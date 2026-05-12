import { runPricingScrape } from "@/lib/pricing-scrape-runner";

/**
 * SerpAPI-based scrape — multi-source (Sam's Club + Google Shopping fallback).
 *
 * Pass ?samsclub_only=true (query) or {samsclub_only:true} (body) to cap the
 * run at 1 SerpAPI call per product (Sam's Club only, no fallbacks).
 */
export async function POST(request: Request) {
  const reqUrl = new URL(request.url);
  let samsclubOnly = reqUrl.searchParams.get("samsclub_only") === "true";
  if (!samsclubOnly) {
    try {
      const body = await request.clone().json().catch(() => null);
      if (body && typeof body === "object" && (body as { samsclub_only?: unknown }).samsclub_only === true) {
        samsclubOnly = true;
      }
    } catch {
      // No JSON body — leave flag as-is
    }
  }

  return runPricingScrape({
    upstreamPath: "/api/scrape",
    extraBody: { samsclub_only: samsclubOnly },
    timeoutMs: 600000, // 10 minutes
  });
}
