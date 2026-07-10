/**
 * Inventory data layer — Supabase helpers for the inventory system.
 * Handles company/product/machine upserts + inventory queries.
 */

import { createServerClient } from "@/lib/supabase";
import { recordStockMovement } from "@/lib/inventory-ledger";

const COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const COMPANY_NAME = "PocketPantry";

// ─── Company ────────────────────────────────────────────────────────

let _companyId: string | null = null;

export async function ensureDefaultCompany(): Promise<string> {
  if (_companyId) return _companyId;
  const supabase = createServerClient();
  const { error } = await supabase.from("companies").upsert(
    { id: COMPANY_ID, name: COMPANY_NAME, timezone: "America/New_York" },
    { onConflict: "id" }
  );
  if (error) throw new Error(`ensureDefaultCompany: ${error.message}`);
  _companyId = COMPANY_ID;
  return COMPANY_ID;
}

// ─── Products ───────────────────────────────────────────────────────

function generateSku(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
}

export async function ensureProduct(
  name: string,
  category = "Snacks"
): Promise<string> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const sku = generateSku(name);

  // Try to find existing product by name (case-insensitive)
  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", name)
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  // Insert new product
  const { data, error } = await supabase
    .from("products")
    .upsert(
      { company_id: companyId, name, sku, category },
      { onConflict: "company_id,sku" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`ensureProduct(${name}): ${error.message}`);
  return data.id;
}

// ─── Machines ───────────────────────────────────────────────────────

export async function ensureMachine(
  nayaxDeviceId: string,
  name: string,
  location?: string
): Promise<string> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // Check if machine exists by nayax_device_id
  const { data: existing } = await supabase
    .from("machines")
    .select("id")
    .eq("nayax_device_id", nayaxDeviceId)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update name/last_sync
    await supabase
      .from("machines")
      .update({ name, last_sync_at: new Date().toISOString() })
      .eq("id", existing[0].id);
    return existing[0].id;
  }

  // Insert new machine
  const { data, error } = await supabase
    .from("machines")
    .insert({
      company_id: companyId,
      name,
      nayax_device_id: nayaxDeviceId,
      status: "healthy",
      last_sync_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`ensureMachine(${nayaxDeviceId}): ${error.message}`);
  return data.id;
}

// ─── Machine Inventory ──────────────────────────────────────────────

export async function upsertMachineInventory(params: {
  machineId: string;
  productId: string;
  estimatedRemaining: number;
  dailySalesRate: number;
  soldSinceRefill: number;
}): Promise<void> {
  const supabase = createServerClient();

  // Get current record to preserve last_loaded_qty from refill logs
  const { data: existing } = await supabase
    .from("machine_inventory")
    .select("last_loaded_qty")
    .eq("machine_id", params.machineId)
    .eq("product_id", params.productId)
    .limit(1);

  const lastLoadedQty = existing?.[0]?.last_loaded_qty ?? 0;
  const estimated = lastLoadedQty > 0
    ? Math.max(0, lastLoadedQty - params.soldSinceRefill)
    : 0; // No refill logged yet — we can't estimate remaining

  const { error } = await supabase.from("machine_inventory").upsert(
    {
      machine_id: params.machineId,
      product_id: params.productId,
      estimated_remaining: estimated,
      daily_sales_rate: params.dailySalesRate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "machine_id,product_id" }
  );

  if (error)
    throw new Error(`upsertMachineInventory: ${error.message}`);
}

/**
 * Batch-resolve many product names to ids in a handful of queries instead of
 * one select+insert PER product. Returns a lowercase-name → id map (matching
 * ensureProduct's case-insensitive behavior). Existing products are read in
 * bulk; only genuinely-new names are inserted (rare on a steady-state sync),
 * one at a time via ensureProduct so SKU generation/collision stays identical.
 *
 * This is what makes the sync fast: 10 machines × ~40 products used to be
 * ~400 sequential round-trips; now it's a few bulk reads.
 */
