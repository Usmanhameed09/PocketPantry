/**
 * /api/reports — aggregates real data for the Reports page.
 *
 * Sources:
 *   - daily_sales (Supabase): revenue, units, product breakdown, machine totals
 *   - products (Supabase): names + unit_cost for margin math
 *   - machines (Supabase): machine name lookup
 *   - scraper-api /api/reports/payment-breakdown: live payment method split
 *
 * Query: ?days=7|30|90&machineId=<optional>
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { todayInOperatorTz, dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";
import { readEnv } from "@/lib/runtime-env";
import { withCache, reportsCacheKey, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAYAX_PROCESSING_FEE_RATE = 0.0595; // 5.95% on card transactions (per Nayax statement)

type DailySaleRow = {
  product_id: string;
  machine_id: string;
  sale_date: string;
  units_sold: number;
  revenue: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bypass = searchParams.get("fresh") === "1";
    // Build a cache key that captures the full query — different ranges
    // and per-machine filters get their own slot so we don't serve the
    // wrong data when the operator switches the filter.
    const rangeKey = [
      searchParams.get("from") || "",
      searchParams.get("to") || "",
      searchParams.get("days") || "30",
    ].join("|");
    const machineKey = searchParams.get("machineId") || "all";
    if (bypass) return NextResponse.json(await buildReports(searchParams));
    const payload = await withCache(
      reportsCacheKey(rangeKey, machineKey),
      TTL.reports,
      () => buildReports(searchParams),
    );
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}

async function buildReports(searchParams: URLSearchParams): Promise<Record<string, unknown>> {
  try {
    // Accept either ?days=N (preset) or ?from=YYYY-MM-DD&to=YYYY-MM-DD (custom range).
    // Custom range wins if both are valid; days is the fallback.
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const isoFrom = fromParam && dateRegex.test(fromParam) ? fromParam : null;
    const isoTo = toParam && dateRegex.test(toParam) ? toParam : null;

    const days = Math.max(1, Math.min(366, Number(searchParams.get("days")) || 30));
    // machineId may be a single id OR a comma-separated list (consolidated
    // report across several machines — e.g. all machines at one location).
    const machineIdsParam = (searchParams.get("machineId") || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const machineFilterList = machineIdsParam.length > 0 ? machineIdsParam : null;
    // Back-compat single-id used where only one is meaningful (payment scoping).
    const machineFilter = machineFilterList && machineFilterList.length === 1
      ? machineFilterList[0] : null;

    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Full machine roster (id + name), ALWAYS unfiltered — this feeds the
    // report's machine selector so the list never collapses to just the
    // currently-selected machine (Arthur's "I have to reset to All to see the
    // others" bug). Independent of the report's machineId filter.
    const { data: allMachinesData } = await supabase
      .from("machines").select("id, name").eq("company_id", companyId).order("name");
    const allMachines = (allMachinesData || []).map((m) => ({
      machineId: m.id as string, machine: m.name as string,
    }));

    // Date range in the operator's timezone (Eastern by default) so the
    // Reports page numbers line up with Nayax's live dashboard.
    const fromStr = isoFrom || dateNDaysAgoInOperatorTz(days);
    const toStr = isoTo || todayInOperatorTz();

    // ─── 1. Fetch daily_sales rows in range ───────────────────────────
    // Explicit pagination — .range(0, 49999) alone wasn't enough because
    // PostgREST defaults max-rows to 1000 server-side. Without paging,
    // smaller machines whose rows happened to land past the 1000-row cutoff
    // (in PK ordering) got partially summed — eg Hartman 16300 showed
    // \$10.11 when its actual 30d revenue was \$119.80.
    const PAGE = 1000;
    const rows: DailySaleRow[] = [];
    for (let from = 0; from < 100000; from += PAGE) {
      let q = supabase
        .from("daily_sales")
        .select("product_id, machine_id, sale_date, units_sold, revenue")
        .gte("sale_date", fromStr)
        .lte("sale_date", toStr)
        .range(from, from + PAGE - 1);
      if (machineFilterList) {
        q = machineFilterList.length === 1
          ? q.eq("machine_id", machineFilterList[0])
          : q.in("machine_id", machineFilterList);
      }
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...(data as DailySaleRow[]));
      if (data.length < PAGE) break;
    }

    // ─── 2. Lookup tables: products + machines ────────────────────────
    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const machineIds = [...new Set(rows.map((r) => r.machine_id))];

    const [productsRes, machinesRes] = await Promise.all([
      productIds.length > 0
        ? supabase.from("products").select("id, name, unit_cost").in("id", productIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; unit_cost?: number }> }),
      machineIds.length > 0
        ? supabase.from("machines").select("id, name").in("id", machineIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const productById = new Map(
      (productsRes.data || []).map((p) => [
        p.id as string,
        { name: p.name as string, cost: (p.unit_cost as number) || 0 },
      ])
    );
    const machineById = new Map(
      (machinesRes.data || []).map((m) => [m.id as string, m.name as string])
    );

    // ─── 3. Aggregate per-day revenue + units ─────────────────────────
    // Sanity check: if a product's stored unit_cost is > the average unit
    // revenue it sold for, the cost is almost certainly bad data (we got
    // case-price scraped as unit-price). Clamp it to the revenue so margin
    // shows 0% instead of a huge negative number that misleads everyone.
    const dayBucket = new Map<string, { revenue: number; units: number }>();
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalCost = 0;
    const flaggedCosts: Array<{ product: string; storedCost: number; avgRevenue: number }> = [];
    // Compute effective cost per product (clamped to avg revenue)
    const effectiveCostById = new Map<string, number>();
    {
      const aggByProduct = new Map<string, { units: number; revenue: number }>();
      for (const r of rows) {
        const e = aggByProduct.get(r.product_id) || { units: 0, revenue: 0 };
        e.units += r.units_sold || 0;
        e.revenue += r.revenue || 0;
        aggByProduct.set(r.product_id, e);
      }
      for (const [pid, agg] of aggByProduct) {
        const storedCost = productById.get(pid)?.cost || 0;
        const avgUnitRev = agg.units > 0 ? agg.revenue / agg.units : 0;
        if (storedCost > 0 && avgUnitRev > 0 && storedCost > avgUnitRev * 1.2) {
          // Bad cost data — log + clamp to 90% of avg revenue
          flaggedCosts.push({
            product: productById.get(pid)?.name || pid,
            storedCost: Math.round(storedCost * 100) / 100,
            avgRevenue: Math.round(avgUnitRev * 100) / 100,
          });
          effectiveCostById.set(pid, avgUnitRev * 0.9);
        } else {
          effectiveCostById.set(pid, storedCost);
        }
      }
    }
    for (const r of rows) {
      const e = dayBucket.get(r.sale_date) || { revenue: 0, units: 0 };
      e.revenue += r.revenue || 0;
      e.units += r.units_sold || 0;
      dayBucket.set(r.sale_date, e);
      totalRevenue += r.revenue || 0;
      totalUnits += r.units_sold || 0;
      totalCost += (r.units_sold || 0) * (effectiveCostById.get(r.product_id) || 0);
    }
    const revenueByDay = Array.from(dayBucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: formatDateShort(date),
        revenue: Math.round(v.revenue * 100) / 100,
        units: v.units,
      }));

    // ─── 4. Top SKUs (by units sold) ──────────────────────────────────
    const skuMap = new Map<string, { units: number; revenue: number; cost: number }>();
    for (const r of rows) {
      const e = skuMap.get(r.product_id) || { units: 0, revenue: 0, cost: 0 };
      e.units += r.units_sold || 0;
      e.revenue += r.revenue || 0;
      e.cost += (r.units_sold || 0) * (effectiveCostById.get(r.product_id) || 0);
      skuMap.set(r.product_id, e);
    }
    const topSkus = Array.from(skuMap.entries())
      .map(([pid, v]) => ({
        product: productById.get(pid)?.name || pid,
        units: v.units,
        revenue: Math.round(v.revenue * 100) / 100,
        cost: Math.round(v.cost * 100) / 100,
        margin: v.revenue > 0 ? Math.round(((v.revenue - v.cost) / v.revenue) * 100) : 0,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 20);

    // ─── 5. Per-machine breakdown ─────────────────────────────────────
    const machineMap = new Map<string, {
      revenue: number; units: number; cost: number;
      productSales: Map<string, number>;
    }>();
    for (const r of rows) {
      const e = machineMap.get(r.machine_id) || {
        revenue: 0, units: 0, cost: 0, productSales: new Map<string, number>(),
      };
      e.revenue += r.revenue || 0;
      e.units += r.units_sold || 0;
      e.cost += (r.units_sold || 0) * (effectiveCostById.get(r.product_id) || 0);
      e.productSales.set(
        r.product_id,
        (e.productSales.get(r.product_id) || 0) + (r.units_sold || 0)
      );
      machineMap.set(r.machine_id, e);
    }
    const machineReport = Array.from(machineMap.entries())
      .map(([mid, v]) => {
        let topProductId = "";
        let topUnits = 0;
        for (const [pid, units] of v.productSales) {
          if (units > topUnits) { topProductId = pid; topUnits = units; }
        }
        return {
          machineId: mid,
          machine: machineById.get(mid) || `Machine ${mid.slice(0, 6)}`,
          transactions: v.units, // Nayax counts a "sale" per unit; close enough
          revenue: Math.round(v.revenue * 100) / 100,
          cost: Math.round(v.cost * 100) / 100,
          profit: Math.round((v.revenue - v.cost) * 100) / 100,
          margin: v.revenue > 0
            ? Math.round(((v.revenue - v.cost) / v.revenue) * 100)
            : 0,
          avgSale: v.units > 0
            ? Math.round((v.revenue / v.units) * 100) / 100
            : 0,
          topProduct: productById.get(topProductId)?.name || "—",
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const revenueByMachine = machineReport.map((m) => ({
      machine: m.machine,
      revenue: m.revenue,
      margin: m.margin,
    }));

    // ─── 6. Payment breakdown (live from scraper-api) ─────────────────
    // If filtering by a single machine, look up its Nayax device id and pass
    // it through so the payment split is scoped to THAT machine, not the fleet.
    let nayaxDeviceIdFilter: string | null = null;
    if (machineFilter) {
      const { data: m } = await supabase
        .from("machines").select("nayax_device_id")
        .eq("id", machineFilter).maybeSingle();
      nayaxDeviceIdFilter = (m?.nayax_device_id as string | null) ?? null;
    }
    const rawPayment = await fetchPaymentBreakdown(days).catch(() => null);
    const paymentSplit = rawPayment
      ? (nayaxDeviceIdFilter
        ? filterPaymentToMachine(rawPayment, nayaxDeviceIdFilter)
        : rawPayment)
      : null;

    // ─── 7. Financial summary ─────────────────────────────────────────
    // The AUTHORITATIVE revenue is totalRevenue (summed from daily_sales). The
    // scraper payment breakdown covers a slightly different window and a
    // different dataset, so using its ABSOLUTE card dollars made the numbers
    // never reconcile (Arthur: "revenue after fees is more than the card total",
    // "$184 + $36 ≠ $300"). Instead we take only the card/cash SHARE from the
    // breakdown and apply it to totalRevenue — so card + cash always == total.
    const cardShare: number | null = (() => {
      const byMethod = paymentSplit?.byMethod;
      if (!byMethod) return null;
      const splitTotal = Object.values(byMethod).reduce((s, m) => s + (m?.revenue || 0), 0);
      if (splitTotal <= 0) return null;
      const card = byMethod["Credit Card"]?.revenue || 0;
      return card / splitTotal;
    })();
    // No usable split → treat as card-only. Nayax is card-first and the AHA /
    // Chinese machines take NO cash at all, so card = full revenue for them.
    const effectiveCardShare = cardShare == null ? 1 : cardShare;
    const cardRevenue = Math.round(totalRevenue * effectiveCardShare * 100) / 100;
    const cashRevenue = Math.round((totalRevenue - cardRevenue) * 100) / 100;
    const processingFees = Math.round(cardRevenue * NAYAX_PROCESSING_FEE_RATE * 100) / 100;
    const netProfit = Math.round((totalRevenue - totalCost - processingFees) * 100) / 100;
    const avgMargin = totalRevenue > 0
      ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10
      : 0;

    // ─── 8. Inventory turns (rough) ───────────────────────────────────
    // = (cost of goods sold over period) / (current warehouse inventory value)
    let inventoryTurns: number | null = null;
    let inventoryNote: string | null = null;
    if (!machineFilter) {
      const { data: warehouseRows } = await supabase
        .from("warehouse_inventory")
        .select("product_id, on_hand")
        .eq("company_id", companyId);
      let inventoryValue = 0;
      for (const w of warehouseRows || []) {
        const cost = effectiveCostById.get(w.product_id as string)
          ?? (productById.get(w.product_id as string)?.cost || 0);
        inventoryValue += ((w.on_hand as number) || 0) * cost;
      }
      if (inventoryValue > 50 && totalCost > 0) {
        const annualisedCogs = totalCost * (365 / days);
        const raw = annualisedCogs / inventoryValue;
        if (raw > 100) {
          // Likely a data-quality issue — warehouse is essentially empty,
          // makes the ratio meaningless. Show null with note.
          inventoryTurns = null;
          inventoryNote = "Warehouse stock too low to compute meaningful turns";
        } else {
          inventoryTurns = Math.round(raw * 10) / 10;
        }
      } else {
        inventoryNote = "Warehouse value too small — log opening stock or receive a PO first";
      }
    }

    return {
      success: true,
      range: { days, fromDate: fromStr, toDate: toStr, machineId: machineFilter },
      stats: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        netProfit,
        processingFees,
        avgMargin,
        totalUnits,
        totalTransactions: rows.length, // one row per (product, machine, day)
        cardRevenue,
        cashRevenue,
      },
      revenueByDay,
      topSkus,
      revenueByMachine,
      machineReport,
      allMachines,
      paymentSplit: paymentSplit
        ? buildPaymentSplit(paymentSplit, totalRevenue)
        : null,
      paymentBreakdown: paymentSplit,
      inventoryTurns,
      inventoryNote,
      dataQuality: {
        flaggedCostProducts: flaggedCosts.length,
        sampleFlagged: flaggedCosts.slice(0, 5),
        paymentSplitWindowNote: paymentSplit
          ? "Payment split is from Nayax's last-sales window — may cover a slightly different period than the revenue total above."
          : null,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed" };
  }
}

function formatDateShort(iso: string): string {
  // "2026-05-22" → "May 22"
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

type PaymentBreakdownResponse = {
  totalRevenue: number;
  totalSales: number;
  byMethod: Record<string, { sales: number; revenue: number }>;
  byBrand: Record<string, number>;
  byMachine: Array<{
    machineId: string; machineName: string;
    totalRevenue: number; totalSales: number;
    byMethod: Record<string, { sales: number; revenue: number }>;
  }>;
};

async function fetchPaymentBreakdown(days: number): Promise<PaymentBreakdownResponse | null> {
  const scraperUrl = readEnv("SCRAPER_API_URL") || "http://localhost:8000";
  const apiKey = readEnv("SCRAPER_BACKEND_KEY") || readEnv("API_KEY");
  try {
    const res = await fetch(`${scraperUrl}/api/reports/payment-breakdown?days=${days}`, {
      headers: { ...(apiKey ? { "x-api-key": apiKey } : {}) },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    return data as PaymentBreakdownResponse;
  } catch {
    return null;
  }
}

function filterPaymentToMachine(
  p: PaymentBreakdownResponse,
  nayaxDeviceId: string
): PaymentBreakdownResponse {
  const m = p.byMachine.find((x) => x.machineId === nayaxDeviceId);
  if (!m) {
    // No data for this machine — return empty but valid shape
    return {
      totalRevenue: 0, totalSales: 0,
      byMethod: {}, byBrand: {}, byMachine: [],
    };
  }
  return {
    totalRevenue: m.totalRevenue,
    totalSales: m.totalSales,
    byMethod: m.byMethod,
    // byBrand is fleet-wide — we don't have per-machine brand split from the
    // scraper-api yet. Show empty so the UI doesn't show fleet totals labelled
    // as the machine's.
    byBrand: {},
    byMachine: [m],
  };
}

function buildPaymentSplit(p: PaymentBreakdownResponse, scaleToRevenue: number) {
  // The payment breakdown comes from Nayax's rolling last-sales window, so its
  // ABSOLUTE dollars cover a different period than the report and were showing
  // e.g. $6,893 card when the report period's total was $1,345 — confusing and
  // inconsistent with the Processing Fees panel. Fix: keep only the method
  // PROPORTIONS from the window and rescale the dollars to the report's actual
  // total revenue, so every method amount sums to the report total.
  const windowTotal = Object.values(p.byMethod).reduce((s, v) => s + (v?.revenue || 0), 0)
    || p.totalRevenue || 0;
  return Object.entries(p.byMethod)
    .map(([name, v]) => {
      const share = windowTotal > 0 ? v.revenue / windowTotal : 0;
      return {
        name,
        value: Math.round(share * 100),
        // Rescaled to the report period so the numbers reconcile everywhere.
        amount: Math.round(share * scaleToRevenue * 100) / 100,
        sales: v.sales, // raw window transaction count (informational)
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
