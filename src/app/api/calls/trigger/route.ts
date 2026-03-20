import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leads-store";
import { triggerOutboundCall, formatPhoneE164 } from "@/lib/vapi";

/**
 * POST /api/calls/trigger — Trigger an outbound VAPI call to a lead
 *
 * Body: { leadId: "L-001" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.callAttempts >= 3) {
      return NextResponse.json(
        { error: "Maximum call attempts (3) reached for this lead" },
        { status: 400 }
      );
    }

    if (!lead.phone) {
      return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
    }

    if (!process.env.VAPI_PHONE_NUMBER_ID) {
      return NextResponse.json(
        { error: "VAPI phone number not configured. Add VAPI_PHONE_NUMBER_ID to env vars." },
        { status: 500 }
      );
    }

    const formattedPhone = formatPhoneE164(lead.phone);

    console.log(`[Calls] Triggering call to ${lead.business} (${formattedPhone}) — Attempt ${lead.callAttempts + 1}`);

    const vapiCall = await triggerOutboundCall({
      phoneNumber: formattedPhone,
      leadId: lead.id,
      assistantOverrides: {
        variableValues: {
          contactName: lead.contact,
          businessName: lead.business,
        },
      },
    });

    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

    await updateLead(leadId, {
      vapiCallId: vapiCall.id,
      stage: lead.stage === "New Lead" ? "Contacted" : lead.stage,
      lastActivity: `Call initiated — ${dateStr}`,
    });

    console.log(`[Calls] VAPI call created: ${vapiCall.id}`);

    return NextResponse.json({
      ok: true,
      callId: vapiCall.id,
      leadId: lead.id,
      status: vapiCall.status,
      message: `Call initiated to ${lead.business} (${formattedPhone})`,
    });
  } catch (error) {
    console.error("[Calls] Error triggering call:", error);
    const message = error instanceof Error ? error.message : "Failed to trigger call";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
