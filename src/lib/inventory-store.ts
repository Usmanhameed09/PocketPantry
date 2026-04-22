/**
 * Inventory data layer — Supabase helpers for the inventory system.
 * Handles company/product/machine upserts + inventory queries.
 */

import { createServerClient } from "@/lib/supabase";

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

// ─── Refill Logging ─────────────────────────────────────────────────

export async function logRefill(params: {
  machineId: string;
  items: Array<{ productId: string; quantity: number }>;
  refillDate?: string;
}): Promise<void> {
  const supabase = createServerClient();
  const refillAt = params.refillDate || new Date().toISOString();

  for (const item of params.items) {
    const { error } = await supabase.from("machine_inventory").upsert(
      {
        machine_id: params.machineId,
        product_id: item.productId,
        last_loaded_qty: item.quantity,
        estimated_remaining: item.quantity, // Fresh refill = full stock
        last_refill_at: refillAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "machine_id,product_id" }
    );
    if (error) throw new Error(`logRefill: ${error.message}`);
  }
}

// ─── Inventory Overview ─────────────────────────────────────────────

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  onHand: number;       // warehouse qty
  inMachines: number;   // sum of estimated_remaining across machines
  dailySales: number;   // avg daily sales rate
  daysLeft: number;     // (onHand + inMachines) / dailySales
  leadTimeDays: number;
  restockStatus: "OK" | "Low" | "Critical" | "Out";
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
    .select("id, name, sku, category, lead_time_days")
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

    let restockStatus: InventoryProduct["restockStatus"] = "OK";
    if (totalStock === 0 && dailySales > 0) restockStatus = "Out";
    else if (daysLeft <= leadTime) restockStatus = "Critical";
    else if (daysLeft <= leadTime * 2) restockStatus = "Low";

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      onHand,
      inMachines,
      dailySales: Math.round(dailySales * 100) / 100,
      daysLeft,
      leadTimeDays: leadTime,
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

export async function getProductList(): Promise<
  Array<{ id: string; name: string; sku: string }>
> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw new Error(`getProductList: ${error.message}`);
  return data || [];
}
