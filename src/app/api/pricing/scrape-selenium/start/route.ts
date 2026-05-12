import { NextResponse } from "next/server";
import { getPricingCatalog } from "@/lib/live-pricing-catalog";

/**
 * Start a Selenium scrape job. Returns a job_id that the client should poll
 * via /api/pricing/scrape-selenium/status?job=<id>.
 *
 * The scraper-api runs the scrape in a background asyncio task — this endpoint
 * returns immediately. Per-product results land in the job state as Chromium
 * works through the catalog.
 */
export async function POST() {
  const scraperUrl = process.env.SCRAPER_API_URL || "http://localhost:8000";
  const apiKey = process.env.SCRAPER_BACKEND_KEY || "";

  try {
    const catalog = await getPricingCatalog();
    if (catalog.length === 0) {
      return NextResponse.json({ success: true, job_id: null, total: 0, message: "No products in catalog" });
    }

    const res = await fetch(`${scraperUrl}/api/scrape/selenium/start`, {
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
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { success: false, error: `Failed to start scrape: ${res.status} ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      job_id: data.job_id,
      total: data.total,
      status: data.status,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reach scraper API" },
      { status: 502 }
    );
  }
}
