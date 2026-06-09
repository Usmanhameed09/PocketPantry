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
      name: "get_sales_summary",
      description:
        "Aggregated sales over a DATE RANGE with optional grouping. Use this " +
        "for any question of the form 'revenue/units/sales over [period] " +
        "by [machine|product|day]', e.g. 'average revenue per machine in May 2026', " +
        "'top 5 days last week', 'units sold per product last month'. " +
        "Returns TOTAL revenue + units + transactions + dayCount for the period, " +
        "plus a breakdown array if groupBy is set. Machine and product NAMES " +
        "are joined in — never just IDs. PREFER this over query_table for " +
        "anything sales-related.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "YYYY-MM-DD (inclusive)." },
          endDate: { type: "string", description: "YYYY-MM-DD (inclusive)." },
          groupBy: {
            type: "string",
            enum: ["machine", "product", "day", "none"],
            description: "How to aggregate. Default 'none' = single totals row.",
          },
          machineId: {
            type: "string",
            description: "Optional: scope to one machine (UUID). Omit for fleet-wide.",
          },
          limit: {
            type: "integer",
            description: "Max breakdown rows (sorted by revenue DESC). Default 20.",
            default: 20,
          },
        },
        required: ["startDate", "endDate"],
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
  {
    type: "function" as const,
    function: {
      name: "get_buy_list",
      description:
        "Current weekly buy list — products that need to be ordered based on " +
        "projections + on-hand + safety stock. Each item carries caseSize, " +
        "units, cases, unitCost, unitVendPrice, perUnitMargin, totalCost, " +
        "reason. CRITICAL: when caseSize=1, present qty as 'units' not 'cases'. " +
        "Always show unitCost + unitVendPrice when recommending a buy. " +
        "Use for 'what should I order', 'what's running low', restock questions.",
      parameters: {
        type: "object",
        properties: {
          top: { type: "integer", description: "Top N items by total cost. Default 10.", default: 10 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_top_sellers",
      description:
        "Top N products by fleet-wide units sold in the last 30 days. " +
        "Returns name, category, units30d, dailyVelocity, machineCount. " +
        "Use for 'what's selling best', 'top sellers', 'best products'.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "How many to return. Default 10.", default: 10 },
          category: { type: "string", description: "Optional category filter (Snacks/Candy/Drinks/Meals)." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pipeline_summary",
      description:
        "Sales pipeline counts by tier and stage, plus top 5 hottest leads. " +
        "Use for 'how is my pipeline', 'how many leads', tier distribution questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_purchase_orders",
      description:
        "List purchase orders, optionally filtered by status (Draft, Approved, " +
        "Purchased, Received, Cancelled). Returns id, status, total, lineCount, " +
        "createdAt, approvedAt, purchasedAt, receivedAt. Use for any PO-related " +
        "question. For full line items on one PO use get_purchase_order_details.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Optional status filter." },
          limit: { type: "integer", description: "Max results, default 20.", default: 20 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_purchase_order_details",
      description:
        "Full details of one PO including every line (product, qty ordered, " +
        "qty received, unit cost). Accepts the PO short-id (first 8 chars) or " +
        "the full UUID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "PO id (short 8-char or full UUID)." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pricing_analyses",
      description:
        "Pending price-change analyses — products where the system has " +
        "calculated a suggested vending price based on cost. Returns product, " +
        "supplier, current cost, suggested price, projected margin, status. " +
        "Use for 'what should I charge for X', pricing review questions.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter (e.g. 'Pending Approval'). Default: all.",
          },
          limit: { type: "integer", description: "Max results, default 15.", default: 15 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_underperformers",
      description:
        "Products flagged as low-volume or low-margin over the last 30 days. " +
        "Returns name, category, 4-week units, weekly average, margin, reason. " +
        "Use for 'what should I drop', 'which products aren't working'.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max results, default 15.", default: 15 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_weekly_trends",
      description:
        "Week-over-week comparison — last 7 days vs prior 7 days. Returns " +
        "fleet totals, plus top spikes (≥30% up) and declines (≥30% down), and " +
        "top sellers this week. Use for 'what's hot this week', 'what's slowing'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_predictions",
      description:
        "30-day forward projections: top products by expected units OR by " +
        "expected COGS spend. Includes seasonal multiplier and manual override " +
        "flags. Use for 'what will I sell next month', 'expected restock cost'.",
      parameters: {
        type: "object",
        properties: {
          by: { type: "string", enum: ["units", "cogs"], description: "Sort by 'units' (default) or 'cogs'.", default: "units" },
          limit: { type: "integer", description: "Top N. Default 12.", default: 12 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_warehouse_summary",
      description:
        "Warehouse totals + top-stocked products by value. Returns total " +
        "value, total units, SKU count, items below threshold. Use for 'what " +
        "is my warehouse worth', 'how much stock do I have', threshold questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_stock_movements",
      description:
        "Recent inventory ledger entries (purchases, refills, spoilage, count " +
        "corrections). Returns product, qty, reason, location, createdAt. " +
        "Use for 'where did X units go', 'last refills', audit questions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max results, default 20.", default: 20 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_waste_report",
      description:
        "Spoilage + damage report over a date range. Returns total dollars " +
        "and units lost, event counts, breakdown by category and by product, " +
        "and a list of recent events. Use for 'how much am I losing to waste', " +
        "'what spoiled last month', 'top waste products'.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "YYYY-MM-DD inclusive. Default: 30 days ago." },
          endDate: { type: "string", description: "YYYY-MM-DD inclusive. Default: today." },
          limit: { type: "integer", description: "Max items in byProduct + recentEvents. Default 15.", default: 15 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_inventory_turns",
      description:
        "Inventory turnover per product (units sold ÷ avg on hand) over a " +
        "configurable period. Classifies as fast / healthy / slow / dead / " +
        "no_signal. Returns fleet summary + per-product turns + days-of-supply. " +
        "IMPORTANT: when asked about a SPECIFIC bucket (e.g. 'dead stock', " +
        "'slow movers', 'what isn't moving'), ALWAYS pass classification to " +
        "filter — without it, fast movers always come back first and the " +
        "answer is wrong.",
      parameters: {
        type: "object",
        properties: {
          periodDays: { type: "integer", description: "Days to look back. Default 30.", default: 30 },
          limit: { type: "integer", description: "Max products. Default 30.", default: 30 },
          classification: {
            type: "string",
            enum: ["fast", "healthy", "slow", "dead", "no_signal"],
            description:
              "Filter to one bucket. Use 'dead' for 'dead stock' / 'what isn't " +
              "selling'. Use 'slow' for 'underperformers'. Use 'fast' for 'top " +
              "sellers by turnover'. Omit for a mixed list (fast first).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_audit_log",
      description:
        "Critical-action audit log: every cost change, price change, PO " +
        "status transition, spoilage/damage event, and product edit with " +
        "who/what/when/old/new. Use for 'who changed the cost of X', " +
        "'when was PO Y approved', 'what changed last week', auditing.",
      parameters: {
        type: "object",
        properties: {
          actionType: {
            type: "string",
            enum: ["cost_change","price_change","po_status_change","po_delete","product_create","product_edit","spoilage","damage","refill","warehouse_adjust"],
            description: "Optional filter for one action type.",
          },
          entityId: { type: "string", description: "Optional: filter to one entity (product UUID or PO ID)." },
          actor: { type: "string", description: "Optional: filter by who made the change." },
          startDate: { type: "string", description: "YYYY-MM-DD inclusive." },
          endDate: { type: "string", description: "YYYY-MM-DD inclusive." },
          limit: { type: "integer", description: "Max events. Default 25.", default: 25 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "describe_schema",
      description:
        "Returns the list of tables + columns the AI can query via " +
        "query_table. Use this FIRST whenever you need to call query_table " +
        "and you're unsure which table/column name to use. Lightweight; " +
        "always safe to call.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_table",
      description:
        "Generic safe read-only query against an allowlisted table. Use this " +
        "as a FALLBACK when none of the named tools above fit the question. " +
        "Filters use PostgREST operators: eq, neq, gt, gte, lt, lte, ilike. " +
        "ALWAYS prefer the named tools when one fits — they return cleaner " +
        "data. Call describe_schema first if you're not sure what's available.",
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            description: "Allowlisted table name (see describe_schema).",
          },
          columns: {
            type: "string",
            description: "Comma-separated columns. Default: all safe columns.",
          },
          filters: {
            type: "array",
            description: "Array of { column, op, value } where op is eq|neq|gt|gte|lt|lte|ilike.",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "ilike"] },
                value: {},
              },
              required: ["column", "op", "value"],
            },
          },
          orderBy: {
            type: "string",
            description: "Column name to order by.",
          },
          orderDesc: {
            type: "boolean",
            description: "True for descending order. Default false.",
          },
          limit: {
            type: "integer",
            description: "Max rows. Capped at 50.",
            default: 25,
          },
        },
        required: ["table"],
      },
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
      case "get_sales_summary":
        return await getSalesSummary({
          startDate: String(args.startDate || ""),
          endDate: String(args.endDate || ""),
          groupBy: ((args.groupBy as string) || "none") as "machine" | "product" | "day" | "none",
          machineId: args.machineId ? String(args.machineId) : undefined,
          limit: Number(args.limit) || 20,
        });
      case "find_lead":
        return await findLead(String(args.query || ""), Number(args.limit) || 8);
      case "list_open_alerts":
        return await listOpenAlerts();
      case "get_buy_list":
        return await getBuyList(Number(args.top) || 10);
      case "get_top_sellers":
        return await getTopSellers(
          Number(args.limit) || 10,
          args.category ? String(args.category) : undefined
        );
      case "get_pipeline_summary":
        return await getPipelineSummary();
      case "get_purchase_orders":
        return await getPurchaseOrders(
          args.status ? String(args.status) : undefined,
          Number(args.limit) || 20
        );
      case "get_purchase_order_details":
        return await getPurchaseOrderDetails(String(args.id || ""));
      case "get_pricing_analyses":
        return await getPricingAnalyses(
          args.status ? String(args.status) : undefined,
          Number(args.limit) || 15
        );
      case "get_underperformers":
        return await getUnderperformersTool(Number(args.limit) || 15);
      case "get_weekly_trends":
        return await getWeeklyTrendsTool();
      case "get_predictions":
        return await getPredictionsTool(
          (args.by === "cogs" ? "cogs" : "units") as "units" | "cogs",
          Number(args.limit) || 12
        );
      case "get_warehouse_summary":
        return await getWarehouseSummary();
      case "get_recent_stock_movements":
        return await getRecentStockMovements(Number(args.limit) || 20);
      case "get_waste_report": {
        const { getWasteReport } = await import("@/lib/waste-report");
        const { dateNDaysAgoInOperatorTz, todayInOperatorTz } = await import("@/lib/operator-timezone");
        const start = args.startDate ? String(args.startDate) : dateNDaysAgoInOperatorTz(30);
        const end = args.endDate ? String(args.endDate) : todayInOperatorTz();
        const lim = Number(args.limit) || 15;
        const r = await getWasteReport(start, end, lim);
        return r as unknown as ToolResult;
      }
      case "get_inventory_turns": {
        const { getInventoryTurns } = await import("@/lib/waste-report");
        const periodDays = Number(args.periodDays) || 30;
        const lim = Number(args.limit) || 30;
        // When a classification filter is requested we have to pull a larger
        // working set, filter, then trim — otherwise the upstream pre-trim
        // would consume the cap with fast movers and we'd return [].
        const cls = args.classification ? String(args.classification) : null;
        const workingLimit = cls ? 1000 : lim;
        const r = await getInventoryTurns(periodDays, workingLimit);
        if (cls) {
          const filtered = r.products.filter((p) => p.classification === cls).slice(0, lim);
          return { ...r, products: filtered, classification: cls } as unknown as ToolResult;
        }
        return r as unknown as ToolResult;
      }
      case "get_audit_log": {
        const { listAuditEvents } = await import("@/lib/audit-log");
        const events = await listAuditEvents({
          actionType: args.actionType as never,
          entityId: args.entityId ? String(args.entityId) : undefined,
          actor: args.actor ? String(args.actor) : undefined,
          startDate: args.startDate ? String(args.startDate) : undefined,
          endDate: args.endDate ? String(args.endDate) : undefined,
          limit: Number(args.limit) || 25,
        });
        return { events, count: events.length } as unknown as ToolResult;
      }
      case "describe_schema":
        return describeSchema();
      case "query_table":
        return await queryTable({
          table: String(args.table || ""),
          columns: args.columns ? String(args.columns) : undefined,
          filters: Array.isArray(args.filters) ? (args.filters as Array<{ column: string; op: string; value: unknown }>) : undefined,
          orderBy: args.orderBy ? String(args.orderBy) : undefined,
          orderDesc: Boolean(args.orderDesc),
          limit: Number(args.limit) || 25,
        });
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
// Tool: get_sales_summary — aggregated sales over a date range
// ─────────────────────────────────────────────────────────────────────

async function getSalesSummary(args: {
  startDate: string;
  endDate: string;
  groupBy: "machine" | "product" | "day" | "none";
  machineId?: string;
  limit: number;
}): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) {
    return { error: "startDate and endDate must be YYYY-MM-DD" };
  }
  if (args.startDate > args.endDate) {
    return { error: "startDate must be <= endDate" };
  }
  const supabase = createServerClient();
  // Paginate through daily_sales — Supabase caps at 1000 rows per page.
  // For a busy month with many machines/products this can run into 5-10k rows.
  type SalesRow = { sale_date: string; machine_id: string; product_id: string; units_sold: number; revenue: number };
  const rows: SalesRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 100000; from += PAGE) {
    let q = supabase
      .from("daily_sales")
      .select("sale_date, machine_id, product_id, units_sold, revenue")
      .gte("sale_date", args.startDate)
      .lte("sale_date", args.endDate)
      .range(from, from + PAGE - 1);
    if (args.machineId) q = q.eq("machine_id", args.machineId);
    const { data } = await q;
    if (!data || data.length === 0) break;
    rows.push(...(data as SalesRow[]));
    if (data.length < PAGE) break;
  }

  if (rows.length === 0) {
    return {
      startDate: args.startDate,
      endDate: args.endDate,
      totals: { revenue: 0, units: 0, transactions: 0, dayCount: 0 },
      groupBy: args.groupBy,
      breakdown: [],
      message: "No sales recorded in that date range.",
    };
  }

  // Totals across the whole range
  let totalRevenue = 0;
  let totalUnits = 0;
  const uniqueDays = new Set<string>();
  for (const r of rows) {
    totalRevenue += r.revenue || 0;
    totalUnits += r.units_sold || 0;
    uniqueDays.add(r.sale_date);
  }

  const totals = {
    revenue: Math.round(totalRevenue * 100) / 100,
    units: totalUnits,
    transactions: rows.length,
    dayCount: uniqueDays.size,
  };

  if (args.groupBy === "none") {
    return { startDate: args.startDate, endDate: args.endDate, totals, groupBy: "none", breakdown: [] };
  }

  // Build the grouped view
  type Bucket = { key: string; revenue: number; units: number; transactions: number; days: Set<string> };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    let key: string;
    if (args.groupBy === "machine") key = r.machine_id;
    else if (args.groupBy === "product") key = r.product_id;
    else key = r.sale_date;
    const b = buckets.get(key) || { key, revenue: 0, units: 0, transactions: 0, days: new Set<string>() };
    b.revenue += r.revenue || 0;
    b.units += r.units_sold || 0;
    b.transactions += 1;
    b.days.add(r.sale_date);
    buckets.set(key, b);
  }

  // Resolve names — join to machines/products in a single query each
  const nameMap = new Map<string, string>();
  if (args.groupBy === "machine") {
    const ids = Array.from(buckets.keys());
    if (ids.length > 0) {
      const { data } = await supabase.from("machines").select("id, name").in("id", ids);
      for (const m of data || []) nameMap.set(m.id as string, (m.name as string) || (m.id as string));
    }
  } else if (args.groupBy === "product") {
    const ids = Array.from(buckets.keys());
    if (ids.length > 0) {
      const { data } = await supabase.from("products").select("id, name").in("id", ids);
      for (const p of data || []) nameMap.set(p.id as string, (p.name as string) || (p.id as string));
    }
  }

  const cap = Math.min(Math.max(args.limit, 1), 100);
  const breakdown = Array.from(buckets.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, cap)
    .map((b) => {
      const name = args.groupBy === "day" ? b.key : nameMap.get(b.key) || b.key;
      const avgPerDay = b.days.size > 0 ? b.revenue / b.days.size : 0;
      const out: Record<string, unknown> = {
        name,
        revenue: Math.round(b.revenue * 100) / 100,
        units: b.units,
        transactions: b.transactions,
        activeDays: b.days.size,
        avgRevenuePerActiveDay: Math.round(avgPerDay * 100) / 100,
      };
      if (args.groupBy !== "day") out.id = b.key;
      return out;
    });

  return {
    startDate: args.startDate,
    endDate: args.endDate,
    totals,
    groupBy: args.groupBy,
    breakdown,
    breakdownCount: buckets.size,
    breakdownTruncated: buckets.size > cap ? buckets.size - cap : 0,
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
// Tool: get_buy_list — wraps the existing buy-list generator so the
// case-vs-units + unit-price fixes from the v1 snapshot also apply here.
// ─────────────────────────────────────────────────────────────────────

async function getBuyList(top: number): Promise<ToolResult> {
  const { generateBuyList } = await import("@/lib/buy-list-generator");
  const buyList = await generateBuyList();
  const flat = buyList.vendorGroups.flatMap((g) =>
    g.lines.map((l) => ({
      product: l.productName,
      vendor: l.vendor,
      caseSize: l.caseSize,
      cases: l.recommendedCases,
      units: l.recommendedQty,
      unitCost: Math.round(l.unitCost * 100) / 100,
      unitVendPrice: null as number | null, // filled below if available
      perUnitMargin: null as number | null,
      totalCost: Math.round(l.estimatedCost * 100) / 100,
      reason: l.explanation,
    }))
  );

  // Enrich with vend price from products table
  const supabase = createServerClient();
  const companyId = await ensureDefaultCompany();
  const lineNames = flat.map((l) => l.product);
  if (lineNames.length > 0) {
    const { data: prods } = await supabase
      .from("products")
      .select("name, default_vend_price")
      .eq("company_id", companyId)
      .in("name", lineNames);
    const vendByName = new Map((prods || []).map((p) => [p.name as string, p.default_vend_price as number | null]));
    for (const l of flat) {
      const vp = vendByName.get(l.product) ?? null;
      l.unitVendPrice = vp;
      if (vp && vp > 0) {
        l.perUnitMargin = Math.round(((vp - l.unitCost) / vp) * 100);
      }
    }
  }

  const sorted = flat.sort((a, b) => b.totalCost - a.totalCost).slice(0, Math.max(1, Math.min(top, 25)));
  const totalCost = Math.round(flat.reduce((s, l) => s + l.totalCost, 0) * 100) / 100;
  const totalUnits = flat.reduce((s, l) => s + l.units, 0);

  return {
    horizonDays: buyList.horizonDays,
    safetyStockDays: buyList.safetyStockDays,
    totalUnits,
    totalCost,
    lineCount: flat.length,
    topRecommendations: sorted,
    note:
      "When caseSize=1, present as 'units' not 'cases'. Always show " +
      "unitCost + unitVendPrice when recommending a buy.",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_top_sellers — last-30-days top movers fleet-wide
// ─────────────────────────────────────────────────────────────────────

async function getTopSellers(limit: number, category?: string): Promise<ToolResult> {
  const supabase = createServerClient();
  const since = dateNDaysAgoInOperatorTz(30);

  const { data: salesRows } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue, machine_id, products(name, category)")
    .gte("sale_date", since)
    .range(0, 49999);

  const agg = new Map<string, { name: string; category: string; units: number; revenue: number; machines: Set<string> }>();
  for (const r of salesRows || []) {
    const pid = r.product_id as string;
    const prod = (r as { products?: { name?: string; category?: string } }).products;
    const cat = prod?.category || "?";
    if (category && cat.toLowerCase() !== category.toLowerCase()) continue;
    const e = agg.get(pid) || {
      name: prod?.name || pid,
      category: cat,
      units: 0,
      revenue: 0,
      machines: new Set<string>(),
    };
    e.units += (r.units_sold as number) || 0;
    e.revenue += (r.revenue as number) || 0;
    if (r.machine_id) e.machines.add(r.machine_id as string);
    agg.set(pid, e);
  }

  const sorted = Array.from(agg.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((p) => ({
      name: p.name,
      category: p.category,
      units30d: p.units,
      revenue30d: Math.round(p.revenue * 100) / 100,
      dailyVelocity: Math.round((p.units / 30) * 100) / 100,
      machineCount: p.machines.size,
    }));

  return {
    windowDays: 30,
    categoryFilter: category || null,
    topSellers: sorted,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_pipeline_summary — lead counts + top 5 hottest leads
// ─────────────────────────────────────────────────────────────────────

async function getPipelineSummary(): Promise<ToolResult> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("leads")
    .select("id, business, tier, stage, owner, last_touch_at, is_call_ready")
    .range(0, 9999);

  const leads = data || [];
  const byTier: Record<string, number> = { A: 0, B: 0, C: 0, none: 0 };
  const byStage: Record<string, number> = {};
  let callReady = 0;
  for (const l of leads) {
    const t = (l.tier as string | null)?.toUpperCase() || "none";
    byTier[t] = (byTier[t] || 0) + 1;
    const s = (l.stage as string) || "Unknown";
    byStage[s] = (byStage[s] || 0) + 1;
    if (l.is_call_ready) callReady++;
  }

  const tierRank: Record<string, number> = { A: 0, B: 1, C: 2 };
  const top5 = [...leads]
    .sort((a, b) => {
      const ta = tierRank[(a.tier as string | null) || "Z"] ?? 9;
      const tb = tierRank[(b.tier as string | null) || "Z"] ?? 9;
      if (ta !== tb) return ta - tb;
      return (new Date((b.last_touch_at as string) || 0).getTime()) - (new Date((a.last_touch_at as string) || 0).getTime());
    })
    .slice(0, 5)
    .map((l) => ({
      id: l.id,
      business: l.business,
      tier: l.tier,
      stage: l.stage,
      owner: l.owner,
      lastTouchAt: l.last_touch_at,
    }));

  return {
    total: leads.length,
    byTier,
    byStage,
    callReady,
    topHotLeads: top5,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_purchase_orders
// ─────────────────────────────────────────────────────────────────────

async function getPurchaseOrders(status: string | undefined, limit: number): Promise<ToolResult> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  let q = supabase
    .from("purchase_orders")
    .select("id, supplier_name, status, total_cost, created_at, approved_at, purchased_at, received_at, po_lines(count)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (status) q = q.eq("status", status);
  const { data } = await q;

  const byStatus: Record<string, number> = {};
  let openTotal = 0;
  for (const p of data || []) {
    const s = p.status as string;
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (["Draft", "Approved", "Purchased"].includes(s)) {
      openTotal += (p.total_cost as number) || 0;
    }
  }

  return {
    pos: (data || []).map((p) => ({
      id: p.id,
      shortId: (p.id as string).slice(0, 8),
      supplier: p.supplier_name,
      status: p.status,
      total: p.total_cost || 0,
      lineCount: ((p.po_lines as unknown) as Array<{ count: number }>)?.[0]?.count ?? 0,
      createdAt: p.created_at,
      approvedAt: p.approved_at,
      purchasedAt: p.purchased_at,
      receivedAt: p.received_at,
    })),
    countByStatus: byStatus,
    openTotal: Math.round(openTotal * 100) / 100,
    total: (data || []).length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_purchase_order_details
// ─────────────────────────────────────────────────────────────────────

async function getPurchaseOrderDetails(id: string): Promise<ToolResult> {
  if (!id) return { error: "id is required" };
  const supabase = createServerClient();
  // Support short ID (first 8 chars) — query with ilike
  const isShort = id.length < 36;
  const { data: pos } = isShort
    ? await supabase
        .from("purchase_orders")
        .select("id, supplier_name, status, total_cost, notes, created_at, approved_at, purchased_at, received_at")
        .ilike("id", `${id}%`)
        .limit(1)
    : await supabase
        .from("purchase_orders")
        .select("id, supplier_name, status, total_cost, notes, created_at, approved_at, purchased_at, received_at")
        .eq("id", id)
        .limit(1);

  if (!pos || pos.length === 0) return { error: `PO ${id} not found` };
  const po = pos[0];

  const { data: lines } = await supabase
    .from("po_lines")
    .select("id, product_id, qty_ordered, qty_received, unit_cost, products(name)")
    .eq("po_id", po.id as string);

  return {
    po: {
      id: po.id,
      supplier: po.supplier_name,
      status: po.status,
      total: po.total_cost || 0,
      notes: po.notes,
      createdAt: po.created_at,
      approvedAt: po.approved_at,
      purchasedAt: po.purchased_at,
      receivedAt: po.received_at,
    },
    lines: (lines || []).map((l) => ({
      productName: ((l as { products?: { name?: string } }).products?.name) || l.product_id,
      qtyOrdered: l.qty_ordered,
      qtyReceived: l.qty_received || 0,
      unitCost: l.unit_cost,
      lineCost: Math.round(((l.qty_ordered as number) * (l.unit_cost as number)) * 100) / 100,
    })),
    lineCount: (lines || []).length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_pricing_analyses
// ─────────────────────────────────────────────────────────────────────

async function getPricingAnalyses(status: string | undefined, limit: number): Promise<ToolResult> {
  const { getSavedPricingAnalyses } = await import("@/lib/live-pricing-catalog");
  const all = Object.values(await getSavedPricingAnalyses());
  let filtered = all;
  if (status) filtered = all.filter((a) => a.status === status);
  // Sort by margin spread (suggested - cost) descending — highest-value
  // pricing decisions first.
  filtered.sort((a, b) => (b.suggestedPrice - b.cost) - (a.suggestedPrice - a.cost));
  return {
    analyses: filtered.slice(0, Math.min(Math.max(limit, 1), 30)).map((a) => ({
      product: a.scrapedProduct || a.productId,
      supplier: a.supplier,
      cost: a.cost,
      suggestedPrice: a.suggestedPrice,
      margin: a.margin,
      status: a.status,
    })),
    total: filtered.length,
    statusFilter: status || null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_underperformers
// ─────────────────────────────────────────────────────────────────────

async function getUnderperformersTool(limit: number): Promise<ToolResult> {
  const { findUnderperformers } = await import("@/lib/product-proposals");
  const items = await findUnderperformers();
  return {
    underperformers: items.slice(0, Math.min(Math.max(limit, 1), 30)).map((u) => ({
      product: u.productName,
      category: u.category,
      units4Wk: u.unitsLast4Weeks,
      avgWeekly: u.averageWeekly,
      margin: u.margin,
      reason: u.reason,
    })),
    total: items.length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_weekly_trends — week-over-week comparison
// ─────────────────────────────────────────────────────────────────────

async function getWeeklyTrendsTool(): Promise<ToolResult> {
  const supabase = createServerClient();
  const sinceStr = dateNDaysAgoInOperatorTz(14);
  const cutoffStr = dateNDaysAgoInOperatorTz(7);
  const { data } = await supabase
    .from("daily_sales")
    .select("product_id, sale_date, units_sold, products(name)")
    .gte("sale_date", sinceStr)
    .range(0, 49999);

  if (!data || data.length === 0) {
    return { available: false, message: "No daily sales data in the last 14 days." };
  }

  const lastWeek = new Map<string, { name: string; units: number }>();
  const priorWeek = new Map<string, { name: string; units: number }>();
  for (const r of data) {
    const pid = r.product_id as string;
    const target = (r.sale_date as string) >= cutoffStr ? lastWeek : priorWeek;
    const name = ((r as { products?: { name?: string } }).products?.name) || pid;
    const e = target.get(pid) || { name, units: 0 };
    e.units += (r.units_sold as number) || 0;
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
    .sort((a, b) => b.units - a.units).slice(0, 8)
    .map((e) => ({ name: e.name, units: e.units }));

  return {
    available: true,
    lastWeekTotal: lastTotal,
    priorWeekTotal: priorTotal,
    fleetWoWPct: priorTotal > 0 ? Math.round(((lastTotal - priorTotal) / priorTotal) * 1000) / 10 : 0,
    spikes: spikes.slice(0, 8),
    declines: declines.slice(0, 8),
    topSellersThisWeek: topSellers,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_predictions — 30-day forward projections
// ─────────────────────────────────────────────────────────────────────

async function getPredictionsTool(by: "units" | "cogs", limit: number): Promise<ToolResult> {
  const { getProjections } = await import("@/lib/projection-engine");
  const projections = await getProjections();
  const withDemand = projections.filter((p) => p.projectedUnits30d > 0);
  const totalUnits = withDemand.reduce((s, p) => s + p.projectedUnits30d, 0);
  const totalCogs = withDemand.reduce((s, p) => s + p.projectedCogs30d, 0);
  const sorted = [...withDemand].sort((a, b) =>
    by === "cogs" ? b.projectedCogs30d - a.projectedCogs30d : b.projectedUnits30d - a.projectedUnits30d
  );
  return {
    horizonDays: 30,
    totalProjectedUnits: Math.round(totalUnits),
    totalProjectedCogs: Math.round(totalCogs * 100) / 100,
    productCount: withDemand.length,
    sortBy: by,
    top: sorted.slice(0, Math.min(Math.max(limit, 1), 30)).map((p) => ({
      product: p.productName,
      category: p.category,
      projectedUnits30d: p.projectedUnits30d,
      projectedCogs30d: Math.round(p.projectedCogs30d * 100) / 100,
      velocityPerDay: p.velocityPerDay,
      seasonalMultiplier: p.seasonalMultiplier,
      hasManualOverride: p.override !== null,
      explanation: p.explanation,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_warehouse_summary
// ─────────────────────────────────────────────────────────────────────

async function getWarehouseSummary(): Promise<ToolResult> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data: warehouse } = await supabase
    .from("warehouse_inventory")
    .select("product_id, on_hand")
    .eq("company_id", companyId)
    .range(0, 9999);

  const productIds = (warehouse || []).map((w) => w.product_id as string);
  const { data: prods } = productIds.length > 0
    ? await supabase
        .from("products")
        .select("id, name, unit_cost")
        .in("id", productIds)
    : { data: [] as Array<{ id: string; name: string; unit_cost: number }> };
  const prodById = new Map((prods || []).map((p) => [p.id as string, p as unknown as { name: string; unit_cost?: number }]));

  let totalValue = 0;
  let totalUnits = 0;
  let belowThreshold = 0;
  const topStocked: Array<{ name: string; onHand: number; unitCost: number; value: number }> = [];
  for (const w of warehouse || []) {
    const pid = w.product_id as string;
    const onHand = (w.on_hand as number) || 0;
    const prod = prodById.get(pid);
    const cost = (prod?.unit_cost as number) || 0;
    const value = onHand * cost;
    totalValue += value;
    totalUnits += onHand;
    if (onHand <= 5) belowThreshold++;
    if (onHand > 0) {
      topStocked.push({
        name: prod?.name || pid,
        onHand,
        unitCost: cost,
        value: Math.round(value * 100) / 100,
      });
    }
  }
  topStocked.sort((a, b) => b.value - a.value);

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    totalUnits,
    skusWithStock: topStocked.length,
    skusBelowThreshold: belowThreshold,
    topStocked: topStocked.slice(0, 10),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tool: get_recent_stock_movements — last N ledger entries
// ─────────────────────────────────────────────────────────────────────

async function getRecentStockMovements(limit: number): Promise<ToolResult> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("stock_movements")
    .select("qty, reason, location, machine_id, notes, created_at, products(name), machines(name)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  return {
    movements: (data || []).map((m) => ({
      product: ((m as { products?: { name?: string } }).products?.name) || "?",
      qty: m.qty,
      reason: m.reason,
      location: m.location === "warehouse" ? "warehouse" : "machine",
      machineName: ((m as { machines?: { name?: string } }).machines?.name) || null,
      notes: m.notes,
      createdAt: m.created_at,
    })),
    count: (data || []).length,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Schema introspection + safe query escape hatch
// ─────────────────────────────────────────────────────────────────────

// Tables (and their safe columns) that the AI is allowed to query via
// query_table. Anything not on this list is blocked — protects PII tables
// (api_keys, secrets if any) and limits the blast radius of a runaway
// query. Add tables here as the surface area grows.
const QUERYABLE_SCHEMA: Record<string, { columns: string[]; defaultOrderBy?: string; description: string }> = {
  products: {
    columns: ["id", "name", "sku", "category", "vendor", "status", "unit_cost", "default_vend_price", "case_size", "barcode", "lead_time_days", "created_at"],
    defaultOrderBy: "name",
    description: "Master product catalog.",
  },
  machines: {
    columns: ["id", "name", "status", "last_sync_at", "location_id", "created_at"],
    defaultOrderBy: "name",
    description: "Vending machines.",
  },
  warehouse_inventory: {
    columns: ["product_id", "on_hand", "updated_at"],
    defaultOrderBy: "on_hand",
    description: "Warehouse stock on-hand per product.",
  },
  machine_inventory: {
    columns: ["machine_id", "product_id", "estimated_remaining", "last_loaded_qty", "last_refill_at", "daily_sales_rate", "updated_at"],
    defaultOrderBy: "last_refill_at",
    description: "Per-machine inventory baselines + estimates.",
  },
  stock_movements: {
    columns: ["product_id", "machine_id", "location", "qty", "reason", "reference_id", "notes", "created_by", "created_at"],
    defaultOrderBy: "created_at",
    description: "Inventory ledger — every stock change.",
  },
  purchase_orders: {
    columns: ["id", "supplier_name", "status", "total_cost", "created_at", "approved_at", "purchased_at", "received_at"],
    defaultOrderBy: "created_at",
    description: "Purchase orders.",
  },
  po_lines: {
    columns: ["id", "po_id", "product_id", "qty_ordered", "qty_received", "unit_cost"],
    description: "Lines on a purchase order.",
  },
  daily_sales: {
    columns: ["sale_date", "machine_id", "product_id", "units_sold", "revenue"],
    defaultOrderBy: "sale_date",
    description: "Daily sales aggregated per machine + product.",
  },
  alerts: {
    columns: ["id", "type", "kind", "product_id", "machine_id", "severity", "message", "days_remaining", "recommended_qty", "status", "created_at", "resolved_at"],
    defaultOrderBy: "created_at",
    description: "Alert rows (low stock, machine offline, etc.).",
  },
  leads: {
    columns: ["id", "business", "stage", "tier", "tier_score", "owner", "vertical", "employee_count", "next_action", "next_action_at", "last_touch_at", "call_attempts", "apollo_title", "city", "state", "created_at"],
    defaultOrderBy: "last_touch_at",
    description: "Sales pipeline leads.",
  },
  product_proposals: {
    columns: ["id", "candidate_name", "category", "reason", "status", "suggested_initial_qty", "target_locations", "suggested_price_min", "suggested_price_max", "reasoning_text", "proposed_by", "created_at", "decided_at"],
    defaultOrderBy: "created_at",
    description: "Product proposals (manual + ai-trending).",
  },
  replacement_plans: {
    columns: ["id", "old_product_id", "new_product_id", "status", "started_at", "completed_at", "notes"],
    defaultOrderBy: "started_at",
    description: "Active product replacement plans.",
  },
  seasonal_multipliers: {
    columns: ["category", "month", "multiplier"],
    description: "Per-category monthly seasonal multipliers.",
  },
  refill_events: {
    columns: ["id", "machine_id", "performed_by", "performed_at", "notes"],
    defaultOrderBy: "performed_at",
    description: "Refill events (operator-logged).",
  },
  refill_lines: {
    columns: ["refill_id", "product_id", "qty_loaded"],
    description: "Per-product lines on a refill event.",
  },
};

const ALLOWED_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "ilike"]);

function describeSchema(): ToolResult {
  return {
    tables: Object.entries(QUERYABLE_SCHEMA).map(([name, meta]) => ({
      table: name,
      columns: meta.columns,
      description: meta.description,
      defaultOrderBy: meta.defaultOrderBy || null,
    })),
    operatorTip:
      "Use these as table/column names when calling query_table. Filters " +
      "accept ops: eq, neq, gt, gte, lt, lte, ilike (case-insensitive LIKE — " +
      "wrap value with % for substring match).",
  };
}

async function queryTable(args: {
  table: string;
  columns?: string;
  filters?: Array<{ column: string; op: string; value: unknown }>;
  orderBy?: string;
  orderDesc?: boolean;
  limit: number;
}): Promise<ToolResult> {
  const schema = QUERYABLE_SCHEMA[args.table];
  if (!schema) {
    return {
      error: `Table "${args.table}" is not queryable. Call describe_schema for the allowlist.`,
    };
  }

  // Column whitelist enforcement. If the AI requests columns, every one
  // must be in the schema. If it doesn't, use all of them. We never SELECT *
  // because some columns (e.g. raw_payload on outreach_log) can be huge.
  let cols = schema.columns.join(", ");
  if (args.columns) {
    const requested = args.columns.split(",").map((c) => c.trim()).filter(Boolean);
    const bad = requested.filter((c) => !schema.columns.includes(c));
    if (bad.length > 0) {
      return { error: `Invalid columns: ${bad.join(", ")}. Allowed: ${schema.columns.join(", ")}` };
    }
    cols = requested.join(", ");
  }

  const supabase = createServerClient();
  let q = supabase.from(args.table).select(cols);

  // Filter validation — only allowlisted ops, only allowlisted columns.
  for (const f of args.filters || []) {
    if (!ALLOWED_OPS.has(f.op)) {
      return { error: `Op "${f.op}" is not allowed. Use one of: ${[...ALLOWED_OPS].join(", ")}` };
    }
    if (!schema.columns.includes(f.column)) {
      return { error: `Column "${f.column}" not allowed on ${args.table}.` };
    }
    // PostgREST's typed methods (eq, gt, etc.) on the query builder
    type Q = typeof q & Record<string, (col: string, val: unknown) => typeof q>;
    q = (q as Q)[f.op](f.column, f.value as never);
  }

  if (args.orderBy) {
    if (!schema.columns.includes(args.orderBy)) {
      return { error: `orderBy "${args.orderBy}" not allowed on ${args.table}.` };
    }
    q = q.order(args.orderBy, { ascending: !args.orderDesc });
  } else if (schema.defaultOrderBy) {
    q = q.order(schema.defaultOrderBy, { ascending: !args.orderDesc });
  }

  const cappedLimit = Math.min(Math.max(args.limit, 1), 50);
  q = q.limit(cappedLimit);

  const { data, error } = await q;
  if (error) return { error: error.message };

  return {
    table: args.table,
    rowCount: (data || []).length,
    rows: data || [],
    truncatedAt: (data || []).length === cappedLimit ? cappedLimit : null,
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
