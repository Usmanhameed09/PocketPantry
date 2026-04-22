import { NextResponse } from "next/server";
import { testConnection } from "@/lib/email-agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await testConnection();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
