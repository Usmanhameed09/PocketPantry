/**
 * Sync REAL vendor + cost from the pricing module's scrape results into
 * the products table. Matches by product name (case-insensitive).
 *
 * For products that match a successful scrape → vendor + unit_cost get
 * REAL values from the scrape. For products with no scrape match → vendor
 * is cleared back to NULL (no fake data).
 *
 * Run with:
 *   curl -X POST https://.../api/admin/sync-pricing-to-products \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { getSavedPricingAnalyses } from "@/lib/live-pricing-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Fetch every saved pricing analysis (keyed by Nayax product id)
    const analyses = await getSavedPricingAnalyses();

    // Build a map: normalized-product-name → { supplier, cost }
    // Pricing analyses store productId (Nayax-style), so we need the
    // product name. Hit the pricing catalog to get name → analysis mapping.
    const catalogRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "https://pocketpantry.vercel.app"}/api/pricing/catalog`,
      { cache: "no-store" }
    );
    const catalogData = await catalogRes.json();
    const catalog = catalogData?.data || [];

    const realByName = new Map<string, { vendor: string; cost: number }>();
    for (const row of catalog) {
      if (!row.scraped) continue;
      const name = normalizeName(row.product || "");
      if (!name) continue;
      // Sanity-check: only accept real retailers
      const vendor: string = row.supplier;
      if (!["Sam's Club", "Walmart", "Costco"].includes(vendor)) continue;
      realByName.set(name, {
        vendor,
        cost: typeof row.cost === "number" ? row.cost : 0,
      });
    }

    // Fetch every product
    const { data: products } = await supabase
      .from("products")
      .select("id, name, vendor, unit_cost")
      .eq("company_id", companyId);

    if (!products) {
      return NextResponse.json({ success: false, error: "No products found" }, { status: 404 });
    }

    let realMatches = 0;
    let clearedFakes = 0;
    let unchanged = 0;
    const samples: Array<{ name: string; vendor: string; cost: number }> = [];

    for (const p of products) {
      const match = realByName.get(normalizeName(p.name as string));
      if (match) {
        const { error } = await supabase
          .from("products")
          .update({ vendor: match.vendor, unit_cost: match.cost })
          .eq("id", p.id);
        if (!error) {
          realMatches++;
          if (samples.length < 5) {
            samples.push({ name: p.name as string, vendor: match.vendor, cost: match.cost });
          }
        }
      } else if (p.vendor) {
        // No scrape match — clear the placeholder vendor and reset cost to 0
        // so the operator can fill in the real value (or leave it blank).
        const { error } = await supabase
          .from("products")
          .update({ vendor: null, unit_cost: 0 })
          .eq("id", p.id);
        if (!error) clearedFakes++;
      } else {
        unchanged++;
      }
    }

    return NextResponse.json({
      success: true,
      totalProducts: products.length,
      realMatches,
      clearedFakes,
      unchanged,
      samples,
      message: `Updated ${realMatches} products with real scraped data; cleared ${clearedFakes} placeholder vendors.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
