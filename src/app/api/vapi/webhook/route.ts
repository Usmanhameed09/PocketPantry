import { NextRequest, NextResponse } from "next/server";
import { updateLeadFromCallOutcome, getLead, updateLead } from "@/lib/leads-store";

/**
 * VAPI Webhook Handler
 *
 * VAPI sends events here during and after calls:
 * - "function-call" → AI wants to execute a tool (collect_lead_info, schedule_site_visit, log_call_outcome)
 * - "end-of-call-report" → Call has ended, contains transcript and summary
 * - "status-update" → Call status changes (ringing, in-progress, ended)
 *
 * Setup: Set this URL as the serverUrl in your VAPI assistant config.
 * For local dev, use ngrok: ngrok http 3000 → https://xxx.ngrok.io/api/vapi/webhook
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: "No message in webhook payload" }, { status: 400 });
    }

    const messageType = message.type;
    console.log(`[VAPI Webhook] Received: ${messageType}`);

    switch (messageType) {
      case "function-call":
        return handleFunctionCall(message, body);

      case "end-of-call-report":
        return handleEndOfCallReport(message, body);

      case "status-update":
        return handleStatusUpdate(message, body);

      case "hang":
        console.log("[VAPI Webhook] Call hang event");
        return NextResponse.json({ ok: true });

      default:
        console.log(`[VAPI Webhook] Unhandled message type: ${messageType}`);
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

/**
 * Handle tool/function calls from the AI during a call
 */
function handleFunctionCall(
  message: { functionCall: { name: string; parameters: Record<string, unknown> } },
  body: { call?: { metadata?: { leadId?: string } } }
) {
  const { name, parameters } = message.functionCall;
  const leadId = body.call?.metadata?.leadId;

  console.log(`[VAPI Webhook] Function call: ${name}`, parameters);

  switch (name) {
    case "collect_lead_info": {
      // Update lead with collected info
      if (leadId) {
        const updates: Record<string, unknown> = {};
        if (parameters.business_name) updates.business = parameters.business_name as string;
        if (parameters.contact_name) updates.contact = parameters.contact_name as string;
        if (parameters.phone) updates.phone = parameters.phone as string;
        if (parameters.email) updates.email = parameters.email as string;
        if (parameters.address) updates.address = parameters.address as string;
        updateLead(leadId, updates as Partial<typeof updates & { business: string; contact: string; phone: string; email: string; address: string }>);
      }

      return NextResponse.json({
        result: "Lead information collected and saved successfully. Continue with the conversation.",
      });
    }

    case "schedule_site_visit": {
      const visitDate = parameters.preferred_date as string;
      const visitTime = parameters.preferred_time as string || "TBD";

      if (leadId) {
        updateLead(leadId, {
          stage: "Site Visit Requested",
          lastActivity: `Site visit scheduled: ${visitDate} at ${visitTime}`,
        });
      }

      console.log(`[VAPI Webhook] Site visit scheduled: ${parameters.business_name} on ${visitDate} at ${visitTime}`);

      return NextResponse.json({
        result: `Site visit scheduled for ${visitDate} at ${visitTime}. Arthur will be notified. Confirm the details with the prospect.`,
      });
    }

    case "log_call_outcome": {
      const outcome = parameters.outcome as string;
      const summary = parameters.summary as string;

      if (leadId) {
        const lead = getLead(leadId);
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

        updateLeadFromCallOutcome(leadId, outcome, {
          attempt: (lead?.callAttempts || 0) + 1,
          date: dateStr,
          duration: "—",  // Will be updated from end-of-call-report
          outcome: outcome,
          summary: summary,
        });

        // Store callback info if applicable
        if (outcome === "callback" && (parameters.callback_date || parameters.callback_time)) {
          updateLead(leadId, {
            callbackDate: parameters.callback_date as string,
            callbackTime: parameters.callback_time as string,
          });
        }
      }

      console.log(`[VAPI Webhook] Call outcome: ${outcome} — ${summary}`);

      return NextResponse.json({
        result: "Call outcome logged successfully.",
      });
    }

    default:
      console.log(`[VAPI Webhook] Unknown function: ${name}`);
      return NextResponse.json({ result: "Function not recognized." });
  }
}

/**
 * Handle end-of-call report — contains full transcript and call metadata
 */
function handleEndOfCallReport(
  message: {
    endedReason?: string;
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    durationSeconds?: number;
    cost?: number;
  },
  body: { call?: { metadata?: { leadId?: string } } }
) {
  const leadId = body.call?.metadata?.leadId;

  console.log("[VAPI Webhook] End of call report:", {
    leadId,
    endedReason: message.endedReason,
    duration: message.durationSeconds,
    summary: message.summary,
  });

  // Update the lead's last call log with duration
  if (leadId && message.durationSeconds) {
    const lead = getLead(leadId);
    if (lead && lead.callLogs.length > 0) {
      const lastLog = lead.callLogs[lead.callLogs.length - 1];
      const mins = Math.floor(message.durationSeconds / 60);
      const secs = message.durationSeconds % 60;
      lastLog.duration = `${mins}m ${secs}s`;

      if (message.summary && !lastLog.summary) {
        lastLog.summary = message.summary;
      }

      updateLead(leadId, { callLogs: lead.callLogs });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Handle call status updates (ringing, in-progress, ended)
 */
function handleStatusUpdate(
  message: { status?: string },
  body: { call?: { metadata?: { leadId?: string }; id?: string } }
) {
  const leadId = body.call?.metadata?.leadId;
  const callId = body.call?.id;

  console.log(`[VAPI Webhook] Status update: ${message.status} (lead: ${leadId}, call: ${callId})`);

  if (leadId && message.status === "in-progress") {
    updateLead(leadId, {
      stage: "Contacted",
      vapiCallId: callId,
    });
  }

  return NextResponse.json({ ok: true });
}
