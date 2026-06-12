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

  // Catalog synthetic-id -> canonical product name (the catalog row name
  // is the operator-facing product name, which matches the products table).
  const nameById = new Map(catalog.map((c) => [c.id, c.name]));

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

  const fixes: Array<{ productId: string; cost: number; name: string; oldCost: number }> = [];
  for (const [savedId, a] of Object.entries(saved)) {
    const cost = Number(a.cost) || 0;
    if (cost <= 0) continue;
    // Resolve the product name: prefer the catalog's canonical name.
    const name = nameById.get(savedId) || a.scrapedProduct || "";
    if (!name) continue;
    const prod = prodByName.get(normalizeName(name));
    if (!prod) continue; // no matching products row — skip
    const oldCost = prod.unit_cost ?? 0;
    if (Math.abs(oldCost - cost) < 0.01) continue; // already correct
    fixes.push({
      productId: prod.id,
      cost: Math.round(cost * 100) / 100,
      name: prod.name,
      oldCost,
    });
  }

  return { fixes };
}

async function applyBackfill(fixes: Array<{ productId: string; cost: number; name: string; oldCost: number }>) {
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
