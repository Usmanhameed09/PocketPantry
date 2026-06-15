/**
 * Slow subset of the Today page: refill stops, restock cost (buy list),
 * pricing suggestions, recent reply. Split from /api/dashboard/today so
 * these heavier computations don't block the top tiles from rendering.
 *
 * Cached for 60s; ?fresh=1 bypasses.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { generateBuyList } from "@/lib/buy-list-generator";
import { getSavedPricingAnalyses } from "@/lib/live-pricing-catalog";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_KEY = "today:sections";

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildSections()
      : await withCache(CACHE_KEY, TTL.today, buildSections);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

async function buildSections(): Promise<Record<string, unknown>> {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    const [machinesRes, machineInvRes, analyses, replyRes] = await Promise.all([
      supabase.from("machines").select("id, name").eq("company_id", companyId),
      supabase.from("machine_inventory").select("machine_id, estimated_remaining, daily_sales_rate"),
      getSavedPricingAnalyses(),
      fetchRecentReplies(supabase),
    ]);

    const machines = machinesRes.data || [];
    const machineInv = machineInvRes.data || [];

    // ─── Refill stops ───────────────────────────────────────────────
    const machineLowest = new Map<string, { name: string; lowItems: number }>();
    for (const m of machines) {
      machineLowest.set(m.id as string, { name: m.name as string, lowItems: 0 });
    }
    for (const mi of machineInv) {
      const e = machineLowest.get(mi.machine_id as string);
      if (!e) continue;
      const rem = (mi.estimated_remaining as number) || 0;
      const rate = (mi.daily_sales_rate as number) || 0;
      if (rate > 0 && rem <= rate * 3) e.lowItems++;
    }
    const refillStops = Array.from(machineLowest.values())
      .filter((m) => m.lowItems > 0)
      .sort((a, b) => b.lowItems - a.lowItems)
      .map((m) => ({
        machine: m.name,
        items: m.lowItems,
        color: m.lowItems >= 20 ? "#dc2626" : m.lowItems >= 10 ? "#d97706" : "#059669",
      }));

    // ─── Buy list summary (restock cost) ────────────────────────────
    let restockCost = 0;
    let buyListItems = 0;
    try {
      const bl = await generateBuyList();
      restockCost = bl.vendorGroups.reduce((s, g) => s + g.subtotal, 0);
      buyListItems = bl.vendorGroups.reduce((s, g) => s + g.lines.length, 0);
    } catch {
      // skip — non-critical
    }

    // ─── Pricing suggestions ────────────────────────────────────────
    function isPrintable(s: string): boolean {
      const trimmed = s.replace(/\s+/g, "");
      return trimmed.length > 0 && /^[\x20-\x7E]+$/.test(trimmed);
    }
    // Realistic vending bounds. A single vended snack/drink/meal never costs
    // $85 / $178 / $355 — anything above these is a scraper MIS-MATCH (a luxury
    // handbag matched to "Croissant", a mattress matched to "Full Size") or a
    // CASE price, not a unit price. Without these guards the card sorts those
    // absurd numbers to the top. Filtering them keeps it 100% authentic.
    const MAX_UNIT_COST = 8;          // generous — covers premium meal items
    const MAX_SUGGESTED_PRICE = 20;
    const isCasePrice = (name: string) =>
      /\(\s*price\s*\/\s*case\s*\)|\bper\s*case\b|\/\s*case\b|\bcase\s*of\b/i.test(name);
    const priceChanges = Object.values(analyses)
      .filter((a) =>
        a.status === "Pending Approval" &&
        a.suggestedPrice > 0 && a.suggestedPrice <= MAX_SUGGESTED_PRICE &&
        a.cost > 0 && a.cost <= MAX_UNIT_COST &&
        a.scrapedProduct &&
        isPrintable(a.scrapedProduct) &&
        !isCasePrice(a.scrapedProduct)
      )
      .sort((a, b) => (b.suggestedPrice - b.cost) - (a.suggestedPrice - a.cost))
      .slice(0, 3)
      .map((a) => ({
        product: a.scrapedProduct || a.productId,
        suggestedPrice: a.suggestedPrice,
        cost: a.cost,
      }));

    // ─── Recent reply ───────────────────────────────────────────────
    const recentReply = replyRes.length > 0 ? {
      from: replyRes[0].from,
      summary: replyRes[0].summary,
      receivedAt: replyRes[0].receivedAt,
      intent: replyRes[0].intent,
    } : null;

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      refillStops,
      restock: {
        cost: Math.round(restockCost * 100) / 100,
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
