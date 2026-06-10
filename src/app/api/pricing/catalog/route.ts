import { NextResponse } from "next/server";
import {
  getPricingCatalog,
  getSavedPricingAnalyses,
  saveProductPricing,
  savePricingDecision,
  type PricingCatalogProduct,
} from "@/lib/live-pricing-catalog";
import { withCache, CACHE_KEYS, TTL, invalidateOnPriceWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mapCatalogItem(
  product: PricingCatalogProduct,
  savedAnalysis?: Awaited<ReturnType<typeof getSavedPricingAnalyses>>[string]
) {
  // ALWAYS use the catalog's resolved cost — which now correctly comes
  // from products.unit_cost via getPricingCatalog. The savedAnalysis.cost
  // is a frozen-in-time snapshot from when the analysis was last saved,
  // so a Cost Fixer (or any other) update to products.unit_cost wouldn't
  // be reflected. Recompute prevCost + margin against the live cost too.
  const cost = product.lastKnownCost;
  const margin =
    product.currentPrice > 0 && product.currentPrice > cost
      ? Math.round(((product.currentPrice - cost) / product.currentPrice) * 100)
      : 0;

  return {
    id: product.id,
    productRefId: product.productRefId,
    product: product.name,
    scrapedProduct: savedAnalysis?.scrapedProduct ?? null,
    supplier: savedAnalysis?.supplier ?? "Not scraped yet",
    cost,
    prevCost: savedAnalysis?.cost ?? cost, // last-saved cost shown as "previous" for diff context
    currentPrice: product.currentPrice,
    suggestedPrice: savedAnalysis?.suggestedPrice ?? product.currentPrice,
    margin,
    status: savedAnalysis?.status ?? "Cost Margin",
    trigger: savedAnalysis?.trigger ?? (product.isManualOnly
      ? "Manually added product"
      : `Live from ${product.platform === "chinese" ? "HAHA machine" : "machine feed"}`),
    sourceUrl: savedAnalysis?.sourceUrl,
    packPrice: savedAnalysis?.packPrice ?? null,
    packSize: savedAnalysis?.packSize ?? product.expectedPackSize,
    scraped: savedAnalysis?.scraped ?? false,
    allPrices: savedAnalysis?.allPrices ?? [],
    machineCount: product.machineCount,
    unitsSold: product.unitsSold,
    platform: product.platform,
    lastSoldAt: product.lastSoldAt,
    category: product.category,
    isManualOnly: product.isManualOnly,
    error: savedAnalysis?.error ?? null,
    lastScrapedAt: savedAnalysis?.updatedAt ?? null,
    firstFillCost: savedAnalysis?.firstFillCost ?? null,
    firstFillSupplier: savedAnalysis?.firstFillSupplier ?? null,
    firstFillPackSize: savedAnalysis?.firstFillPackSize ?? null,
    _costSource: product._costSource,
    _productsUnitCost: product._productsUnitCost,
    _supabaseSku: product._supabaseSku,
  };
}

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildCatalog()
      : await withCache(CACHE_KEYS.pricingCatalog, TTL.pricingCatalog, buildCatalog);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    const e = error as Partial<{ message: string; code: string; details: string; hint: string }> | null;
    const msg = e?.message || (typeof error === "string" ? error : JSON.stringify(error));
    const code = e?.code;
    console.error("[pricing/catalog] GET error:", { code, msg, details: e?.details, hint: e?.hint });
    return NextResponse.json(
      {
        success: false,
        error: msg || "Failed to fetch pricing catalog",
        errorCode: code,
        data: [],
        meta: { total: 0 },
      },
      { status: 502 }
    );
  }
}

async function buildCatalog(): Promise<Record<string, unknown>> {
  const products = await getPricingCatalog();
  const savedAnalyses = await getSavedPricingAnalyses();
  return {
    success: true,
    data: products.map((product) => mapCatalogItem(product, savedAnalyses[product.id])),
    meta: { total: products.length, savedCount: Object.keys(savedAnalyses).length },
  };
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const productId = String(body.productId || "").trim();
    const analysisId = String(body.analysisId || "").trim();
    const decision = body.decision ? String(body.decision).trim() : "";

    if (!productId && !analysisId) {
      return NextResponse.json({ success: false, error: "Product id is required" }, { status: 400 });
    }

    if (decision) {
      const currentPrice = Number(body.currentPrice);
      const suggestedPrice = Number(body.suggestedPrice);

      if (decision !== "approve" && decision !== "reject") {
        return NextResponse.json({ success: false, error: "Invalid pricing decision" }, { status: 400 });
      }

      if (!analysisId || !Number.isFinite(currentPrice) || !Number.isFinite(suggestedPrice)) {
        return NextResponse.json({ success: false, error: "Decision payload is incomplete" }, { status: 400 });
      }

      if (decision === "approve" && productId) {
        await saveProductPricing(productId, { currentPrice: suggestedPrice });
      }

      await savePricingDecision(analysisId, decision, { currentPrice, suggestedPrice });
      await invalidateOnPriceWrite();
      return NextResponse.json({ success: true });
    }

    const updates: { currentPrice?: number; lastKnownCost?: number } = {};

    if (body.currentPrice !== undefined) {
      const currentPrice = Number(body.currentPrice);
      if (!Number.isFinite(currentPrice) || currentPrice < 0) {
        return NextResponse.json({ success: false, error: "Current price must be a valid number" }, { status: 400 });
      }
      updates.currentPrice = currentPrice;
    }

    if (body.lastKnownCost !== undefined) {
      const lastKnownCost = Number(body.lastKnownCost);
      if (!Number.isFinite(lastKnownCost) || lastKnownCost < 0) {
        return NextResponse.json({ success: false, error: "Cost must be a valid number" }, { status: 400 });
      }
      updates.lastKnownCost = lastKnownCost;
    }

    if (updates.currentPrice === undefined && updates.lastKnownCost === undefined) {
      return NextResponse.json({ success: false, error: "No pricing changes provided" }, { status: 400 });
    }

    await saveProductPricing(productId, updates);
    await invalidateOnPriceWrite();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update current price",
      },
      { status: 500 }
    );
  }
}
