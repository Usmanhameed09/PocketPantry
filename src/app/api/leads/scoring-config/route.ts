/**
 * GET  /api/leads/scoring-config — fetch current weights + thresholds
 * POST /api/leads/scoring-config — update weights + thresholds, invalidate cache
 *      { weights: {...}, thresholds: { A, B }, rescoreAll?: boolean }
 *
 * Lets the admin tune scoring without a redeploy. If `rescoreAll` is true,
 * every existing lead is re-scored against the new weights.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { loadScoringConfig, invalidateScoringConfigCache, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from "@/lib/lead-scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const { weights, thresholds } = await loadScoringConfig();
  return NextResponse.json({ ok: true, weights, thresholds, defaults: { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const weights = body.weights || DEFAULT_WEIGHTS;
    const thresholds = body.thresholds || DEFAULT_THRESHOLDS;
    const supabase = createServerClient();

    // Pull existing row (if any) — we update in place to keep history simple
    const { data: existing } = await supabase
      .from("scoring_config").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();

    if (existing?.id) {
      await supabase.from("scoring_config").update({
        weights, thresholds, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("scoring_config").insert({ weights, thresholds });
    }

    invalidateScoringConfigCache();

    let rescored = 0;
    if (body.rescoreAll) {
      // Trigger the existing /api/leads/score endpoint logic by calling its lib directly
      const { getAllLeads } = await import("@/lib/leads-store");
      const { scoreAndPersist } = await import("@/lib/lead-scoring");
      const leads = await getAllLeads();
      for (const lead of leads) {
        await scoreAndPersist(lead.id, lead);
        rescored++;
      }
    }

    return NextResponse.json({ ok: true, rescored });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
