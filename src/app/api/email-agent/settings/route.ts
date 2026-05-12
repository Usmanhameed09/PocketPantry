import { NextRequest, NextResponse } from "next/server";
import { getEmailAgentSettings, saveEmailAgentSettings } from "@/lib/email-agent-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getEmailAgentSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saved = await saveEmailAgentSettings({
      dailyCap: body.dailyCap,
      perLeadCap: body.perLeadCap,
      enabled: body.enabled,
    });
    return NextResponse.json({ success: true, settings: saved });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
