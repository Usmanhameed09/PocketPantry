import { NextRequest, NextResponse } from "next/server";
import { bookLeadInCalendly } from "@/lib/calendly-booking";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, startTime } = body as { leadId?: string; startTime?: string };

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    return NextResponse.json(await bookLeadInCalendly({ leadId, startTime }));
  } catch (error) {
    console.error("[API /calendly/book POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to book Google Calendar meeting";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
