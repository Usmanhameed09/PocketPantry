/**
 * Fast subset of the Today page: the 4 top tiles (sales, machines, alerts,
 * warehouse summary). Split out from the parent /api/dashboard/today so the
 * UI can render the top tiles in ~600ms while the slower /sections endpoint
 * (refill stops, buy list, pricing, recent reply) is still loading.
 *
 * Cached for 60s; ?fresh=1 bypasses.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { listAlerts } from "@/lib/alerts-engine";
import { todayInOperatorTz, dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_KEY = "today:tiles";
const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "https://arbersaas.duckdns.org/api2";

/**
 * Pull TODAY's sales LIVE from Nayax (via the scraper-api), bucketed to the
 * operator-tz date. The daily_sales table is only as fresh as the last sync
 * (which has no intraday cron), so without this the Today tile shows $0 / a
 * stale number while the Nayax dashboard shows the real running total — the
 * "live vs ours" gap operators reported.
 *
 * Sums the same daily_breakdown / daily_revenue fields the sync writes, so the
 * number is consistent with what daily_sales will eventually hold. Returns null
 * on any failure (scraper down, timeout) so we fall back to the synced number.
 */
async function fetchLiveSales(
  todayStr: string,
  yesterdayStr: string,
): Promise<{ today: { units: number; revenue: number; transactions: number }; yesterdayRevenue: number } | null> {
  try {
    const res = await fetch(`${SCRAPER_API_URL}/api/machines/inventory-status`, {
      headers: { "x-api-key": process.env.SCRAPER_BACKEND_KEY || process.env.API_KEY || "" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const machines = (data.machines || []) as Array<{
      products?: Array<{ daily_breakdown?: Record<string, number>; daily_revenue?: Record<string, number> }>;
    }>;
    let units = 0;
    let revenue = 0;
    let transactions = 0; // product-machine pairs that sold today (matches the synced row-count semantics)
    let yesterdayRevenue = 0;
    let foundAnyDate = false;
    for (const m of machines) {
      for (const p of m.products || []) {
        const db = p.daily_breakdown || {};
        const dr = p.daily_revenue || {};
        if (Object.keys(db).length > 0) foundAnyDate = true;
        const u = db[todayStr] || 0;
        if (u > 0) {
          units += u;
          revenue += dr[todayStr] || 0;
          transactions += 1;
        }
        yesterdayRevenue += dr[yesterdayStr] || 0;
      }
    }
    // If the breakdown carried no dates at all, treat as no live data (don't
    // overwrite a synced number with a bogus 0).
    if (!foundAnyDate) return null;
    return { today: { units, revenue, transactions }, yesterdayRevenue };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildTiles()
      : await withCache(CACHE_KEY, TTL.today, buildTiles);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

async function buildTiles(): Promise<Record<string, unknown>> {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    const todayStr = todayInOperatorTz();
    const yesterdayStr = dateNDaysAgoInOperatorTz(1);
    const sinceLast7 = dateNDaysAgoInOperatorTz(7);
    const sinceLast14 = dateNDaysAgoInOperatorTz(14);

    const [
      alerts,
      todayRowsRes,
      yesterdayRowsRes,
      weekRowsRes,
      priorWeekRowsRes,
      machinesRes,
      warehouseRes,
      lastSaleRowRes,
    ] = await Promise.all([
      listAlerts(false),
      supabase.from("daily_sales").select("units_sold, revenue").eq("sale_date", todayStr),
      supabase.from("daily_sales").select("revenue").eq("sale_date", yesterdayStr),
      supabase.from("daily_sales").select("units_sold").gte("sale_date", sinceLast7).lt("sale_date", todayStr),
      supabase.from("daily_sales").select("units_sold").gte("sale_date", sinceLast14).lt("sale_date", sinceLast7),
      supabase.from("machines").select("id, name, status, location_id").eq("company_id", companyId),
      supabase.from("warehouse_inventory").select("product_id, on_hand").eq("company_id", companyId),
      supabase.from("daily_sales").select("sale_date").order("sale_date", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const todayRows = todayRowsRes.data || [];
    const yesterdayRows = yesterdayRowsRes.data || [];
    const weekRows = weekRowsRes.data || [];
    const priorWeekRows = priorWeekRowsRes.data || [];
    const machines = machinesRes.data || [];
    const warehouse = warehouseRes.data || [];

    // Today's sales — start from the synced daily_sales snapshot, then try to
    // override with a LIVE Nayax pull so the tile matches the Nayax dashboard.
    let todayUnits = todayRows.reduce((s, r) => s + (r.units_sold as number), 0);
    let todayRevenue = todayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    let todayTransactions = todayRows.length;
    let liveDataAt: string | null = null;

    // Yesterday from the synced snapshot is the fallback; the live pull (below)
    // overrides it so the figure is real even when no sync cron has run.
    let yesterdayRevenue = yesterdayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);

    const live = await fetchLiveSales(todayStr, yesterdayStr);
    if (live) {
      todayUnits = live.today.units;
      todayRevenue = live.today.revenue;
      todayTransactions = live.today.transactions;
      // Only trust live yesterday if it actually carried data for that day;
      // otherwise keep the synced figure.
      if (live.yesterdayRevenue > 0) yesterdayRevenue = live.yesterdayRevenue;
      liveDataAt = new Date().toISOString();
    }

    const wowPct = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : 0;
    const avgSale = todayTransactions > 0 ? todayRevenue / todayTransactions : 0;
    const lastSaleDate = (lastSaleRowRes.data?.sale_date as string | null) || null;
    const todayHasData = liveDataAt !== null || lastSaleDate === todayStr;

    // When today has no live/synced data, show the most recent synced day's
    // ACTUAL revenue (labeled "Last data <date>") instead of a misleading $0.
    let lastDayRevenue = todayRevenue;
    if (!liveDataAt && lastSaleDate && lastSaleDate !== todayStr) {
      const { data: lastDayRows } = await supabase
        .from("daily_sales").select("revenue").eq("sale_date", lastSaleDate);
      lastDayRevenue = (lastDayRows || []).reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    }
    const thisWeekUnits = weekRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const priorWeekUnits = priorWeekRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const weekWoWPct = priorWeekUnits > 0
      ? Math.round(((thisWeekUnits - priorWeekUnits) / priorWeekUnits) * 100)
      : 0;

    // Machines status — use the SAME source the Machines page uses
    // (/api/machines, which merges scraper-fed status with the
    // DB-side offline overlay). Originally I read machines.status from
    // Supabase directly here to save a roundtrip, but operators saw
    // Today showing 8/8 active while Machines showed 7/8 — divergence
    // is unacceptable for the tile. /api/machines is itself cached
    // (60s TTL) so the merged count is fast.
    const mergedMachines = await fetchMergedMachineList();
    const offlineMachines = mergedMachines.filter(
      (m) => (m.status || "").toLowerCase() === "offline"
    );
    const totalMachines = mergedMachines.length > 0
      ? mergedMachines.length
      : machines.length; // fall back to Supabase if /api/machines is down
    const activeMachines = totalMachines - offlineMachines.length;

    // Warehouse — value + low-stock count (without buy-list compute).
    const productIds = warehouse.map((w) => w.product_id as string);
    let warehouseValue = 0;
    let itemsBelowThreshold = 0;
    if (productIds.length > 0) {
      const { data: prodCostRows } = await supabase
        .from("products")
        .select("id, unit_cost")
        .in("id", productIds);
      const costById = new Map((prodCostRows || []).map((p) => [p.id as string, (p.unit_cost as number) || 0]));
      for (const w of warehouse) {
        const onHand = (w.on_hand as number) || 0;
        warehouseValue += onHand * (costById.get(w.product_id as string) || 0);
        if (onHand <= 5) itemsBelowThreshold++;
      }
    }

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      sales: {
        todayRevenue: Math.round(todayRevenue * 100) / 100,
        todayUnits,
        todayTransactions,
        yesterdayRevenue: Math.round(yesterdayRevenue * 100) / 100,
        wowPct,
        avgSale: Math.round(avgSale * 100) / 100,
        thisWeekUnits,
        priorWeekUnits,
        weekWoWPct,
        lastSaleDate,
        lastDayRevenue: Math.round(lastDayRevenue * 100) / 100,
        todayHasData,
        liveDataAt,
      },
      machines: {
        total: totalMachines,
        active: activeMachines,
        offline: offlineMachines.length,
        offlineList: offlineMachines.slice(0, 3).map((m) => ({
          name: m.name || "(unknown)",
          status: "Offline",
        })),
      },
      alerts: {
        total: alerts.length,
        high: alerts.filter((a) => a.severity === "high").length,
        topAlerts: alerts.slice(0, 5).map((a) => ({
          message: a.message,
          severity: a.severity,
          kind: a.kind,
        })),
      },
      warehouse: {
        value: Math.round(warehouseValue * 100) / 100,
        itemsBelowThreshold,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed",
    };
  }
}

type MergedMachine = { name?: string; status?: string };

/**
 * Pulls the SAME machine list the Machines page renders, by calling our
 * own /api/machines proxy (cached, so this is cheap). Critical: the
 * Today tile and the Machines page MUST agree on the offline count or
 * operators lose trust in both numbers.
 */
async function fetchMergedMachineList(): Promise<MergedMachine[]> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://pocketpantry.vercel.app";
    const res = await fetch(`${base}/api/machines`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.machines || []) as MergedMachine[];
  } catch {
    return [];
  }
}
