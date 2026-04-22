import { NextResponse } from "next/server";
import { getPricingCatalog, savePricingAnalyses } from "@/lib/live-pricing-catalog";

type SupplierPricePayload = {
  supplier: string;
  pack_price: number;
  pack_size: number | null;
  unit_price: number | null;
  name: string;
  url: string;
};

type PricingPayload = {
  id: string;
  product: string;
  supplier: string;
  cost: number;
  prev_cost: number;
  current_price: number;
  suggested_price: number;
  margin: number;
  status: string;
  trigger: string;
  source_url?: string;
  pack_price?: number | null;
  pack_size?: number | null;
  scraped?: boolean;
  error?: string | null;
  all_prices?: SupplierPricePayload[];
};

type ScraperResponsePayload = {
  success: boolean;
  data: PricingPayload[];
  meta: Record<string, unknown>;
  error?: string;
  detail?: string;
};

export async function POST() {
  const scraperUrl = process.env.SCRAPER_API_URL || "http://localhost:8000";
  const apiKey = process.env.SCRAPER_BACKEND_KEY || "";

  try {
    const catalog = await getPricingCatalog();

    if (catalog.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, scraped: 0, failed: 0, timestamp: new Date().toISOString() },
      });
    }

    const catalogMap = new Map(catalog.map((product) => [product.id, product]));

    const res = await fetch(`${scraperUrl}/api/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({
        products: catalog.map((product) => ({
          id: product.id,
          name: product.name,
          search_term: product.searchTerm,
          vending_price: product.currentPrice,
          last_known_cost: product.lastKnownCost,
          expected_pack_size: product.expectedPackSize,
          category: product.category,
        })),
      }),
      signal: AbortSignal.timeout(600000),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("[pricing/scrape] Non-JSON response from scraper:", res.status, text.slice(0, 300));
      return NextResponse.json(
        {
          success: false,
          error: `Scraper API returned ${res.status} (not JSON). Make sure the scraper backend is running and reachable at ${scraperUrl}`,
        },
        { status: 502 }
      );
    }

    const data: ScraperResponsePayload = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || data.error || "Scraper API error" },
        { status: res.status }
      );
    }

    const mappedRows = data.data.map((row) => {
      const catalogProduct = catalogMap.get(row.id);
      return {
        id: row.id,
        productRefId: catalogProduct?.productRefId ?? row.id,
        product: catalogProduct?.name ?? row.product,
        scrapedProduct: row.scraped ? row.product : null,
        supplier: row.scraped ? row.supplier : "Not scraped yet",
        cost: row.cost,
        prevCost: row.prev_cost,
        currentPrice: row.current_price,
        suggestedPrice: row.suggested_price,
        margin: row.margin,
        status: row.status,
        trigger: row.trigger,
        sourceUrl: row.scraped ? row.source_url : undefined,
        packPrice: row.pack_price,
        packSize: row.pack_size,
        scraped: row.scraped,
        error: row.error || null,
        allPrices: (row.all_prices || []).map((sp) => ({
          supplier: sp.supplier,
          packPrice: sp.pack_price,
          packSize: sp.pack_size,
          unitPrice: sp.unit_price,
          name: sp.name,
          url: sp.url,
        })),
        machineCount: catalogProduct?.machineCount ?? 0,
        unitsSold: catalogProduct?.unitsSold ?? 0,
        platform: catalogProduct?.platform ?? "manual",
        lastSoldAt: catalogProduct?.lastSoldAt ?? null,
        category: catalogProduct?.category ?? "snack",
        isManualOnly: catalogProduct?.isManualOnly ?? false,
      };
    });

    await savePricingAnalyses(
      mappedRows.map((row) => ({
        productId: row.id,
        supplier: row.supplier,
        cost: row.cost,
        prevCost: row.prevCost,
        suggestedPrice: row.suggestedPrice,
        margin: row.margin,
        status: row.status,
        trigger: row.trigger,
        sourceUrl: row.sourceUrl,
        packPrice: row.packPrice,
        packSize: row.packSize,
        scraped: row.scraped,
        scrapedProduct: row.scrapedProduct,
        error: row.error || null,
        updatedAt: new Date().toISOString(),
        allPrices: row.allPrices || [],
      }))
    );

    const failedRows = data.data.filter((row) => !row.scraped);
    const uniqueErrors = Array.from(
      new Set(
        failedRows
          .map((row) => row.error?.trim())
          .filter((value): value is string => Boolean(value))
      )
    );

    let warning: string | undefined;
    if ((data.meta?.scraped as number | undefined) === 0 && uniqueErrors.length > 0) {
      warning = uniqueErrors[0];
    } else if (failedRows.length > 0 && uniqueErrors.length > 0) {
      warning = `${failedRows.length} products could not be scraped. ${uniqueErrors[0]}`;
    }

    return NextResponse.json({
      success: data.success,
      data: mappedRows,
      meta: data.meta,
      ...(warning ? { error: warning } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reach scraper API",
      },
      { status: 502 }
    );
  }
}
