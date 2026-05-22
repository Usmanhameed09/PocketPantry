/**
 * Fix pricing analyses where the scraped cost is clearly wrong (e.g. >= $4
 * because the scraper matched a multi-pack instead of a single unit). Looks
 * up the real supplier cost from the products table (populated from the UPC
 * import) and overwrites the saved analysis.
 *
 * POST { thresholdCost?: number = 4 }
 *   Looks at all pricing rows with cost >= threshold and rewrites them to
 *   the supplier cost (where known). Recomputes margin/suggestedPrice/status.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import {
  getSavedPricingAnalyses,
  savePricingAnalyses,
  type SavedPricingAnalysis,
} from "@/lib/live-pricing-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORY_MARGINS: Record<string, number> = {
  beverage: 0.5, beverages: 0.5, drinks: 0.5,
  snack: 0.45, snacks: 0.45, meals: 0.45, health: 0.45,
};
const DEFAULT_MARGIN = 0.45;

function roundToQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normName(s).split(/\s+/).filter((t) => t.length >= 3));
}

function nameMatchScore(target: string, candidate: string): number {
  // Token-overlap score (0..1). Requires majority of target tokens to match.
  const t = tokenize(target);
  const c = tokenize(candidate);
  if (t.size === 0) return 0;
  let matches = 0;
  for (const tok of t) if (c.has(tok)) matches++;
  return matches / t.size;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const threshold = Number(body.thresholdCost) || 4;
    const minMatchScore = Number(body.minMatchScore) || 0.5;

    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Pull every product (across pagination) to find supplier costs
    const supplierProducts: Array<{ id: string; name: string; unit_cost: number; case_size: number; category: string }> = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit_cost, case_size, category")
        .eq("company_id", companyId)
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const p of data) {
        if ((p.unit_cost as number) > 0) {
          supplierProducts.push(p as never);
        }
      }
      if (data.length < 1000) break;
    }

    // Pull current pricing analyses (keyed by productId from /api/pricing flow)
    const analyses = await getSavedPricingAnalyses();
    const productIds = Object.keys(analyses);

    // We also need the canonical product names from the pricing catalog — those
    // are nayax-style productIds. We fetch them from /api/pricing/catalog.
    const catalogRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "https://pocketpantry.vercel.app"}/api/pricing/catalog`,
      { cache: "no-store" }
    );
    const catalogJson = await catalogRes.json();
    const catalog: Array<{ id: string; product: string; cost: number; currentPrice: number; category?: string }> = catalogJson?.data || [];

    const matchesToUpdate: SavedPricingAnalysis[] = [];
    const samples: Array<{ pricing: string; oldCost: number; newCost: number; supplier: string; score: number }> = [];
    const noMatch: Array<{ name: string; oldCost: number }> = [];

    for (const item of catalog) {
      const oldCost = item.cost || 0;
      if (oldCost < threshold) continue;

      // Find best supplier match by name token overlap
      let best: { product: typeof supplierProducts[number]; score: number } | null = null;
      for (const sp of supplierProducts) {
        const score = nameMatchScore(item.product, sp.name);
        if (score >= minMatchScore && (!best || score > best.score)) {
          best = { product: sp, score };
        }
      }
      if (!best) {
        noMatch.push({ name: item.product, oldCost });
        continue;
      }

      const newCost = Math.round(best.product.unit_cost * 100) / 100;
      // Only update if supplier cost is meaningfully lower
      if (newCost >= oldCost) {
        continue;
      }

      // Build updated analysis (recompute margin, suggestedPrice, status)
      const existing = analyses[item.id] || {} as SavedPricingAnalysis;
      const category = (best.product.category || item.category || "snack").toLowerCase();
      const targetMargin = CATEGORY_MARGINS[category] ?? DEFAULT_MARGIN;
      const rawSuggested = newCost / (1 - targetMargin);
      const suggested = roundToQuarter(rawSuggested);
      const finalSuggested = Math.max(suggested, item.currentPrice || 0);
      const margin = finalSuggested > 0
        ? Math.round(((finalSuggested - newCost) / finalSuggested) * 100)
        : 0;

      const priceChangeNeeded = finalSuggested > (item.currentPrice || 0) + 0.01;
      const status = priceChangeNeeded ? "Pending Approval" : (margin >= 45 ? "Cost Margin" : "Pending Approval");
      const trigger = priceChangeNeeded
        ? `Supplier cost $${newCost.toFixed(2)} — raise price to $${finalSuggested.toFixed(2)}`
        : `Supplier cost $${newCost.toFixed(2)} — current price still healthy`;

      const updated: SavedPricingAnalysis = {
        ...existing,
        productId: item.id,
        supplier: existing.supplier && existing.supplier !== "Not scraped yet" ? existing.supplier : "Supplier (UPC list)",
        cost: newCost,
        prevCost: oldCost,
        suggestedPrice: finalSuggested,
        margin,
        status,
        trigger,
        scraped: true,
        scrapedProduct: existing.scrapedProduct || best.product.name,
        error: null,
        updatedAt: new Date().toISOString(),
        allPrices: existing.allPrices || [],
        sourceUrl: existing.sourceUrl,
        packPrice: existing.packPrice ?? null,
        packSize: existing.packSize ?? best.product.case_size,
      };

      matchesToUpdate.push(updated);
      if (samples.length < 15) {
        samples.push({
          pricing: item.product,
          oldCost,
          newCost,
          supplier: best.product.name,
          score: Math.round(best.score * 100) / 100,
        });
      }
    }

    if (matchesToUpdate.length > 0) {
      await savePricingAnalyses(matchesToUpdate);
    }

    return NextResponse.json({
      success: true,
      threshold,
      examined: catalog.filter((c) => (c.cost || 0) >= threshold).length,
      updated: matchesToUpdate.length,
      noMatch: noMatch.length,
      samples,
      noMatchList: noMatch.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) { return POST(req); }
