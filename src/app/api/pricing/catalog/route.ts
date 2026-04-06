import { NextResponse } from "next/server";
import {
  getPricingCatalog,
  getSavedPricingAnalyses,
  saveProductPricing,
  savePricingDecision,
  type PricingCatalogProduct,
} from "@/lib/live-pricing-catalog";

function mapCatalogItem(
  product: PricingCatalogProduct,
  savedAnalysis?: Awaited<ReturnType<typeof getSavedPricingAnalyses>>[string]
) {
  const margin =
    product.currentPrice > 0 && product.currentPrice > product.lastKnownCost
      ? Math.round(((product.currentPrice - product.lastKnownCost) / product.currentPrice) * 100)
      : 0;

  return {
    id: product.id,
    productRefId: product.productRefId,
    product: product.name,
    scrapedProduct: savedAnalysis?.scrapedProduct ?? null,
    supplier: savedAnalysis?.supplier ?? "Not scraped yet",
    cost: savedAnalysis?.cost ?? product.lastKnownCost,
    prevCost: savedAnalysis?.prevCost ?? product.lastKnownCost,
    currentPrice: product.currentPrice,
    suggestedPrice: savedAnalysis?.suggestedPrice ?? product.currentPrice,
    margin: savedAnalysis?.margin ?? margin,
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
  };
}

export async function GET() {
  try {
    const products = await getPricingCatalog();
    const savedAnalyses = await getSavedPricingAnalyses();
    return NextResponse.json({
      success: true,
      data: products.map((product) => mapCatalogItem(product, savedAnalyses[product.id])),
      meta: { total: products.length },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch pricing catalog",
        data: [],
        meta: { total: 0 },
      },
      { status: 502 }
    );
  }
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
