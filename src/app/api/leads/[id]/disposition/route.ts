/**
 * POST /api/leads/[id]/disposition
 *
 * Manual call disposition for the human-caller workflow (Aurther's brief).
 * Body: { outcome: string, summary?: string, duration?: string, attempt?: number }
 *
 * Calls addCallLogAndUpdateStage which:
 *   1. Inserts a call_logs row
 *   2. Updates the lead's stage based on the outcome
 *   3. Stamps last_touch_at + next_action + next_action_at
 *   4. Generates the next lead_tasks row per cadence rules
 *   5. Logs an outreach_log entry
 *   6. Triggers wrong-contact Apollo re-search on wrong_number outcomes
 *
 * Returns: { ok, leadId, outcome }
 */

import { NextResponse } from "next/server";
import { addCallLogAndUpdateStage, getLead } from "@/lib/leads-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Missing leadId" }, { status: 400 });
    }

    const body = await req.json();
    const outcome = String(body.outcome || "").trim();
    if (!outcome) {
      return NextResponse.json({ ok: false, error: "outcome required" }, { status: 400 });
    }

    // Need the current attempt count to figure out which attempt this is.
    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
    }
    const attempt = Number(body.attempt) || (lead.callAttempts || 0) + 1;

    const ok = await addCallLogAndUpdateStage(
      leadId,
      {
        attempt,
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        duration: String(body.duration || "0:00"),
        outcome,
        summary: String(body.summary || ""),
      },
      outcome,
    );

    if (!ok) {
      return NextResponse.json({ ok: false, error: "Disposition save failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, leadId, outcome, attempt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
