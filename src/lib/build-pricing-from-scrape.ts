/**
 * TypeScript port of the Python `build_pricing_result` logic from
 * scraper-api/app/main.py. Computes suggested price, margin, status, and
 * trigger from scraped cost vs known cost.
 *
 * Used by /api/pricing/scrape-extension-results so the dashboard doesn't
 * need to round-trip through the scraper-api just to apply margin math.
 */

import type { PricingCatalogProduct } from "@/lib/live-pricing-catalog";

const CATEGORY_MARGINS: Record<string, number> = {
  beverage: 0.5,
  snack: 0.45,
};
const DEFAULT_MARGIN = 0.5;

function roundToQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

export type ExtensionScrapeResult = {
  productId: string;
  scraped: boolean;
  retailer?: string; // "Sam's Club" | "Walmart" | "Costco"
  scrapedName?: string;
  packPrice?: number;
  packSize?: number | null;
  unitPrice?: number | null;
  sourceUrl?: string;
  error?: string;
  candidates?: Array<{
    name: string;
    price: number;
    pack_size: number | null;
    url: string;
    retailer?: string;
  }>;
};

export type ComputedPricingRow = {
  productId: string;
  supplier: string;
  cost: number;
  prevCost: number;
  suggestedPrice: number;
  margin: number;
  status: string;
  trigger: string;
  sourceUrl?: string;
  packPrice?: number | null;
  packSize?: number | null;
  scraped: boolean;
  scrapedProduct: string | null;
  error: string | null;
};

export function buildPricingFromScrape(
  product: PricingCatalogProduct,
  scrape: ExtensionScrapeResult,
): ComputedPricingRow {
  // Resolve the scraped UNIT cost. Priority:
  //   1. scrape.unitPrice if the scraper pre-computed one (> 0)
  //   2. packPrice / packSize — the common case. The Sam's Club /
  //      Walmart scraper returns a PACK price ($15.98) + pack size (24)
  //      but NOT a unit price. Previously we only checked unitPrice, so
  //      these scrapes fell through to product.lastKnownCost (often 0),
  //      which is why Coca-Cola showed $0.00 cost after a successful
  //      $15.98/24pk scrape.
  //   3. packPrice alone if packSize is missing/1 (cost == pack == unit)
  //   4. product.lastKnownCost — last resort when the scrape gave nothing
  let scrapedUnitCost = 0;
  if (scrape.scraped) {
    if (typeof scrape.unitPrice === "number" && scrape.unitPrice > 0) {
      scrapedUnitCost = scrape.unitPrice;
    } else if (typeof scrape.packPrice === "number" && scrape.packPrice > 0) {
      const size = scrape.packSize && scrape.packSize > 1 ? scrape.packSize : 1;
      scrapedUnitCost = Math.round((scrape.packPrice / size) * 100) / 100;
    }
  }
  const unitCost = scrapedUnitCost > 0 ? scrapedUnitCost : product.lastKnownCost;
  const prevCost = product.lastKnownCost;
  const targetMargin = CATEGORY_MARGINS[product.category] ?? DEFAULT_MARGIN;
  const hasCostBasis = unitCost > 0;
  const costDiff = Math.round((unitCost - prevCost) * 100) / 100;
  const costChanged = Math.abs(costDiff) >= 0.01;

  let finalSuggested: number;
  let margin: number;
  if (hasCostBasis) {
    const rawSuggested = unitCost / (1 - targetMargin);
    const suggested = roundToQuarter(rawSuggested);
    finalSuggested = Math.max(suggested, product.currentPrice);
    margin = finalSuggested > 0
      ? Math.round(((finalSuggested - unitCost) / finalSuggested) * 100)
      : 0;
  } else {
    finalSuggested = product.currentPrice;
    margin = 0;
  }

  // Needs review = operator must actually change the vending price.
  // Cost moving is informational unless it forces a price change.
  const priceChangeNeeded = hasCostBasis && finalSuggested > product.currentPrice + 0.01;

  let status: string;
  let trigger: string;
  if (!hasCostBasis) {
    status = "Pending Approval";
    trigger = "No reliable unit cost yet";
  } else if (priceChangeNeeded) {
    status = "Pending Approval";
    if (costChanged && costDiff > 0) {
      trigger = `Supplier cost up $${costDiff.toFixed(2)} — raise price to $${finalSuggested.toFixed(2)}`;
    } else {
      trigger = `Raise price to $${finalSuggested.toFixed(2)} (margin below target)`;
    }
  } else if (margin >= 45) {
    status = "Cost Margin";
    if (costChanged && costDiff > 0) {
      trigger = `Cost up $${costDiff.toFixed(2)} — current price still healthy`;
    } else if (costChanged && costDiff < 0) {
      trigger = `Cost down $${Math.abs(costDiff).toFixed(2)} — margin improved`;
    } else {
      trigger = "Healthy margin";
    }
  } else {
    status = "Pending Approval";
    trigger = "Margin below target";
  }

  return {
    productId: product.id,
    supplier: scrape.scraped ? (scrape.retailer || "Sam's Club") : "Not scraped yet",
    cost: unitCost,
    prevCost,
    suggestedPrice: finalSuggested,
    margin,
    status,
    trigger,
    sourceUrl: scrape.scraped ? scrape.sourceUrl : undefined,
    packPrice: scrape.scraped ? scrape.packPrice ?? null : null,
    packSize: scrape.scraped ? scrape.packSize ?? null : null,
    scraped: !!scrape.scraped,
    scrapedProduct: scrape.scraped ? scrape.scrapedName || null : null,
    error: scrape.error || null,
  };
}