export async function ensureProductsBatch(names: string[]): Promise<Map<string, string>> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const byLower = new Map<string, string>(); // lowercase name → id

  // Bulk-read ONLY the products whose names we're syncing (a few hundred),
  // not the whole catalog. Exact-name match; any case-variant miss is caught
  // by the ensureProduct fallback below (which does a case-insensitive lookup),
  // so this stays correct — no duplicate is ever created.
  for (let i = 0; i < wanted.length; i += 200) {
    const batch = wanted.slice(i, i + 200);
    const { data, error } = await supabase
      .from("products").select("id, name").eq("company_id", companyId).in("name", batch);
    if (error) throw new Error(`ensureProductsBatch read: ${error.message}`);
    for (const p of data || []) {
      const k = (p.name as string).toLowerCase();
      if (!byLower.has(k)) byLower.set(k, p.id as string);
    }
  }

  // Resolve/create anything not matched exactly. ensureProduct does the
  // case-insensitive lookup (so a case-variant reuses the existing row) and
  // only inserts a genuinely-new product. Empty on a steady-state sync.
  for (const name of wanted) {
    if (byLower.has(name.toLowerCase())) continue;
    const id = await ensureProduct(name);
    byLower.set(name.toLowerCase(), id);
  }
  return byLower;
}

/**
 * Batch-upsert machine_inventory for many (machine, product) pairs. Reads all
 * existing rows for the given machines in ONE query to preserve each pair's
 * last_loaded_qty (the refill baseline), computes estimated_remaining, then
 * upserts in chunks — replacing the per-product select+upsert loop.
 */
export async function batchUpsertMachineInventory(
  machineIds: string[],
  rows: Array<{ machineId: string; productId: string; dailySalesRate: number; soldSinceRefill: number }>,
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = createServerClient();
  const uniqMachineIds = [...new Set(machineIds)];

  const lastLoaded = new Map<string, number>(); // "machineId|productId" → last_loaded_qty
  if (uniqMachineIds.length > 0) {
    const { data } = await supabase
      .from("machine_inventory")
      .select("machine_id, product_id, last_loaded_qty")
      .in("machine_id", uniqMachineIds);
    for (const r of data || []) {
      lastLoaded.set(`${r.machine_id}|${r.product_id}`, (r.last_loaded_qty as number) || 0);
    }
  }

  const now = new Date().toISOString();
  const upsertRows = rows.map((r) => {
    const baseline = lastLoaded.get(`${r.machineId}|${r.productId}`) || 0;
    const estimated = baseline > 0 ? Math.max(0, baseline - r.soldSinceRefill) : 0;
    return {
      machine_id: r.machineId,
      product_id: r.productId,
      estimated_remaining: estimated,
      daily_sales_rate: r.dailySalesRate,
      updated_at: now,
    };
  });
  for (let i = 0; i < upsertRows.length; i += 500) {
    const { error } = await supabase
      .from("machine_inventory")
      .upsert(upsertRows.slice(i, i + 500), { onConflict: "machine_id,product_id" });
    if (error) throw new Error(`batchUpsertMachineInventory: ${error.message}`);
  }
}

// ─── Refill Logging ─────────────────────────────────────────────────

export async function logRefill(params: {
  machineId: string;
  items: Array<{ productId: string; quantity: number }>;
  refillDate?: string;
  createdBy?: string | null;
}): Promise<void> {
  for (const item of params.items) {
    if (item.quantity <= 0) continue;

    // Acceptance criterion: "Logging a refill subtracts from warehouse
    // stock and updates 'in machine' stock baseline."
    //
    // Both halves go through the ledger. recordStockMovement() writes the
    // stock_movements row AND reconciles the rollup table for that
    // location (warehouse_inventory or machine_inventory).
    const refEventId = `refill-${params.machineId.slice(0, 8)}-${Date.now()}`;

    // Warehouse side: stock leaving (−qty). Auto-reconciles
    // warehouse_inventory.on_hand from SUM(stock_movements).
    await recordStockMovement({
      productId: item.productId,
      location: "warehouse",
      qty: -item.quantity,
      reason: "refill",
      referenceId: refEventId,
      notes: `Refill to machine ${params.machineId.slice(0, 8)}`,
      createdBy: params.createdBy ?? null,
    });

    // Machine side: stock arriving (+qty). Auto-reconciles
    // machine_inventory.estimated_remaining and last_loaded_qty by
    // replaying movements (refill→reset, sale_estimate→subtract).
    await recordStockMovement({
      productId: item.productId,
      location: params.machineId,
      machineId: params.machineId,
      qty: item.quantity,
      reason: "refill",
      referenceId: refEventId,
      notes: "Refill from warehouse",
      createdBy: params.createdBy ?? null,
    });
  }
}

