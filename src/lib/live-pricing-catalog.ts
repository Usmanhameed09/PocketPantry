import { createServerClient } from "./supabase";
import { promises as fs } from "fs";
import path from "path";
import { readEnv } from "./runtime-env";
import { PRICING_SYSTEM_LEAD_ID } from "./system-records";
import { guardScrapedUnitCost } from "./cost-fixer";
import { ensureDefaultCompany } from "./inventory-store";
import { invalidateOnPriceWrite } from "./cache";

// outreach_log has a CHECK constraint that limits action_type to a small set
// (call/email/email_agent_settings). We reuse "call" — the same pattern
// google-calendar-store and machine-order-store use for arbitrary system
// state — and discriminate via action_data.kind. Reads filter by both
// lead_id (PRICING_SYSTEM_LEAD_ID) and action_data.kind so we never pick up
// rows from those other consumers.
const PRICING_ANALYSIS_ACTION_TYPE = "call";
const PRICING_ANALYSIS_SNAPSHOT_KIND = "pricing_analysis_snapshot";
const PRICING_ANALYSIS_ITEM_KIND = "pricing_analysis_item";

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
  unit_cost: number | null;
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
  // Canonical product name (operator-facing). Used to resolve the real
  // products.id when productId is a synthetic scraper id. Optional for
  // backward-compat with older saved rows.
  productName?: string;
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
  // CRITICAL: must return the same company the rest of the app uses
  // (ensureDefaultCompany returns the hardcoded UUID 00000000-...-0001).
  // The previous implementation did "ORDER BY created_at ASC LIMIT 1"
  // which silently picked a DIFFERENT company row whenever multiple
  // existed — that's why a Cost Fixer fix on the canonical company's
  // products row never reached the Pricing module's catalog lookup.
  return ensureDefaultCompany();
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

  // PostgREST caps each query at 1000 rows server-side. The products
  // table has 6000+ rows after the UPC bulk-import; without pagination
  // we only ever see the first 1000 alphabetically — meaning any
  // operator edit (Cost Fixer, Products page) to a row beyond that
  // window was invisible to the Pricing module. Same fix pattern as
  // projection-engine + reports + assistant-context use.
  const PAGE = 1000;
  const products: SupabaseProductRow[] = [];
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,category,unit_size,unit_cost")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    products.push(...(data as SupabaseProductRow[]));
    if (data.length < PAGE) break;
  }

  const { data: prices, error: pricesError } = await supabase
    .from("product_prices")
    .select("id,product_id,current_price")
    .is("machine_id", null);
  if (pricesError && !isMissingTableError(pricesError)) {
    console.warn("[pricing] product_prices error:", pricesError.code, pricesError.message);
  }

  return {
    products,
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

  // syncLiveProductsToSupabase creates a separate row per scraper SKU
  // without populating unit_cost. So the products table often has TWO
  // rows with the same name: the operator's (unit_cost > 0) and the
  // sync-created one (unit_cost = NULL). For both maps below, we prefer
  // the row WITH a real unit_cost so a Cost Fixer / Products edit on the
  // operator's row wins over the empty sync-created shadow.
  const preferWithCost = (existing: typeof products[number] | undefined, candidate: typeof products[number]) => {
    if (!existing) return candidate;
    const ec = existing.unit_cost;
    const cc = candidate.unit_cost;
    const eHas = ec != null && ec > 0;
    const cHas = cc != null && cc > 0;
    if (cHas && !eHas) return candidate;
    return existing;
  };
  const productBySku = new Map<string, typeof products[number]>();
  for (const p of products) {
    productBySku.set(p.sku, preferWithCost(productBySku.get(p.sku), p));
  }
  // Name-based lookup falls back when scraper SKU != products SKU. Same
  // duplicate-resolution rule — keep whichever row has a real cost.
  const normalizeName = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const productByNormalizedName = new Map<string, typeof products[number]>();
  for (const p of products) {
    const key = normalizeName(p.name);
    productByNormalizedName.set(key, preferWithCost(productByNormalizedName.get(key), p));
  }
  const priceByProductId = new Map(prices.map((price) => [price.product_id, price.current_price]));
  const localOverrideById = new Map(Object.entries(localStore.priceOverrides));
  const localCostById = new Map(Object.entries(localStore.costOverrides));

  const catalog: PricingCatalogProduct[] = [];

  for (const liveProduct of liveProducts) {
    const sku = liveProduct.sku || normalizeSku(liveProduct.name);
    const productId = liveProduct.id || `live-${normalizeSku(liveProduct.name)}`;
    // Primary: SKU match. Fallback: normalized-name match (handles the case
    // where the scraper auto-generates a SKU that doesn't line up with the
    // SKU on the same product in the products table).
    const supabaseProduct =
      productBySku.get(sku) ||
      productByNormalizedName.get(normalizeName(liveProduct.name));
    const fallbackProductId = supabaseProduct?.id || productId;
    const localOverride = localOverrideById.get(fallbackProductId);
    const currentPrice =
      localOverride !== undefined
        ? Number(localOverride)
        : (supabaseProduct
        ? (priceByProductId.get(supabaseProduct.id) ?? liveProduct.observed_price ?? liveProduct.vending_price ?? 0)
        : (liveProduct.observed_price ?? liveProduct.vending_price ?? 0));

    // Cost source priority:
    //   1. localStore.costOverrides — operator edited from the Pricing UI
    //      directly (kept as the most recent intent if both exist)
    //   2. products.unit_cost — canonical source of truth. Cost Fixer,
    //      Products page edit, Exception Queue fix, /api/inventory/products
    //      PATCH all write here. WAS MISSING — that's why a Cost Fixer
    //      fix wasn't reflected on the Pricing page.
    //   3. liveProduct.last_known_cost — scraper-fed fallback (Nayax /
    //      HAHA most recent observation)
    const localCostOverride = localCostById.get(fallbackProductId);
    const productsUnitCost = supabaseProduct?.unit_cost;
    const resolvedCost =
      localCostOverride !== undefined
        ? Number(localCostOverride)
        : (productsUnitCost != null && productsUnitCost > 0
            ? Number(productsUnitCost)
            : (liveProduct.last_known_cost ?? 0));

    catalog.push({
      id: productId,
      productRefId: fallbackProductId,
      name: liveProduct.name,
      sku,
      searchTerm: liveProduct.search_term || liveProduct.name,
      category: liveProduct.category || "snack",
      currentPrice,
      lastKnownCost: resolvedCost,
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
  action_data: {
    kind?: string;
    productId?: string;
    analysis?: SavedPricingAnalysis;
    analyses?: Record<string, SavedPricingAnalysis>;
  } & Record<string, unknown>;
  performed_at: string;
};

async function readSupabaseAnalyses(): Promise<Record<string, SavedPricingAnalysis>> {
  // We persist one row per (productId, scrape) and keep the latest per
  // productId on read. This avoids the race condition where 8 concurrent
  // per-product POSTs each read the same snapshot and overwrite each other.
  try {
    const supabase = createServerClient();
    // Filter by lead_id only — action_data->>kind discrimination happens in
    // application code below. This keeps the query simple and avoids needing
    // a jsonb operator that might not be supported in all PostgREST versions.
    const { data, error } = await supabase
      .from("outreach_log")
      .select("action_data, performed_at")
      .eq("lead_id", PRICING_SYSTEM_LEAD_ID)
      .eq("action_type", PRICING_ANALYSIS_ACTION_TYPE)
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
      const kind = row.action_data?.kind;
      // Per-product row format (preferred — race-safe)
      if (kind === PRICING_ANALYSIS_ITEM_KIND && row.action_data?.productId && row.action_data?.analysis) {
        const pid = row.action_data.productId;
        if (!seen.has(pid)) {
          out[pid] = row.action_data.analysis;
          seen.add(pid);
        }
        continue;
      }
      // Legacy snapshot format — only fill in products not already covered
      // by a per-product row.
      if (kind === PRICING_ANALYSIS_SNAPSHOT_KIND || row.action_data?.analyses) {
        const snapshot = row.action_data?.analyses;
        if (snapshot && typeof snapshot === "object") {
          for (const [pid, analysis] of Object.entries(snapshot)) {
            if (!seen.has(pid)) {
              out[pid] = analysis;
              seen.add(pid);
            }
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

let pricingSystemLeadEnsured = false;

async function ensurePricingSystemLead() {
  // outreach_log.lead_id has a foreign key to leads.id. Other system stores
  // (google-calendar-store, outreach-template-store) follow this same
  // pattern — create a placeholder lead row the first time we need it.
  if (pricingSystemLeadEnsured) return;
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("id", PRICING_SYSTEM_LEAD_ID)
    .maybeSingle();

  if (existing?.id) {
    pricingSystemLeadEnsured = true;
    return;
  }

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const { error: insertError } = await supabase.from("leads").insert({
    id: PRICING_SYSTEM_LEAD_ID,
    business: "__SYSTEM__ Pricing Analyses",
    contact: "System",
    phone: "0000000000",
    email: "",
    address: "",
    distance: "—",
    business_type: "system",
    source: "Manual",
    stage: "New Lead",
    contact_method: "Call",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: "Pricing analyses store",
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
  pricingSystemLeadEnsured = true;
}

async function writeSupabaseAnalysisItems(analyses: SavedPricingAnalysis[]) {
  if (analyses.length === 0) return;
  await ensurePricingSystemLead();
  const supabase = createServerClient();
  const rows = analyses.map((analysis) => ({
    lead_id: PRICING_SYSTEM_LEAD_ID,
    action_type: PRICING_ANALYSIS_ACTION_TYPE,
    action_data: {
      kind: PRICING_ANALYSIS_ITEM_KIND,
      productId: analysis.productId,
      analysis,
      updatedAt: new Date().toISOString(),
    },
  }));
  const { error } = await supabase.from("outreach_log").insert(rows);
  if (error) throw error;
}

/**
 * Persist each scraped unit cost into products.unit_cost so the rest of
 * the app (Cost Fixer, Buy List, Inventory Overview, Reports, AI tools,
 * etc.) immediately sees the new cost. Skips zeros + non-positive numbers
 * so a failed scrape result can't blank out an existing good cost.
 */
async function syncCostsToProductsTable(analyses: SavedPricingAnalysis[]) {
  if (analyses.length === 0) return;
  const supabase = createServerClient();
  const companyId = await ensureDefaultCompany();

  // The analysis productId is a synthetic scraper id, so we CANNOT update
  // by .eq("id", productId). Resolve the real products row by normalized
  // product name instead (same approach the catalog read path uses).
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  type Prod = { id: string; name: string; unit_cost: number | null; category: string | null };
  const products: Prod[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 50000; from += PAGE) {
    const { data } = await supabase
      .from("products")
      .select("id, name, unit_cost, category")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    products.push(...(data as Prod[]));
    if (data.length < PAGE) break;
  }
  // normalized name -> products row, preferring one that already has a cost
  const byName = new Map<string, Prod>();
  for (const p of products) {
    const k = norm(p.name);
    const e = byName.get(k);
    if (!e || ((p.unit_cost ?? 0) > 0 && (e.unit_cost ?? 0) <= 0)) byName.set(k, p);
  }

  for (const a of analyses) {
    const cost = Number(a.cost);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    const name = a.productName || "";
    if (!name) continue;
    const prod = byName.get(norm(name));
    if (!prod) continue;
    const category = (prod.category || "snack").toLowerCase();
    const caseCeiling = category.includes("meal") ? 8 : 5;
    // Sanity guards (same as the backfill): reject obvious case prices and
    // don't blow up a reasonable existing cost.
    if (cost > caseCeiling) continue;
    const oldCost = prod.unit_cost ?? 0;
    if (oldCost > 0 && cost > oldCost * 1.5) continue;

    const update: Record<string, unknown> = { unit_cost: Math.round(cost * 100) / 100 };
    if (a.packSize != null && Number.isFinite(Number(a.packSize)) && Number(a.packSize) > 1) {
      update.case_size = Math.round(Number(a.packSize));
    }
    const { error } = await supabase.from("products").update(update).eq("id", prod.id);
    if (error) {
      console.warn("[pricing-catalog] products update failed for", prod.name, error.message);
    }
  }
}

async function applyScrapeTimeCostGuard(analyses: SavedPricingAnalysis[]) {
  if (analyses.length === 0) return;
  const supabase = createServerClient();
  const ids = analyses.map((a) => a.productId).filter(Boolean);
  if (ids.length === 0) return;
  const { data: prodRows } = await supabase
    .from("products")
    .select("id, name, category, default_vend_price")
    .in("id", ids);
  const byId = new Map(
    (prodRows || []).map((p) => [
      p.id as string,
      p as { id: string; name: string; category?: string | null; default_vend_price?: number | null },
    ])
  );
  for (const a of analyses) {
    const prod = byId.get(a.productId);
    if (!prod) continue;
    const result = await guardScrapedUnitCost({
      productName: prod.name,
      category: prod.category ?? null,
      scrapedUnitCost: a.cost,
      packSize: a.packSize ?? null,
      packPrice: a.packPrice ?? null,
      vendPrice: prod.default_vend_price ?? null,
    });
    if (result.unitCost !== a.cost) {
      // Record the correction in the trigger string so the operator can
      // see in the Pricing UI why the cost changed from what was scraped.
      a.cost = result.unitCost;
      a.trigger = `${a.trigger || "Scrape"} (cost-fixer: ${result.source})`;
    }
    if (result.flag) {
      a.status = "Needs Review";
    }
  }
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

  // Scrape-time guard: before persisting, validate each unit cost against
  // the product name + vending price to catch case-prices-stored-as-unit.
  // Falls through silently on any error — the guard is opportunistic, not
  // mandatory; the backlog cleanup tool catches anything that slips by.
  try {
    await applyScrapeTimeCostGuard(analyses);
  } catch (err) {
    console.warn("[pricing-catalog] cost guard failed:", err);
  }

  // ALSO write the scraped cost into products.unit_cost. Without this,
  // the Pricing catalog reads cost from products.unit_cost — which the
  // scraper never updated — so after the scrape completed and the UI
  // re-fetched, the old pre-scrape values came back and operators saw
  // their scrape "revert". The savedAnalysis snapshot still gets written
  // below for the history record + diff context.
  try {
    await syncCostsToProductsTable(analyses);
  } catch (err) {
    console.warn("[pricing-catalog] products.unit_cost sync failed:", err);
  }

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
    // Even the local-fallback path is a write the operator initiated —
    // wipe the catalog cache so the next load re-reads (and picks up
    // anything the scrape did manage to persist).
    await invalidateOnPriceWrite();
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

  // CRITICAL: invalidate the Pricing catalog cache so the next /api/pricing/catalog
  // read picks up the scraped data. Without this, the operator ran a scrape,
  // we persisted everything, then the UI re-fetched and got the cached
  // pre-scrape catalog — making it look like the scrape silently lost data.
  await invalidateOnPriceWrite();

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
