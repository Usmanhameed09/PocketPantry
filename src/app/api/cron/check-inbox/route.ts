import { NextRequest, NextResponse } from "next/server";
import { checkInboxForReplies } from "@/lib/email-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkInboxForReplies();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron/check-inbox]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
