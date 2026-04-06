import { NextResponse } from "next/server";
import { getGoogleCalendarStatus } from "@/lib/google-calendar";
import { clearGoogleCalendarTokenRecord } from "@/lib/google-calendar-store";

export async function GET() {
  try {
    return NextResponse.json(await getGoogleCalendarStatus());
  } catch (error) {
    console.error("[API /google-calendar/status GET] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to get Google Calendar status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearGoogleCalendarTokenRecord();
    return NextResponse.json({
      ok: true,
      disconnected: true,
      message: "Google Calendar account disconnected.",
    });
  } catch (error) {
    console.error("[API /google-calendar/status DELETE] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to disconnect Google Calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
