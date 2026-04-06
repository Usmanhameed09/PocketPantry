import { createServerClient } from "./supabase";
import { promises as fs } from "fs";
import path from "path";

export type ProductCategory = "beverage" | "snack";

export type LiveMachineProduct = {
  id: string;
  name: string;
  sku?: string;
  search_term: string;
  vending_price: number;
  last_known_cost: number;
  expected_pack_size?: number | null;
  category: ProductCategory;
  observed_price?: number | null;
  units_sold: number;
  order_count: number;
  machine_count: number;
  machines: { id: string; name: string }[];
  last_sold_at?: string | null;
  platform: "chinese" | "nayax" | string;
};

export type PricingCatalogProduct = {
  id: string;
  productRefId: string;
  name: string;
  sku: string;
  searchTerm: string;
  category: ProductCategory;
  currentPrice: number;
  lastKnownCost: number;
  expectedPackSize: number | null;
  observedPrice: number | null;
  unitsSold: number;
  orderCount: number;
  machineCount: number;
  machines: { id: string; name: string }[];
  lastSoldAt: string | null;
  platform: string;
  isManualOnly: boolean;
};

type SupabaseProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit_size: string | null;
};

type SupabasePriceRow = {
  id: string;
  product_id: string;
  current_price: number;
};

type LocalManualProduct = {
  id: string;
  name: string;
  sku: string;
  category: ProductCategory;
  currentPrice: number;
};

export type SavedSupplierPrice = {
  supplier: string;
  packPrice: number;
  packSize: number | null;
  unitPrice: number | null;
  name: string;
  url: string;
};

export type SavedPricingAnalysis = {
  productId: string;
  supplier: string;
  cost: number;
  prevCost: number;
  suggestedPrice: number;
  margin: number;
  status: string;
  trigger: string;
  sourceUrl?: string;
  packPrice?: number | null;
  packSize?: number | null;
  scraped?: boolean;
  scrapedProduct?: string | null;
  error?: string | null;
  updatedAt: string;
  allPrices: SavedSupplierPrice[];
};

type LocalPricingStore = {
  manualProducts: LocalManualProduct[];
  priceOverrides: Record<string, number>;
  costOverrides: Record<string, number>;
  savedAnalyses: Record<string, SavedPricingAnalysis>;
};

const scraperUrl = () => process.env.SCRAPER_API_URL || "http://localhost:8000";
const apiKey = () => process.env.SCRAPER_BACKEND_KEY || "";
const localStorePath = path.join(process.cwd(), ".data", "pricing-catalog.json");

function buildHeaders() {
  return apiKey() ? { "x-api-key": apiKey() } : {};
}

export function normalizeSku(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `product-${Date.now()}`;
}

function parsePackSize(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function isMissingTableError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "PGRST205";
}

async function readLocalStore(): Promise<LocalPricingStore> {
  try {
    const raw = await fs.readFile(localStorePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalPricingStore>;
    return {
      manualProducts: Array.isArray(parsed.manualProducts) ? parsed.manualProducts : [],
      priceOverrides: parsed.priceOverrides && typeof parsed.priceOverrides === "object" ? parsed.priceOverrides : {},
      costOverrides: parsed.costOverrides && typeof parsed.costOverrides === "object" ? parsed.costOverrides : {},
      savedAnalyses: parsed.savedAnalyses && typeof parsed.savedAnalyses === "object" ? parsed.savedAnalyses : {},
    };
  } catch {
    return { manualProducts: [], priceOverrides: {}, costOverrides: {}, savedAnalyses: {} };
  }
}

async function writeLocalStore(store: LocalPricingStore) {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getOrCreateCompanyId() {
  const supabase = createServerClient();
  const { data: existingCompany, error: existingError } = await supabase
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingCompany?.id) return existingCompany.id;

  const { data: insertedCompany, error: insertError } = await supabase
    .from("companies")
    .insert({ name: "PocketPantry", timezone: "America/Chicago" })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return insertedCompany.id;
}

export async function fetchLiveMachineProducts(): Promise<LiveMachineProduct[]> {
  const response = await fetch(`${scraperUrl()}/api/machine-products`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || "Failed to fetch live machine products");
  }

  return (data.products || []) as LiveMachineProduct[];
}

