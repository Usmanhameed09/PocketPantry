/**
 * GET  /api/leads/outreach-config — current routing/cadence config
 * POST /api/leads/outreach-config — update it (US6.3)
 *   { autoAssignEnabled, callers, closers, maxCallAttempts, retryCadenceDays, apolloTitles }
 *
 * Lets the admin change who leads route to, the call attempt cap, retry
 * cadence, and the Apollo title list without a code deploy.
 */

import { NextResponse } from "next/server";
import { loadOutreachConfig, saveOutreachConfig, DEFAULT_OUTREACH_CONFIG } from "@/lib/outreach-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await loadOutreachConfig();
  return NextResponse.json({ ok: true, config, defaults: DEFAULT_OUTREACH_CONFIG });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const config = await saveOutreachConfig(body || {});
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
