/**
 * One-shot category cleanup:
 *   1. Move products with category="Health" → "Snacks" (we no longer use Health)
 *   2. Auto-detect Candy from product names (chocolate, candy, gum, etc.) and
 *      reclassify Snacks → Candy where the name clearly indicates candy.
 *
 * Idempotent — safe to re-run.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CANDY_KEYWORDS = [
  "candy", "chocolate", "gum", "lollipop", "lolly", "skittles", "snickers",
  "twix", "milky way", "kit kat", "kitkat", "reese", "m&m", "starburst",
  "hershey", "twizzler", "jolly rancher", "mentos", "tootsie", "airheads",
  "sour patch", "haribo", "gummy", "gummi", "nerds", "bubble", "altoid",
  "mint ", "mints", "licorice", "caramel", "fudge", "toffee", "marshmallow",
  "butterfinger", "3 musketeer", "almond joy", "mounds", "payday",
];

function looksLikeCandy(name: string): boolean {
  const n = name.toLowerCase();
  return CANDY_KEYWORDS.some((kw) => n.includes(kw));
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

    // Step 1 — Health → Snacks
    const { data: healthRows, error: hErr } = await supabase
      .from("products")
      .update({ category: "Snacks" })
      .eq("company_id", companyId)
      .eq("category", "Health")
      .select("id");
    if (hErr) throw hErr;
    const healthMoved = healthRows?.length || 0;

    // Step 2 — Candy detection (paginated)
    const PAGE = 1000;
    const candyIds: string[] = [];
    const candySamples: string[] = [];
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("company_id", companyId)
        .eq("category", "Snacks")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const p of data) {
        const name = p.name as string;
        if (looksLikeCandy(name)) {
          candyIds.push(p.id as string);
          if (candySamples.length < 10) candySamples.push(name);
        }
      }
      if (data.length < PAGE) break;
    }

    let candyMoved = 0;
    if (candyIds.length > 0) {
      // Update in chunks of 500 to stay safe
      for (let i = 0; i < candyIds.length; i += 500) {
        const chunk = candyIds.slice(i, i + 500);
        const { error } = await supabase
          .from("products")
          .update({ category: "Candy" })
          .in("id", chunk);
        if (error) throw error;
        candyMoved += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      healthToSnacks: healthMoved,
      snacksToCandy: candyMoved,
      candySamples,
      message: `Moved ${healthMoved} Health → Snacks, ${candyMoved} Snacks → Candy.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) { return POST(req); }
