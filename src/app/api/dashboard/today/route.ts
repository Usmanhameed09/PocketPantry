/**
 * Single endpoint feeding the Today page. Pulls real data from:
 *   - daily_sales (today's revenue, transactions, week-over-week)
 *   - machine_inventory (machine sales rates, top stops needing refill)
 *   - alerts (low stock + offline machines)
 *   - buy-list math (warehouse value, restock cost, items needed)
 *   - outreach_log (recent email replies)
 *   - pricing catalog (suggested price changes)
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { listAlerts } from "@/lib/alerts-engine";
import { generateBuyList } from "@/lib/buy-list-generator";
import { getSavedPricingAnalyses } from "@/lib/live-pricing-catalog";
import { todayInOperatorTz, dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    // Bypass cache when ?fresh=1 — for manual refresh buttons + the AI
    // agent when it explicitly wants live numbers.
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildTodayPayload()
      : await withCache(CACHE_KEYS.today, TTL.today, buildTodayPayload);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

async function buildTodayPayload(): Promise<Record<string, unknown>> {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Run independent queries in parallel
    const [
      alerts,
      todayRows,
      yesterdayRows,
      thisWeekRows,
      priorWeekRows,
      machinesRes,
      machineInvRes,
      warehouseRes,
      replyRows,
      analyses,
    ] = await Promise.all([
      listAlerts(false),
      fetchDailySales(supabase, 0),
      fetchDailySales(supabase, 1),
      fetchDailySalesRange(supabase, 7, 0),
      fetchDailySalesRange(supabase, 14, 7),
      supabase.from("machines").select("id, name, status, location_id").eq("company_id", companyId),
      supabase.from("machine_inventory").select("machine_id, product_id, estimated_remaining, daily_sales_rate, products(name, unit_cost)"),
      supabase.from("warehouse_inventory").select("product_id, on_hand").eq("company_id", companyId),
      fetchRecentReplies(supabase),
      getSavedPricingAnalyses(),
    ]);

    const machines = machinesRes.data || [];
    const machineInv = machineInvRes.data || [];
    const warehouse = warehouseRes.data || [];

    // Fetch the SAME machine list the /machines page renders, so the active/
    // offline counts on the Today tile agree with that page. Counting from
    // Supabase here while the page counts from /api/machines caused the
    // "Today shows 7/8, Machines shows 6/8" mismatch operators reported.
    const scraperMachineList = await fetchScraperMachines();
    const scraperOfflineNames = new Set(
      scraperMachineList
        .filter((m) => (m.status || "").toLowerCase() === "offline")
        .map((m) => m.name || "")
    );

    // ─── Today's revenue ───────────────────────────────────────────────
    // 1. First read what's in daily_sales (whatever the last sync wrote)
    let todayUnits = todayRows.reduce((s, r) => s + (r.units_sold as number), 0);
    let todayRevenue = todayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    let todayTransactions = todayRows.length;
    const yesterdayRevenue = yesterdayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);

    // 2. Now try to OVERRIDE with truly live numbers from Nayax. The cron
    //    only runs once a day, so daily_sales is up to 24h stale. Live
    //    Nayax — via the scraper-api — has the real-time count. If the
    //    scraper times out (>20s) we keep the cached number rather than
    //    fail the whole dashboard.
    let liveDataAt: string | null = null;
    try {
      const live = await fetchLiveTodayTotals(todayInOperatorTz());
      if (live) {
        todayUnits = live.units;
        todayRevenue = live.revenue;
        todayTransactions = live.transactions;
        liveDataAt = live.fetchedAt;
      }
    } catch { /* fall through, keep cached values */ }
    const wowPct = yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : 0;
    const avgSale = todayTransactions > 0 ? todayRevenue / todayTransactions : 0;

    // What's the most recent date that actually has sales data? Useful so the
    // UI can show "Yesterday" or "Last data: May 26" instead of misleading $0
    const { data: lastSaleRow } = await supabase
      .from("daily_sales")
      .select("sale_date")
      .order("sale_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSaleDate = (lastSaleRow?.sale_date as string | null) || null;
    // "Today" in the operator's timezone (Eastern by default), NOT UTC.
    // Otherwise after 8pm ET this would jump to tomorrow's UTC date and show $0.
    const todayStr = todayInOperatorTz();
    const todayHasData = lastSaleDate === todayStr;

    // Weekly comparison (for spikes shown on the page)
    const thisWeekUnits = thisWeekRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const priorWeekUnits = priorWeekRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const weekWoWPct = priorWeekUnits > 0
      ? Math.round(((thisWeekUnits - priorWeekUnits) / priorWeekUnits) * 100)
      : 0;

    // ─── Machines status ───────────────────────────────────────────────
    // Count from the SAME scraper-merged list the Machines page shows
    // (filtered by lowercase "offline" so it matches /api/machines status
    // overlay logic). If the scraper proxy is unreachable, fall back to the
    // Supabase machines table so the tile still renders something.
    const machineCountSource = scraperMachineList.length > 0
      ? scraperMachineList.map((m) => ({ name: m.name || "", status: m.status || "" }))
      : machines.map((m) => ({ name: m.name as string, status: m.status as string }));
    const offlineMachines = machineCountSource.filter(
      (m) => (m.status || "").toLowerCase() === "offline" || scraperOfflineNames.has(m.name)
    );
    const totalMachines = machineCountSource.length;
    const activeMachines = totalMachines - offlineMachines.length;

    // ─── Refill stops — ALL machines with low items, ranked ────────────
    // A "low item" = a product on this machine where current estimated
    // stock is less than 3 days of sales (or unknown — never refilled).
    const machineLowest = new Map<string, { name: string; lowItems: number; remainingTotal: number }>();
    for (const m of machines) {
      machineLowest.set(m.id as string, { name: m.name as string, lowItems: 0, remainingTotal: 0 });
    }
    for (const mi of machineInv) {
      const e = machineLowest.get(mi.machine_id as string);
      if (!e) continue;
      const rem = (mi.estimated_remaining as number) || 0;
      const rate = (mi.daily_sales_rate as number) || 0;
      e.remainingTotal += rem;
      if (rate > 0 && rem <= rate * 3) e.lowItems++;
    }
    // Return EVERY machine with at least one low item, sorted worst-first.
    // No artificial cap — the operator should see the full list to plan a route.
    const refillStops = Array.from(machineLowest.values())
      .filter((m) => m.lowItems > 0)
      .sort((a, b) => b.lowItems - a.lowItems)
      .map((m) => ({
        machine: m.name,
        items: m.lowItems,
        color: m.lowItems >= 20 ? "#dc2626" : m.lowItems >= 10 ? "#d97706" : "#059669",
      }));

    // ─── Warehouse value + low stock count ─────────────────────────────
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

    // ─── Buy list summary (restock cost) ───────────────────────────────
    let restockCost = 0;
    let buyListItems = 0;
    try {
      const bl = await generateBuyList();
      restockCost = bl.vendorGroups.reduce((s, g) => s + g.subtotal, 0);
      buyListItems = bl.vendorGroups.reduce((s, g) => s + g.lines.length, 0);
    } catch {
      // skip — non-critical
    }

    // ─── Pricing suggestions ───────────────────────────────────────────
    // Filter to actionable changes:
    //  - real cost basis (cost > 0, otherwise the suggestion is meaningless)
    //  - real suggested price
    //  - product name doesn't contain garbled/non-printable characters
    //  - sort by price-increase magnitude (cents added per unit) so the top
    //    3 are the highest-impact opportunities, not random
    function isPrintable(s: string): boolean {
      // Strip whitespace; require all remaining chars to be common printable
      const trimmed = s.replace(/\s+/g, "");
      return trimmed.length > 0 && /^[\x20-\x7E]+$/.test(trimmed);
    }
    const priceChanges = Object.values(analyses)
      .filter((a) =>
        a.status === "Pending Approval" &&
        a.suggestedPrice > 0 &&
        a.cost > 0 &&
        a.scrapedProduct &&
        isPrintable(a.scrapedProduct)
      )
      .sort((a, b) => (b.suggestedPrice - b.cost) - (a.suggestedPrice - a.cost))
      .slice(0, 3)
      .map((a) => ({
        product: a.scrapedProduct || a.productId,
        suggestedPrice: a.suggestedPrice,
        cost: a.cost,
      }));

    // ─── Recent reply (for "New Location Reply" card) ──────────────────
    const recentReply = replyRows.length > 0 ? {
      from: replyRows[0].from,
      summary: replyRows[0].summary,
      receivedAt: replyRows[0].receivedAt,
      intent: replyRows[0].intent,
    } : null;

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
        todayHasData,
        // Non-null = today's numbers above came LIVE from Nayax on this request.
        // Null = scraper timed out / unavailable, you're seeing the last
        // daily_sales sync (could be hours stale).
        liveDataAt,
      },
      machines: {
        total: totalMachines,
        active: activeMachines,
        offline: offlineMachines.length,
        offlineList: offlineMachines.slice(0, 3).map((m) => ({ name: m.name, status: "Offline" })),
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
      refillStops,
      warehouse: {
        value: Math.round(warehouseValue * 100) / 100,
        itemsBelowThreshold,
        restockCost: Math.round(restockCost * 100) / 100,
        buyListItems,
      },
      priceChanges,
      recentReply,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed",
    };
  }
}

