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
  scrapedName?: string;
  packPrice?: number;
  packSize?: number | null;
  unitPrice?: number | null;
  sourceUrl?: string;
  error?: string;
  candidates?: Array<{ name: string; price: number; pack_size: number | null; url: string }>;
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
  const unitCost = scrape.scraped && typeof scrape.unitPrice === "number" && scrape.unitPrice > 0
    ? scrape.unitPrice
    : product.lastKnownCost;
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

  let status: string;
  let trigger: string;
  if (!hasCostBasis) {
    status = "Pending Approval";
    trigger = "No reliable unit cost yet";
  } else if (costChanged && costDiff > 0) {
    status = "Pending Approval";
    trigger = `Supplier cost up $${costDiff.toFixed(2)}`;
  } else if (costChanged && costDiff < 0) {
    status = "Pending Approval";
    trigger = `Supplier cost down $${Math.abs(costDiff).toFixed(2)}`;
  } else if (margin >= 45) {
    status = "Cost Margin";
    trigger = "Healthy margin";
  } else {
    status = "Pending Approval";
    trigger = "Margin below target";
  }

  return {
    productId: product.id,
    supplier: scrape.scraped ? "Sam's Club" : "Not scraped yet",
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
