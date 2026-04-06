import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCalendarCode, resolveGoogleCalendarOrigin } from "@/lib/google-calendar";

const STATE_COOKIE = "google_calendar_oauth_state";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const savedState = request.cookies.get(STATE_COOKIE)?.value;

    if (!code) {
      return NextResponse.json({ error: "Missing Google authorization code." }, { status: 400 });
    }

    if (!state || !savedState || state !== savedState) {
      return NextResponse.json({ error: "Invalid Google OAuth state." }, { status: 400 });
    }

    const origin = resolveGoogleCalendarOrigin(request);

    await exchangeGoogleCalendarCode({
      code,
      origin,
    });

    const pipelineUrl = new URL("/pipeline?googleCalendar=connected", origin).toString();
    const response = new NextResponse(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Calendar Connected</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #f8fafc;
        color: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
      }
      .card {
        max-width: 520px;
        width: 100%;
        background: #ffffff;
        border: 1px solid #dbe4ee;
        border-radius: 18px;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0 0 12px;
        font-size: 15px;
        line-height: 1.6;
        color: #475569;
      }
      a {
        display: inline-block;
        margin-top: 10px;
        padding: 10px 16px;
        border-radius: 10px;
        background: #16a34a;
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
      }
      .hint {
        margin-top: 14px;
        font-size: 13px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Google Calendar connected</h1>
      <p>Your Google account is now connected and ready for meeting booking and invite sending.</p>
      <p>You can head back to Pipeline now and continue working.</p>
      <a href="${pipelineUrl}">Return to Pipeline</a>
      <div class="hint">You can close this page after opening Pipeline.</div>
    </div>
  </body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    console.error("[API /google-calendar/callback GET] Error:", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message || "Failed to finish Google Calendar auth")
          : JSON.stringify(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
