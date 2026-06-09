/**
 * GET /api/machines/totals?days=30
 *
 * Returns revenue/order/item totals over a FIXED window, sourced from the
 * daily_sales table. This is the single source of truth that Today and
 * Reports also read from, so all three pages stay numerically consistent.
 *
 * Why this exists: the Machines page previously summed each machine's
 * `totalRevenue` from the scraper-api's Nayax `lastSales` response. Nayax
 * returns a fixed-size rolling window of recent transactions — when new
 * sales arrive, older (sometimes higher-value) ones drop off the back, so
 * the aggregate could DECREASE over the course of a day. Operators
 * reported "afternoon $3040 → now $3028" which is exactly that bug.
 *
 * Response shape:
 *   { ok, days, fromDate, toDate, total: { revenue, orders, units },
 *     perMachine: { [nayax_device_id]: { revenue, orders, units } } }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { dateNDaysAgoInOperatorTz, todayInOperatorTz } from "@/lib/operator-timezone";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const bypass = searchParams.get("fresh") === "1";
    // Build a key per ?days=N so different windows don't share a cache slot.
    const cacheKey = `${CACHE_KEYS.machinesTotals}:${daysParam || "30"}`;
    if (bypass) return NextResponse.json(await buildTotals(searchParams));
    const payload = await withCache(cacheKey, TTL.machinesTotals, () => buildTotals(searchParams));
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

async function buildTotals(searchParams: URLSearchParams): Promise<Record<string, unknown>> {
  try {
    const daysParam = searchParams.get("days");
    // "all" means lifetime total — no lower bound on sale_date, just upper
    // bound at today (so future-dated rows don't sneak in). days=N applies
    // the rolling window from N days ago through today.
    const isAllTime = daysParam === "all";
    const days = isAllTime ? 0 : Math.max(1, Math.min(366, Number(daysParam) || 30));
    const fromDate = isAllTime ? "1970-01-01" : dateNDaysAgoInOperatorTz(days);
    const toDate = todayInOperatorTz();

    const supabase = createServerClient();

    // 1. Pull daily_sales rows in the window.
    // Explicit pagination — .range(0, 49999) alone wasn't enough because
    // PostgREST's max-rows config caps responses at 1000 rows server-side.
    // With ~1450 rows in the window, ~450 got dropped, totals reported ~30%
    // under truth and operators kept saying "Machines total is stuck".
    // Same pattern Reports + projection-engine + assistant-context use.
    const PAGE = 1000;
    const salesRows: Array<{ machine_id: string; units_sold: number; revenue: number }> = [];
    for (let from = 0; from < 100000; from += PAGE) {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("machine_id, units_sold, revenue")
        .gte("sale_date", fromDate)
        .lte("sale_date", toDate)
        .range(from, from + PAGE - 1);
      if (error) {
        return { ok: false, error: error.message };
      }
      if (!data || data.length === 0) break;
      salesRows.push(...(data as Array<{ machine_id: string; units_sold: number; revenue: number }>));
      if (data.length < PAGE) break;
    }

    // 2. Aggregate per machine_id + totals
    const perMachine = new Map<string, { revenue: number; orders: number; units: number }>();
    let totalRevenue = 0;
    let totalUnits = 0;
    let totalOrders = 0;
    for (const r of salesRows || []) {
      const mid = r.machine_id as string;
      const rev = (r.revenue as number) || 0;
      const units = (r.units_sold as number) || 0;
      // 1 daily_sales row per (product, machine, day) → counts as 1 order line.
      // Not a perfect "transaction count" but consistent across pages.
      const orders = units > 0 ? 1 : 0;

      totalRevenue += rev;
      totalUnits += units;
      totalOrders += orders;

      if (!perMachine.has(mid)) perMachine.set(mid, { revenue: 0, orders: 0, units: 0 });
      const m = perMachine.get(mid)!;
      m.revenue += rev;
      m.units += units;
      m.orders += orders;
    }

    // 3. Resolve internal machine_id → nayax_device_id for the response keys,
    //    so the Machines page (which keys by nayax_device_id from scraper)
    //    can match up rows.
    const machineIds = Array.from(perMachine.keys());
    let perDevice: Record<string, { revenue: number; orders: number; units: number }> = {};
    if (machineIds.length > 0) {
      const { data: machineRows } = await supabase
        .from("machines")
        .select("id, nayax_device_id, name")
        .in("id", machineIds);
      for (const m of machineRows || []) {
        const did = (m.nayax_device_id as string) || (m.id as string);
        const v = perMachine.get(m.id as string);
        if (v) perDevice[did] = v;
      }
      // For any machine_id that didn't resolve, fall back to its own id key
      for (const [mid, v] of perMachine.entries()) {
        if (!Object.values(perDevice).includes(v)) perDevice[mid] = v;
      }
    }

    // For all-time, report the actual earliest sale date so the UI can show
    // "Total since YYYY-MM-DD" instead of an arbitrary 1970 lower bound.
    let earliestSaleDate: string | null = null;
    if (isAllTime) {
      const { data: earliest } = await supabase
        .from("daily_sales").select("sale_date")
        .order("sale_date", { ascending: true }).limit(1).maybeSingle();
      earliestSaleDate = (earliest?.sale_date as string) || null;
    }

    return {
      ok: true,
      days: isAllTime ? "all" : days,
      fromDate: earliestSaleDate || fromDate,
      toDate,
      total: {
        revenue: Math.round(totalRevenue * 100) / 100,
        orders: totalOrders,
        units: totalUnits,
      },
      perMachine: perDevice,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
