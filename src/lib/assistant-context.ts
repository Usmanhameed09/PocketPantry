/**
 * Builds the complete data snapshot for the AI assistant. The AI sees ONLY
 * what we put in here, so this needs to cover every data source the operator
 * might ask about — inventory, pricing, POs, buy list, sales trends, recent
 * emails, alerts, proposals. If a piece of data isn't here, the AI is told
 * to plainly admit it doesn't have the answer (never invent one).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { getProjections, getProjectionSettings } from "@/lib/projection-engine";
import { findUnderperformers } from "@/lib/product-proposals";
import { listAlerts } from "@/lib/alerts-engine";
import { getSavedPricingAnalyses } from "@/lib/live-pricing-catalog";
import { todayInOperatorTz, dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export type AssistantContext = {
  generatedAt: string;
  dataWindow: string;
  metricsGlossary: string;
  availableDataSources: string[];
  totals: {
    products: number;
    machines: number;
    activeMachines: number;
    offlineMachines: number;
    productsWithSales: number;
    openAlerts: number;
    underperformers: number;
    openPurchaseOrders: number;
    pendingPriceChanges: number;
    activeProposals: number;
    activeReplacementPlans: number;
  };
  todaysSales: {
    todayRevenue: number;
    todayUnits: number;
    todayTransactions: number;
    yesterdayRevenue: number;
    wowPct: number;
    lastSaleDate: string | null;
    todayHasData: boolean;
  };
  topSellersFleetWide: Array<{
    name: string;
    category: string;
    fleetVelocityPerDay: number;
    fleetMonthlyUnits: number;
    avgPerMachinePerDay: number;
    activeMachines: number;
    margin: number | null;
  }>;
  underperformers: Array<{
    name: string; category: string; fleetMonthlyUnits: number; margin: number | null; reason: string;
  }>;
  alerts: Array<{ severity: string; kind: string; message: string }>;
  categoryBreakdownFleetWide: Array<{
    category: string; count: number;
    fleetDailyVelocity: number; fleetMonthlyUnits: number;
  }>;
  machines: Array<{
    name: string;
    status: string;
    productCount: number;
    machineDailyUnits: number;
    machineMonthlyUnits: number;
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
  // 30-day projection from /predictions. Distinct from topSellersFleetWide
  // (which is actual recent velocity). The AI should treat these as "expected
  // next 30 days" and use them for forward-looking questions ("what should we
  // stock?", "how much will we spend on X this month?").
  predictions: {
    horizonDays: number;
    windowWeeks: number;
    totalProjectedUnits30d: number;
    totalProjectedCogs30d: number;
    productCount: number;
    topByUnits: Array<{
      product: string; category: string;
      projectedUnits30d: number;
      velocityPerDay: number;
      seasonalMultiplier: number;
      hasManualOverride: boolean;
      explanation: string;
    }>;
    topByCogsSpend: Array<{
      product: string; category: string;
      projectedUnits30d: number;
      projectedCogs30d: number;
      unitCost: number;
    }>;
    manualOverrides: Array<{
      product: string; category: string; override: number;
    }>;
    seasonalBoostsActive: Array<{
      product: string; category: string;
      seasonalMultiplier: number;
    }>;
  };
  warehouse: {
    totalValue: number;
    totalUnits: number;
    skusWithStock: number;
    itemsBelowThreshold: number;
    topStockedProducts: Array<{ name: string; onHand: number; unitCost: number; value: number }>;
  };
  purchaseOrders: {
    countByStatus: Record<string, number>;
    openTotal: number;
    recent: Array<{
      supplier: string; status: string; total: number;
      createdAt: string; lineCount: number;
    }>;
  };
  buyList: {
    available: boolean;
    horizonDays: number;
    safetyStockDays: number;
    totalCases: number;
    totalCost: number;
    byVendor: Array<{ vendor: string; items: number; cost: number }>;
    topRecommendations: Array<{
      product: string; vendor: string; cases: number; units: number; cost: number; reason: string;
    }>;
  };
  pricing: {
    pendingChanges: number;
    recentSamples: Array<{
      product: string; supplier: string;
      cost: number; suggestedPrice: number; margin: number; status: string;
    }>;
    avgMarginIfApplied: number | null;
  };
  proposals: {
    active: Array<{
      name: string; category: string | null; status: string;
      suggestedInitialQty: number | null; reasoning: string | null;
    }>;
  };
  replacements: Array<{
    oldProduct: string; newProduct: string; status: string;
    startedAt: string; notes: string | null;
  }>;
  recentEmailReplies: Array<{
    from: string; intent: string; summary: string; receivedAt: string;
  }>;
  recentStockMovements: Array<{
    product: string; qty: number; reason: string;
    location: string; createdAt: string;
  }>;
};

type ProductRow = {
  id: string; name: string; category?: string;
  unit_cost?: number; default_vend_price?: number | null;
};

export async function buildAssistantContext(): Promise<AssistantContext> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // Run independent queries in parallel
  const [
    projections,
    alerts,
    underperformersRaw,
    projectionSettings,
    productsRes,
    machinesRes,
    machineInvRes,
    warehouseRes,
    posRes,
    poLinesRes,
    pricingAnalyses,
    proposalsRes,
    replacementsRes,
    emailRepliesRes,
    movementsRes,
    todayRows,
    yesterdayRows,
  ] = await Promise.all([
    getProjections(),
    listAlerts(false),
    findUnderperformers(),
    getProjectionSettings().catch(() => ({ windowWeeks: 6, safetyStockDays: 5, horizonDays: 7 })),
    supabase.from("products").select("id, name, category, default_vend_price, unit_cost", { count: "exact" }).eq("company_id", companyId).range(0, 9999),
    supabase.from("machines").select("id, name, status").eq("company_id", companyId),
    supabase.from("machine_inventory").select("machine_id, product_id, daily_sales_rate, products(name, category)"),
    supabase.from("warehouse_inventory").select("product_id, on_hand").eq("company_id", companyId),
    supabase.from("purchase_orders").select("id, supplier_name, status, total_cost, created_at, po_lines(count)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
    supabase.from("po_lines").select("po_id, qty_ordered, qty_received, purchase_orders!inner(status)").in("purchase_orders.status", ["Draft", "Approved", "Purchased"]),
    getSavedPricingAnalyses(),
    supabase.from("product_proposals").select("candidate_name, category, status, suggested_initial_qty, reasoning_text").eq("company_id", companyId).order("created_at", { ascending: false }).limit(10),
    supabase.from("replacement_plans").select("status, started_at, notes, old_product_id, new_product_id, old:products!replacement_plans_old_product_id_fkey(name), new:products!replacement_plans_new_product_id_fkey(name)").eq("company_id", companyId).order("started_at", { ascending: false }).limit(10),
    supabase.from("outreach_log").select("lead_id, action_data, performed_at").eq("action_type", "email").contains("action_data", { subtype: "reply_received" }).order("performed_at", { ascending: false }).limit(5),
    supabase.from("stock_movements").select("qty, reason, location, created_at, products(name)").in("reason", ["purchase", "refill", "spoilage", "damage", "count_correction"]).order("created_at", { ascending: false }).limit(15),
    fetchDailySales(supabase, 0),
    fetchDailySales(supabase, 1),
  ]);

  const products = (productsRes.data || []) as ProductRow[];
  const productCount = productsRes.count || products.length;
  const machines = machinesRes.data || [];
  const machineInv = machineInvRes.data || [];
  const warehouse = warehouseRes.data || [];

  // ─── TODAY'S SALES ─────────────────────────────────────────────────
  const todayUnits = todayRows.reduce((s, r) => s + (r.units_sold as number), 0);
  const todayRevenue = todayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
  const yesterdayRevenue = yesterdayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
  const todayTransactions = todayRows.length;
  const wowPct = yesterdayRevenue > 0
    ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : 0;
  const { data: lastSaleRow } = await supabase
    .from("daily_sales").select("sale_date")
    .order("sale_date", { ascending: false }).limit(1).maybeSingle();
  const lastSaleDate = (lastSaleRow?.sale_date as string | null) || null;
  const todayStr = todayInOperatorTz();

  // ─── FLEET TOP SELLERS + PER-MACHINE ──────────────────────────────
  const withVelocity = projections.filter((p) => p.velocityPerDay > 0);
  const { data: machineCounts } = await supabase
    .from("machine_inventory").select("product_id, machine_id").gt("daily_sales_rate", 0);
  const machinesPerProduct = new Map<string, Set<string>>();
  for (const m of machineCounts || []) {
    const pid = m.product_id as string;
    if (!machinesPerProduct.has(pid)) machinesPerProduct.set(pid, new Set());
    machinesPerProduct.get(pid)!.add(m.machine_id as string);
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  const topSellersFleetWide = withVelocity
    .sort((a, b) => b.velocityPerDay - a.velocityPerDay)
    .slice(0, 15)
    .map((p) => {
      const product = productById.get(p.productId);
      const price = product?.default_vend_price ?? null;
      const cost = product?.unit_cost ?? null;
      const margin = price && cost && price > 0 ? Math.round(((price - cost) / price) * 100) : null;
      const activeMachines = machinesPerProduct.get(p.productId)?.size || 0;
      const fleetVelocity = Math.round(p.velocityPerDay * 100) / 100;
      return {
        name: p.productName,
        category: p.category,
        fleetVelocityPerDay: fleetVelocity,
        fleetMonthlyUnits: p.projectedUnits30d,
        avgPerMachinePerDay: activeMachines > 0
          ? Math.round((fleetVelocity / activeMachines) * 100) / 100
          : fleetVelocity,
        activeMachines,
        margin,
      };
    });

  // ─── CATEGORY BREAKDOWN ───────────────────────────────────────────
  const catMap = new Map<string, { count: number; totalDailyVelocity: number }>();
  for (const p of products) {
    const cat = p.category || "Snacks";
    const v = projections.find((x) => x.productId === p.id)?.velocityPerDay || 0;
    const e = catMap.get(cat) || { count: 0, totalDailyVelocity: 0 };
    e.count++;
    e.totalDailyVelocity += v;
    catMap.set(cat, e);
  }
  const categoryBreakdownFleetWide = Array.from(catMap.entries())
    .map(([category, e]) => ({
      category, count: e.count,
      fleetDailyVelocity: Math.round(e.totalDailyVelocity * 100) / 100,
      fleetMonthlyUnits: Math.round(e.totalDailyVelocity * 30),
    }))
    .sort((a, b) => b.fleetDailyVelocity - a.fleetDailyVelocity);

  // ─── PER-MACHINE PRODUCT BREAKDOWN ────────────────────────────────
  // Source: daily_sales (actual transaction log, aggregated over last 30 days).
  // Previously we used machine_inventory.daily_sales_rate, but that field is
  // computed by scraper-api as total_sold / max(1, days_span) — so a product
  // with one lifetime sale shows as "1/day" forever. The daily_sales table is
  // the real per-day transaction count.
  const dsSinceStr = dateNDaysAgoInOperatorTz(30);
  const { data: dailySalesRows } = await supabase
    .from("daily_sales")
    .select("product_id, machine_id, sale_date, units_sold")
    .gte("sale_date", dsSinceStr);

  // Aggregate units sold over the full 30-day window (same denominator the
  // Reports page uses). We deliberately DON'T project — if a product sold 3
  // units in our 30 days of data, monthly = 3. No extrapolation.
  const REPORTS_WINDOW_DAYS = 30;
  const aggByMP = new Map<string, { units: number }>();
  for (const r of dailySalesRows || []) {
    const key = `${r.machine_id}|${r.product_id}`;
    const e = aggByMP.get(key) || { units: 0 };
    e.units += (r.units_sold as number) || 0;
    aggByMP.set(key, e);
  }
  const dataSpanDays = REPORTS_WINDOW_DAYS;

  // Resolve product metadata for these IDs
  const dsProductIds = [...new Set(Array.from(aggByMP.keys()).map((k) => k.split("|")[1]))];
  const { data: dsProductRows } = dsProductIds.length > 0
    ? await supabase.from("products").select("id, name, category").in("id", dsProductIds)
    : { data: [] as Array<{ id: string; name?: string; category?: string }> };
  const dsProductMeta = new Map((dsProductRows || []).map((p) => [
    p.id as string,
    { name: (p.name as string) || "?", category: (p.category as string) || "Snacks" },
  ]));

  const byMachine = new Map<string, Array<{ name: string; category: string; rate: number; units30d: number }>>();
  for (const [key, agg] of aggByMP) {
    const [machineId, productId] = key.split("|");
    const meta = dsProductMeta.get(productId);
    if (!meta) continue;
    // rate = actual units sold over the last 30 days ÷ 30; matches what the
    // Reports page shows when you divide its units column by 30 days.
    const rate = agg.units / REPORTS_WINDOW_DAYS;
    const arr = byMachine.get(machineId) || [];
    arr.push({ name: meta.name, category: meta.category, rate, units30d: agg.units });
    byMachine.set(machineId, arr);
  }

  // Suppress unused-var warning — kept for parity with the previous
  // implementation in case we need fleet-wide machine_inventory access later.
  void machineInv;
  const machineRows = machines.map((m) => {
    const items = (byMachine.get(m.id as string) || [])
      .filter((x) => x.units30d > 0)
      .sort((a, b) => b.units30d - a.units30d);
    const categoryMix: Record<string, number> = {};
    let total30d = 0;
    for (const it of items) {
      categoryMix[it.category] = (categoryMix[it.category] || 0) + it.units30d;
      total30d += it.units30d;
    }
    return {
      name: m.name as string,
      status: m.status as string,
      productCount: items.length,
      machineDailyUnits: Math.round((total30d / dataSpanDays) * 10) / 10,
      // 30d total = raw units summed across all products on this machine
      // over the same 30-day window the Reports page uses.
      machineMonthlyUnits: total30d,
      // No slice cap — the AI was hallucinating numbers when asked about
      // products outside the cap. Snapshot is a few KB larger but the AI
      // can now find every actual product on the machine.
      products: items.map((x) => ({
        name: x.name, category: x.category,
        // machineDailyUnits = average daily rate (units30d / 30)
        machineDailyUnits: Math.round(x.rate * 100) / 100,
        // machineMonthlyUnits = ACTUAL units sold over last 30 days (matches Reports)
        machineMonthlyUnits: x.units30d,
      })),
      categoryMix,
    };
  });
  const offlineMachines = machines.filter((m) => (m.status as string) === "offline").length;

  // ─── WEEKLY TRENDS ────────────────────────────────────────────────
  const weeklyTrends = await buildWeeklyTrends(supabase);

  // ─── WAREHOUSE ────────────────────────────────────────────────────
  const warehouseProductIds = warehouse.map((w) => w.product_id as string);
  let warehouseValue = 0;
  let itemsBelowThreshold = 0;
  let warehouseUnits = 0;
  const topStocked: Array<{ name: string; onHand: number; unitCost: number; value: number }> = [];
  if (warehouseProductIds.length > 0) {
    const { data: prodCostRows } = await supabase
      .from("products").select("id, name, unit_cost")
      .in("id", warehouseProductIds);
    const prodById = new Map((prodCostRows || []).map((p) => [p.id as string, p as unknown as { name: string; unit_cost?: number }]));
    for (const w of warehouse) {
      const pid = w.product_id as string;
      const onHand = (w.on_hand as number) || 0;
      const prod = prodById.get(pid);
      const cost = (prod?.unit_cost as number) || 0;
      const value = onHand * cost;
      warehouseValue += value;
      warehouseUnits += onHand;
      if (onHand <= 5) itemsBelowThreshold++;
      if (onHand > 0) {
        topStocked.push({
          name: prod?.name || "?",
          onHand, unitCost: cost,
          value: Math.round(value * 100) / 100,
        });
      }
    }
    topStocked.sort((a, b) => b.value - a.value);
  }
  const skusWithStock = topStocked.length;

  // ─── PURCHASE ORDERS ──────────────────────────────────────────────
  const poRows = (posRes.data || []) as Array<{
    id: string; supplier_name: string; status: string;
    total_cost: number; created_at: string;
    po_lines?: Array<{ count: number }>;
  }>;
  const poCountByStatus: Record<string, number> = {};
  let openPosTotal = 0;
  for (const po of poRows) {
    poCountByStatus[po.status] = (poCountByStatus[po.status] || 0) + 1;
    if (["Draft", "Approved", "Purchased"].includes(po.status)) {
      openPosTotal += (po.total_cost as number) || 0;
    }
  }
  const recentPos = poRows.slice(0, 8).map((po) => ({
    supplier: po.supplier_name,
    status: po.status,
    total: po.total_cost || 0,
    createdAt: po.created_at,
    lineCount: po.po_lines?.[0]?.count || 0,
  }));

  // ─── BUY LIST (lightweight summary — full calculation lives in buy-list endpoint) ─
  // Just summarize current open-PO coverage; we don't re-run generateBuyList()
  // here to keep snapshot fast.
  const buyListAvailable = projections.length > 0;
  const buyListSummary = await buildBuyListSummary(supabase, projections, warehouse, products, poLinesRes.data || []);

  // ─── PRICING ──────────────────────────────────────────────────────
  const allAnalyses = Object.values(pricingAnalyses);
  const pendingPriceChanges = allAnalyses.filter(
    (a) => a.status === "Pending Approval" && a.cost > 0 && a.suggestedPrice > 0
  );
  const recentPricingSamples = pendingPriceChanges
    .sort((a, b) => (b.suggestedPrice - b.cost) - (a.suggestedPrice - a.cost))
    .slice(0, 8)
    .map((a) => {
      // Filter garbled names — only printable ASCII
      const name = a.scrapedProduct || a.productId;
      const isClean = /^[\x20-\x7E]+$/.test(name.replace(/\s+/g, ""));
      return {
        product: isClean ? name : "(name unreadable)",
        supplier: a.supplier || "?",
        cost: a.cost,
        suggestedPrice: a.suggestedPrice,
        margin: a.margin,
        status: a.status,
      };
    });
  const avgMarginIfApplied = pendingPriceChanges.length > 0
    ? Math.round(pendingPriceChanges.reduce((s, a) => s + a.margin, 0) / pendingPriceChanges.length)
    : null;

  // ─── PROPOSALS ────────────────────────────────────────────────────
  const proposalRows = (proposalsRes.data || []) as Array<{
    candidate_name: string; category: string | null; status: string;
    suggested_initial_qty: number | null; reasoning_text: string | null;
  }>;
  const activeProposals = proposalRows.map((p) => ({
    name: p.candidate_name,
    category: p.category,
    status: p.status,
    suggestedInitialQty: p.suggested_initial_qty,
    reasoning: p.reasoning_text,
  }));
  const proposedCount = activeProposals.filter((p) => p.status === "Proposed").length;

  // ─── REPLACEMENTS ────────────────────────────────────────────────
  const replacementRows = (replacementsRes.data || []) as Array<{
    status: string; started_at: string; notes: string | null;
    old?: { name?: string }; new?: { name?: string };
  }>;
  const replacements = replacementRows.map((r) => ({
    oldProduct: r.old?.name || "?",
    newProduct: r.new?.name || "?",
    status: r.status,
    startedAt: r.started_at,
    notes: r.notes,
  }));
  const activeReplacementPlans = replacements.filter((r) => r.status === "Active").length;

  // ─── PREDICTIONS / PROJECTIONS ───────────────────────────────────
  // Same source as the Predictions page: daily_sales over 30d (operator TZ)
  // × category seasonal multiplier × manual override. Distinct from
  // topSellersFleetWide which is RECENT velocity. The AI should use these
  // for forward-looking questions ("how many will I sell next month?",
  // "what's the expected restock cost?").
  const projectionsWithDemand = projections.filter((p) => p.projectedUnits30d > 0);
  const totalProjectedUnits30d = projectionsWithDemand.reduce((s, p) => s + p.projectedUnits30d, 0);
  const totalProjectedCogs30d = projectionsWithDemand.reduce((s, p) => s + p.projectedCogs30d, 0);
  const predictionsTopByUnits = [...projectionsWithDemand]
    .sort((a, b) => b.projectedUnits30d - a.projectedUnits30d)
    .slice(0, 20)
    .map((p) => ({
      product: p.productName,
      category: p.category,
      projectedUnits30d: p.projectedUnits30d,
      velocityPerDay: p.velocityPerDay,
      seasonalMultiplier: p.seasonalMultiplier,
      hasManualOverride: p.override !== null,
      explanation: p.explanation,
    }));
  const predictionsTopByCogs = [...projectionsWithDemand]
    .filter((p) => p.cost > 0)
    .sort((a, b) => b.projectedCogs30d - a.projectedCogs30d)
    .slice(0, 15)
    .map((p) => ({
      product: p.productName,
      category: p.category,
      projectedUnits30d: p.projectedUnits30d,
      projectedCogs30d: p.projectedCogs30d,
      unitCost: p.cost,
    }));
  const manualOverrides = projectionsWithDemand
    .filter((p) => p.override !== null)
    .map((p) => ({
      product: p.productName,
      category: p.category,
      override: p.override as number,
    }));
  const seasonalBoostsActive = projectionsWithDemand
    .filter((p) => Math.abs(p.seasonalMultiplier - 1.0) > 0.01)
    .sort((a, b) => b.seasonalMultiplier - a.seasonalMultiplier)
    .slice(0, 15)
    .map((p) => ({
      product: p.productName,
      category: p.category,
      seasonalMultiplier: p.seasonalMultiplier,
    }));

  // ─── EMAIL REPLIES ───────────────────────────────────────────────
  const replyRows = (emailRepliesRes.data || []) as Array<{
    action_data: { from?: string; intent?: string; summary?: string };
    performed_at: string;
  }>;
  const recentEmailReplies = replyRows.map((r) => ({
    from: r.action_data?.from || "?",
    intent: r.action_data?.intent || "",
    summary: r.action_data?.summary || "",
    receivedAt: r.performed_at,
  }));

  // ─── STOCK MOVEMENTS ─────────────────────────────────────────────
  const moveRows = (movementsRes.data || []) as Array<{
    qty: number; reason: string; location: string; created_at: string;
    products?: { name?: string };
  }>;
  const recentStockMovements = moveRows.map((m) => ({
    product: m.products?.name || "?",
    qty: m.qty,
    reason: m.reason,
    location: m.location === "warehouse" ? "warehouse" : "machine",
    createdAt: m.created_at,
  }));

  return {
    generatedAt: new Date().toISOString(),
    dataWindow:
      `machineMonthlyUnits values are ACTUAL units sold in the last 30 days (raw count from daily_sales — same source as the Reports page). ` +
      `Fleet topSellersFleetWide.fleetMonthlyUnits is projected from Nayax's 30-day rolling average. ` +
      (weeklyTrends.available
        ? `Weekly trends from daily_sales (last ${weeklyTrends.daysOfData} days).`
        : "Weekly trends not yet available."),
    metricsGlossary:
      "FLEET-WIDE numbers: sums across all machines (fleetVelocityPerDay, fleetMonthlyUnits, fleetDailyVelocity, etc.). " +
      "PER-MACHINE numbers: inside machines[].products[] — these are the rate for THAT specific machine only. " +
      "Never blend them. If you cite fleet, say 'fleet-wide'. If you cite a machine, name the machine.",
    availableDataSources: [
      "totals (counts of products, machines, alerts, etc.)",
      "todaysSales (revenue, transactions, today vs yesterday)",
      "topSellersFleetWide (top 25 products by fleet velocity)",
      "underperformers (low-velocity or low-margin products)",
      "alerts (open low-stock and machine-offline alerts)",
      "categoryBreakdownFleetWide (Snacks/Candy/Drinks/Meals totals)",
      "machines (per-machine product mix + sales)",
      "weeklyTrends (week-over-week spikes/declines)",
      "warehouse (total value, on-hand by SKU, items below threshold)",
      "purchaseOrders (status, recent POs, open PO total)",
      "buyList (vendors, top recommendations, total cost)",
      "pricing (pending price changes with cost/suggested/margin)",
      "proposals (active product proposals)",
      "replacements (active replacement plans)",
      "recentEmailReplies (last 5 lead replies with intent)",
      "recentStockMovements (last 15 purchases/refills/spoilage)",
      "predictions (30d projected units + COGS, top by units, top by spend, manual overrides, active seasonal boosts) — use for forward-looking questions",
    ],
    totals: {
      products: productCount,
      machines: machines.length,
      activeMachines: machines.length - offlineMachines,
      offlineMachines,
      productsWithSales: withVelocity.length,
      openAlerts: alerts.length,
      underperformers: underperformersRaw.length,
      openPurchaseOrders: (poCountByStatus.Draft || 0) + (poCountByStatus.Approved || 0) + (poCountByStatus.Purchased || 0),
      pendingPriceChanges: pendingPriceChanges.length,
      activeProposals: proposedCount,
      activeReplacementPlans,
    },
    todaysSales: {
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      todayUnits,
      todayTransactions,
      yesterdayRevenue: Math.round(yesterdayRevenue * 100) / 100,
      wowPct,
      lastSaleDate,
      todayHasData: lastSaleDate === todayStr,
    },
    topSellersFleetWide,
    underperformers: underperformersRaw.slice(0, 12).map((u) => ({
      name: u.productName,
      category: u.category,
      fleetMonthlyUnits: Math.round(u.averageWeekly * 4),
      margin: u.margin,
      reason: u.reason,
    })),
    alerts: alerts.slice(0, 15).map((a) => ({
      severity: a.severity, kind: a.kind, message: a.message,
    })),
    categoryBreakdownFleetWide,
    machines: machineRows,
    weeklyTrends,
    predictions: {
      horizonDays: projectionSettings.horizonDays,
      windowWeeks: projectionSettings.windowWeeks,
      totalProjectedUnits30d: Math.round(totalProjectedUnits30d),
      totalProjectedCogs30d: Math.round(totalProjectedCogs30d * 100) / 100,
      productCount: projectionsWithDemand.length,
      topByUnits: predictionsTopByUnits,
      topByCogsSpend: predictionsTopByCogs,
      manualOverrides,
      seasonalBoostsActive,
    },
    warehouse: {
      totalValue: Math.round(warehouseValue * 100) / 100,
      totalUnits: warehouseUnits,
      skusWithStock,
      itemsBelowThreshold,
      topStockedProducts: topStocked.slice(0, 10),
    },
    purchaseOrders: {
      countByStatus: poCountByStatus,
      openTotal: Math.round(openPosTotal * 100) / 100,
      recent: recentPos,
    },
    buyList: buyListSummary,
    pricing: {
      pendingChanges: pendingPriceChanges.length,
      recentSamples: recentPricingSamples,
      avgMarginIfApplied,
    },
    proposals: { active: activeProposals },
    replacements,
    recentEmailReplies,
    recentStockMovements,
  };
}

async function fetchDailySales(
  supabase: ReturnType<typeof createServerClient>, daysAgo: number
) {
  const dateStr = dateNDaysAgoInOperatorTz(daysAgo);
  const { data } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue")
    .eq("sale_date", dateStr);
  return data || [];
}

async function buildBuyListSummary(
  supabase: ReturnType<typeof createServerClient>,
  projections: Awaited<ReturnType<typeof getProjections>>,
  warehouse: Array<{ product_id: string; on_hand: number }>,
  products: ProductRow[],
  poLines: Array<{ product_id?: string; qty_ordered: number; qty_received: number }> = []
): Promise<AssistantContext["buyList"]> {
  if (projections.length === 0) {
    return {
      available: false, horizonDays: 7, safetyStockDays: 5,
      totalCases: 0, totalCost: 0, byVendor: [], topRecommendations: [],
    };
  }

  const HORIZON = 7;
  const SAFETY = 5;

  // Per-product warehouse + reserved
  const onHandById = new Map(warehouse.map((w) => [w.product_id, w.on_hand]));
  const reservedById = new Map<string, number>();
  for (const l of poLines) {
    if (!l.product_id) continue;
    const open = (l.qty_ordered || 0) - (l.qty_received || 0);
    if (open > 0) reservedById.set(l.product_id, (reservedById.get(l.product_id) || 0) + open);
  }

  // Vendor + case_size lookup
  const productIds = projections.map((p) => p.productId);
  const { data: prodVendors } = await supabase
    .from("products").select("id, vendor, case_size")
    .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
  const vendorById = new Map((prodVendors || []).map((p) => [p.id as string, ((p.vendor as string) || "Default")]));
  const caseSizeById = new Map((prodVendors || []).map((p) => [p.id as string, Math.max(1, (p.case_size as number) || 1)]));

  // In-machine stock (sum across machines)
  const { data: machineInv } = await supabase
    .from("machine_inventory").select("product_id, estimated_remaining")
    .in("product_id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
  const inMachinesById = new Map<string, number>();
  for (const m of machineInv || []) {
    const pid = m.product_id as string;
    inMachinesById.set(pid, (inMachinesById.get(pid) || 0) + (m.estimated_remaining as number));
  }

  const lines = projections.map((p) => {
    const onHand = onHandById.get(p.productId) || 0;
    const inMachines = inMachinesById.get(p.productId) || 0;
    const reserved = reservedById.get(p.productId) || 0;
    const caseSize = caseSizeById.get(p.productId) || 1;
    const velocity = p.velocityPerDay * (p.seasonalMultiplier || 1);
    const need = velocity * HORIZON + velocity * SAFETY - onHand - inMachines - reserved;
    const cases = need > 0 ? Math.ceil(need / caseSize) : 0;
    const units = cases * caseSize;
    return {
      product: p.productName,
      vendor: vendorById.get(p.productId) || "Default",
      cases, units,
      cost: Math.round(units * p.cost * 100) / 100,
      reason: cases > 0
        ? `${velocity.toFixed(2)}/d × ${HORIZON + SAFETY}d − ${onHand + inMachines + reserved} on hand`
        : "no order needed",
    };
  }).filter((l) => l.cases > 0);

  const totalCases = lines.reduce((s, l) => s + l.cases, 0);
  const totalCost = Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100;
  const vendorMap = new Map<string, { items: number; cost: number }>();
  for (const l of lines) {
    const e = vendorMap.get(l.vendor) || { items: 0, cost: 0 };
    e.items++;
    e.cost += l.cost;
    vendorMap.set(l.vendor, e);
  }
  const byVendor = Array.from(vendorMap.entries())
    .map(([vendor, e]) => ({ vendor, items: e.items, cost: Math.round(e.cost * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost);
  const topRecommendations = lines.sort((a, b) => b.cost - a.cost).slice(0, 10);

  // Mark products as referenced (avoid unused-var warning if we extend later)
  void products;

  return {
    available: true,
    horizonDays: HORIZON, safetyStockDays: SAFETY,
    totalCases, totalCost, byVendor, topRecommendations,
  };
}

async function buildWeeklyTrends(supabase: ReturnType<typeof createServerClient>) {
  const sinceStr = dateNDaysAgoInOperatorTz(14);

  const { data, error } = await supabase
    .from("daily_sales")
    .select("product_id, sale_date, units_sold, products(name)")
    .gte("sale_date", sinceStr);

  if (error || !data || data.length === 0) {
    return {
      available: false, daysOfData: 0,
      lastWeekTotal: 0, priorWeekTotal: 0, fleetWoWPct: 0,
      spikes: [], declines: [], topSellersThisWeek: [],
    };
  }

  const cutoffStr = dateNDaysAgoInOperatorTz(7);
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
    if (priorUnits < 3) continue;
    const pct = Math.round(((lw.units - priorUnits) / priorUnits) * 1000) / 10;
    if (pct >= 30) spikes.push({ name: lw.name, lastWeek: lw.units, priorWeek: priorUnits, pct });
    else if (pct <= -30) declines.push({ name: lw.name, lastWeek: lw.units, priorWeek: priorUnits, pct });
  }

  spikes.sort((a, b) => b.pct - a.pct);
  declines.sort((a, b) => a.pct - b.pct);

  const topSellers = Array.from(lastWeek.values())
    .sort((a, b) => b.units - a.units).slice(0, 10)
    .map((e) => ({ name: e.name, units: e.units }));

  return {
    available: true,
    daysOfData: allDates.size,
    lastWeekTotal: lastTotal,
    priorWeekTotal: priorTotal,
    fleetWoWPct: priorTotal > 0 ? Math.round(((lastTotal - priorTotal) / priorTotal) * 1000) / 10 : 0,
    spikes: spikes.slice(0, 10),
    declines: declines.slice(0, 10),
    topSellersThisWeek: topSellers,
  };
}
