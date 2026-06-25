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

    // Today's sales — read straight from the synced daily_sales (Nayax + HAHA).
    // The dashboard auto-runs the sync when the operator opens it, so this stays
    // current. (We removed the old "live Nayax pull" override: it timed out on
    // every load AND didn't cover HAHA machines, so it just made the number
    // flip-flop. One source of truth now: the synced daily_sales.)
    const todayUnits = todayRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const todayRevenue = todayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    const todayTransactions = todayRows.length;
    const liveDataAt: string | null = null;
    const yesterdayRevenue = yesterdayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);

    const wowPct = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : 0;
    const avgSale = todayTransactions > 0 ? todayRevenue / todayTransactions : 0;
    const lastSaleDate = (lastSaleRowRes.data?.sale_date as string | null) || null;
    const todayHasData = lastSaleDate === todayStr;

    // When today has no synced data yet, show the most recent synced day's
    // ACTUAL revenue (labeled "Last data <date>") instead of a misleading $0.
    let lastDayRevenue = todayRevenue;
    if (lastSaleDate && lastSaleDate !== todayStr) {
      const { data: lastDayRows } = await supabase
        .from("daily_sales").select("revenue").eq("sale_date", lastSaleDate);
      lastDayRevenue = (lastDayRows || []).reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    }
    const thisWeekUnits = weekRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const priorWeekUnits = priorWeekRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const weekWoWPct = priorWeekUnits > 0
      ? Math.round(((thisWeekUnits - priorWeekUnits) / priorWeekUnits) * 100)
      : 0;

    // Machines status — MIRROR the Machines page exactly. Its source of truth
    // is /api/machines, where the offline signal comes from the SCRAPER's
    // per-machine status (Nayax/Chinese last-seen). Our Supabase machines.status
    // column is NOT reliable for this (a machine the scraper reports offline can
    // still be "healthy" in our DB), so we must use the scraper list, not the DB
    // column — that mismatch is exactly why the tile read 10/10 while Machines
    // read 9/10.
    const mergedMachines = await fetchMergedMachineList();
    let totalMachines: number;
    let offlineMachines: Array<{ name: string; status: string }>;
    if (mergedMachines.length > 0) {
      offlineMachines = mergedMachines
        .filter((m) => (m.status || "").toLowerCase() === "offline")
        .map((m) => ({ name: m.name || "(unknown)", status: "Offline" }));
      totalMachines = mergedMachines.length;
    } else {
      // Proxy unavailable — best-effort from Supabase status. Do NOT assume all
      // healthy (that fallback is what kept snapping the tile back to 10/10).
      offlineMachines = machines
        .filter((m) => ((m.status as string) || "").toLowerCase() === "offline")
        .map((m) => ({ name: (m.name as string) || "(unknown)", status: "Offline" }));
      totalMachines = machines.length;
    }
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
    // Hard timeout — without it, a hung /api/machines (which itself hits the
    // scraper) would block the whole tiles function past its platform limit,
    // making Vercel return a non-JSON 504 the client can't parse.
    // Generous timeout: the machine count is the source of truth for the tile,
    // and an empty return forces the unreliable Supabase-status fallback. Better
    // to wait than to show a wrong count. (Tile maxDuration is 30s.)
    const res = await fetch(`${base}/api/machines`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.machines || []) as MergedMachine[];
  } catch {
    return [];
  }
}
