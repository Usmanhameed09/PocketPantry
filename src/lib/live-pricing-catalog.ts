import { createServerClient } from "./supabase";
import { promises as fs } from "fs";
import path from "path";
import { readEnv } from "./runtime-env";
import { PRICING_SYSTEM_LEAD_ID } from "./system-records";

const PRICING_ANALYSIS_ACTION = "pricing_analysis_snapshot";
const PRICING_ANALYSIS_ITEM_ACTION = "pricing_analysis_item";

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
  firstFillCost?: number | null;
  firstFillSupplier?: string | null;
  firstFillPackSize?: number | null;
};

type LocalPricingStore = {
  manualProducts: LocalManualProduct[];
  priceOverrides: Record<string, number>;
  costOverrides: Record<string, number>;
  savedAnalyses: Record<string, SavedPricingAnalysis>;
};

const scraperUrl = () => readEnv("SCRAPER_API_URL") || "http://localhost:8000";
const apiKey = () => readEnv("SCRAPER_BACKEND_KEY");
const localStorePath = path.join(process.cwd(), ".data", "pricing-catalog.json");

function buildHeaders() {
  const key = apiKey();
  const headers: Record<string, string> = {};
  if (key) {
    headers["x-api-key"] = key;
  }
  return headers;
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
  if (!error || typeof error !== "object") return false;
  const e = error as Partial<{ code: string; message: string; hint: string; details: string }>;
  const code = e.code || "";
  const message = (e.message || e.hint || e.details || "").toLowerCase();
  // PGRST205 = PostgREST "table not found", 42P01 = PostgreSQL "undefined_table"
  // Also check message for relation/table not found patterns
  return code === "PGRST205" || code === "42P01"
    || message.includes("relation") && message.includes("does not exist")
    || message.includes("table") && message.includes("not found");
}

