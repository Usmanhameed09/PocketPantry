/**
 * POST /api/leads/book-meeting
 *   { leadId, date, time, durationMin?, notes?, attendees? }
 *
 * What it does, in order:
 *   1. Cancels all open tasks for the lead (stop-rule — once booked we stop dialing)
 *   2. Moves the lead to stage "Meeting Booked"
 *   3. Creates a "follow_up" task for 24h after the meeting (no-show recovery)
 *   4. Persists visit_date/visit_time on the lead
 *   5. Logs an outreach entry so it shows in the activity feed
 *
 * Does NOT actually push to a real calendar (Google/Apple) — that's a separate
 * integration. This is the canonical "meeting is on the books" event.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createTask, addBusinessDays } from "@/lib/lead-tasks";
import { invalidateOnLeadWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leadId, date, time, durationMin, notes } = body;
    if (!leadId || !date || !time) {
      return NextResponse.json({ ok: false, error: "leadId, date, time required" }, { status: 400 });
    }

    const meetingAt = new Date(`${date}T${time}:00`);
    if (isNaN(meetingAt.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid date/time" }, { status: 400 });
    }

    const supabase = createServerClient();

    // 1. Cancel open tasks — stop-rule. Once a meeting is booked we shouldn't
    //    keep dialing the lead or sending follow-up emails.
    await supabase.from("lead_tasks").update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      completed_outcome: "meeting_booked",
    }).eq("lead_id", leadId).eq("status", "open");

    // 2. Move stage + set next_action
    const followUpAt = new Date(meetingAt.getTime() + 24 * 60 * 60 * 1000);
    const update: Record<string, unknown> = {
      stage: "Meeting Booked",
      visit_date: date,
      visit_time: time,
      last_activity: `Meeting booked ${date} ${time}`,
      updated_at: new Date().toISOString(),
    };
    const v2Update = {
      ...update,
      next_action: "Post-meeting follow-up",
      next_action_at: followUpAt.toISOString(),
      last_touch_at: new Date().toISOString(),
    };
    let { error } = await supabase.from("leads").update(v2Update).eq("id", leadId);
    if (error) {
      ({ error } = await supabase.from("leads").update(update).eq("id", leadId));
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // 3. Schedule the no-show recovery task
    try {
      await createTask({
        leadId,
        taskType: "follow_up",
        scheduledFor: followUpAt,
        priority: 80,
        reason: notes ? `Post-meeting follow-up: ${notes}`.slice(0, 200) : "Post-meeting follow-up",
      });
    } catch { /* table may not exist yet */ }

    // 4. Outreach log entry
    await supabase.from("outreach_log").insert({
      lead_id: leadId,
      action_type: "site_visit_scheduled",
      action_data: { date, time, durationMin: durationMin ?? 30, notes: notes || null },
    });

    await invalidateOnLeadWrite();
    return NextResponse.json({
      ok: true,
      meetingAt: meetingAt.toISOString(),
      followUpAt: followUpAt.toISOString(),
      stage: "Meeting Booked",
      // Helpful for the UI — let it know we expect the operator to mark won/no-show
      nextWindowDeadline: addBusinessDays(meetingAt, 2).toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
