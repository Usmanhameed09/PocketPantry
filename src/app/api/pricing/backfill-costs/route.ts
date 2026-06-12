/**
 * One-shot backfill: recompute unit cost for products that were scraped
 * but saved with cost = 0 because the old buildPricingFromScrape didn't
 * divide packPrice by packSize.
 *
 * Reads the current pricing catalog (which already carries the scraped
 * packPrice + packSize), recomputes unitCost = packPrice / packSize for
 * any row where cost is 0 but pack data exists, and persists via
 * savePricingAnalyses — which now also writes products.unit_cost.
 *
 * GET  ?dry=1  → preview what would change (no writes)
 * POST         → apply the fix
 */

import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import {
  getPricingCatalog,
  getSavedPricingAnalyses,
} from "@/lib/live-pricing-catalog";
import { invalidateOnPriceWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scrape ALREADY computed correct unit costs and stored them in the
 * saved analyses (outreach_log). The bug was that those costs never got
 * copied into products.unit_cost — which is what the catalog + Cost Fixer
 * + Buy List + Reports all read. So products show $0 even though the scrape
 * has the real number.
 *
 * This backfill copies each saved-analysis cost (> 0) into products.unit_cost
 * wherever they differ. The catalog matches a scraped row to a products row
 * by id; if the saved analysis productId IS a products.id we update directly,
 * otherwise we resolve through the catalog's productRefId.
 */
async function computeBackfill() {
  const [catalog, saved] = await Promise.all([
    getPricingCatalog(),
    getSavedPricingAnalyses(),
  ]);
  const supabase = createServerClient();

  // Map catalog id -> the real products.id (productRefId) to write to.
  const refById = new Map(catalog.map((c) => [c.id, c.productRefId]));
  const nameById = new Map(catalog.map((c) => [c.id, c.name]));

  // Collect target (products.id -> cost) from the saved analyses.
  const writes: Array<{ productId: string; cost: number; name: string }> = [];
  for (const [savedId, a] of Object.entries(saved)) {
    const cost = Number(a.cost) || 0;
    if (cost <= 0) continue;
    // Prefer the catalog's productRefId (the canonical products.id). If the
    // saved key isn't in the catalog, assume it's already a products.id.
    const targetId = refById.get(savedId) || savedId;
    if (!targetId) continue;
    writes.push({
      productId: targetId,
      cost: Math.round(cost * 100) / 100,
      name: nameById.get(savedId) || a.scrapedProduct || targetId,
    });
  }

  // Read current products.unit_cost for those ids so we only update the
  // ones that are actually stale (0 or different).
  const ids = [...new Set(writes.map((w) => w.productId))];
  const currentCostById = new Map<string, number>();
  const PAGE = 200;
  for (let i = 0; i < ids.length; i += PAGE) {
    const chunk = ids.slice(i, i + PAGE);
    const { data } = await supabase
      .from("products")
      .select("id, unit_cost")
      .in("id", chunk);
    for (const r of data || []) {
      currentCostById.set(r.id as string, (r.unit_cost as number) || 0);
    }
  }

  const fixes = writes.filter((w) => {
    const cur = currentCostById.get(w.productId);
    // Only count rows that exist in products AND whose cost differs.
    return cur !== undefined && Math.abs(cur - w.cost) >= 0.01;
  });

  return { fixes };
}

async function applyBackfill(fixes: Array<{ productId: string; cost: number; name: string }>) {
  const supabase = createServerClient();
  let applied = 0;
  for (const f of fixes) {
    const { error } = await supabase
      .from("products")
      .update({ unit_cost: f.cost, updated_at: new Date().toISOString() })
      .eq("id", f.productId);
    if (!error) applied++;
  }
  if (applied > 0) await invalidateOnPriceWrite();
  return applied;
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    // Debug: dump the raw saved analyses so we can see what's actually
    // stored (cost, packPrice, packSize) for the supposedly-broken rows.
    if (sp.get("debug") === "1") {
      const saved = await getSavedPricingAnalyses();
      const entries = Object.entries(saved);
      const sample = entries.slice(0, 20).map(([id, a]) => ({
        id: id.slice(0, 8),
        scrapedProduct: a.scrapedProduct,
        cost: a.cost,
        packPrice: a.packPrice,
        packSize: a.packSize,
        scraped: a.scraped,
      }));
      const zeroCost = entries.filter(([, a]) => (Number(a.cost) || 0) === 0).length;
      const zeroCostWithPack = entries.filter(([, a]) =>
        (Number(a.cost) || 0) === 0 && (a.packPrice ?? 0) > 0).length;
      return NextResponse.json({
        success: true,
        debug: true,
        totalSaved: entries.length,
        zeroCost,
        zeroCostWithPack,
        sample,
      });
    }
    const dry = sp.get("dry") === "1";
    const { fixes } = await computeBackfill();
    if (dry) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        count: fixes.length,
        fixes: fixes.slice(0, 100),
      });
    }
    const applied = await applyBackfill(fixes);
    return NextResponse.json({ success: true, applied, total: fixes.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
