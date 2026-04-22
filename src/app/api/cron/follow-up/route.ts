import { NextRequest, NextResponse } from "next/server";
import { getAllLeads } from "@/lib/leads-store";
import { processOutreachFollowUps } from "@/lib/outreach-follow-up";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const leads = await getAllLeads();
    const results = await processOutreachFollowUps(leads);
    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error("[cron/follow-up]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
