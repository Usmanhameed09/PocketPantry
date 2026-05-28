/**
 * POST /api/leads/score
 *   { id: "L-001" }         → re-score one lead
 *   { all: true }           → re-score every visible lead
 *   { preview: {...lead} }  → return a score WITHOUT persisting (used by the
 *                              create form to show the tier before save)
 *
 * Returns: { ok, results: [{ id, score, tier, reason }], skipped }
 */

import { NextResponse } from "next/server";
import { getAllLeads, getLead } from "@/lib/leads-store";
import { scoreAndPersist, scoreLead, loadScoringConfig } from "@/lib/lead-scoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.preview) {
      const { weights, thresholds } = await loadScoringConfig();
      const result = scoreLead(body.preview, weights, thresholds);
      return NextResponse.json({ ok: true, preview: result });
    }

    if (body.all) {
      const leads = await getAllLeads();
      const results: Array<{ id: string; score: number; tier: string; reason: string }> = [];
      for (const lead of leads) {
        const r = await scoreAndPersist(lead.id, lead);
        results.push({ id: lead.id, score: r.score, tier: r.tier, reason: r.reason });
      }
      return NextResponse.json({ ok: true, results, count: results.length });
    }

    const id = (body.id as string) || "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id or all flag" }, { status: 400 });
    }
    const lead = await getLead(id);
    if (!lead) {
      return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
    }
    const result = await scoreAndPersist(lead.id, lead);
    return NextResponse.json({ ok: true, id: lead.id, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Score failed" },
      { status: 500 }
    );
  }
}
