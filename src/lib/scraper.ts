import * as cheerio from "cheerio";
import { StoredProduct } from "./pricing-products";

export interface ScrapedPrice {
  productId: string;
  productName: string;
  scrapedName: string;
  scrapedPrice: number | null;
  scrapedPricePerUnit: number | null;
  packSize: number | null;
  unitPrice: number | null;
  url: string;
  success: boolean;
  error?: string;
}

/**
 * Scrape a single product page from Sam's Club.
 * Sam's Club renders prices via JS, so we try multiple strategies:
 * 1. JSON-LD structured data
 * 2. Meta tags
 * 3. HTML price selectors
 * 4. Sam's Club product API
 */
async function scrapeSamsClubProduct(
  product: StoredProduct
): Promise<ScrapedPrice> {
  const url = `https://www.samsclub.com/p/${product.samsClubProductId}/${product.samsClubItemNumber}`;

  const result: ScrapedPrice = {
    productId: product.id,
    productName: product.name,
    scrapedName: "",
    scrapedPrice: null,
    scrapedPricePerUnit: null,
    packSize: null,
    unitPrice: null,
    url,
    success: false,
  };

  try {
    // Strategy 1: Try the product page with browser-like headers
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Strategy 2: Try Sam's Club API endpoint
      return await scrapeSamsClubAPI(product, result);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try JSON-LD structured data (most reliable)
    const jsonLd = $('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLd.length; i++) {
      try {
        const data = JSON.parse($(jsonLd[i]).html() || "");
        if (data["@type"] === "Product" || data?.offers) {
          result.scrapedName = data.name || product.name;
          const offer = data.offers?.price || data.offers?.[0]?.price;
          if (offer) {
            result.scrapedPrice = parseFloat(offer);
            result.success = true;
          }
        }
      } catch {
        // Continue to next strategy
      }
    }

    if (!result.success) {
      // Try meta tags
      const ogPrice =
        $('meta[property="product:price:amount"]').attr("content") ||
        $('meta[property="og:price:amount"]').attr("content");
      if (ogPrice) {
        result.scrapedPrice = parseFloat(ogPrice);
        result.scrapedName =
          $('meta[property="og:title"]').attr("content") || product.name;
        result.success = true;
      }
    }

    if (!result.success) {
      // Try common price CSS selectors
      const priceSelectors = [
        '[data-automation="club-price"]',
        ".sc-price",
        '[class*="Price"]',
        '[class*="price"]',
        ".sc-channel-price",
      ];
      for (const sel of priceSelectors) {
        const el = $(sel).first();
        if (el.length) {
          const text = el.text().replace(/[^0-9.]/g, "");
          if (text) {
            result.scrapedPrice = parseFloat(text);
            result.scrapedName = $("h1").first().text().trim() || product.name;
            result.success = true;
            break;
          }
        }
      }
    }

    // If page scraping failed, try API
    if (!result.success) {
      return await scrapeSamsClubAPI(product, result);
    }

    // Calculate per-unit price if we have a pack price
    if (result.scrapedPrice && result.success) {
      result.packSize = extractPackSize(
        result.scrapedName || product.name
      );
      if (result.packSize && result.packSize > 1) {
        result.unitPrice =
          Math.round((result.scrapedPrice / result.packSize) * 100) / 100;
        result.scrapedPricePerUnit = result.unitPrice;
      } else {
        result.unitPrice = result.scrapedPrice;
        result.scrapedPricePerUnit = result.scrapedPrice;
      }
    }

    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown error";
    // Try API as last resort
    return await scrapeSamsClubAPI(product, result);
  }
}

/**
 * Try Sam's Club's search/product API as a fallback.
 */
async function scrapeSamsClubAPI(
  product: StoredProduct,
  result: ScrapedPrice
): Promise<ScrapedPrice> {
  try {
    const searchTerm = encodeURIComponent(product.name);
    const apiUrl = `https://www.samsclub.com/api/node/vivaldi/browse/v2/products/search?sourceType=1&limit=1&offset=0&searchTerm=${searchTerm}`;

    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const records =
        data?.payload?.records || data?.records || data?.products || [];
      if (records.length > 0) {
        const item = records[0];
        const price =
          item.onlinePrice?.finalPrice?.amount ||
          item.listPrice?.amount ||
          item.price?.finalPrice?.amount ||
          item.clubPrice ||
          null;
        if (price) {
          result.scrapedPrice = parseFloat(price);
          result.scrapedName = item.productName || item.name || product.name;
          result.success = true;
          result.packSize = extractPackSize(result.scrapedName);
          if (result.packSize && result.packSize > 1) {
            result.unitPrice =
              Math.round((result.scrapedPrice / result.packSize) * 100) / 100;
            result.scrapedPricePerUnit = result.unitPrice;
          } else {
            result.unitPrice = result.scrapedPrice;
            result.scrapedPricePerUnit = result.scrapedPrice;
          }
        }
      }
    }
  } catch {
    // API fallback also failed
  }

  if (!result.success) {
    result.error = result.error || "Could not fetch price from Sam's Club";
  }
  return result;
}

/**
 * Extract pack size from product name.
 * e.g., "Monster Energy (24 pk)" → 24
 *        "Celsius 18 ct" → 18
 */
function extractPackSize(name: string): number | null {
  const patterns = [
    /(\d+)\s*(?:pk|pack|ct|count|cans?|bottles?|ea)/i,
    /(\d+)\s*(?:fl\s*oz)\s*,?\s*(\d+)\s*pk/i,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) {
      // For "16 fl oz, 24 pk" pattern, take the second number
      const num = m[2] ? parseInt(m[2]) : parseInt(m[1]);
      if (num > 1 && num <= 100) return num;
    }
  }
  return null;
}

/**
 * Scrape all products in parallel with concurrency limit.
 */
export async function scrapeAllProducts(
  products: StoredProduct[]
): Promise<ScrapedPrice[]> {
  const concurrency = 3;
  const results: ScrapedPrice[] = [];

  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((p) => scrapeSamsClubProduct(p))
    );
    results.push(...batchResults);
  }

  return results;
}
