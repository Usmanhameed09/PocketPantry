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
  kind: "low_stock" | "spike" | "machine_offline" | "expiry" | "underperformer";
  productId: string | null;
  productName: string | null;
  machineId: string | null;
  machineName: string | null;
  severity: "low" | "medium" | "high";
  message: string;
  daysRemaining: number | null;
  recommendedQty: number | null;
  ageHours: number | null;
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

const OFFLINE_HOURS_THRESHOLD = Number(process.env.MACHINE_OFFLINE_HOURS) || 24;

/**
 * Detect machines that haven't reported any inventory update in the last
 * MACHINE_OFFLINE_HOURS hours. We can't get this directly from Nayax/Chinese
 * APIs yet (we asked for the access), so we infer from "last time the sync
 * wrote machine_inventory rows for this machine".
 *
 * Returns the number of alerts created + machines marked offline.
 */
async function scanOfflineMachines(): Promise<{ created: number; marked: number }> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  const { data: machines } = await supabase
    .from("machines")
    .select("id, name, status, last_sync_at")
    .eq("company_id", companyId);
  if (!machines?.length) return { created: 0, marked: 0 };

  // Find latest updated_at per machine from machine_inventory (more reliable
  // than machines.last_sync_at since the sync writes there each run).
  const { data: invRows } = await supabase
    .from("machine_inventory")
    .select("machine_id, updated_at")
    .in("machine_id", machines.map((m) => m.id as string))
    .order("updated_at", { ascending: false });

  const latestByMachine = new Map<string, string>();
  for (const r of invRows || []) {
    const mid = r.machine_id as string;
    if (!latestByMachine.has(mid)) {
      latestByMachine.set(mid, r.updated_at as string);
    }
  }

  // Existing open offline alerts so we don't duplicate
  const { data: openAlertsRaw } = await supabase
    .from("alerts")
    .select("id, machine_id, status, metadata")
    .eq("company_id", companyId)
    .eq("status", "open")
    .not("machine_id", "is", null);
  const openOfflineByMachine = new Set(
    (openAlertsRaw || [])
      .filter((a) => ((a.metadata as { kind?: string } | null)?.kind) === "machine_offline")
      .map((a) => a.machine_id as string)
  );

  const now = Date.now();
  const thresholdMs = OFFLINE_HOURS_THRESHOLD * 3600 * 1000;
  const newAlerts: Array<Record<string, unknown>> = [];
  const offlineIds: string[] = [];
  const recoveredIds: string[] = [];

  for (const m of machines) {
    const machineId = m.id as string;
    // Prefer machine_inventory.updated_at; fall back to machines.last_sync_at
    const latestStr = latestByMachine.get(machineId) || (m.last_sync_at as string | null);
    if (!latestStr) {
      // Never synced — skip (different problem; could fire later if needed)
      continue;
    }
    const latest = new Date(latestStr).getTime();
    const ageMs = now - latest;
    const ageHours = Math.round(ageMs / 36000) / 100; // 2 decimals

    if (ageMs > thresholdMs) {
      // Offline — mark + alert (if not already alerted)
      offlineIds.push(machineId);
      if (!openOfflineByMachine.has(machineId)) {
        newAlerts.push({
          company_id: companyId,
          type: "low_stock", // reuse existing enum; metadata.kind distinguishes
          machine_id: machineId,
          severity: ageHours > 72 ? "high" : "medium",
          message: `${m.name} hasn't reported in ${ageHours.toFixed(1)} hours — likely offline or unplugged.`,
          metadata: { kind: "machine_offline", ageHours, lastSeen: latestStr },
        });
      }
    } else if (m.status === "offline") {
      // Came back online — mark healthy + resolve any open offline alerts
      recoveredIds.push(machineId);
    }
  }

  // Update statuses
  if (offlineIds.length > 0) {
    await supabase.from("machines").update({ status: "offline" }).in("id", offlineIds);
  }
  if (recoveredIds.length > 0) {
    await supabase.from("machines").update({ status: "healthy" }).in("id", recoveredIds);
    // Resolve open offline alerts for recovered machines
    const idsToResolve = (openAlertsRaw || [])
      .filter((a) =>
        ((a.metadata as { kind?: string } | null)?.kind) === "machine_offline" &&
        recoveredIds.includes(a.machine_id as string)
      )
      .map((a) => a.id as string);
    if (idsToResolve.length > 0) {
      await supabase
        .from("alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .in("id", idsToResolve);
    }
  }

  let created = 0;
  if (newAlerts.length > 0) {
    const { error } = await supabase.from("alerts").insert(newAlerts);
    if (!error) created = newAlerts.length;
  }

  return { created, marked: offlineIds.length };
}

