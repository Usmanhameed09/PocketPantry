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
  totals: {
    products: number;
    machines: number;
    productsWithSales: number;
    openAlerts: number;
    underperformers: number;
  };
  topSellers: Array<{
    name: string; category: string; velocityPerDay: number;
    monthlyProjection: number; margin: number | null;
  }>;
  underperformers: Array<{
    name: string; category: string; weeklyAvg: number; margin: number | null; reason: string;
  }>;
  alerts: Array<{ severity: string; message: string }>;
  categoryBreakdown: Array<{ category: string; count: number; totalVelocity: number }>;
  machines: Array<{ name: string; status: string; productCount: number; topProducts: string[] }>;
  recentTrends: { lastWeekVsPrev: number; spikes: string[]; declines: string[] };
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

  // Top sellers by velocity
  const withVelocity = projections.filter((p) => p.velocityPerDay > 0);
  const topSellers = withVelocity
    .sort((a, b) => b.velocityPerDay - a.velocityPerDay)
    .slice(0, 15)
    .map((p) => {
      const product = products.find((pr) => pr.id === p.productId);
      const price = product?.default_vend_price as number | null;
      const cost = product?.unit_cost as number | null;
      const margin = price && cost && price > 0 ? Math.round(((price - cost) / price) * 100) : null;
      return {
        name: p.productName,
        category: p.category,
        velocityPerDay: Math.round(p.velocityPerDay * 100) / 100,
        monthlyProjection: p.projectedUnits30d,
        margin,
      };
    });

  // Category breakdown
  const catMap = new Map<string, { count: number; totalVelocity: number }>();
  for (const p of products) {
    const cat = (p.category as string) || "Snacks";
    const v = projections.find((x) => x.productId === p.id)?.velocityPerDay || 0;
    const e = catMap.get(cat) || { count: 0, totalVelocity: 0 };
    e.count++;
    e.totalVelocity += v;
    catMap.set(cat, e);
  }
  const categoryBreakdown = Array.from(catMap.entries())
    .map(([category, e]) => ({
      category,
      count: e.count,
      totalVelocity: Math.round(e.totalVelocity * 100) / 100,
    }))
    .sort((a, b) => b.totalVelocity - a.totalVelocity);

  // Recent trends — compare last week vs prior week
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("product_id, qty, created_at, products(name)")
    .eq("reason", "sale_estimate")
    .gte("created_at", since.toISOString());
  const lastWeekCut = new Date();
  lastWeekCut.setDate(lastWeekCut.getDate() - 7);
  const lastWeek = new Map<string, { name: string; units: number }>();
  const prevWeek = new Map<string, { name: string; units: number }>();
  for (const m of moves || []) {
    const pid = m.product_id as string;
    const pname = ((m.products as unknown) as { name?: string })?.name || pid;
    const created = new Date(m.created_at as string);
    const target = created >= lastWeekCut ? lastWeek : prevWeek;
    const e = target.get(pid) || { name: pname, units: 0 };
    e.units += Math.abs(m.qty as number);
    target.set(pid, e);
  }
  let lastTotal = 0; let prevTotal = 0;
  const spikes: string[] = []; const declines: string[] = [];
  for (const [pid, lw] of lastWeek) {
    lastTotal += lw.units;
    const pw = prevWeek.get(pid);
    if (!pw || pw.units < 3) continue;
    const ratio = lw.units / pw.units;
    if (ratio >= 1.3) spikes.push(`${lw.name} (+${Math.round((ratio - 1) * 100)}%)`);
    else if (ratio <= 0.7) declines.push(`${lw.name} (-${Math.round((1 - ratio) * 100)}%)`);
  }
  for (const pw of prevWeek.values()) prevTotal += pw.units;
  const lastWeekVsPrev = prevTotal > 0 ? Math.round((lastTotal / prevTotal - 1) * 1000) / 10 : 0;

  // Per-machine top products
  const { data: machineInv } = await supabase
    .from("machine_inventory")
    .select("machine_id, product_id, daily_sales_rate, products(name)");
  const byMachine = new Map<string, Array<{ name: string; rate: number }>>();
  for (const m of machineInv || []) {
    const mid = m.machine_id as string;
    const arr = byMachine.get(mid) || [];
    arr.push({
      name: ((m.products as unknown) as { name?: string })?.name || "?",
      rate: (m.daily_sales_rate as number) || 0,
    });
    byMachine.set(mid, arr);
  }
  const machineRows = machines.map((m) => {
    const items = (byMachine.get(m.id as string) || []).sort((a, b) => b.rate - a.rate);
    return {
      name: m.name as string,
      status: m.status as string,
      productCount: items.length,
      topProducts: items.slice(0, 5).map((x) => `${x.name} (${x.rate.toFixed(1)}/d)`),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      products: productCount,
      machines: machines.length,
      productsWithSales: withVelocity.length,
      openAlerts: alerts.length,
      underperformers: underperformersRaw.length,
    },
    topSellers,
    underperformers: underperformersRaw.slice(0, 15).map((u) => ({
      name: u.productName,
      category: u.category,
      weeklyAvg: u.averageWeekly,
      margin: u.margin,
      reason: u.reason,
    })),
    alerts: alerts.slice(0, 15).map((a) => ({ severity: a.severity, message: a.message })),
    categoryBreakdown,
    machines: machineRows,
    recentTrends: {
      lastWeekVsPrev,
      spikes: spikes.slice(0, 10),
      declines: declines.slice(0, 10),
    },
  };
}
