/**
 * Sam's Club fallback for the browser-extension scrape.
 *
 * The browser extension scrapes Sam's Club directly, but Sam's Akamai
 * bot-detection blocks it for many products (especially single-serve
 * snacks), so those fall to Walmart. The operator's requirement is that
 * SAM'S CLUB IS THE PRIMARY SOURCE — Walmart is only acceptable when Sam's
 * genuinely doesn't carry the item.
 *
 * The server SerpAPI scraper (`scraper-api /api/scrape` with
 * `samsclub_only: true`) reaches Sam's via `site:samsclub.com` Google
 * search, which is NOT Akamai-blocked. So for any product the extension
 * couldn't get from Sam's, we retry it here through SerpAPI Sam's-only and
 * prefer that result. If SerpAPI also finds nothing at Sam's, the row keeps
 * the extension's Walmart result (legitimate — Sam's doesn't carry it).
 *
 * Returned shape matches ExtensionScrapeResult so the caller can feed it
 * straight back through buildPricingFromScrape (same title-based pack
 * parsing as the in-browser path).
 */

import type { ExtensionScrapeResult } from "@/lib/build-pricing-from-scrape";

type FallbackProduct = {
  id: string;
  name: string;
  /** Clean canonical search term — never a prior scrape's result title. */
  searchTerm: string;
  category?: string;
  vendingPrice?: number;
  lastKnownCost?: number;
  expectedPackSize?: number | null;
};

type SerpApiSupplierPrice = {
  supplier: string;
  pack_price: number;
  pack_size: number | null;
  unit_price: number | null;
  name: string;
  url: string;
};

type SerpApiRow = {
  id: string;
  product: string;
  supplier: string;
  cost: number;
  pack_price?: number | null;
  pack_size?: number | null;
  source_url?: string;
  scraped?: boolean;
  error?: string | null;
  all_prices?: SerpApiSupplierPrice[];
};

type SerpApiResponse = {
  success: boolean;
  data?: SerpApiRow[];
  detail?: string;
  error?: string;
};

/**
 * Retry the given products through the server SerpAPI Sam's-only scrape.
 * Returns a map of productId -> ExtensionScrapeResult for every product that
 * SerpAPI successfully found AT SAM'S CLUB. Products SerpAPI couldn't find at
 * Sam's are omitted (caller keeps the original extension result).
 *
 * Best-effort: any network/timeout error resolves to an empty map so the
 * extension scrape still returns its own results.
 */
export async function fetchSamsClubFallback(
  products: FallbackProduct[],
  opts: { timeoutMs?: number } = {},
): Promise<Map<string, ExtensionScrapeResult>> {
  const out = new Map<string, ExtensionScrapeResult>();
  if (products.length === 0) return out;

  const scraperUrl = process.env.SCRAPER_API_URL || "http://localhost:8000";
  const apiKey = process.env.SCRAPER_BACKEND_KEY || "";
  // 30s base + 3s/product mirrors the scraper-api's own dynamic timeout,
  // capped so a large batch can't hang the request indefinitely.
  const timeoutMs = opts.timeoutMs ?? Math.min(30_000 + products.length * 3_000, 280_000);

  try {
    const res = await fetch(`${scraperUrl}/api/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify({
        samsclub_only: true,
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          search_term: p.searchTerm,
          vending_price: p.vendingPrice ?? 0,
          last_known_cost: p.lastKnownCost ?? 0,
          expected_pack_size: p.expectedPackSize ?? null,
          category: p.category ?? "snack",
        })),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      console.warn("[samsclub-fallback] non-JSON response", res.status);
      return out;
    }
    const body: SerpApiResponse = await res.json();
    if (!res.ok || !body.success || !Array.isArray(body.data)) {
      console.warn("[samsclub-fallback] scraper error", body.detail || body.error);
      return out;
    }

    for (const row of body.data) {
      // Only accept a genuine Sam's Club hit with a real price.
      const isSams = (row.supplier || "").toLowerCase().includes("sam");
      const packPrice = typeof row.pack_price === "number" ? row.pack_price : null;
      const usableCost = (packPrice && packPrice > 0) || (row.cost && row.cost > 0);
      if (!row.scraped || !isSams || !usableCost) continue;

      out.set(row.id, {
        productId: row.id,
        scraped: true,
        retailer: "Sam's Club",
        scrapedName: row.product,
        packPrice: packPrice ?? row.cost,
        packSize: row.pack_size ?? null,
        // Let buildPricingFromScrape recompute the unit cost from packPrice
        // and the title pack count (title wins over the scraper's packSize),
        // so the fallback path matches the in-browser path exactly.
        unitPrice: null,
        sourceUrl: row.source_url,
        candidates: (row.all_prices || []).map((c) => ({
          name: c.name,
          price: c.pack_price,
          pack_size: c.pack_size,
          url: c.url,
          retailer: c.supplier,
        })),
      });
    }
  } catch (err) {
    console.warn("[samsclub-fallback] failed:", err instanceof Error ? err.message : err);
  }

  return out;
}