// ─── Inventory Overview ─────────────────────────────────────────────

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  cost: number;         // unit cost ($) — for warehouse value
  onHand: number;       // warehouse qty
  inMachines: number;   // sum of estimated_remaining across machines
  dailySales: number;   // avg daily sales rate
  daysLeft: number;     // (onHand + inMachines) / dailySales
  leadTimeDays: number;
  hasStockSignal: boolean; // true if any refill/PO/count adjustment recorded
  restockStatus: "OK" | "Low" | "Critical" | "Out" | "NoData";
  machines: Array<{
    machineId: string;
    machineName: string;
    estimatedRemaining: number;
    lastLoadedQty: number;
    dailySalesRate: number;
    lastRefillAt: string | null;
  }>;
}

export async function getInventoryOverview(): Promise<InventoryProduct[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // Fetch products
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, name, sku, category, lead_time_days, unit_cost")
    .eq("company_id", companyId)
    .order("name");

  if (pErr) throw new Error(`getInventoryOverview products: ${pErr.message}`);
  if (!products || products.length === 0) return [];

  // Fetch warehouse inventory
  const { data: warehouse } = await supabase
    .from("warehouse_inventory")
    .select("product_id, on_hand")
    .eq("company_id", companyId);

  const warehouseMap = new Map<string, number>();
  for (const w of warehouse || []) {
    warehouseMap.set(w.product_id, w.on_hand);
  }

  // Track which products have any real stock signal (refill/PO/count fix).
  // Without one of these we cannot know what's in machines — Nayax doesn't
  // expose slot-level stock. UI should mark these as "Needs setup".
  const { data: signals } = await supabase
    .from("stock_movements")
    .select("product_id")
    .in("reason", ["purchase", "refill", "count_correction"]);
  const stockSignalSet = new Set((signals || []).map((m) => m.product_id as string));

  // Fetch machine inventory with machine names
  const { data: machineInv } = await supabase
    .from("machine_inventory")
    .select(`
      product_id,
      machine_id,
      estimated_remaining,
      last_loaded_qty,
      daily_sales_rate,
      last_refill_at,
      machines!inner(name)
    `);

  // Group machine inventory by product
  const machinesByProduct = new Map<string, InventoryProduct["machines"]>();
  for (const mi of machineInv || []) {
    const arr = machinesByProduct.get(mi.product_id) || [];
    arr.push({
      machineId: mi.machine_id,
      machineName: (mi as any).machines?.name || "Unknown",
      estimatedRemaining: mi.estimated_remaining,
      lastLoadedQty: mi.last_loaded_qty,
      dailySalesRate: mi.daily_sales_rate,
      lastRefillAt: mi.last_refill_at,
    });
    machinesByProduct.set(mi.product_id, arr);
  }

  // Build overview
  return products.map((p) => {
    const onHand = warehouseMap.get(p.id) || 0;
    const machines = machinesByProduct.get(p.id) || [];
    const inMachines = machines.reduce((sum, m) => sum + m.estimatedRemaining, 0);
    const dailySales = machines.length > 0
      ? machines.reduce((sum, m) => sum + m.dailySalesRate, 0)
      : 0;
    const totalStock = onHand + inMachines;
    const daysLeft = dailySales > 0 ? Math.round(totalStock / dailySales) : 999;
    const leadTime = p.lead_time_days || 1;
    const hasStockSignal = stockSignalSet.has(p.id);

    let restockStatus: InventoryProduct["restockStatus"];
    if (!hasStockSignal) {
      // No refill or PO ever recorded — can't say anything meaningful
      restockStatus = "NoData";
    } else if (totalStock === 0 && dailySales > 0) {
      restockStatus = "Out";
    } else if (daysLeft <= leadTime) {
      restockStatus = "Critical";
    } else if (daysLeft <= leadTime * 2) {
      restockStatus = "Low";
    } else {
      restockStatus = "OK";
    }

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      cost: (p as { unit_cost?: number }).unit_cost || 0,
      onHand,
      inMachines,
      dailySales: Math.round(dailySales * 100) / 100,
      daysLeft,
      leadTimeDays: leadTime,
      hasStockSignal,
      restockStatus,
      machines,
    };
  });
}

