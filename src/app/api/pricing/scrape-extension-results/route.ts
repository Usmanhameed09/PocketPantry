import { NextResponse } from "next/server";
import { getPricingCatalog, savePricingAnalyses } from "@/lib/live-pricing-catalog";
import { buildPricingFromScrape, type ExtensionScrapeResult } from "@/lib/build-pricing-from-scrape";
import { fetchSamsClubFallback } from "@/lib/samsclub-fallback";

// SerpAPI Sam's fallback can take a while for a large batch.
export const maxDuration = 300;

type RequestBody = {
  results?: ExtensionScrapeResult[];
  requestId?: string;
};

/**
 * Accepts scrape results gathered by the browser extension running in the
 * user's session. Applies the same margin math the SerpAPI flow uses,
 * persists to Supabase (or local fallback), and returns the mapped rows
 * the dashboard renders.
 */
export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const results = Array.isArray(body.results) ? body.results : [];

    if (results.length === 0) {
      return NextResponse.json({ success: false, error: "No results in payload" }, { status: 400 });
    }

    const catalog = await getPricingCatalog();
    const catalogMap = new Map(catalog.map((p) => [p.id, p]));

    // SAM'S CLUB IS THE PRIMARY SOURCE. The browser extension gets blocked by
    // Sam's Akamai for many products (mostly snacks) and falls to Walmart.
    // For every product the extension did NOT get from Sam's, retry it through
    // the server SerpAPI Sam's-only scrape (site:samsclub.com — not Akamai
    // blocked). When SerpAPI finds it at Sam's, we use that result instead;
    // otherwise the extension's Walmart result stands (Sam's truly lacks it).
    const needsSams = results.filter((r) => {
      const retailer = (r.retailer || "").toLowerCase();
      return !r.scraped || !retailer.includes("sam");
    });
    let samsFallback = new Map<string, ExtensionScrapeResult>();
    if (needsSams.length > 0) {
      const fallbackProducts = needsSams
        .map((r) => catalogMap.get(r.productId))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          id: p.id,
          name: p.name,
          // Clean canonical name, NEVER a prior scrape title — avoids the
          // search-term snowball that drifted everything to Walmart.
          searchTerm: p.name,
          category: p.category,
          vendingPrice: p.currentPrice,
          lastKnownCost: p.lastKnownCost,
          expectedPackSize: p.expectedPackSize,
        }));
      samsFallback = await fetchSamsClubFallback(fallbackProducts);
    }

    const mappedRows: Record<string, unknown>[] = [];
    const analyses = [];

    for (const rawResult of results) {
      // Prefer a SerpAPI Sam's hit over the extension's non-Sam's result.
      const result = samsFallback.get(rawResult.productId) ?? rawResult;
      const product = catalogMap.get(result.productId);
      if (!product) continue;

      const computed = buildPricingFromScrape(product, result);

      mappedRows.push({
        id: product.id,
        productRefId: product.productRefId,
        product: product.name,
        scrapedProduct: computed.scrapedProduct,
        supplier: computed.supplier,
        cost: computed.cost,
        prevCost: computed.prevCost,
        currentPrice: product.currentPrice,
        suggestedPrice: computed.suggestedPrice,
        margin: computed.margin,
        status: computed.status,
        trigger: computed.trigger,
        sourceUrl: computed.sourceUrl,
        packPrice: computed.packPrice,
        packSize: computed.packSize,
        scraped: computed.scraped,
        error: computed.error,
        allPrices: result.candidates
          ? result.candidates.map((c) => ({
              supplier: c.retailer || "Sam's Club",
              packPrice: c.price,
              packSize: c.pack_size,
              unitPrice: c.pack_size && c.pack_size > 0
                ? Math.round((c.price / c.pack_size) * 100) / 100
                : c.price,
              name: c.name,
              url: c.url,
            }))
          : [],
        machineCount: product.machineCount,
        unitsSold: product.unitsSold,
        platform: product.platform,
        lastSoldAt: product.lastSoldAt,
        category: product.category,
        isManualOnly: product.isManualOnly,
        firstFillCost: computed.scraped ? computed.packPrice : null,
        firstFillSupplier: computed.scraped ? (result.retailer || "Sam's Club") : null,
        firstFillPackSize: computed.packSize,
      });

      analyses.push({
        productId: product.id,
        // Canonical product name so the cost can be resolved to the real
        // products.id (the analysis productId is a synthetic scraper id).
        productName: product.name,
        supplier: computed.supplier,
        cost: computed.cost,
        prevCost: computed.prevCost,
        suggestedPrice: computed.suggestedPrice,
        margin: computed.margin,
        status: computed.status,
        trigger: computed.trigger,
        sourceUrl: computed.sourceUrl,
        packPrice: computed.packPrice,
        packSize: computed.packSize,
        scraped: computed.scraped,
        scrapedProduct: computed.scrapedProduct,
        error: computed.error,
        updatedAt: new Date().toISOString(),
        allPrices: (mappedRows[mappedRows.length - 1].allPrices as unknown) as Array<{
          supplier: string;
          packPrice: number;
          packSize: number | null;
          unitPrice: number | null;
          name: string;
          url: string;
        }>,
        firstFillCost: computed.scraped ? computed.packPrice ?? null : null,
        firstFillSupplier: computed.scraped ? (result.retailer || "Sam's Club") : null,
        firstFillPackSize: computed.packSize ?? null,
      });
    }

    let saveError: string | null = null;
    let saveLocation: "supabase" | "local" | "failed" = "failed";
    try {
      const result = await savePricingAnalyses(analyses);
      if (result && "local" in result && result.local) {
        saveLocation = "local";
        saveError = (result as { supabaseError?: string }).supabaseError || "supabase write fell back to local";
      } else {
        saveLocation = "supabase";
      }
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
      console.warn("[pricing/scrape-extension-results] save failed:", err);
    }

    const scrapedCount = analyses.filter((a) => a.scraped).length;
    return NextResponse.json({
      success: true,
      data: mappedRows,
      meta: {
        total: mappedRows.length,
        scraped: scrapedCount,
        failed: mappedRows.length - scrapedCount,
        timestamp: new Date().toISOString(),
        method: "extension",
        saveLocation,
        ...(saveError ? { saveError } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process extension results",
      },
      { status: 500 }
    );
  }
}
