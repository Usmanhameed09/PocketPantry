/**
 * External UPC lookup via upcitemdb.com.
 *
 * Free trial endpoint (no key, ~100 lookups/day) → upgrade env var
 * UPCITEMDB_API_KEY for the paid plan if usage grows.
 *
 * This is the same kind of database that consumer barcode-scanner apps
 * (Out of Milk, Stockpile, Productly, etc.) query — they don't host the
 * UPC catalog themselves, they hit a service like this one.
 */

import "server-only";

export type ExternalUpcResult = {
  found: boolean;
  upc: string;
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  size?: string;
  weight?: string;
  imageUrl?: string;
  // Best guess at case size by parsing "12 Pack", "24-count", "6ct" out of title
  inferredCaseSize?: number;
  // Best-guess unit cost from cheapest offer (helps pre-fill the form)
  cheapestOffer?: { price: number; merchant: string };
};

const TRIAL_ENDPOINT = "https://api.upcitemdb.com/prod/trial/lookup";
const PAID_ENDPOINT = "https://api.upcitemdb.com/prod/v1/lookup";

const PACK_PATTERNS: RegExp[] = [
  /(\d+)\s*[- ]?(?:pack|pk|ct|count|cs|case|bottles?|cans?|pcs?|pieces?)\b/i,
  /(?:pack|case)\s*of\s*(\d+)/i,
  /(\d+)\s*(?:x|×)\s*\d+/i, // "12 x 12 fl oz"
];

function inferCaseSize(title: string | undefined, description: string | undefined): number | undefined {
  const haystack = [title, description].filter(Boolean).join(" ");
  if (!haystack) return undefined;
  for (const re of PACK_PATTERNS) {
    const m = haystack.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 500) return n;
    }
  }
  return undefined;
}

function mapCategory(raw: string | undefined): string {
  const c = (raw || "").toLowerCase();
  if (!c) return "Snacks";
  if (c.includes("beverage") || c.includes("drink") || c.includes("soda") || c.includes("water")) return "Drinks";
  if (c.includes("snack") || c.includes("candy") || c.includes("chip") || c.includes("cookie")) return "Snacks";
  if (c.includes("food") || c.includes("meal")) return "Meals";
  if (c.includes("health") || c.includes("vitamin") || c.includes("supplement")) return "Health";
  return "Snacks";
}

export async function lookupExternalUpc(rawBarcode: string): Promise<ExternalUpcResult> {
  const upc = rawBarcode.replace(/\D/g, "");
  if (upc.length < 8) {
    return { found: false, upc };
  }

  const apiKey = process.env.UPCITEMDB_API_KEY;
  const url = apiKey
    ? `${PAID_ENDPOINT}?upc=${upc}`
    : `${TRIAL_ENDPOINT}?upc=${upc}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["user_key"] = apiKey;

  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      // 429 = rate limited; 404 = not found
      return { found: false, upc };
    }
    const data = await res.json() as {
      code?: string;
      total?: number;
      items?: Array<{
        title?: string; brand?: string; category?: string;
        description?: string; size?: string; weight?: string;
        images?: string[];
        offers?: Array<{ merchant?: string; price?: number; availability?: string }>;
      }>;
    };

    if (data.code !== "OK" || !data.items || data.items.length === 0) {
      return { found: false, upc };
    }

    const item = data.items[0];
    const inferredCaseSize = inferCaseSize(item.title, item.description);

    // Cheapest offer (skip $0 / unavailable)
    let cheapest: { price: number; merchant: string } | undefined;
    for (const offer of item.offers || []) {
      if (!offer.price || offer.price <= 0) continue;
      if (!cheapest || offer.price < cheapest.price) {
        cheapest = { price: offer.price, merchant: offer.merchant || "?" };
      }
    }

    return {
      found: true,
      upc,
      title: item.title,
      brand: item.brand,
      category: mapCategory(item.category),
      description: item.description,
      size: item.size,
      weight: item.weight,
      imageUrl: item.images?.[0],
      inferredCaseSize,
      cheapestOffer: cheapest,
    };
  } catch (err) {
    console.warn("[upc-lookup] external lookup failed:", err);
    return { found: false, upc };
  }
}
