import { NextResponse } from "next/server";
import { getPricingCatalog, savePricingAnalyses } from "@/lib/live-pricing-catalog";

/**
 * Poll a Selenium scrape job for incremental progress. Each call:
 *   1. Hits the scraper-api status endpoint with `since` cursor
 *   2. Reads only the NEW per-product results since last poll
 *   3. Maps them to dashboard schema + saves to local store
 *   4. Returns the new rows so the UI can patch its table
 *
 * Client should pass `?job=<id>&since=<last_count>` and update its `since`
 * to the returned `next_since` value.
 */
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
  first_fill_cost?: number | null;
  first_fill_supplier?: string | null;
  first_fill_pack_size?: number | null;
};

type StatusResponse = {
  job_id: string;
  status: "running" | "done" | "error";
  total: number;
  completed: number;
  next_since: number;
  results: PricingPayload[];
  error?: string | null;
  elapsed_seconds: number;
};

export async function GET(request: Request) {
  const scraperUrl = process.env.SCRAPER_API_URL || "http://localhost:8000";
  const apiKey = process.env.SCRAPER_BACKEND_KEY || "";

  const url = new URL(request.url);
  const job = url.searchParams.get("job");
  const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;

  if (!job) {
    return NextResponse.json({ success: false, error: "job param required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${scraperUrl}/api/scrape/selenium/status?job=${encodeURIComponent(job)}&since=${since}`,
      {
        headers: apiKey ? { "x-api-key": apiKey } : {},
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { success: false, error: `Status fetch failed: ${res.status} ${text.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data: StatusResponse = await res.json();

    // Need catalog for the row mapping (product names, machine counts, etc.)
    // Skip if no new results — saves a 50s catalog fetch on idle polls.
    if (data.results.length === 0) {
      return NextResponse.json({
        success: true,
        job_id: data.job_id,
        status: data.status,
        total: data.total,
        completed: data.completed,
        next_since: data.next_since,
        elapsed_seconds: data.elapsed_seconds,
        rows: [],
        error: data.error,
      });
    }

    const catalog = await getPricingCatalog();
    const catalogMap = new Map(catalog.map((p) => [p.id, p]));

    const rows = data.results.map((row) => {
      const catalogProduct = catalogMap.get(row.id);
      return {
        id: row.id,
        productRefId: catalogProduct?.productRefId ?? row.id,
        product: catalogProduct?.name ?? row.product,
        scrapedProduct: row.scraped ? row.product : null,
        supplier: row.scraped ? row.supplier : "Not on Sam's Club",
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
        firstFillCost: row.first_fill_cost ?? null,
        firstFillSupplier: row.first_fill_supplier ?? null,
        firstFillPackSize: row.first_fill_pack_size ?? null,
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

    // Save incrementally so closing the browser doesn't lose progress
    await savePricingAnalyses(
      rows.map((row) => ({
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
        firstFillCost: row.firstFillCost ?? null,
        firstFillSupplier: row.firstFillSupplier ?? null,
        firstFillPackSize: row.firstFillPackSize ?? null,
      }))
    );

    return NextResponse.json({
      success: true,
      job_id: data.job_id,
      status: data.status,
      total: data.total,
      completed: data.completed,
      next_since: data.next_since,
      elapsed_seconds: data.elapsed_seconds,
      rows,
      error: data.error,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Status poll failed" },
      { status: 502 }
    );
  }
}
