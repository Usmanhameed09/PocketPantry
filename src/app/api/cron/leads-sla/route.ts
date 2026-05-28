/**
 * Cron: leads-sla — runs daily at 8am ET, flags leads that have stalled.
 *
 * SLA rules (will surface on the pipeline UI as red dots / "Overdue" chips):
 *   - prospect/contacted with no touch in 3 days → flag "Stale prospect"
 *   - interested/qualified with no touch in 24h → flag "Hot lead going cold"
 *   - meeting_booked with meeting >48h in past + no won/no-show set → flag "Meeting needs disposition"
 *   - tier A with no next_action_at scheduled → flag "Top-tier untouched"
 *
 * Output: writes ops_tasks rows so the alerts panel picks them up, AND sets
 * is_call_ready=true on top-tier stale leads so they jump to the top of the queue.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: leads } = await supabase
      .from("leads")
      .select("id, business, stage, tier, last_touch_at, next_action_at, visit_date, visit_time, added_date")
      .range(0, 9999);

    const flags: Array<{ leadId: string; reason: string; severity: string }> = [];
    const callReadyIds: string[] = [];

    for (const lead of leads || []) {
      const stage = (lead.stage as string) || "";
      const tier = (lead.tier as string) || "C";
      const lastTouch = (lead.last_touch_at as string) || (lead.added_date as string) || null;
      const lastTouchTs = lastTouch ? new Date(lastTouch).getTime() : 0;
      const ageDays = lastTouchTs ? (Date.now() - lastTouchTs) / (24 * 60 * 60 * 1000) : 999;

      if ((stage === "New Lead" || stage === "Prospect" || stage === "Contacted") && ageDays >= 3) {
        flags.push({ leadId: lead.id as string, reason: `${lead.business}: stale ${Math.floor(ageDays)}d in ${stage}`, severity: "medium" });
        if (tier === "A") callReadyIds.push(lead.id as string);
      }
      if ((stage === "Interested" || stage === "Qualified") && ageDays >= 1) {
        flags.push({ leadId: lead.id as string, reason: `${lead.business}: hot lead going cold (${Math.floor(ageDays)}d)`, severity: "high" });
        callReadyIds.push(lead.id as string);
      }
      if (stage === "Meeting Booked" && lead.visit_date) {
        const meeting = new Date(`${lead.visit_date}T${(lead.visit_time as string) || "09:00"}:00`);
        if (Date.now() - meeting.getTime() > 48 * 60 * 60 * 1000) {
          flags.push({ leadId: lead.id as string, reason: `${lead.business}: meeting was ${lead.visit_date}, no disposition`, severity: "high" });
        }
      }
      if (tier === "A" && !lead.next_action_at) {
        flags.push({ leadId: lead.id as string, reason: `${lead.business}: Tier A with no next action scheduled`, severity: "medium" });
        callReadyIds.push(lead.id as string);
      }
    }

    // Best-effort: bump is_call_ready on top-tier stale leads
    if (callReadyIds.length) {
      try {
        await supabase.from("leads").update({ is_call_ready: true })
          .in("id", Array.from(new Set(callReadyIds)));
      } catch { /* column may not exist yet */ }
    }

    // Persist flags as ops_tasks for the Today panel
    if (flags.length) {
      const rows = flags.slice(0, 50).map((f) => ({
        company_id: null,
        task_type: "pipeline_sla",
        priority: f.severity,
        title: f.reason,
        description: null,
        related_entity_type: "lead",
        related_entity_id: f.leadId,
        status: "open",
      }));
      await supabase.from("ops_tasks").insert(rows);
    }

    return NextResponse.json({
      ok: true,
      flagged: flags.length,
      callReadyBumped: callReadyIds.length,
      sample: flags.slice(0, 5),
      runAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// POST so Vercel cron can hit either verb (some configurations require POST)
export const POST = GET;
