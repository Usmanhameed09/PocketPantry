/**
 * Builds a compact data snapshot for the AI assistant — gives GPT-4o enough
 * context to answer questions like "what should I remove?" or "where should
 * I put this new product?" without exceeding token limits.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { getProjections } from "@/lib/projection-engine";
import { findUnderperformers } from "@/lib/product-proposals";
import { listAlerts } from "@/lib/alerts-engine";

export type AssistantContext = {
  generatedAt: string;
  dataWindow: string;
  metricsGlossary: string;
  totals: {
    products: number;
    machines: number;
    productsWithSales: number;
    openAlerts: number;
    underperformers: number;
  };
  // Fleet-wide top sellers: numbers are SUMS across all machines.
  topSellersFleetWide: Array<{
    name: string;
    category: string;
    fleetVelocityPerDay: number;        // sum across all machines
    fleetMonthlyUnits: number;          // ≈ fleetVelocityPerDay × 30
    avgPerMachinePerDay: number;        // = fleetVelocity / activeMachines (rough)
    activeMachines: number;             // how many machines sell this
    margin: number | null;
  }>;
  underperformers: Array<{
    name: string; category: string; fleetMonthlyUnits: number; margin: number | null; reason: string;
  }>;
  alerts: Array<{ severity: string; message: string }>;
  categoryBreakdownFleetWide: Array<{
    category: string; count: number;
    fleetDailyVelocity: number; fleetMonthlyUnits: number;
  }>;
  machines: Array<{
    name: string; status: string; productCount: number;
    machineDailyRevenue?: number;
    machineDailyUnits: number;
    machineMonthlyUnits: number;
    // ALL products selling on this machine with their PER-MACHINE rate (not fleet)
    products: Array<{
      name: string; category: string;
      machineDailyUnits: number;
      machineMonthlyUnits: number;
    }>;
    categoryMix: Record<string, number>;
  }>;
  weeklyTrends: {
    available: boolean;
    daysOfData: number;
    lastWeekTotal: number;
    priorWeekTotal: number;
    fleetWoWPct: number;
    spikes: Array<{ name: string; lastWeek: number; priorWeek: number; pct: number }>;
    declines: Array<{ name: string; lastWeek: number; priorWeek: number; pct: number }>;
    topSellersThisWeek: Array<{ name: string; units: number }>;
  };
};

export async function buildAssistantContext(): Promise<AssistantContext> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // Run independent queries in parallel
  const [projections, alerts, underperformersRaw, productsRes, machinesRes] = await Promise.all([
    getProjections(),
    listAlerts(false),
    findUnderperformers(),
    supabase.from("products").select("id, name, category, default_vend_price, unit_cost", { count: "exact" }).eq("company_id", companyId).range(0, 9999),
    supabase.from("machines").select("id, name, status").eq("company_id", companyId),
  ]);

  const products = productsRes.data || [];
  const productCount = productsRes.count || products.length;
  const machines = machinesRes.data || [];

  // Top sellers by FLEET velocity — Nayax 30-day avg summed across machines
  const withVelocity = projections.filter((p) => p.velocityPerDay > 0);
  // Per-product machine count
  const { data: machineCounts } = await supabase
    .from("machine_inventory")
    .select("product_id, machine_id")
    .gt("daily_sales_rate", 0);
  const machinesPerProduct = new Map<string, Set<string>>();
  for (const m of machineCounts || []) {
    const pid = m.product_id as string;
    if (!machinesPerProduct.has(pid)) machinesPerProduct.set(pid, new Set());
    machinesPerProduct.get(pid)!.add(m.machine_id as string);
  }

  const topSellersFleetWide = withVelocity
    .sort((a, b) => b.velocityPerDay - a.velocityPerDay)
    .slice(0, 20)
    .map((p) => {
      const product = products.find((pr) => pr.id === p.productId);
      const price = product?.default_vend_price as number | null;
      const cost = product?.unit_cost as number | null;
      const margin = price && cost && price > 0 ? Math.round(((price - cost) / price) * 100) : null;
      const activeMachines = machinesPerProduct.get(p.productId)?.size || 0;
      const fleetVelocity = Math.round(p.velocityPerDay * 100) / 100;
      const avgPerMachine = activeMachines > 0
        ? Math.round((fleetVelocity / activeMachines) * 100) / 100
        : fleetVelocity;
      return {
        name: p.productName,
        category: p.category,
        fleetVelocityPerDay: fleetVelocity,
        fleetMonthlyUnits: p.projectedUnits30d,
        avgPerMachinePerDay: avgPerMachine,
        activeMachines,
        margin,
      };
    });

  // Category breakdown — fleet-wide sales (sum across machines)
  const catMap = new Map<string, { count: number; totalDailyVelocity: number }>();
  for (const p of products) {
    const cat = (p.category as string) || "Snacks";
    const v = projections.find((x) => x.productId === p.id)?.velocityPerDay || 0;
    const e = catMap.get(cat) || { count: 0, totalDailyVelocity: 0 };
    e.count++;
    e.totalDailyVelocity += v;
    catMap.set(cat, e);
  }
  const categoryBreakdownFleetWide = Array.from(catMap.entries())
    .map(([category, e]) => ({
      category,
      count: e.count,
      fleetDailyVelocity: Math.round(e.totalDailyVelocity * 100) / 100,
      fleetMonthlyUnits: Math.round(e.totalDailyVelocity * 30),
    }))
    .sort((a, b) => b.fleetDailyVelocity - a.fleetDailyVelocity);

  // Per-machine product list — PER-MACHINE rates (NOT fleet totals)
  const { data: machineInv } = await supabase
    .from("machine_inventory")
    .select("machine_id, product_id, daily_sales_rate, products(name, category)");
  const byMachine = new Map<string, Array<{ name: string; category: string; rate: number }>>();
  for (const m of machineInv || []) {
    const mid = m.machine_id as string;
    const prod = (m.products as unknown) as { name?: string; category?: string } | null;
    const arr = byMachine.get(mid) || [];
    arr.push({
      name: prod?.name || "?",
      category: prod?.category || "Snacks",
      rate: (m.daily_sales_rate as number) || 0,
    });
    byMachine.set(mid, arr);
  }
  const machineRows = machines.map((m) => {
    const items = (byMachine.get(m.id as string) || []).filter((x) => x.rate > 0).sort((a, b) => b.rate - a.rate);
    const categoryMix: Record<string, number> = {};
    let dailyUnits = 0;
    for (const it of items) {
      categoryMix[it.category] = (categoryMix[it.category] || 0) + it.rate;
      dailyUnits += it.rate;
    }
    // Round category mix
    for (const k of Object.keys(categoryMix)) {
      categoryMix[k] = Math.round(categoryMix[k] * 10) / 10;
    }
    return {
      name: m.name as string,
      status: m.status as string,
      productCount: items.length,
      machineDailyUnits: Math.round(dailyUnits * 10) / 10,
      machineMonthlyUnits: Math.round(dailyUnits * 30),
      // ALL products on this machine (not just top 8) so the AI can answer
      // questions about any product on any specific machine accurately.
      products: items.map((x) => ({
        name: x.name,
        category: x.category,
        machineDailyUnits: Math.round(x.rate * 100) / 100,
        machineMonthlyUnits: Math.round(x.rate * 30),
      })),
      categoryMix,
    };
  });

  // Weekly trends — from daily_sales table (per-day units)
  const weeklyTrends = await buildWeeklyTrends(supabase);

  return {
    generatedAt: new Date().toISOString(),
    dataWindow: weeklyTrends.available
      ? `Velocity = Nayax 30-day average. Weekly trends pulled from daily_sales (last ${weeklyTrends.daysOfData} days of per-day data).`
      : "Velocity = Nayax 30-day average. Weekly trends not yet available (run the sync first).",
    metricsGlossary:
      "fleetVelocityPerDay / fleetMonthlyUnits = SUM across all active machines (e.g. 7.9/day total across 8 machines = ~1/day per machine, ~237/month fleet-wide). " +
      "avgPerMachinePerDay = fleet velocity ÷ number of machines selling this product (rough per-machine estimate). " +
      "machineDailyUnits / machineMonthlyUnits inside the 'machines[].products' array = the TRUE per-machine rate for THAT specific machine, NOT a fleet total. " +
      "Never blend fleet and per-machine numbers in one answer.",
    totals: {
      products: productCount,
      machines: machines.length,
      productsWithSales: withVelocity.length,
      openAlerts: alerts.length,
      underperformers: underperformersRaw.length,
    },
    topSellersFleetWide,
    underperformers: underperformersRaw.slice(0, 20).map((u) => ({
      name: u.productName,
      category: u.category,
      fleetMonthlyUnits: Math.round(u.averageWeekly * 4),
      margin: u.margin,
      reason: u.reason,
    })),
    alerts: alerts.slice(0, 20).map((a) => ({ severity: a.severity, message: a.message })),
    categoryBreakdownFleetWide,
    machines: machineRows,
    weeklyTrends,
  };
}

async function buildWeeklyTrends(supabase: ReturnType<typeof createServerClient>) {
  const today = new Date();
  const sinceDate = new Date(today);
  sinceDate.setDate(sinceDate.getDate() - 14);
  const sinceStr = sinceDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_sales")
    .select("product_id, sale_date, units_sold, products(name)")
    .gte("sale_date", sinceStr);

  if (error || !data || data.length === 0) {
    return {
      available: false,
      daysOfData: 0,
      lastWeekTotal: 0,
      priorWeekTotal: 0,
      fleetWoWPct: 0,
      spikes: [] as Array<{ name: string; lastWeek: number; priorWeek: number; pct: number }>,
      declines: [] as Array<{ name: string; lastWeek: number; priorWeek: number; pct: number }>,
      topSellersThisWeek: [] as Array<{ name: string; units: number }>,
    };
  }

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const lastWeek = new Map<string, { name: string; units: number }>();
  const priorWeek = new Map<string, { name: string; units: number }>();
  const allDates = new Set<string>();

  for (const r of data) {
    const pid = r.product_id as string;
    const date = r.sale_date as string;
    const units = (r.units_sold as number) || 0;
    const name = ((r.products as unknown) as { name?: string } | null)?.name || pid;
    allDates.add(date);
    const target = date >= cutoffStr ? lastWeek : priorWeek;
    const e = target.get(pid) || { name, units: 0 };
    e.units += units;
    target.set(pid, e);
  }

  let lastTotal = 0;
  let priorTotal = 0;
  for (const e of lastWeek.values()) lastTotal += e.units;
  for (const e of priorWeek.values()) priorTotal += e.units;

  const spikes: Array<{ name: string; lastWeek: number; priorWeek: number; pct: number }> = [];
  const declines: Array<{ name: string; lastWeek: number; priorWeek: number; pct: number }> = [];

  for (const [pid, lw] of lastWeek) {
    const pw = priorWeek.get(pid);
    const priorUnits = pw?.units || 0;
    // Need at least 3 units in prior week to be a meaningful trend
    if (priorUnits < 3) continue;
    const pct = Math.round(((lw.units - priorUnits) / priorUnits) * 1000) / 10;
    if (pct >= 30) spikes.push({ name: lw.name, lastWeek: lw.units, priorWeek: priorUnits, pct });
    else if (pct <= -30) declines.push({ name: lw.name, lastWeek: lw.units, priorWeek: priorUnits, pct });
  }

  spikes.sort((a, b) => b.pct - a.pct);
  declines.sort((a, b) => a.pct - b.pct);

  const topSellers = Array.from(lastWeek.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 10)
    .map((e) => ({ name: e.name, units: e.units }));

  const fleetWoWPct = priorTotal > 0
    ? Math.round(((lastTotal - priorTotal) / priorTotal) * 1000) / 10
    : 0;

  return {
    available: true,
    daysOfData: allDates.size,
    lastWeekTotal: lastTotal,
    priorWeekTotal: priorTotal,
    fleetWoWPct,
    spikes: spikes.slice(0, 10),
    declines: declines.slice(0, 10),
    topSellersThisWeek: topSellers,
  };
}
