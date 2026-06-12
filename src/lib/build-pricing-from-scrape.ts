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

/**
 * Parse the pack/case count out of a retail product TITLE. Walmart / Sam's
 * Club titles almost always state it, e.g.:
 *   "Mrs Freshleys Crunch Mini Donut, 3.4 Ounce -- 72 per case."   -> 72
 *   "Coca-Cola Soda Soft Drink, 12 fl oz, 35 Pack"                 -> 35
 *   "Doritos Nacho Cheese, 1 oz, Pack of 40"                       -> 40
 *   "Lays Classic Chips 1oz 50ct"                                  -> 50
 *   "case of 24"                                                   -> 24
 *
 * The hard part is NOT matching the volume/weight (3.4 Ounce, 12 fl oz).
 * We only accept a number that is explicitly tied to a COUNT word
 * (case/pack/count/ct/pc/box/cans/bottles/bags/bars/per case), and we
 * reject numbers immediately followed by a unit (oz, ounce, fl, ml, g, lb).
 */
export function parsePackFromTitle(title: string | null | undefined): number | null {
  if (!title) return null;
  const t = title.toLowerCase();

  // Ordered patterns, strongest signal first.
  const patterns: RegExp[] = [
    /(\d{1,3})\s*(?:per\s*case|\/\s*case|\/\s*cs)\b/, // "72 per case", "72/case"
    /(?:case|pack)\s*of\s*(\d{1,3})\b/,                // "case of 24", "pack of 40"
    /(\d{1,3})\s*[-\s]?(?:ct|count|pk|pack|pcs|pieces?|cans?|bottles?|bags?|bars?|cups?|boxes?|box|tin)\b/, // "50ct", "24 pack", "12 cans"
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 2 && n <= 288) return n;
    }
  }
  return null;
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
  // Resolve the effective pack size. The scraper's packSize is often wrong
  // (1 when the listing is actually a 72-count case), but the product TITLE
  // almost always states the real count ("72 per case"). When the scraper
  // size is missing/1, parse the title and prefer that.
  let effectivePackSize = scrape.packSize && scrape.packSize > 1 ? scrape.packSize : 1;
  if (effectivePackSize <= 1) {
    const fromTitle = parsePackFromTitle(scrape.scrapedName);
    if (fromTitle && fromTitle > 1) effectivePackSize = fromTitle;
  }

  let scrapedUnitCost = 0;
  if (scrape.scraped) {
    if (typeof scrape.unitPrice === "number" && scrape.unitPrice > 0) {
      scrapedUnitCost = scrape.unitPrice;
    } else if (typeof scrape.packPrice === "number" && scrape.packPrice > 0) {
      scrapedUnitCost = Math.round((scrape.packPrice / effectivePackSize) * 100) / 100;
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
    // Store the EFFECTIVE pack size (title-parsed when the scraper's was
    // wrong) so case_size + the "$X / Npk" display reflect reality.
    packSize: scrape.scraped ? effectivePackSize : null,
    scraped: !!scrape.scraped,
    scrapedProduct: scrape.scraped ? scrape.scrapedName || null : null,
    error: scrape.error || null,
  };
}
