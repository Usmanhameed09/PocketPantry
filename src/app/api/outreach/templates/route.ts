import { NextRequest, NextResponse } from "next/server";
import { getOutreachTemplates, saveOutreachTemplates } from "@/lib/outreach-template-store";

export async function GET() {
  try {
    const templates = await getOutreachTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[API /outreach/templates GET] Error:", error);
    return NextResponse.json({ error: "Failed to load outreach templates." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const templates = await saveOutreachTemplates(body.templates || body);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[API /outreach/templates PUT] Error:", error);
    return NextResponse.json({ error: "Failed to save outreach templates." }, { status: 400 });
  }
}
