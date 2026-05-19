/**
 * Inventory ledger — every stock change is an immutable row in
 * stock_movements. Current on-hand = SUM(qty) per product/location.
 *
 * Used by Sprint 1 (warehouse adjustments), Sprint 2 (refills),
 * Sprint 4 (PO receiving), and any sale-estimate writeback.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";

export type StockReason =
  | "purchase"
  | "refill"
  | "spoilage"
  | "damage"
  | "count_correction"
  | "sale_estimate"
  | "transfer";

export type StockMovement = {
  productId: string;
  location: "warehouse" | string; // "warehouse" or machine_id string
  machineId?: string | null;
  qty: number; // positive = in, negative = out
  reason: StockReason;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

export async function recordStockMovement(movement: StockMovement) {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("stock_movements").insert({
    product_id: movement.productId,
    location: movement.location,
    machine_id: movement.machineId ?? null,
    qty: movement.qty,
    reason: movement.reason,
    reference_id: movement.referenceId ?? null,
    notes: movement.notes ?? null,
    created_by: movement.createdBy ?? null,
  }).select("id").single();

  if (error) throw new Error(`recordStockMovement: ${error.message}`);

  // Mirror the running total into the existing warehouse_inventory /
  // machine_inventory rollup tables so reads stay fast.
  if (movement.location === "warehouse") {
    await reconcileWarehouseOnHand(movement.productId);
  } else if (movement.machineId) {
    await reconcileMachineEstimate(movement.machineId, movement.productId);
  }
  return data?.id as string | undefined;
}

export async function recordStockMovements(movements: StockMovement[]) {
  for (const m of movements) {
    await recordStockMovement(m);
  }
}

async function reconcileWarehouseOnHand(productId: string) {
  const supabase = createServerClient();
  const { data: balance } = await supabase
    .from("stock_movements")
    .select("qty")
    .eq("product_id", productId)
    .eq("location", "warehouse");

  const onHand = (balance || []).reduce((s, r) => s + (r.qty as number), 0);

  // Need company_id from the product
  const { data: prod } = await supabase
    .from("products")
    .select("company_id")
    .eq("id", productId)
    .maybeSingle();

  if (!prod?.company_id) return;

  await supabase.from("warehouse_inventory").upsert(
    {
      company_id: prod.company_id,
      product_id: productId,
      on_hand: Math.max(0, onHand),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,product_id" }
  );
}

async function reconcileMachineEstimate(machineId: string, productId: string) {
  const supabase = createServerClient();
  const { data: movements } = await supabase
    .from("stock_movements")
    .select("qty, reason, created_at")
    .eq("product_id", productId)
    .eq("machine_id", machineId)
    .order("created_at", { ascending: true });

  if (!movements || movements.length === 0) return;

  // Estimated remaining = sum of refill loads − sum of sales since last refill.
  // Restart accumulation at each new refill.
  let lastLoaded = 0;
  let lastRefillAt: string | null = null;
  let sinceRefill = 0;
  for (const m of movements) {
    if (m.reason === "refill") {
      lastLoaded = m.qty as number;
      sinceRefill = 0;
      lastRefillAt = (m as { created_at?: string }).created_at ?? null;
    } else if (m.reason === "sale_estimate") {
      sinceRefill += Math.abs(m.qty as number);
    }
  }
  const estimated = Math.max(0, lastLoaded - sinceRefill);

  await supabase.from("machine_inventory").upsert(
    {
      machine_id: machineId,
      product_id: productId,
      last_loaded_qty: lastLoaded,
      estimated_remaining: estimated,
      last_refill_at: lastRefillAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "machine_id,product_id" }
  );
}

export async function listStockMovements(
  productId: string,
  limit = 50
): Promise<Array<{
  id: string;
  qty: number;
  reason: StockReason;
  location: string;
  machineId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, qty, reason, location, machine_id, notes, created_by, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listStockMovements: ${error.message}`);
  return (data || []).map((r) => ({
    id: r.id as string,
    qty: r.qty as number,
    reason: r.reason as StockReason,
    location: r.location as string,
    machineId: (r.machine_id as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
