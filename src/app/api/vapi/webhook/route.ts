import { NextRequest, NextResponse } from "next/server";
import {
  getLead,
  updateLead,
  addCallLogAndUpdateStage,
  updateLastCallDuration,
  logOutreachAction,
} from "@/lib/leads-store";

/**
 * VAPI Webhook Handler
 *
 * Receives events from VAPI during and after calls:
 * - "function-call" → AI executes a tool (collect_lead_info, schedule_site_visit, log_call_outcome)
 * - "end-of-call-report" → Call ended, contains transcript & summary
 * - "status-update" → Call status changes (ringing, in-progress, ended)
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
async function handleFunctionCall(
  message: { functionCall: { name: string; parameters: Record<string, unknown> } },
  body: { call?: { metadata?: { leadId?: string }; id?: string } }
) {
  const { name, parameters } = message.functionCall;
  const leadId = body.call?.metadata?.leadId;
  const vapiCallId = body.call?.id;

  console.log(`[VAPI Webhook] Function call: ${name}`, parameters);

  switch (name) {
    case "collect_lead_info": {
      if (leadId) {
        const updates: Record<string, string> = {};
        if (parameters.business_name) updates.business = parameters.business_name as string;
        if (parameters.contact_name) updates.contact = parameters.contact_name as string;
        if (parameters.phone) updates.phone = parameters.phone as string;
        if (parameters.email) updates.email = parameters.email as string;
        if (parameters.address) updates.address = parameters.address as string;

        await updateLead(leadId, updates);
        console.log(`[VAPI Webhook] Lead ${leadId} info updated`);
      }

      return NextResponse.json({
        result: "Lead information collected and saved successfully. Continue with the conversation.",
      });
    }

    case "schedule_site_visit": {
      const visitDate = parameters.preferred_date as string;
      const visitTime = (parameters.preferred_time as string) || "TBD";
      const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (leadId) {
        await updateLead(leadId, {
          stage: "Site Visit Requested",
          lastActivity: `Site visit scheduled: ${visitDate} at ${visitTime} — ${dateStr}`,
        });

        await logOutreachAction(leadId, "site_visit_scheduled", {
          date: visitDate,
          time: visitTime,
          business: parameters.business_name,
          contact: parameters.contact_name,
          address: parameters.address,
          notes: parameters.notes,
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
        const lead = await getLead(leadId);
        const dateStr = new Date().toLocaleDateString("en-US", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });

        await addCallLogAndUpdateStage(leadId, {
          attempt: (lead?.callAttempts || 0) + 1,
          date: dateStr,
          duration: "—",  // Updated later from end-of-call-report
          outcome: outcome,
          summary: summary,
          vapiCallId: vapiCallId,
        }, outcome);

        // Store callback info
        if (outcome === "callback") {
          await updateLead(leadId, {
            callbackDate: parameters.callback_date as string,
            callbackTime: parameters.callback_time as string,
          });

          await logOutreachAction(leadId, "callback_scheduled", {
            date: parameters.callback_date,
            time: parameters.callback_time,
          });
        }

        // Log voicemail
        if (outcome === "voicemail") {
          await logOutreachAction(leadId, "voicemail", { summary });
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
 * Handle end-of-call report — full transcript and call metadata
 */
async function handleEndOfCallReport(
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
    summary: message.summary?.substring(0, 100),
  });

  if (leadId && message.durationSeconds) {
    const mins = Math.floor(message.durationSeconds / 60);
    const secs = message.durationSeconds % 60;
    const durationStr = `${mins}m ${secs}s`;

    await updateLastCallDuration(leadId, durationStr, message.summary || undefined);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Handle call status updates (ringing, in-progress, ended)
 */
async function handleStatusUpdate(
  message: { status?: string },
  body: { call?: { metadata?: { leadId?: string }; id?: string } }
) {
  const leadId = body.call?.metadata?.leadId;
  const callId = body.call?.id;

  console.log(`[VAPI Webhook] Status update: ${message.status} (lead: ${leadId}, call: ${callId})`);

  if (leadId && message.status === "in-progress") {
    await updateLead(leadId, {
      stage: "Contacted",
      vapiCallId: callId,
    });
  }

  return NextResponse.json({ ok: true });
}
