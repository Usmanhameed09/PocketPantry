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
import { readEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAYAX_PROCESSING_FEE_RATE = 0.035; // ~3.5% on card transactions

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
    const days = Math.max(1, Math.min(90, Number(searchParams.get("days")) || 30));
    const machineFilter = searchParams.get("machineId") || null;

    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Date range
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - days);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);

    // ─── 1. Fetch daily_sales rows in range ───────────────────────────
    let dailyQuery = supabase
      .from("daily_sales")
      .select("product_id, machine_id, sale_date, units_sold, revenue")
      .gte("sale_date", fromStr)
      .lte("sale_date", toStr);
    if (machineFilter) dailyQuery = dailyQuery.eq("machine_id", machineFilter);

    const { data: dailySales, error: dsErr } = await dailyQuery;
    if (dsErr) throw dsErr;
    const rows = (dailySales || []) as DailySaleRow[];

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
    const dayBucket = new Map<string, { revenue: number; units: number }>();
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalCost = 0;
    for (const r of rows) {
      const e = dayBucket.get(r.sale_date) || { revenue: 0, units: 0 };
      e.revenue += r.revenue || 0;
      e.units += r.units_sold || 0;
      dayBucket.set(r.sale_date, e);
      totalRevenue += r.revenue || 0;
      totalUnits += r.units_sold || 0;
      totalCost += (r.units_sold || 0) * (productById.get(r.product_id)?.cost || 0);
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
      e.cost += (r.units_sold || 0) * (productById.get(r.product_id)?.cost || 0);
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
      e.cost += (r.units_sold || 0) * (productById.get(r.product_id)?.cost || 0);
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
    const paymentSplit = await fetchPaymentBreakdown(days).catch(() => null);

    // ─── 7. Financial summary ─────────────────────────────────────────
    const cardRevenue = paymentSplit?.byMethod?.["Credit Card"]?.revenue || 0;
    const processingFees = Math.round(cardRevenue * NAYAX_PROCESSING_FEE_RATE * 100) / 100;
    const netProfit = Math.round((totalRevenue - totalCost - processingFees) * 100) / 100;
    const avgMargin = totalRevenue > 0
      ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10
      : 0;

    // ─── 8. Inventory turns (rough) ───────────────────────────────────
    // = (cost of goods sold over period) / (current warehouse inventory value)
    let inventoryTurns: number | null = null;
    if (!machineFilter) {
      const { data: warehouseRows } = await supabase
        .from("warehouse_inventory")
        .select("product_id, on_hand")
        .eq("company_id", companyId);
      let inventoryValue = 0;
      for (const w of warehouseRows || []) {
        const cost = productById.get(w.product_id as string)?.cost || 0;
        inventoryValue += ((w.on_hand as number) || 0) * cost;
      }
      if (inventoryValue > 0 && totalCost > 0) {
        // annualize: COGS for period × (365/days) ÷ avg inventory
        const annualisedCogs = totalCost * (365 / days);
        inventoryTurns = Math.round((annualisedCogs / inventoryValue) * 10) / 10;
      }
    }

    return NextResponse.json({
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
      },
      revenueByDay,
      topSkus,
      revenueByMachine,
      machineReport,
      paymentSplit: paymentSplit
        ? buildPaymentSplit(paymentSplit)
        : null,
      paymentBreakdown: paymentSplit,
      inventoryTurns,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
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

function buildPaymentSplit(p: PaymentBreakdownResponse) {
  // Convert byMethod into the [{ name, value, amount }] shape the chart expects.
  const total = p.totalRevenue || 0;
  return Object.entries(p.byMethod)
    .map(([name, v]) => ({
      name,
      value: total > 0 ? Math.round((v.revenue / total) * 100) : 0,
      amount: v.revenue,
      sales: v.sales,
    }))
    .sort((a, b) => b.amount - a.amount);
}
