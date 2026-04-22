import { createServerClient } from "@/lib/supabase";
import { addEmailLog, logOutreachAction, updateLead, type Lead } from "@/lib/leads-store";
import { sendOutreachEmail } from "@/lib/outreach-email";

const FOLLOW_UP_1_DELAY_DAYS = 5;
const FOLLOW_UP_2_DELAY_DAYS = 3;
const CLOSE_AFTER_FOLLOW_UP_2_DAYS = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_1_DELAY_MS = FOLLOW_UP_1_DELAY_DAYS * ONE_DAY_MS;
const FOLLOW_UP_2_DELAY_MS = FOLLOW_UP_2_DELAY_DAYS * ONE_DAY_MS;
const CLOSE_AFTER_FOLLOW_UP_2_MS = CLOSE_AFTER_FOLLOW_UP_2_DAYS * ONE_DAY_MS;
const CLOSED_STAGES = new Set<Lead["stage"]>([
  "Interested",
  "Site Visit Requested",
  "Proposal Requested",
  "Not Interested",
]);

type EmailStage = "primary" | "follow_up_1" | "follow_up_2";

function normalizeStage(value: unknown): EmailStage | null {
  if (value === "primary" || value === "follow_up_1" || value === "follow_up_2") {
    return value;
  }
  return null;
}

async function getLatestEmailTimeline() {
  const supabase = createServerClient();
  const [{ data, error }, { data: emailRows, error: emailError }] = await Promise.all([
    supabase
    .from("outreach_log")
    .select("lead_id, performed_at, action_data")
    .eq("action_type", "email")
      .order("performed_at", { ascending: false }),
    supabase
      .from("email_logs")
      .select("lead_id, created_at, status")
      .order("created_at", { ascending: true }),
  ]);

  if (error) {
    throw error;
  }
  if (emailError) {
    throw emailError;
  }

  const byLead = new Map<
    string,
    {
      primaryAt?: number;
      followUp1At?: number;
      followUp2At?: number;
      hasReply?: boolean;
    }
  >();

  for (const row of data || []) {
    const leadId = row.lead_id as string | undefined;
    if (!leadId) continue;

    const actionData = (row.action_data || {}) as { stage?: unknown; subtype?: unknown };
    const performedAt = new Date(String(row.performed_at || "")).getTime();
    const current = byLead.get(leadId) || {};

    // Track inbound replies — any reply means we stop follow-ups for this lead
    if (actionData.subtype === "reply_received") {
      current.hasReply = true;
      byLead.set(leadId, current);
      continue;
    }

    const stage = normalizeStage(actionData.stage);
    if (!stage) continue;
    if (!Number.isFinite(performedAt)) continue;

    if (stage === "primary" && current.primaryAt === undefined) current.primaryAt = performedAt;
    if (stage === "follow_up_1" && current.followUp1At === undefined) current.followUp1At = performedAt;
    if (stage === "follow_up_2" && current.followUp2At === undefined) current.followUp2At = performedAt;
    byLead.set(leadId, current);
  }

  // Fallback: position-based timeline from email_logs.
  // We only count rows with status === "Sent" so a "Replied" row never gets
  // mistaken for an outgoing follow-up. Also flag leads that have any "Replied" row.
  const sentRowsByLead = new Map<string, number[]>();
  for (const row of emailRows || []) {
    const leadId = row.lead_id as string | undefined;
    const createdAt = new Date(String(row.created_at || "")).getTime();
    const status = row.status as string | undefined;
    if (!leadId || !Number.isFinite(createdAt)) continue;

    if (status === "Replied") {
      const current = byLead.get(leadId) || {};
      current.hasReply = true;
      byLead.set(leadId, current);
      continue;
    }

    if (status !== "Sent") continue;
    if (!sentRowsByLead.has(leadId)) sentRowsByLead.set(leadId, []);
    sentRowsByLead.get(leadId)!.push(createdAt);
  }

  for (const [leadId, timestamps] of sentRowsByLead.entries()) {
    const current = byLead.get(leadId) || {};
    const sorted = [...timestamps].sort((a, b) => a - b);

    if (current.primaryAt === undefined && sorted[0] !== undefined) current.primaryAt = sorted[0];
    if (current.followUp1At === undefined && sorted[1] !== undefined) current.followUp1At = sorted[1];
    if (current.followUp2At === undefined && sorted[2] !== undefined) current.followUp2At = sorted[2];

    byLead.set(leadId, current);
  }

  return byLead;
}

async function sendAndLogEmail(lead: Lead, stage: "follow_up_1" | "follow_up_2") {
  const response = await sendOutreachEmail({
    to: lead.email,
    stage,
    contactName: lead.contact || "there",
    businessName: lead.business,
  });

  await addEmailLog(lead.id, response.subject, "Sent");
  await logOutreachAction(lead.id, "email", {
    stage,
    subject: response.subject,
    resendId: response.id || null,
  });

  if (stage === "follow_up_1") {
    await updateLead(lead.id, {
      followUp1Sent: true,
      lastActivity: `Follow-up email #1 sent - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    });
  } else {
    await updateLead(lead.id, {
      followUp2Sent: true,
      lastActivity: `Follow-up email #2 sent - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    });
  }

  return response.subject;
}

export async function processOutreachFollowUps(leads: Lead[]) {
  const results = {
    followUp1Sent: 0,
    followUp2Sent: 0,
    closedAsNotInterested: 0,
    errors: 0,
  };

  const timeline = await getLatestEmailTimeline();
  const now = Date.now();

  for (const lead of leads) {
    if (CLOSED_STAGES.has(lead.stage) || !lead.email || !lead.emailSent) {
      continue;
    }

    const leadTimeline = timeline.get(lead.id) || {};
    const primaryAt = leadTimeline.primaryAt;
    const followUp1At = leadTimeline.followUp1At;
    const followUp2At = leadTimeline.followUp2At;

    // Hard guard: if the lead has ever replied (per outreach_log or email_logs),
    // never send another follow-up — even if the stage hasn't been updated yet.
    if (leadTimeline.hasReply) {
      continue;
    }

    try {
      if (!lead.followUp1Sent) {
        if (primaryAt && now - primaryAt >= FOLLOW_UP_1_DELAY_MS) {
          await sendAndLogEmail(lead, "follow_up_1");
          results.followUp1Sent += 1;
        }
        continue;
      }

      if (!lead.followUp2Sent) {
        if (followUp1At && now - followUp1At >= FOLLOW_UP_2_DELAY_MS) {
          await sendAndLogEmail(lead, "follow_up_2");
          results.followUp2Sent += 1;
        }
        continue;
      }

      if (followUp2At && now - followUp2At >= CLOSE_AFTER_FOLLOW_UP_2_MS) {
        await updateLead(lead.id, {
          stage: "Not Interested",
          lastActivity: `Closed after email follow-ups - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        });
        await logOutreachAction(lead.id, "email", {
          stage: "closed_after_follow_ups",
          reason: "No response after primary email and two follow-up emails.",
        });
        results.closedAsNotInterested += 1;
      }
    } catch (error) {
      console.error(`[Follow-up] Failed for ${lead.id}:`, error);
      results.errors += 1;
    }
  }

  return results;
}
