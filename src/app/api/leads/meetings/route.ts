/**
 * GET /api/leads/meetings — returns upcoming meetings + open slots.
 *
 * For the pipeline Calendar block. Pulls every lead at stage "Meeting Booked"
 * with a future visit_date, sorted by date. Open slots = naive business-hour
 * windows over the next 5 business days that aren't already taken.
 *
 * Real Google Calendar integration is out of scope for this endpoint — the
 * /api/leads/book-meeting writes visit_date/visit_time to the lead and this
 * endpoint reads them back. Wiring to Cal.com / Google Calendar can replace
 * this with a thin adapter later.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function addBusinessDays(base: Date, days: number): Date {
  const r = new Date(base); let n = days;
  while (n > 0) { r.setDate(r.getDate() + 1); const d = r.getDay(); if (d !== 0 && d !== 6) n--; }
  return r;
}

export async function GET() {
  try {
    const supabase = createServerClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("leads")
      .select("id, business, contact, stage, owner, tier, visit_date, visit_time")
      .eq("stage", "Meeting Booked")
      .gte("visit_date", today)
      .order("visit_date", { ascending: true })
      .order("visit_time", { ascending: true })
      .limit(20);

    const meetings = (data || []).map((m) => ({
      id: m.id as string,
      business: m.business as string,
      contact: (m.contact as string) || "",
      owner: (m.owner as string) || "",
      tier: (m.tier as string) || "",
      date: m.visit_date as string,
      time: (m.visit_time as string) || "",
    }));

    // Open-slot suggestions: weekdays 10am, 2pm, 4pm over next 5 business days.
    // We exclude any (date, time) pair already taken by a meeting.
    const taken = new Set(meetings.map((m) => `${m.date}T${m.time}`));
    const slots: Array<{ date: string; time: string }> = [];
    const now = new Date();
    for (let i = 1; i <= 7 && slots.length < 8; i++) {
      const d = addBusinessDays(now, i);
      const dateStr = d.toISOString().slice(0, 10);
      for (const time of ["10:00", "14:00", "16:00"]) {
        if (!taken.has(`${dateStr}T${time}`)) slots.push({ date: dateStr, time });
      }
    }

    return NextResponse.json({
      ok: true,
      meetings: meetings.slice(0, 5),
      totalUpcoming: meetings.length,
      openSlots: slots.slice(0, 6),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