function shouldUseLocalPricingFallback(error: unknown) {
  if (isMissingTableError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as Partial<{ code: string; message: string; details: string; hint: string }>;
  const code = e.code || "";
  const message = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  return code === "23503"
    || code === "22P02"
    || message.includes("foreign key")
    || message.includes("violates foreign key constraint")
    || message.includes("invalid input syntax")
    || message.includes("uuid");
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
  try {
    await fs.mkdir(path.dirname(localStorePath), { recursive: true });
    await fs.writeFile(localStorePath, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    // Vercel's filesystem is read-only (EROFS). The save is best-effort; on
    // production we silently skip and rely on the in-memory items state +
    // the extension's chrome.storage to keep data visible for the current
    // session. For durable cross-session persistence on production, swap
    // this for a Supabase table.
    const e = err as { code?: string };
    if (e && (e.code === "EROFS" || e.code === "EACCES")) {
      console.warn("[pricing-catalog] write skipped (read-only filesystem)");
      return;
    }
    throw err;
  }
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
    category: product.category || "snack",
    unit_size: product.expected_pack_size ? String(product.expected_pack_size) : null,
  }));

  const { error } = await supabase
    .from("products")
    .upsert(rows, { onConflict: "company_id,sku", ignoreDuplicates: false });

  if (error) {
    console.error("[pricing] syncLiveProducts error:", error.code, error.message, error.details, error.hint);
    return { synced: 0 };
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
  // product_prices table may not exist — gracefully return empty prices
  if (pricesError && !isMissingTableError(pricesError)) {
    console.warn("[pricing] product_prices error:", pricesError.code, pricesError.message);
  }

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
    const productId = liveProduct.id || `live-${normalizeSku(liveProduct.name)}`;
    const supabaseProduct = productBySku.get(sku);
    const fallbackProductId = supabaseProduct?.id || productId;
    const localOverride = localOverrideById.get(fallbackProductId);
    const currentPrice =
      localOverride !== undefined
        ? Number(localOverride)
        : (supabaseProduct
        ? (priceByProductId.get(supabaseProduct.id) ?? liveProduct.observed_price ?? liveProduct.vending_price ?? 0)
        : (liveProduct.observed_price ?? liveProduct.vending_price ?? 0));

    catalog.push({
      id: productId,
      productRefId: fallbackProductId,
      name: liveProduct.name,
      sku,
      searchTerm: liveProduct.search_term || liveProduct.name,
      category: liveProduct.category || "snack",
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
      platform: liveProduct.platform || "unknown",
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
    if (!shouldUseLocalPricingFallback(error)) {
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

type SupabaseAnalysisRow = {
  action_data: { productId?: string; analysis?: SavedPricingAnalysis } & Record<string, unknown>;
  performed_at: string;
};

async function readSupabaseAnalyses(): Promise<Record<string, SavedPricingAnalysis>> {
  // We persist one row per (productId, scrape) and keep the latest per
  // productId on read. This avoids the race condition where 8 concurrent
  // per-product POSTs each read the same snapshot and overwrite each other.
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("outreach_log")
      .select("action_data, performed_at")
      .eq("lead_id", PRICING_SYSTEM_LEAD_ID)
      .in("action_type", [PRICING_ANALYSIS_ITEM_ACTION, PRICING_ANALYSIS_ACTION])
      .order("performed_at", { ascending: false })
      .limit(5000);

    if (error) {
      if (isMissingTableError(error)) return {};
      console.warn("[pricing-catalog] readSupabaseAnalyses error:", error.code, error.message);
      return {};
    }

    const out: Record<string, SavedPricingAnalysis> = {};
    const seen = new Set<string>();

    for (const row of (data || []) as SupabaseAnalysisRow[]) {
      // Per-product row format (preferred — race-safe)
      if (row.action_data?.productId && row.action_data?.analysis) {
        const pid = row.action_data.productId;
        if (!seen.has(pid)) {
          out[pid] = row.action_data.analysis;
          seen.add(pid);
        }
        continue;
      }
      // Legacy snapshot format — only fill in products not already covered
      // by a per-product row.
      const snapshot = (row.action_data as { analyses?: Record<string, SavedPricingAnalysis> })?.analyses;
      if (snapshot && typeof snapshot === "object") {
        for (const [pid, analysis] of Object.entries(snapshot)) {
          if (!seen.has(pid)) {
            out[pid] = analysis;
            seen.add(pid);
          }
        }
      }
    }

    return out;
  } catch (err) {
    console.warn("[pricing-catalog] readSupabaseAnalyses threw:", err);
    return {};
  }
}

async function writeSupabaseAnalysisItems(analyses: SavedPricingAnalysis[]) {
  if (analyses.length === 0) return;
  const supabase = createServerClient();
  const rows = analyses.map((analysis) => ({
    lead_id: PRICING_SYSTEM_LEAD_ID,
    action_type: PRICING_ANALYSIS_ITEM_ACTION,
    action_data: {
      productId: analysis.productId,
      analysis,
      updatedAt: new Date().toISOString(),
    },
  }));
  const { error } = await supabase.from("outreach_log").insert(rows);
  if (error) throw error;
}

export async function getSavedPricingAnalyses() {
  const supabaseAnalyses = await readSupabaseAnalyses();
  if (Object.keys(supabaseAnalyses).length > 0) {
    return supabaseAnalyses;
  }
  const store = await readLocalStore();
  return store.savedAnalyses;
}

export async function savePricingAnalyses(analyses: SavedPricingAnalysis[]) {
  if (analyses.length === 0) return { updated: 0 };

  // Append per-product rows to Supabase (race-safe). Each call only inserts
  // the products it owns, so concurrent per-product POSTs never overwrite
  // each other. The read path keeps the latest row per productId.
  try {
    await writeSupabaseAnalysisItems(analyses);
  } catch (err) {
    const e = err as { code?: string; message?: string; details?: string; hint?: string };
    const errorMsg = `${e.code || ""} ${e.message || err} ${e.details || ""} ${e.hint || ""}`.trim();
    console.warn("[pricing-catalog] Supabase write failed, falling back to local file:", e);
    const localStore = await readLocalStore();
    for (const analysis of analyses) {
      localStore.savedAnalyses[analysis.productId] = analysis;
    }
    await writeLocalStore(localStore);
    return { updated: analyses.length, local: true as const, supabaseError: errorMsg };
  }

  // Best-effort local mirror so dev environments without Supabase also see
  // the data. Ignored on Vercel (EROFS).
  try {
    const localStore = await readLocalStore();
    for (const analysis of analyses) {
      localStore.savedAnalyses[analysis.productId] = analysis;
    }
    await writeLocalStore(localStore);
  } catch {
    // ignore — Supabase is the source of truth
  }

  return { updated: analyses.length };
}

export async function savePricingDecision(
  analysisId: string,
  decision: "approve" | "reject",
  values: { currentPrice: number; suggestedPrice: number }
) {
  // Read merged view (Supabase wins, local fills gaps) so decisions apply to
  // whatever the user just saw on the page.
  const supabaseAnalyses = await readSupabaseAnalyses();
  const localStore = await readLocalStore();
  const merged: Record<string, SavedPricingAnalysis> = {
    ...localStore.savedAnalyses,
    ...supabaseAnalyses,
  };
  const existing = merged[analysisId];

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
  merged[analysisId] = existing;

  try {
    await writeSupabaseAnalysisItems([existing]);
  } catch (err) {
    console.warn("[pricing-catalog] decision Supabase write failed, falling back to local:", err);
    localStore.savedAnalyses = merged;
    await writeLocalStore(localStore);
    return { updated: true, local: true };
  }

  try {
    localStore.savedAnalyses = merged;
    await writeLocalStore(localStore);
  } catch {
    // ignore
  }

  return { updated: true };
}
