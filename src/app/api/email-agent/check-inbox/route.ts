import { NextResponse } from "next/server";
import { checkInboxForReplies } from "@/lib/email-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const result = await checkInboxForReplies();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[email-agent/check-inbox]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
