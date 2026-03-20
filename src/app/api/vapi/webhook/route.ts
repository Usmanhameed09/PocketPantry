import { NextRequest, NextResponse } from "next/server";
import {
  getLead,
  updateLead,
  addCallLogAndUpdateStage,
  updateLastCallDuration,
  logOutreachAction,
  addEmailLog,
} from "@/lib/leads-store";
import { getPrimaryEmail } from "@/lib/email-templates";
import { createServerClient } from "@/lib/supabase";

/**
 * VAPI Webhook Handler — Full Outreach Workflow
 *
 * Per Doc 3 (AI Agent Outreach Workflow):
 * - Handles all VAPI events during/after calls
 * - Auto-sends primary email after voicemail or no-answer
 * - Saves ALL lead data collected during call (Doc 1 lead form)
 * - Saves gatekeeper referral info (Doc 2)
 * - Updates lead stage based on call outcome
 * - Logs everything to outreach_log for audit trail
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
        return NextResponse.json({ ok: true });
      default:
        console.log(`[VAPI Webhook] Unhandled: ${messageType}`);
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// Function Call Handler
// ----------------------------------------------------------------

async function handleFunctionCall(
  message: { functionCall: { name: string; parameters: Record<string, unknown> } },
  body: { call?: { metadata?: { leadId?: string }; id?: string } }
) {
  const { name, parameters } = message.functionCall;
  const leadId = body.call?.metadata?.leadId;
  const vapiCallId = body.call?.id;

  console.log(`[VAPI Webhook] Function: ${name}`, JSON.stringify(parameters).substring(0, 200));

  switch (name) {
    case "collect_lead_info": {
      if (leadId) {
        // Save ALL lead form fields (Doc 1: 9 fields + Doc 2: gatekeeper info)
        const updates: Record<string, unknown> = {};

        if (parameters.business_name) updates.business = parameters.business_name;
        if (parameters.contact_name) updates.contact = parameters.contact_name;
        if (parameters.contact_title) updates.contactTitle = parameters.contact_title;
        if (parameters.phone) updates.phone = parameters.phone;
        if (parameters.email) updates.email = parameters.email;
        if (parameters.address) updates.address = parameters.address;
        if (parameters.employee_count) updates.employeeCount = parameters.employee_count;
        if (parameters.current_vending_status) updates.currentVendingStatus = parameters.current_vending_status;
        if (parameters.current_vendor_name) updates.currentVendorName = parameters.current_vendor_name;
        if (parameters.product_preferences) updates.productPreferences = parameters.product_preferences;
        if (parameters.pain_points) updates.painPoints = parameters.pain_points;

        // Gatekeeper referral data (Doc 2: Who's the person in charge? Phone? Email?)
        if (parameters.decision_maker_name) updates.decisionMakerName = parameters.decision_maker_name;
        if (parameters.decision_maker_phone) updates.decisionMakerPhone = parameters.decision_maker_phone;
        if (parameters.decision_maker_email) updates.decisionMakerEmail = parameters.decision_maker_email;

        await updateLead(leadId, updates as Parameters<typeof updateLead>[1]);
        console.log(`[VAPI Webhook] Lead ${leadId} updated with ${Object.keys(updates).length} fields`);
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
          visitDate,
          visitTime,
          lastActivity: `Site visit: ${visitDate} at ${visitTime} — ${dateStr}`,
        });

        await logOutreachAction(leadId, "site_visit_scheduled", {
          date: visitDate, time: visitTime,
          business: parameters.business_name, contact: parameters.contact_name,
          address: parameters.address, notes: parameters.notes,
        });
      }

      return NextResponse.json({
        result: `Site visit scheduled for ${visitDate} at ${visitTime}. Arthur will be notified.`,
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

        // Save call log and update stage
        await addCallLogAndUpdateStage(leadId, {
          attempt: (lead?.callAttempts || 0) + 1,
          date: dateStr,
          duration: "—",
          outcome,
          summary,
          vapiCallId,
        }, outcome);

        // Handle callback scheduling
        if (outcome === "callback") {
          await updateLead(leadId, {
            callbackDate: parameters.callback_date as string,
            callbackTime: parameters.callback_time as string,
          });
          await logOutreachAction(leadId, "callback_scheduled", {
            date: parameters.callback_date, time: parameters.callback_time,
          });
        }

        // Handle voicemail — trigger primary email (Doc 3 workflow)
        if (outcome === "voicemail" || outcome === "no_answer") {
          await logOutreachAction(leadId, "voicemail", { summary });

          // Auto-send primary email if not already sent (Doc 3: after voicemail → send primary email)
          if (lead && lead.email && !lead.emailSent) {
            await sendPrimaryEmail(leadId, lead.contact, lead.business, lead.email);
          }
        }

        // Save pain points if provided
        if (parameters.pain_points) {
          await updateLead(leadId, {
            painPoints: parameters.pain_points as string[],
          });
        }
      }

      console.log(`[VAPI Webhook] Outcome: ${outcome} — ${summary}`);
      return NextResponse.json({ result: "Call outcome logged successfully." });
    }

    default:
      return NextResponse.json({ result: "Function not recognized." });
  }
}

// ----------------------------------------------------------------
// End of Call Report
// ----------------------------------------------------------------

async function handleEndOfCallReport(
  message: {
    endedReason?: string; transcript?: string; summary?: string;
    recordingUrl?: string; durationSeconds?: number; cost?: number;
  },
  body: { call?: { metadata?: { leadId?: string } } }
) {
  const leadId = body.call?.metadata?.leadId;

  console.log("[VAPI Webhook] End of call:", {
    leadId, endedReason: message.endedReason,
    duration: message.durationSeconds, cost: message.cost,
  });

  if (leadId && message.durationSeconds) {
    const mins = Math.floor(message.durationSeconds / 60);
    const secs = message.durationSeconds % 60;
    await updateLastCallDuration(leadId, `${mins}m ${secs}s`, message.summary || undefined);
  }

  return NextResponse.json({ ok: true });
}

// ----------------------------------------------------------------
// Status Update
// ----------------------------------------------------------------

async function handleStatusUpdate(
  message: { status?: string },
  body: { call?: { metadata?: { leadId?: string }; id?: string } }
) {
  const leadId = body.call?.metadata?.leadId;
  const callId = body.call?.id;

  if (leadId && message.status === "in-progress") {
    await updateLead(leadId, { stage: "Contacted", vapiCallId: callId });
  }

  return NextResponse.json({ ok: true });
}

// ----------------------------------------------------------------
// Email Helpers (Doc 3: Auto-send after voicemail/no-answer)
// ----------------------------------------------------------------

async function sendPrimaryEmail(
  leadId: string, contactName: string, businessName: string, email: string
) {
  try {
    const template = getPrimaryEmail({ contactName, businessName });

    // Send via Supabase edge function or direct SMTP
    // For now, log the email and mark as sent — integrate with email provider later
    console.log(`[Email] Sending primary email to ${email} for ${businessName}`);

    // Log the email in the system
    await addEmailLog(leadId, template.subject, "Sent");
    await updateLead(leadId, { emailSent: true });

    // Try to send via Resend if API key is configured
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ryan <ryan@pvpantry.com>",
          to: [email],
          subject: template.subject,
          html: template.html,
        }),
      });

      if (!res.ok) {
        console.error("[Email] Send failed:", await res.text());
      } else {
        console.log(`[Email] Primary email sent to ${email}`);
      }
    } else {
      console.log("[Email] No RESEND_API_KEY — email logged but not sent. Add RESEND_API_KEY to env vars to enable sending.");
    }
  } catch (error) {
    console.error("[Email] Error sending primary email:", error);
  }
}
