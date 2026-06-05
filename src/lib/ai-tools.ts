/**
 * AI Agent Tool Registry — function-calling tools for the v2 assistant.
 *
 * Each tool wraps a focused query against Supabase or the prediction API.
 * The AI sees:
 *   1. A tiny always-on snapshot (counts + today's revenue)
 *   2. A menu of tool definitions
 *
 * The AI decides which tools to call, with which args, until it has enough
 * to answer the operator's question. This replaces the "cram everything
 * into one snapshot" approach used by the v1 assistant.
 *
 * Tool design rules:
 *   - Each tool returns ≤ ~5kB of JSON (keeps multi-call loops cheap).
 *   - Numeric values come straight from Supabase / prediction-api — never
 *     computed on the fly inside a tool (consistency with the rest of the
 *     dashboard).
 *   - On not-found, return { error: string } instead of throwing — lets
 *     the AI gracefully tell the operator "I couldn't find X" rather than
 *     bubbling a 500.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { dateNDaysAgoInOperatorTz, todayInOperatorTz } from "@/lib/operator-timezone";

// ─────────────────────────────────────────────────────────────────────
// Tool definitions exposed to GPT-4o via the `tools` parameter.
// JSON Schema dialect — OpenAI tool calling uses standard JSON Schema.
// ─────────────────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_machine_details",
      description:
        "Look up one specific machine by name (partial match OK). Returns " +
        "status, last sync, top products on the machine over the last 30 days " +
        "with per-product units sold, and machine totals. Use this when the " +
        "operator names a machine (e.g. 'Hartman 16300', 'Baker Nissan').",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Machine name or substring (case-insensitive).",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_products",
      description:
        "Search the product catalog by name, SKU, or vendor. Returns basic " +
        "info per match: id, name, sku, category, vendor, unit_cost, " +
        "default_vend_price. Use for 'do we carry X?', 'how much does Y cost?'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (name, SKU, or vendor)." },
          limit: { type: "integer", description: "Max results, default 10.", default: 10 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product_details",
      description:
        "Deep info on one specific product by name (partial match OK). Returns " +
        "30-day sales total, daily velocity, machines it's currently in, " +
        "warehouse on-hand, and seasonality (peak/low month) if known. Use " +
        "when operator names a product ('Monster White', 'Coke 12oz').",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name or substring." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_sales_for_date",
      description:
        "Daily sales summary for a single date. Returns total revenue, units, " +
        "transactions, and top 5 products by units that day. Date format YYYY-MM-DD. " +
        "Use for 'how was last Monday', 'what was the best day this week'.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format (operator timezone, America/New_York).",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_lead",
      description:
        "Search the sales pipeline by business name or owner. Returns lead " +
        "ID, business, tier, stage, owner, vertical, next action, last touch. " +
        "Use for any pipeline / lead / 'who is X' question.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Business name or owner name substring." },
          limit: { type: "integer", description: "Max results, default 8.", default: 8 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_open_alerts",
      description:
        "All currently-open alerts (low stock, machine offline, spike, etc.). " +
        "Returns each alert's severity, kind, product/machine, message, " +
        "days_remaining, recommended_qty. Use for any 'what alerts do I have' question.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Tool execution dispatcher. Maps tool name → handler.
// Returns a JSON-serializable result object that GPT receives back.
// ─────────────────────────────────────────────────────────────────────

export type ToolResult = Record<string, unknown> | { error: string };

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_machine_details":
        return await getMachineDetails(String(args.name || ""));
      case "search_products":
        return await searchProducts(String(args.query || ""), Number(args.limit) || 10);
      case "get_product_details":
        return await getProductDetails(String(args.name || ""));
      case "get_sales_for_date":
        return await getSalesForDate(String(args.date || ""));
      case "find_lead":
        return await findLead(String(args.query || ""), Number(args.limit) || 8);
      case "list_open_alerts":
        return await listOpenAlerts();
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_machine_details
// ─────────────────────────────────────────────────────────────────────

async function getMachineDetails(name: string): Promise<ToolResult> {
  if (!name) return { error: "name is required" };
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  const { data: machines } = await supabase
    .from("machines")
    .select("id, name, status, last_sync_at, location_id")
    .eq("company_id", companyId)
    .ilike("name", `%${name}%`)
    .limit(5);

  if (!machines || machines.length === 0) {
    return { error: `No machine matched "${name}"` };
  }

  // If multiple matches, return summary list — let AI ask user to pick.
  if (machines.length > 1) {
    return {
      multipleMatches: machines.map((m) => ({
        name: m.name,
        status: m.status,
      })),
      hint: "Multiple machines matched. Ask the operator to narrow down by full name.",
    };
  }

  const machine = machines[0];
  const machineId = machine.id as string;

  // 30-day sales for this machine
  const since = dateNDaysAgoInOperatorTz(30);
  const { data: salesRows } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue, products(name, category)")
    .eq("machine_id", machineId)
    .gte("sale_date", since)
    .range(0, 9999);

  const byProduct = new Map<string, { name: string; category: string; units: number; revenue: number }>();
  let totalUnits = 0;
  let totalRevenue = 0;
  for (const r of salesRows || []) {
    const pid = r.product_id as string;
    const prod = (r as { products?: { name?: string; category?: string } }).products;
    const e = byProduct.get(pid) || {
      name: prod?.name || "?",
      category: prod?.category || "?",
      units: 0,
      revenue: 0,
    };
    e.units += (r.units_sold as number) || 0;
    e.revenue += (r.revenue as number) || 0;
    byProduct.set(pid, e);
    totalUnits += (r.units_sold as number) || 0;
    totalRevenue += (r.revenue as number) || 0;
  }

  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      category: p.category,
      units30d: p.units,
      revenue30d: Math.round(p.revenue * 100) / 100,
    }));

  return {
    machine: {
      name: machine.name,
      status: machine.status,
      locationId: machine.location_id,
      lastSyncAt: machine.last_sync_at,
    },
    totalsLast30Days: {
      units: totalUnits,
      revenue: Math.round(totalRevenue * 100) / 100,
      productCount: byProduct.size,
    },
    topProductsLast30Days: topProducts,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: search_products
// ─────────────────────────────────────────────────────────────────────

async function searchProducts(query: string, limit: number): Promise<ToolResult> {
  if (!query) return { error: "query is required" };
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  const { data } = await supabase
    .from("products")
    .select("id, name, sku, category, vendor, unit_cost, default_vend_price, case_size, barcode, status")
    .eq("company_id", companyId)
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,vendor.ilike.%${query}%`)
    .limit(Math.min(Math.max(limit, 1), 25));

  return {
    matches: (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      vendor: p.vendor,
      unitCost: p.unit_cost,
      vendPrice: p.default_vend_price,
      caseSize: p.case_size,
      barcode: p.barcode,
      status: p.status,
    })),
    count: (data || []).length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_product_details
// ─────────────────────────────────────────────────────────────────────

async function getProductDetails(name: string): Promise<ToolResult> {
  if (!name) return { error: "name is required" };
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, category, vendor, unit_cost, default_vend_price, case_size, status")
    .eq("company_id", companyId)
    .ilike("name", `%${name}%`)
    .limit(5);

  if (!products || products.length === 0) {
    return { error: `No product matched "${name}"` };
  }

  if (products.length > 1) {
    return {
      multipleMatches: products.map((p) => ({ name: p.name, sku: p.sku, category: p.category })),
      hint: "Multiple products matched. Ask operator to be more specific.",
    };
  }

  const product = products[0];
  const pid = product.id as string;

  // 30-day sales + machine list
  const since = dateNDaysAgoInOperatorTz(30);
  const { data: salesRows } = await supabase
    .from("daily_sales")
    .select("units_sold, revenue, machine_id, machines(name)")
    .eq("product_id", pid)
    .gte("sale_date", since)
    .range(0, 9999);

  let units30d = 0;
  let revenue30d = 0;
  const machineSet = new Map<string, { name: string; units: number }>();
  for (const r of salesRows || []) {
    units30d += (r.units_sold as number) || 0;
    revenue30d += (r.revenue as number) || 0;
    const mid = r.machine_id as string;
    const mName = ((r as { machines?: { name?: string } }).machines?.name) || mid;
    const e = machineSet.get(mid) || { name: mName, units: 0 };
    e.units += (r.units_sold as number) || 0;
    machineSet.set(mid, e);
  }

  // Warehouse on-hand
  const { data: wh } = await supabase
    .from("warehouse_inventory")
    .select("on_hand")
    .eq("company_id", companyId)
    .eq("product_id", pid)
    .maybeSingle();

  // Seasonality from prediction-api
  const seasonality = await fetchProductSeasonality(product.name as string);

  return {
    product: {
      name: product.name,
      sku: product.sku,
      category: product.category,
      vendor: product.vendor,
      unitCost: product.unit_cost,
      vendPrice: product.default_vend_price,
      caseSize: product.case_size,
      status: product.status,
    },
    sales30d: {
      units: units30d,
      revenue: Math.round(revenue30d * 100) / 100,
      dailyVelocity: Math.round((units30d / 30) * 100) / 100,
    },
    inMachines: Array.from(machineSet.values()).sort((a, b) => b.units - a.units).slice(0, 10),
    warehouseOnHand: (wh?.on_hand as number) || 0,
    seasonality,
  };
}

async function fetchProductSeasonality(productName: string): Promise<Record<string, unknown> | null> {
  const base = process.env.PREDICTION_API_URL || "";
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/predictions`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const trends = (data?.seasonalTrends || []) as Array<{
      product?: string;
      peakMonth?: string;
      lowMonth?: string;
      swing?: number;
      monthlyIndex?: Record<string, number>;
    }>;
    const lower = productName.toLowerCase();
    const match = trends.find((s) => (s.product || "").toLowerCase().includes(lower));
    if (!match) return null;
    return {
      peakMonth: match.peakMonth,
      lowMonth: match.lowMonth,
      swingPct: match.swing,
      monthlyIndex: match.monthlyIndex,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_sales_for_date
// ─────────────────────────────────────────────────────────────────────

async function getSalesForDate(date: string): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "date must be YYYY-MM-DD" };
  }
  const supabase = createServerClient();
  const { data } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue, products(name)")
    .eq("sale_date", date)
    .range(0, 9999);

  if (!data || data.length === 0) {
    return { date, totalRevenue: 0, totalUnits: 0, transactions: 0, topProducts: [], message: "No sales recorded for that date." };
  }

  let totalRevenue = 0;
  let totalUnits = 0;
  const byProduct = new Map<string, { name: string; units: number; revenue: number }>();
  for (const r of data) {
    totalRevenue += (r.revenue as number) || 0;
    totalUnits += (r.units_sold as number) || 0;
    const pid = r.product_id as string;
    const pName = ((r as { products?: { name?: string } }).products?.name) || pid;
    const e = byProduct.get(pid) || { name: pName, units: 0, revenue: 0 };
    e.units += (r.units_sold as number) || 0;
    e.revenue += (r.revenue as number) || 0;
    byProduct.set(pid, e);
  }
  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      units: p.units,
      revenue: Math.round(p.revenue * 100) / 100,
    }));

  return {
    date,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalUnits,
    transactions: data.length,
    topProducts,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: find_lead
// ─────────────────────────────────────────────────────────────────────

async function findLead(query: string, limit: number): Promise<ToolResult> {
  if (!query) return { error: "query is required" };
  const supabase = createServerClient();
  const { data } = await supabase
    .from("leads")
    .select("id, business, stage, tier, tier_score, owner, vertical, employee_count, next_action, next_action_at, last_touch_at, call_attempts, apollo_title")
    .or(`business.ilike.%${query}%,owner.ilike.%${query}%`)
    .limit(Math.min(Math.max(limit, 1), 20));

  return {
    matches: (data || []).map((l) => ({
      id: l.id,
      business: l.business,
      stage: l.stage,
      tier: l.tier,
      tierScore: l.tier_score,
      owner: l.owner,
      vertical: l.vertical,
      employeeCount: l.employee_count,
      nextAction: l.next_action,
      nextActionAt: l.next_action_at,
      lastTouchAt: l.last_touch_at,
      callAttempts: l.call_attempts || 0,
      apolloTitle: l.apollo_title,
    })),
    count: (data || []).length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: list_open_alerts
// ─────────────────────────────────────────────────────────────────────

async function listOpenAlerts(): Promise<ToolResult> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("alerts")
    .select("kind, severity, message, days_remaining, recommended_qty, created_at, products(name), machines(name)")
    .eq("company_id", companyId)
    .eq("status", "open")
    .order("severity", { ascending: false })
    .limit(50);

  return {
    alerts: (data || []).map((a) => ({
      kind: a.kind,
      severity: a.severity,
      productName: ((a as { products?: { name?: string } }).products?.name) || null,
      machineName: ((a as { machines?: { name?: string } }).machines?.name) || null,
      message: a.message,
      daysRemaining: a.days_remaining,
      recommendedQty: a.recommended_qty,
      createdAt: a.created_at,
    })),
    count: (data || []).length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Mini snapshot — always-on context, ~500 tokens. The AI gets this
// upfront so simple questions ("how was today?") don't need a tool call.
// ─────────────────────────────────────────────────────────────────────

export async function buildMiniSnapshot(): Promise<Record<string, unknown>> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const today = todayInOperatorTz();
  const yesterday = dateNDaysAgoInOperatorTz(1);

  const [productsRes, machinesRes, alertsRes, todayRows, ydayRows] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("machines").select("id, status").eq("company_id", companyId),
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "open"),
    supabase.from("daily_sales").select("units_sold, revenue").eq("sale_date", today).range(0, 9999),
    supabase.from("daily_sales").select("revenue").eq("sale_date", yesterday).range(0, 9999),
  ]);

  const machines = machinesRes.data || [];
  const offline = machines.filter((m) => (m.status as string) === "offline").length;
  const todayRevenue = (todayRows.data || []).reduce((s, r) => s + ((r.revenue as number) || 0), 0);
  const todayUnits = (todayRows.data || []).reduce((s, r) => s + ((r.units_sold as number) || 0), 0);
  const ydayRevenue = (ydayRows.data || []).reduce((s, r) => s + ((r.revenue as number) || 0), 0);

  return {
    today,
    counts: {
      products: productsRes.count || 0,
      machines: machines.length,
      machinesOffline: offline,
      openAlerts: alertsRes.count || 0,
    },
    todaysSales: {
      revenue: Math.round(todayRevenue * 100) / 100,
      units: todayUnits,
      vsYesterdayPct:
        ydayRevenue > 0
          ? Math.round(((todayRevenue - ydayRevenue) / ydayRevenue) * 100)
          : null,
    },
    yesterdaysRevenue: Math.round(ydayRevenue * 100) / 100,
  };
}
