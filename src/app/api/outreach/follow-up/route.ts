import { NextResponse } from "next/server";
import { getAllLeads } from "@/lib/leads-store";
import { processOutreachFollowUps } from "@/lib/outreach-follow-up";

export async function POST() {
  try {
    const leads = await getAllLeads();
    const results = await processOutreachFollowUps(leads);

    return NextResponse.json({
      ok: true,
      ...results,
      message: `Follow-up workflow complete: ${results.followUp1Sent} first follow-up, ${results.followUp2Sent} second follow-up, ${results.closedAsNotInterested} closed.`,
    });
  } catch (error) {
    console.error("[Follow-up] Error:", error);
    return NextResponse.json({ error: "Follow-up processing failed" }, { status: 500 });
  }
}