// ─── Machine List (for dropdowns) ───────────────────────────────────

export async function getMachineList(): Promise<
  Array<{ id: string; name: string; nayaxDeviceId: string | null; status: string }>
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("machines")
    .select("id, name, nayax_device_id, status")
    .order("name");

  if (error) throw new Error(`getMachineList: ${error.message}`);
  return (data || []).map((m) => ({
    id: m.id,
    name: m.name,
    nayaxDeviceId: m.nayax_device_id,
    status: m.status,
  }));
}

// ─── Product List (for dropdowns) ───────────────────────────────────

/**
 * getProductList — feeds the RefillModal dropdown + similar pickers.
 *
 * Default: only returns ACTIVE products (~30-50) so the operator isn't
 * scrolling past 6000+ bulk-imported orphan SKUs to log a refill. Active
 * = has on-hand stock, machine presence, recent sales, OR operator-set
 * metadata (barcode / vendor / vend price).
 *
 * Pass `{ includeAll: true }` when you genuinely need the full catalog
 * (e.g. an admin tool that's looking up an orphan SKU by name).
 */
export async function getProductList(
  opts: { includeAll?: boolean } = {}
): Promise<Array<{ id: string; name: string; sku: string }>> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, vendor, barcode, default_vend_price")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(`getProductList: ${error.message}`);
  const allProducts = (data || []) as Array<{
    id: string;
    name: string;
    sku: string;
    vendor?: string | null;
    barcode?: string | null;
    default_vend_price?: number | null;
  }>;

  if (opts.includeAll) {
    return allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
  }

  // The UPC bulk-import set barcode + vendor on all 6000+ products, so
  // those fields don't separate "actually used" from "Excel dump". The
  // only honest signals are real activity: stock, machine presence,
  // sales, non-sale stock movements (purchase/refill/correction), or an
  // operator-set vend price.
  const ids = allProducts.map((p) => p.id);
  const [warehouseRes, machineInvRes, salesRes, movementsRes] = await Promise.all([
    supabase
      .from("warehouse_inventory")
      .select("product_id")
      .eq("company_id", companyId)
      .gt("on_hand", 0),
    supabase
      .from("machine_inventory")
      .select("product_id")
      .gt("estimated_remaining", 0),
    supabase
      .from("daily_sales")
      .select("product_id")
      .gte("sale_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .in("product_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("stock_movements")
      .select("product_id")
      .in("reason", ["purchase", "refill", "count_correction", "spoilage", "damage"])
      .limit(20000),
  ]);
  const has = new Set<string>([
    ...((warehouseRes.data || []).map((r) => r.product_id as string)),
    ...((machineInvRes.data || []).map((r) => r.product_id as string)),
    ...((salesRes.data || []).map((r) => r.product_id as string)),
    ...((movementsRes.data || []).map((r) => r.product_id as string)),
  ]);

  return allProducts
    .filter((p) => {
      if (has.has(p.id)) return true;
      const price = p.default_vend_price || 0;
      return price > 0;
    })
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku }));
}