export async function syncLiveProductsToSupabase(products: LiveMachineProduct[]) {
  if (products.length === 0) {
    return { synced: 0 };
  }

  const companyId = await getOrCreateCompanyId();
  const supabase = createServerClient();

  const rows = products.map((product) => ({
    company_id: companyId,
    name: product.name,
    sku: product.sku || normalizeSku(product.name),
    category: product.category,
    unit_size: product.expected_pack_size ? String(product.expected_pack_size) : null,
  }));

  const { error } = await supabase
    .from("products")
    .upsert(rows, { onConflict: "company_id,sku", ignoreDuplicates: false });

  if (error) {
    throw error;
  }

  return { synced: rows.length };
}

async function getSupabaseProducts(companyId: string) {
  const supabase = createServerClient();
  const [{ data: products, error: productsError }, { data: prices, error: pricesError }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,category,unit_size")
      .eq("company_id", companyId)
      .order("name", { ascending: true }),
    supabase
      .from("product_prices")
      .select("id,product_id,current_price")
      .is("machine_id", null),
  ]);

  if (productsError) throw productsError;
  if (pricesError) throw pricesError;

  return {
    products: (products || []) as SupabaseProductRow[],
    prices: (prices || []) as SupabasePriceRow[],
  };
}

export async function getPricingCatalog(): Promise<PricingCatalogProduct[]> {
  const liveProducts = await fetchLiveMachineProducts().catch(() => [] as LiveMachineProduct[]);
  const localStore = await readLocalStore();
  let products: SupabaseProductRow[] = [];
  let prices: SupabasePriceRow[] = [];

  try {
    if (liveProducts.length > 0) {
      await syncLiveProductsToSupabase(liveProducts);
    }

    const companyId = await getOrCreateCompanyId();
    const supabaseData = await getSupabaseProducts(companyId);
    products = supabaseData.products;
    prices = supabaseData.prices;
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const productBySku = new Map(products.map((product) => [product.sku, product]));
  const priceByProductId = new Map(prices.map((price) => [price.product_id, price.current_price]));
  const localOverrideById = new Map(Object.entries(localStore.priceOverrides));
  const localCostById = new Map(Object.entries(localStore.costOverrides));

  const catalog: PricingCatalogProduct[] = [];

  for (const liveProduct of liveProducts) {
    const sku = liveProduct.sku || normalizeSku(liveProduct.name);
    const supabaseProduct = productBySku.get(sku);
    const fallbackProductId = supabaseProduct?.id || liveProduct.id;
    const localOverride = localOverrideById.get(fallbackProductId);
    const currentPrice =
      localOverride !== undefined
        ? Number(localOverride)
        : (supabaseProduct
        ? (priceByProductId.get(supabaseProduct.id) ?? liveProduct.observed_price ?? liveProduct.vending_price ?? 0)
        : (liveProduct.observed_price ?? liveProduct.vending_price ?? 0));

    catalog.push({
      id: liveProduct.id,
      productRefId: fallbackProductId,
      name: liveProduct.name,
      sku,
      searchTerm: liveProduct.search_term || liveProduct.name,
      category: liveProduct.category,
      currentPrice,
      lastKnownCost: localCostById.get(fallbackProductId) !== undefined
        ? Number(localCostById.get(fallbackProductId))
        : (liveProduct.last_known_cost ?? 0),
      expectedPackSize: liveProduct.expected_pack_size ?? parsePackSize(supabaseProduct?.unit_size),
      observedPrice: liveProduct.observed_price ?? null,
      unitsSold: liveProduct.units_sold ?? 0,
      orderCount: liveProduct.order_count ?? 0,
      machineCount: liveProduct.machine_count ?? 0,
      machines: liveProduct.machines || [],
      lastSoldAt: liveProduct.last_sold_at ?? null,
      platform: liveProduct.platform,
      isManualOnly: false,
    });
  }

  catalog.sort((a, b) => {
    if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
    return a.name.localeCompare(b.name);
  });

  return catalog;
}

export async function createManualPricingProduct(input: {
  name: string;
  category: ProductCategory;
  currentPrice: number;
}) {
  try {
    const companyId = await getOrCreateCompanyId();
    const supabase = createServerClient();
    const sku = `manual-${normalizeSku(input.name)}`;

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        company_id: companyId,
        name: input.name,
        sku,
        category: input.category,
        unit_size: null,
      })
      .select("id,name,sku,category,unit_size")
      .single();

    if (productError) throw productError;

    if (input.currentPrice > 0) {
      const { error: priceError } = await supabase
        .from("product_prices")
        .insert({
          machine_id: null,
          product_id: product.id,
          current_price: input.currentPrice,
        });

      if (priceError) throw priceError;
    }

    return product as SupabaseProductRow;
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    const store = await readLocalStore();
    const id = `local-${normalizeSku(input.name)}`;
    const sku = `manual-${normalizeSku(input.name)}`;

    store.manualProducts = [
      ...store.manualProducts.filter((product) => product.id !== id && product.sku !== sku),
      {
        id,
        name: input.name,
        sku,
        category: input.category,
        currentPrice: input.currentPrice,
      },
    ];
    if (input.currentPrice > 0) {
      store.priceOverrides[id] = input.currentPrice;
    }
    await writeLocalStore(store);

    return {
      id,
      name: input.name,
      sku,
      category: input.category,
      unit_size: null,
    } as SupabaseProductRow;
  }
}

