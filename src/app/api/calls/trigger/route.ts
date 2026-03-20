import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leads-store";
import { triggerOutboundCall, formatPhoneE164 } from "@/lib/vapi";

/**
 * POST /api/calls/trigger — Trigger an outbound VAPI call to a lead
 *
 * Body: { leadId: "L-001" }
 *
 * This will:
 * 1. Look up the lead
 * 2. Check call attempt limits (max 3)
 * 3. Trigger the VAPI outbound call
 * 4. Update the lead with the call ID
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // Get the lead
    const lead = getLead(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Check call attempt limit
    if (lead.callAttempts >= 3) {
      return NextResponse.json(
        { error: "Maximum call attempts (3) reached for this lead" },
        { status: 400 }
      );
    }

    // Check if phone number is available
    if (!lead.phone) {
      return NextResponse.json(
        { error: "Lead has no phone number" },
        { status: 400 }
      );
    }

    // Check VAPI phone number is configured
    if (!process.env.VAPI_PHONE_NUMBER_ID) {
      return NextResponse.json(
        { error: "VAPI phone number not configured. Add VAPI_PHONE_NUMBER_ID to .env.local" },
        { status: 500 }
      );
    }

    // Format phone number
    const formattedPhone = formatPhoneE164(lead.phone);

    console.log(`[Calls] Triggering call to ${lead.business} (${formattedPhone}) — Attempt ${lead.callAttempts + 1}`);

    // Trigger the VAPI call
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

    // Update the lead
    updateLead(leadId, {
      vapiCallId: vapiCall.id,
      stage: lead.stage === "New Lead" ? "Contacted" : lead.stage,
      lastActivity: `Call initiated — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
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
