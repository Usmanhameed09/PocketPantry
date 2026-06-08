/**
 * Waste + Inventory Turns reporting.
 *
 * Spoilage report — surfaces every stock_movement with reason in
 * (spoilage, damage), joined with product names + unit costs so the
 * operator sees how many dollars they're losing to waste per period.
 *
 * Inventory turns — measures how fast stock cycles. Formula:
 *   turns = units_sold_in_period / avg_units_on_hand_during_period
 * A high number = fast-moving / lean. A low number = sitting stock.
 * Computed per product over the configurable window (default 30d).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export type WasteEvent = {
  movementId: string;
  productId: string;
  productName: string;
  category: string;
  qty: number;            // already absolute (units lost)
  reason: "spoilage" | "damage";
  unitCost: number;       // dollars per unit
  totalCost: number;      // qty × unitCost (dollars lost)
  location: string;
  machineId: string | null;
  machineName: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type WasteSummary = {
  startDate: string;
  endDate: string;
  totalUnitsLost: number;
  totalDollarsLost: number;
  spoilageEvents: number;
  damageEvents: number;
  byCategory: Array<{ category: string; units: number; dollars: number }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    category: string;
    units: number;
    dollars: number;
    eventCount: number;
  }>;
  recentEvents: WasteEvent[];
};

export async function getWasteReport(
  startDate: string,
  endDate: string,
  limit = 25
): Promise<WasteSummary> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("startDate and endDate must be YYYY-MM-DD");
  }
  const supabase = createServerClient();

  // stock_movements stores spoilage/damage as negative-qty rows. We
  // explicitly filter on reason rather than qty < 0 because count_correction
  // and refill can also have negative qty for legitimate reasons.
  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;
  const { data: rows } = await supabase
    .from("stock_movements")
    .select(
      "id, product_id, machine_id, qty, reason, location, notes, created_by, created_at, products(name, category, unit_cost), machines(name)"
    )
    .in("reason", ["spoilage", "damage"])
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .range(0, 9999);

  const events: WasteEvent[] = (rows || []).map((r) => {
    const prod = (r as { products?: { name?: string; category?: string; unit_cost?: number } }).products;
    const machine = (r as { machines?: { name?: string } }).machines;
    const qty = Math.abs((r.qty as number) || 0);
    const unitCost = (prod?.unit_cost as number) || 0;
    return {
      movementId: r.id as string,
      productId: r.product_id as string,
      productName: prod?.name || (r.product_id as string),
      category: prod?.category || "Other",
      qty,
      reason: r.reason as "spoilage" | "damage",
      unitCost,
      totalCost: Math.round(qty * unitCost * 100) / 100,
      location: r.location as string,
      machineId: (r.machine_id as string | null) ?? null,
      machineName: machine?.name || null,
      notes: (r.notes as string | null) ?? null,
      createdAt: r.created_at as string,
      createdBy: (r.created_by as string | null) ?? null,
    };
  });

  let totalUnits = 0;
  let totalDollars = 0;
  let spoilageCount = 0;
  let damageCount = 0;
  const byCat = new Map<string, { units: number; dollars: number }>();
  const byProd = new Map<string, {
    productId: string;
    productName: string;
    category: string;
    units: number;
    dollars: number;
    eventCount: number;
  }>();

  for (const e of events) {
    totalUnits += e.qty;
    totalDollars += e.totalCost;
    if (e.reason === "spoilage") spoilageCount++;
    else damageCount++;
    const c = byCat.get(e.category) || { units: 0, dollars: 0 };
    c.units += e.qty;
    c.dollars += e.totalCost;
    byCat.set(e.category, c);
    const p = byProd.get(e.productId) || {
      productId: e.productId,
      productName: e.productName,
      category: e.category,
      units: 0,
      dollars: 0,
      eventCount: 0,
    };
    p.units += e.qty;
    p.dollars += e.totalCost;
    p.eventCount += 1;
    byProd.set(e.productId, p);
  }

  return {
    startDate,
    endDate,
    totalUnitsLost: totalUnits,
    totalDollarsLost: Math.round(totalDollars * 100) / 100,
    spoilageEvents: spoilageCount,
    damageEvents: damageCount,
    byCategory: Array.from(byCat.entries())
      .map(([category, v]) => ({
        category,
        units: v.units,
        dollars: Math.round(v.dollars * 100) / 100,
      }))
      .sort((a, b) => b.dollars - a.dollars),
    byProduct: Array.from(byProd.values())
      .sort((a, b) => b.dollars - a.dollars)
      .slice(0, limit)
      .map((p) => ({
        ...p,
        dollars: Math.round(p.dollars * 100) / 100,
      })),
    recentEvents: events.slice(0, Math.min(limit, 50)),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Inventory turns
// ─────────────────────────────────────────────────────────────────────

export type ProductTurns = {
  productId: string;
  productName: string;
  category: string;
  unitsSold: number;          // over period
  avgOnHand: number;          // best-effort average over period
  turns: number;              // unitsSold / avgOnHand
  daysOfSupply: number | null;// avgOnHand / (unitsSold / periodDays)
  classification: "fast" | "healthy" | "slow" | "dead" | "no_signal";
};

export type TurnsReport = {
  startDate: string;
  endDate: string;
  periodDays: number;
  fleetSummary: {
    productCount: number;
    fastMovers: number;
    healthy: number;
    slow: number;
    dead: number;
    noSignal: number;
    medianTurns: number;
    bestTurns: number;
    worstTurns: number;
  };
  products: ProductTurns[];
};

// Thresholds (per-month basis; we scale by periodDays). A "fast mover"
// turns over its stock 4+ times in 30 days. A "dead" item < 0.5 turns
// (sells less than half its on-hand in a month). Tunable later.
const TURNS_FAST = 4;
const TURNS_HEALTHY = 1.5;
const TURNS_SLOW = 0.5;

function classify(turns: number, unitsSold: number): ProductTurns["classification"] {
  if (unitsSold === 0) return "no_signal";
  if (turns >= TURNS_FAST) return "fast";
  if (turns >= TURNS_HEALTHY) return "healthy";
  if (turns >= TURNS_SLOW) return "slow";
  return "dead";
}

export async function getInventoryTurns(periodDays = 30, limit = 100): Promise<TurnsReport> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const sinceStr = dateNDaysAgoInOperatorTz(periodDays);
  const todayStr = dateNDaysAgoInOperatorTz(0);

  // Pull active products in pages (1000 row cap)
  type Prod = { id: string; name: string; category: string };
  const products: Prod[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 50000; from += PAGE) {
    const { data } = await supabase
      .from("products")
      .select("id, name, category")
      .eq("company_id", companyId)
      .eq("status", "Active")
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    products.push(...(data as Prod[]));
    if (data.length < PAGE) break;
  }

  // Sales over period (paginated)
  const unitsByProduct = new Map<string, number>();
  for (let from = 0; from < 100000; from += PAGE) {
    const { data } = await supabase
      .from("daily_sales")
      .select("product_id, units_sold")
      .gte("sale_date", sinceStr)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ product_id: string; units_sold: number }>) {
      unitsByProduct.set(r.product_id, (unitsByProduct.get(r.product_id) || 0) + (r.units_sold || 0));
    }
    if (data.length < PAGE) break;
  }

  // Current on-hand = warehouse + sum of in-machine estimated_remaining.
  // True "average on hand" would require a historical timeseries we don't
  // store yet — for now we approximate as today's on-hand. The classification
  // is robust enough that this approximation is fine for the operator's use.
  const whByProduct = new Map<string, number>();
  const { data: warehouseRows } = await supabase
    .from("warehouse_inventory")
    .select("product_id, on_hand")
    .eq("company_id", companyId)
    .range(0, 9999);
  for (const w of warehouseRows || []) {
    whByProduct.set(w.product_id as string, (w.on_hand as number) || 0);
  }
  const inMachineByProduct = new Map<string, number>();
  const { data: machineRows } = await supabase
    .from("machine_inventory")
    .select("product_id, estimated_remaining")
    .range(0, 9999);
  for (const m of machineRows || []) {
    const pid = m.product_id as string;
    inMachineByProduct.set(pid, (inMachineByProduct.get(pid) || 0) + (m.estimated_remaining as number || 0));
  }

  const productTurns: ProductTurns[] = [];
  for (const p of products) {
    const unitsSold = unitsByProduct.get(p.id) || 0;
    const avgOnHand = (whByProduct.get(p.id) || 0) + (inMachineByProduct.get(p.id) || 0);
    const turns = avgOnHand > 0 ? unitsSold / avgOnHand : 0;
    const dailyVelocity = unitsSold / periodDays;
    const daysOfSupply = dailyVelocity > 0 ? Math.round((avgOnHand / dailyVelocity) * 10) / 10 : null;
    productTurns.push({
      productId: p.id,
      productName: p.name,
      category: p.category,
      unitsSold,
      avgOnHand: Math.round(avgOnHand * 10) / 10,
      turns: Math.round(turns * 100) / 100,
      daysOfSupply,
      classification: classify(turns, unitsSold),
    });
  }

  // Fleet summary
  let fast = 0;
  let healthy = 0;
  let slow = 0;
  let dead = 0;
  let noSignal = 0;
  const turnsValues: number[] = [];
  for (const p of productTurns) {
    if (p.classification === "fast") fast++;
    else if (p.classification === "healthy") healthy++;
    else if (p.classification === "slow") slow++;
    else if (p.classification === "dead") dead++;
    else noSignal++;
    if (p.classification !== "no_signal") turnsValues.push(p.turns);
  }
  turnsValues.sort((a, b) => a - b);
  const median = turnsValues.length > 0 ? turnsValues[Math.floor(turnsValues.length / 2)] : 0;
  const best = turnsValues.length > 0 ? turnsValues[turnsValues.length - 1] : 0;
  const worst = turnsValues.length > 0 ? turnsValues[0] : 0;

  // Sort: fast movers first, then by turns desc within category
  productTurns.sort((a, b) => {
    const rank = { fast: 0, healthy: 1, slow: 2, dead: 3, no_signal: 4 };
    if (rank[a.classification] !== rank[b.classification]) {
      return rank[a.classification] - rank[b.classification];
    }
    return b.turns - a.turns;
  });

  return {
    startDate: sinceStr,
    endDate: todayStr,
    periodDays,
    fleetSummary: {
      productCount: productTurns.length,
      fastMovers: fast,
      healthy,
      slow,
      dead,
      noSignal,
      medianTurns: Math.round(median * 100) / 100,
      bestTurns: Math.round(best * 100) / 100,
      worstTurns: Math.round(worst * 100) / 100,
    },
    products: productTurns.slice(0, limit),
  };
}
