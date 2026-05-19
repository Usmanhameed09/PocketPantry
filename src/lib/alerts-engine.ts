/**
 * Alerts engine (Sprint 5). Predictive low-stock + velocity-spike scan.
 * Run via cron (cron-job.org) hitting /api/cron/alerts-scan.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { getProjections, getProjectionSettings } from "@/lib/projection-engine";

export type Alert = {
  id: string;
  type: "low_stock" | "spike" | "expiry" | "underperformer";
  productId: string | null;
  productName: string | null;
  machineId: string | null;
  machineName: string | null;
  severity: "low" | "medium" | "high";
  message: string;
  daysRemaining: number | null;
  recommendedQty: number | null;
  status: "open" | "acknowledged" | "dismissed" | "resolved";
  createdAt: string;
};

const DEFAULT_THRESHOLD_DAYS = 5;
const SPIKE_RATIO = 1.3;

async function getThresholdDaysByProduct(): Promise<Map<string, number>> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("low_stock_rules")
    .select("product_id, category, threshold_days")
    .eq("company_id", companyId);
  const map = new Map<string, number>();
  const categoryDefaults = new Map<string, number>();
  for (const r of data || []) {
    if (r.product_id) {
      map.set(r.product_id as string, r.threshold_days as number);
    } else if (r.category) {
      categoryDefaults.set(r.category as string, r.threshold_days as number);
    }
  }
  // Save category defaults on a side channel — caller will need to consult.
  (map as unknown as { _categoryDefaults: Map<string, number> })._categoryDefaults = categoryDefaults;
  return map;
}

export async function scanAndPersistAlerts(): Promise<{ created: number; dismissed: number }> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const projections = await getProjections();
  const settings = await getProjectionSettings();
  const thresholds = await getThresholdDaysByProduct();
  const categoryDefaults = (thresholds as unknown as { _categoryDefaults: Map<string, number> })._categoryDefaults;

  const productIds = projections.map((p) => p.productId);
  const { data: warehouse } = await supabase
    .from("warehouse_inventory")
    .select("product_id, on_hand")
    .eq("company_id", companyId);
  const onHandByProduct = new Map(
    (warehouse || []).map((w) => [w.product_id as string, w.on_hand as number])
  );

  // Open PO coverage — sum of qty_ordered - qty_received from open POs
  const { data: poCoverage } = await supabase
    .from("po_lines")
    .select("product_id, qty_ordered, qty_received, purchase_orders!inner(status)")
    .in("purchase_orders.status", ["Draft", "Approved", "Purchased"])
    .in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);
  const coverageByProduct = new Map<string, number>();
  for (const c of (poCoverage || []) as Array<{
    product_id: string;
    qty_ordered: number;
    qty_received: number;
  }>) {
    const open = (c.qty_ordered || 0) - (c.qty_received || 0);
    if (open > 0) coverageByProduct.set(c.product_id, (coverageByProduct.get(c.product_id) || 0) + open);
  }

  // Pull previous week's velocity (for spike detection)
  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const prevWeekStart = new Date();
  prevWeekStart.setDate(prevWeekStart.getDate() - 14);
  const { data: lastWeekMoves } = await supabase
    .from("stock_movements")
    .select("product_id, qty, created_at")
    .eq("reason", "sale_estimate")
    .gte("created_at", lastWeekStart.toISOString());
  const { data: prevWeekMoves } = await supabase
    .from("stock_movements")
    .select("product_id, qty, created_at")
    .eq("reason", "sale_estimate")
    .gte("created_at", prevWeekStart.toISOString())
    .lt("created_at", lastWeekStart.toISOString());

  const lastWeekSales = new Map<string, number>();
  for (const m of lastWeekMoves || []) {
    const pid = m.product_id as string;
    lastWeekSales.set(pid, (lastWeekSales.get(pid) || 0) + Math.abs(m.qty as number));
  }
  const prevWeekSales = new Map<string, number>();
  for (const m of prevWeekMoves || []) {
    const pid = m.product_id as string;
    prevWeekSales.set(pid, (prevWeekSales.get(pid) || 0) + Math.abs(m.qty as number));
  }

  // Existing open alerts so we don't duplicate
  const { data: openAlerts } = await supabase
    .from("alerts")
    .select("id, type, product_id, machine_id, days_remaining")
    .eq("company_id", companyId)
    .eq("status", "open");
  const openAlertKeys = new Set<string>();
  for (const a of openAlerts || []) {
    openAlertKeys.add(`${a.type}::${a.product_id || ""}::${a.machine_id || ""}`);
  }

  const newAlerts: Array<Record<string, unknown>> = [];

  // Identify products that have any real stock signal — either a received PO,
  // a logged refill, or a non-zero warehouse balance from any non-sale movement.
  // Without ANY of those we have no idea what's in the machines and the
  // alert would be pure noise.
  const { data: stockSignals } = await supabase
    .from("stock_movements")
    .select("product_id, reason")
    .in("reason", ["purchase", "refill", "count_correction"])
    .limit(10000);
  const productsWithStockSignal = new Set(
    (stockSignals || []).map((m) => m.product_id as string)
  );

  // ---- Low stock alerts (only fire when we have a real stock signal) ----
  for (const p of projections) {
    // Skip products with no stock history — we don't know what's in machines
    if (!productsWithStockSignal.has(p.productId)) continue;

    const onHand = onHandByProduct.get(p.productId) || 0;
    const incoming = coverageByProduct.get(p.productId) || 0;
    const effectiveStock = onHand + incoming;
    const dailyVelocity = p.velocityPerDay * (p.seasonalMultiplier || 1);
    if (dailyVelocity <= 0) continue;
    const daysRemaining = Math.floor(effectiveStock / dailyVelocity);
    const threshold =
      thresholds.get(p.productId) ?? categoryDefaults.get(p.category) ?? DEFAULT_THRESHOLD_DAYS;

    if (daysRemaining < threshold) {
      const key = `low_stock::${p.productId}::`;
      if (openAlertKeys.has(key)) continue;
      const recommendedQty = Math.ceil(dailyVelocity * (threshold + settings.safetyStockDays));
      newAlerts.push({
        company_id: companyId,
        type: "low_stock",
        product_id: p.productId,
        severity: daysRemaining <= 1 ? "high" : daysRemaining <= 3 ? "medium" : "low",
        message: `${p.productName}: ${daysRemaining}d left (threshold ${threshold}d). Recommended buy: ${recommendedQty}.`,
        days_remaining: daysRemaining,
        recommended_qty: recommendedQty,
        metadata: { onHand, incoming, velocity: dailyVelocity },
      });
    }
  }

  // ---- Spike alerts ----
  for (const p of projections) {
    const last = lastWeekSales.get(p.productId) || 0;
    const prev = prevWeekSales.get(p.productId) || 0;
    if (prev <= 5) continue; // ignore noise
    if (last / prev >= SPIKE_RATIO) {
      const key = `spike::${p.productId}::`;
      if (openAlertKeys.has(key)) continue;
      newAlerts.push({
        company_id: companyId,
        type: "spike",
        product_id: p.productId,
        severity: "medium",
        message: `${p.productName}: sales up ${Math.round((last / prev - 1) * 100)}% week-over-week. Consider raising par level.`,
        days_remaining: null,
        recommended_qty: null,
        metadata: { lastWeek: last, prevWeek: prev },
      });
    }
  }

  // ---- Auto-resolve alerts that no longer apply ----
  const productsStillTriggered = new Set(
    newAlerts.filter((a) => a.type === "low_stock").map((a) => a.product_id as string)
  );
  const dismissIds: string[] = [];
  for (const a of openAlerts || []) {
    if (a.type !== "low_stock") continue;
    if (!productsStillTriggered.has(a.product_id as string)) {
      // Re-check current days_remaining; only auto-resolve if back above threshold
      const p = projections.find((x) => x.productId === a.product_id);
      if (!p) continue;
      const onHand = onHandByProduct.get(p.productId) || 0;
      const incoming = coverageByProduct.get(p.productId) || 0;
      const velocity = p.velocityPerDay * (p.seasonalMultiplier || 1);
      if (velocity <= 0) continue;
      const dr = Math.floor((onHand + incoming) / velocity);
      const threshold =
        thresholds.get(p.productId) ?? categoryDefaults.get(p.category) ?? DEFAULT_THRESHOLD_DAYS;
      if (dr >= threshold) dismissIds.push(a.id as string);
    }
  }

  let created = 0;
  if (newAlerts.length > 0) {
    const { error } = await supabase.from("alerts").insert(newAlerts);
    if (error) throw new Error(`scanAndPersistAlerts insert: ${error.message}`);
    created = newAlerts.length;
  }

  if (dismissIds.length > 0) {
    await supabase
      .from("alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("id", dismissIds);
  }

  return { created, dismissed: dismissIds.length };
}

export async function listAlerts(includeResolved = false): Promise<Alert[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  let query = supabase
    .from("alerts")
    .select("id, type, product_id, machine_id, severity, message, days_remaining, recommended_qty, status, created_at, products(name), machines(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!includeResolved) {
    query = query.in("status", ["open", "acknowledged"]);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listAlerts: ${error.message}`);
  return (data || []).map((a) => ({
    id: a.id as string,
    type: a.type as Alert["type"],
    productId: (a.product_id as string | null) ?? null,
    productName: ((a.products as unknown) as { name?: string } | null)?.name ?? null,
    machineId: (a.machine_id as string | null) ?? null,
    machineName: ((a.machines as unknown) as { name?: string } | null)?.name ?? null,
    severity: a.severity as Alert["severity"],
    message: a.message as string,
    daysRemaining: (a.days_remaining as number | null) ?? null,
    recommendedQty: (a.recommended_qty as number | null) ?? null,
    status: a.status as Alert["status"],
    createdAt: a.created_at as string,
  }));
}

export async function acknowledgeAlert(id: string) {
  const supabase = createServerClient();
  await supabase.from("alerts").update({ status: "acknowledged" }).eq("id", id);
}

export async function dismissAlert(id: string) {
  const supabase = createServerClient();
  await supabase
    .from("alerts")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", id);
}
