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

import { NextResponse } from "next/server";
import {
  getPricingCatalog,
  getSavedPricingAnalyses,
  savePricingAnalyses,
  type SavedPricingAnalysis,
} from "@/lib/live-pricing-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORY_MARGINS: Record<string, number> = { beverage: 0.5, snack: 0.45 };
const DEFAULT_MARGIN = 0.5;
const roundQuarter = (n: number) => Math.round(n * 4) / 4;

async function computeBackfill() {
  // The saved analyses carry the scraped packPrice + packSize. The catalog
  // object doesn't — so we read the analyses directly and use the catalog
  // only for the product name / category / current price lookup.
  const [catalog, saved] = await Promise.all([
    getPricingCatalog(),
    getSavedPricingAnalyses(),
  ]);
  const catById = new Map(catalog.map((c) => [c.id, c]));

  const fixes: Array<{
    product: string;
    productId: string;
    oldCost: number;
    newCost: number;
    packPrice: number;
    packSize: number;
  }> = [];
  const analyses: SavedPricingAnalysis[] = [];

  for (const [productId, a] of Object.entries(saved)) {
    const cost = Number(a.cost) || 0;
    const packPrice = a.packPrice ?? null;
    const packSize = a.packSize ?? null;
    // Only touch rows that look broken: zero cost but real pack data.
    if (cost > 0) continue;
    if (!packPrice || packPrice <= 0) continue;
    const size = packSize && packSize > 1 ? packSize : 1;
    const newCost = Math.round((packPrice / size) * 100) / 100;
    if (newCost <= 0) continue;

    const cat = catById.get(productId);
    const category = cat?.category || "snack";
    const currentPrice = cat?.currentPrice ?? 0;
    const productName = cat?.name || a.scrapedProduct || productId;

    // Recompute suggested price + margin off the corrected cost.
    const targetMargin = CATEGORY_MARGINS[category] ?? DEFAULT_MARGIN;
    const rawSuggested = newCost / (1 - targetMargin);
    const suggested = Math.max(roundQuarter(rawSuggested), currentPrice);
    const margin = suggested > 0 ? Math.round(((suggested - newCost) / suggested) * 100) : 0;

    fixes.push({
      product: productName,
      productId,
      oldCost: cost,
      newCost,
      packPrice,
      packSize: size,
    });

    analyses.push({
      ...a,
      productId,
      cost: newCost,
      prevCost: cost,
      suggestedPrice: suggested,
      margin,
      status: "Cost Margin",
      trigger: `Backfill: $${packPrice} / ${size}pk = $${newCost.toFixed(2)}/unit`,
      packPrice,
      packSize: size,
      scraped: true,
      updatedAt: new Date().toISOString(),
    });
  }

  return { fixes, analyses };
}

export async function GET(req: Request) {
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const { fixes, analyses } = await computeBackfill();
    if (dry) {
      return NextResponse.json({ success: true, dryRun: true, count: fixes.length, fixes });
    }
    if (analyses.length > 0) {
      await savePricingAnalyses(analyses);
    }
    return NextResponse.json({ success: true, applied: fixes.length, fixes });
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