async function fetchDailySales(supabase: ReturnType<typeof createServerClient>, daysAgo: number) {
  // Use the operator's timezone (Eastern by default) so "today" matches what
  // Nayax's live dashboard shows. UTC would shift this 4-5 hours and silently
  // make today's totals look much smaller than the live dashboard.
  const dateStr = dateNDaysAgoInOperatorTz(daysAgo);
  const { data } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue")
    .eq("sale_date", dateStr);
  return data || [];
}

async function fetchDailySalesRange(
  supabase: ReturnType<typeof createServerClient>,
  fromDaysAgo: number,
  toDaysAgo: number
) {
  const { data } = await supabase
    .from("daily_sales")
    .select("units_sold, revenue, sale_date")
    .gte("sale_date", dateNDaysAgoInOperatorTz(fromDaysAgo))
    .lt("sale_date", dateNDaysAgoInOperatorTz(toDaysAgo));
  return data || [];
}

/**
 * Pulls TODAY's revenue + units + transaction count straight from Nayax
 * (via the scraper-api's inventory-status endpoint). The scraper returns a
 * per-product daily_breakdown keyed by date — we sum the entries for the
 * operator's "today" date and return totals.
 *
 * Why this exists: the cron-driven daily_sales table can be 24h stale.
 * Calling this on every page load makes the Today tile match Nayax LIVE
 * within seconds. Cost: 5-15s added to page load on first hit (Vercel
 * Data Cache + s-maxage will serve subsequent requests instantly for ~60s).
 *
 * Returns null on any failure so the caller falls back to the cached number.
 */
