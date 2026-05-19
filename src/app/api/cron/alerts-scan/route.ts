import { NextResponse } from "next/server";
import { scanAndPersistAlerts, listAlerts } from "@/lib/alerts-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * cron-job.org should hit this endpoint daily (e.g. 7am ET) with header
 * `Authorization: Bearer <CRON_SECRET>` so unauthenticated callers can't
 * spam the scan.
 */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / unset → allow
  const provided = req.headers.get("authorization") || req.headers.get("x-cron-secret");
  return provided === `Bearer ${secret}` || provided === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await scanAndPersistAlerts();
    // Pull current open alerts for an email digest body
    const open = await listAlerts(false);
    // Email digest is best-effort — uses the existing Resend setup via
    // /api/email-agent if configured; skipped if env keys are missing.
    if (open.length > 0 && process.env.EMAIL_AGENT_DIGEST_TO) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/inventory/alerts/digest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: open }),
      }).catch(() => {});
    }
    return NextResponse.json({ success: true, ...result, openCount: open.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
