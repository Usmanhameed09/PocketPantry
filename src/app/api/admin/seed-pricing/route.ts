/**
 * Admin-only one-shot endpoint to seed realistic test pricing/vendor data
 * across products that have empty values. Idempotent — only touches rows
 * where unit_cost = 0 or vendor IS NULL.
 *
 * Hit with:
 *   curl -X POST https://.../api/admin/seed-pricing \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DRINK_VENDORS = ["Sam's Club", "Costco", "Coca-Cola Direct", "Pepsi Direct"];
const SNACK_VENDORS = ["Sam's Club", "Costco", "Walmart", "Frito-Lay Direct"];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function priceRange(category: string, idx: number): { cost: number; vend: number } {
  // Deterministic-ish based on idx so re-runs give same values per product
  const rand1 = ((idx * 31) % 100) / 100;
  const rand2 = ((idx * 47) % 100) / 100;
  if (category === "Drinks") {
    const cost = Math.round((0.45 + rand1 * 0.55) * 100) / 100;
    const vend = Math.round((1.75 + rand2 * 0.75) * 100) / 100;
    return { cost, vend };
  }
  if (category === "Snacks") {
    const cost = Math.round((0.35 + rand1 * 0.65) * 100) / 100;
    const vend = Math.round((1.25 + rand2 * 0.75) * 100) / 100;
    return { cost, vend };
  }
  return { cost: 0.75, vend: 1.5 };
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

    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, category, unit_cost, vendor, default_vend_price")
      .eq("company_id", companyId);
    if (error) throw error;

    let updated = 0;
    const skipped: string[] = [];
    let i = 0;

    for (const p of products || []) {
      // Only seed if missing data — don't overwrite operator's real edits
      const needsCost = !p.unit_cost || p.unit_cost === 0;
      const needsVendor = !p.vendor;
      const needsVend = !p.default_vend_price;
      if (!needsCost && !needsVendor && !needsVend) {
        skipped.push(p.name as string);
        continue;
      }

      const { cost, vend } = priceRange(p.category as string, i);
      const vendorList = p.category === "Drinks" ? DRINK_VENDORS : SNACK_VENDORS;
      const update: Record<string, unknown> = {};
      if (needsCost) update.unit_cost = cost;
      if (needsVendor) update.vendor = pick(vendorList, i);
      if (needsVend) update.default_vend_price = vend;

      const { error: upErr } = await supabase.from("products").update(update).eq("id", p.id);
      if (!upErr) updated++;
      i++;
    }

    return NextResponse.json({
      success: true,
      totalProducts: products?.length || 0,
      updated,
      skipped: skipped.length,
      message: `Seeded ${updated} products with test pricing/vendor data.`,
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
