import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildGoogleCalendarAuthUrl, resolveGoogleCalendarOrigin } from "@/lib/google-calendar";

const STATE_COOKIE = "google_calendar_oauth_state";

export async function GET(request: NextRequest) {
  try {
    const state = randomUUID();
    const origin = resolveGoogleCalendarOrigin(request);
    const authUrl = buildGoogleCalendarAuthUrl({ origin, state });
    const response = NextResponse.redirect(authUrl);

    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("[API /google-calendar/connect GET] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to start Google Calendar auth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
