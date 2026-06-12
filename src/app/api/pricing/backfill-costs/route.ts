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
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { invalidateOnPriceWrite } from "@/lib/cache";
import { parsePackFromTitle } from "@/lib/build-pricing-from-scrape";

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
const normalizeName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

async function computeBackfill() {
  const [catalog, saved] = await Promise.all([
    getPricingCatalog(),
    getSavedPricingAnalyses(),
  ]);
  const supabase = createServerClient();
  const companyId = await ensureDefaultCompany();

  // Catalog synthetic-id -> canonical product name + category.
  const nameById = new Map(catalog.map((c) => [c.id, c.name]));
  const catById = new Map(catalog.map((c) => [c.id, c.category]));

  // Load the WHOLE products table (paginated past the 1000-row cap) so we
  // can resolve a scraped product to its real UUID by normalized name.
  type Prod = { id: string; name: string; unit_cost: number | null };
  const products: Prod[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 50000; from += PAGE) {
    const { data } = await supabase
      .from("products")
      .select("id, name, unit_cost")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    products.push(...(data as Prod[]));
    if (data.length < PAGE) break;
  }
  // normalized name -> products row, preferring one that already has a cost
  // (mirrors the catalog's duplicate-resolution so we hit the same row).
  const prodByName = new Map<string, Prod>();
  for (const p of products) {
    const key = normalizeName(p.name);
    const existing = prodByName.get(key);
    if (!existing) { prodByName.set(key, p); continue; }
    const eHas = (existing.unit_cost ?? 0) > 0;
    const cHas = (p.unit_cost ?? 0) > 0;
    if (cHas && !eHas) prodByName.set(key, p);
  }

  const fixes: Array<{ productId: string; cost: number; name: string; oldCost: number; via?: string }> = [];
  const skipped: Array<{ name: string; cost: number; reason: string }> = [];
  for (const [savedId, a] of Object.entries(saved)) {
    let cost = Number(a.cost) || 0;
    let via = "stored cost";
    const category = (catById.get(savedId) || "snack").toLowerCase();
    const caseCeiling = category.includes("meal") ? 8 : 5;

    // RECOVERY: if the stored cost looks like a case price (too high) but we
    // have a pack price + a parseable count in the scraped title, recompute
    // the real unit cost. This rescues e.g. Mrs Freshleys Mini Donut where
    // the scraper saved $171.01 (a 72-count case) as the unit cost — the
    // title "72 per case" gives 171.01/72 = $2.37.
    if (cost > caseCeiling && a.packPrice && a.packPrice > 0) {
      const titleCount = parsePackFromTitle(a.scrapedProduct);
      const size = titleCount && titleCount > 1
        ? titleCount
        : (a.packSize && a.packSize > 1 ? a.packSize : 1);
      if (size > 1) {
        const recomputed = Math.round((a.packPrice / size) * 100) / 100;
        if (recomputed > 0) { cost = recomputed; via = `title pack ${size}`; }
      }
    }

    if (cost <= 0) continue;
    const name = nameById.get(savedId) || a.scrapedProduct || "";
    if (!name) continue;
    const prod = prodByName.get(normalizeName(name));
    if (!prod) continue;
    const oldCost = prod.unit_cost ?? 0;
    if (Math.abs(oldCost - cost) < 0.01) continue; // already correct

    // After recovery, anything STILL above the ceiling is genuinely
    // unparseable (no count in title) — skip rather than import garbage.
    if (cost > caseCeiling) {
      skipped.push({ name: prod.name, cost, reason: `> $${caseCeiling}, no pack count in title` });
      continue;
    }
    if (oldCost > 0 && cost > oldCost * 1.5) {
      skipped.push({ name: prod.name, cost, reason: `${cost} > 1.5× existing ${oldCost}` });
      continue;
    }

    fixes.push({ productId: prod.id, cost: Math.round(cost * 100) / 100, name: prod.name, oldCost, via });
  }

  return { fixes, skipped };
}

async function applyBackfill(fixes: Array<{ productId: string; cost: number; name: string; oldCost: number; via?: string }>) {
  const supabase = createServerClient();
  let applied = 0;
  const errors: string[] = [];
  for (const f of fixes) {
    const { error } = await supabase
      .from("products")
      .update({ unit_cost: f.cost })
      .eq("id", f.productId);
    if (!error) applied++;
    else if (errors.length < 5) errors.push(`${f.name}: ${error.message}`);
  }
  if (applied > 0) await invalidateOnPriceWrite();
  return { applied, errors };
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
    const { fixes, skipped } = await computeBackfill();
    if (dry) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        count: fixes.length,
        skippedCount: skipped.length,
        fixes: fixes.slice(0, 150),
        skipped: skipped.slice(0, 50),
      });
    }
    const { applied, errors } = await applyBackfill(fixes);
    return NextResponse.json({ success: true, applied, total: fixes.length, skipped: skipped.length, errors });
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