export async function saveProductCurrentPrice(productId: string, currentPrice: number) {
  try {
    const supabase = createServerClient();
    const { data: existingPrice, error: existingError } = await supabase
      .from("product_prices")
      .select("id")
      .eq("product_id", productId)
      .is("machine_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingPrice?.id) {
      const { error: updateError } = await supabase
        .from("product_prices")
        .update({ current_price: currentPrice, updated_at: new Date().toISOString() })
        .eq("id", existingPrice.id);

      if (updateError) throw updateError;
      return { updated: true };
    }

    const { error: insertError } = await supabase
      .from("product_prices")
      .insert({
        machine_id: null,
        product_id: productId,
        current_price: currentPrice,
      });

    if (insertError) throw insertError;
    return { updated: true };
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }

    const store = await readLocalStore();
    store.priceOverrides[productId] = currentPrice;
    await writeLocalStore(store);
    return { updated: true, local: true };
  }
}

export async function saveProductPricing(
  productId: string,
  updates: { currentPrice?: number; lastKnownCost?: number }
) {
  if (updates.currentPrice !== undefined) {
    await saveProductCurrentPrice(productId, updates.currentPrice);
  }

  if (updates.lastKnownCost !== undefined) {
    const store = await readLocalStore();
    store.costOverrides[productId] = updates.lastKnownCost;
    await writeLocalStore(store);
  }

  return { updated: true };
}

export async function getSavedPricingAnalyses() {
  const store = await readLocalStore();
  return store.savedAnalyses;
}

export async function savePricingAnalyses(analyses: SavedPricingAnalysis[]) {
  const store = await readLocalStore();

  for (const analysis of analyses) {
    store.savedAnalyses[analysis.productId] = analysis;
  }

  await writeLocalStore(store);
  return { updated: analyses.length };
}

export async function savePricingDecision(
  analysisId: string,
  decision: "approve" | "reject",
  values: { currentPrice: number; suggestedPrice: number }
) {
  const store = await readLocalStore();
  const existing = store.savedAnalyses[analysisId];

  if (!existing) {
    return { updated: false };
  }

  if (decision === "approve") {
    existing.status = "Approved";
    existing.suggestedPrice = values.suggestedPrice;
    existing.trigger = "Approved price update";
  } else {
    existing.status = "Cost Margin";
    existing.suggestedPrice = values.currentPrice;
    existing.trigger = "Price change rejected";
  }

  existing.updatedAt = new Date().toISOString();
  store.savedAnalyses[analysisId] = existing;
  await writeLocalStore(store);

  return { updated: true };
}