/**
 * Targeted alert refresh for a single product. Called from the stock-movement
 * endpoint right after a "purchase" or "refill" so a scan or manual restock
 * makes the matching low-stock alert disappear immediately, without waiting
 * for the next full scanAndPersistAlerts() pass.
 *
 * Approach: if on-hand is now at or above the alert's recommended_qty
 * (what we told the operator to buy), the alert is satisfied — resolve it.
 * If not, leave it in place; the next full scan will recompute properly.
 *
 * Returns the number of alerts dismissed (0 in the common case where nothing
 * was over-threshold).
 */
export async function resolveAlertsForProduct(productId: string): Promise<number> {
  if (!productId) return 0;
  try {
    const supabase = createServerClient();
    const { data: alerts } = await supabase
      .from("alerts")
      .select("id, recommended_qty")
      .eq("product_id", productId)
      .eq("type", "low_stock")
      .eq("status", "open");
    if (!alerts || alerts.length === 0) return 0;

    const { data: wh } = await supabase
      .from("warehouse_inventory")
      .select("on_hand")
      .eq("product_id", productId)
      .maybeSingle();
    const onHand = (wh?.on_hand as number) || 0;

    const toResolve = alerts.filter(
      (a) => onHand >= ((a.recommended_qty as number) || 0)
    );
    if (toResolve.length === 0) return 0;

    await supabase
      .from("alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .in("id", toResolve.map((a) => a.id as string));
    return toResolve.length;
  } catch {
    return 0;
  }
}

export async function scanAndPersistAlerts(): Promise<{ created: number; dismissed: number; offlineCreated?: number; offlineMarked?: number }> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const projections = await getProjections();
  const settings = await getProjectionSettings();
  const thresholds = await getThresholdDaysByProduct();
  const categoryDefaults = (thresholds as unknown as { _categoryDefaults: Map<string, number> })._categoryDefaults;

  // Detect offline machines first — independent of stock-level checks
  const offlineResult = await scanOfflineMachines();

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

  return {
    created,
    dismissed: dismissIds.length,
    offlineCreated: offlineResult.created,
    offlineMarked: offlineResult.marked,
  };
}

export async function listAlerts(includeResolved = false): Promise<Alert[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  let query = supabase
    .from("alerts")
    .select("id, type, product_id, machine_id, severity, message, days_remaining, recommended_qty, status, created_at, metadata, products(name), machines(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!includeResolved) {
    query = query.in("status", ["open", "acknowledged"]);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listAlerts: ${error.message}`);
  return (data || []).map((a) => {
    const meta = (a.metadata as { kind?: string; ageHours?: number } | null) || {};
    const kind = (meta.kind as Alert["kind"]) || (a.type as Alert["kind"]);
    return {
      id: a.id as string,
      type: a.type as Alert["type"],
      kind,
      productId: (a.product_id as string | null) ?? null,
      productName: ((a.products as unknown) as { name?: string } | null)?.name ?? null,
      machineId: (a.machine_id as string | null) ?? null,
      machineName: ((a.machines as unknown) as { name?: string } | null)?.name ?? null,
      severity: a.severity as Alert["severity"],
      message: a.message as string,
      daysRemaining: (a.days_remaining as number | null) ?? null,
      recommendedQty: (a.recommended_qty as number | null) ?? null,
      ageHours: typeof meta.ageHours === "number" ? meta.ageHours : null,
      status: a.status as Alert["status"],
      createdAt: a.created_at as string,
    };
  });
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
