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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
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

    // Also fetch scraper-api machine status — Nayax has its own offline signal
    // (no orders in >3 days) that's independent of our 24h-no-sync detector.
    // The Machines page uses the merged view, so we should too.
    const scraperOfflineNames = await fetchScraperOfflineMachines();

    // ─── Today's revenue ───────────────────────────────────────────────
    const todayUnits = todayRows.reduce((s, r) => s + (r.units_sold as number), 0);
    const todayRevenue = todayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    const yesterdayRevenue = yesterdayRows.reduce((s, r) => s + ((r.revenue as number) || 0), 0);
    const todayTransactions = todayRows.length;
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

    // ─── Machines status (merge DB + scraper-api signals) ──────────────
    const dbOffline = new Set(
      machines.filter((m) => (m.status as string) === "offline").map((m) => m.name as string)
    );
    // Combine: a machine is offline if EITHER our DB OR scraper-api says so
    const offlineNames = new Set<string>([...dbOffline, ...scraperOfflineNames]);
    const offlineMachines = machines.filter((m) => offlineNames.has(m.name as string));
    const activeMachines = machines.length - offlineMachines.length;

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

    return NextResponse.json({
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
      },
      machines: {
        total: machines.length,
        active: activeMachines,
        offline: offlineMachines.length,
        offlineList: offlineMachines.slice(0, 3).map((m) => ({ name: m.name as string, status: "Offline" })),
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
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
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

async function fetchScraperOfflineMachines(): Promise<Set<string>> {
  // Call our own /api/machines proxy which merges scraper + DB statuses.
  // We can't import the route directly server-side, so fetch.
  try {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://pocketpantry.vercel.app"}/api/machines`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return new Set();
    const data = await res.json();
    const ms = (data.machines || []) as Array<{ name?: string; status?: string }>;
    return new Set(
      ms.filter((m) => (m.status || "").toLowerCase() === "offline").map((m) => m.name || "")
    );
  } catch {
    return new Set();
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