async function fetchLiveTodayTotals(todayDateStr: string): Promise<
  { revenue: number; units: number; transactions: number; fetchedAt: string } | null
> {
  const url = process.env.SCRAPER_API_URL;
  const key = process.env.SCRAPER_BACKEND_KEY || process.env.API_KEY || "";
  if (!url) return null;

  // 15s hard cap so a slow scraper doesn't hold the whole page hostage.
  // Vercel's data cache also memoizes for 30s so most refreshes within
  // that window are instant — only one user per 30s pays the round-trip.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${url}/api/machines/inventory-status`, {
      headers: { "x-api-key": key },
      next: { revalidate: 30 },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      machines?: Array<{
        products?: Array<{
          daily_breakdown?: Record<string, number>;
          daily_revenue?: Record<string, number>;
        }>;
      }>;
    };
    let units = 0;
    let revenue = 0;
    let transactions = 0;
    for (const m of data.machines || []) {
      for (const p of m.products || []) {
        const u = p.daily_breakdown?.[todayDateStr] || 0;
        const r = p.daily_revenue?.[todayDateStr] || 0;
        units += u;
        revenue += r;
        if (u > 0) transactions += u; // 1 unit ≈ 1 tx in vending
      }
    }
    return { revenue, units, transactions, fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type ScraperMachine = { name?: string; status?: string };

/**
 * Pulls the SAME machine list the Machines page renders, so the Today tile
 * count agrees with that page. Previously we counted from Supabase here
 * and the Machines page counted from this proxy → the lists diverged when
 * a machine existed in one source but not the other.
 */
async function fetchScraperMachines(): Promise<ScraperMachine[]> {
  try {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://pocketpantry.vercel.app"}/api/machines`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.machines || []) as ScraperMachine[];
  } catch {
    return [];
  }
}

async function fetchRecentReplies(supabase: ReturnType<typeof createServerClient>) {
  try {
    const { data } = await supabase
      .from("outreach_log")
      .select("lead_id, action_data, performed_at")
      .eq("action_type", "email")
      .contains("action_data", { subtype: "reply_received" })
      .order("performed_at", { ascending: false })
      .limit(5);

    return (data || []).map((r) => {
      const ad = (r.action_data as { from?: string; summary?: string; intent?: string }) || {};
      return {
        from: ad.from || "?",
        summary: ad.summary || "",
        intent: ad.intent || "",
        receivedAt: r.performed_at as string,
      };
    });
  } catch {
    return [];
  }
}
