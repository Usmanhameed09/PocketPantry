import { runPricingScrape } from "@/lib/pricing-scrape-runner";

/**
 * Selenium-based scrape — Sam's Club only, no API tokens used.
 *
 * Slow (~25s/product, sequential) but free. Falls back to last_known_cost for
 * products not found at Sam's Club. Use this as the primary scrape; switch to
 * /api/pricing/scrape when Selenium fails or you need multi-source pricing.
 */
export async function POST() {
  return runPricingScrape({
    upstreamPath: "/api/scrape/selenium",
    timeoutMs: 60 * 60 * 1000, // 60 minutes — Selenium is slow
  });
}
