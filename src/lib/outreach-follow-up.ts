import { addEmailLog, logOutreachAction, updateLead, type Lead } from "@/lib/leads-store";
import { sendOutreachEmail } from "@/lib/outreach-email";
import { getFollowUpStages, getOutreachTemplates, type OutreachTemplateStage } from "@/lib/outreach-template-store";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLOSE_AFTER_LAST_FOLLOW_UP_DAYS = 5;
const CLOSE_AFTER_LAST_FOLLOW_UP_MS = CLOSE_AFTER_LAST_FOLLOW_UP_DAYS * ONE_DAY_MS;
const CLOSED_STAGES = new Set<Lead["stage"]>([
  "Interested",
  "Site Visit Requested",
  "Proposal Requested",
  "Not Interested",
]);

function normalizeStage(value: unknown): OutreachTemplateStage | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type LeadTimeline = {
  sentAtByStage: Map<string, number>;
  hasReply?: boolean;
};

async function getLatestEmailTimeline() {
  const { createServerClient } = await import("@/lib/supabase");
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

  if (error) throw error;
  if (emailError) throw emailError;

  const byLead = new Map<string, LeadTimeline>();

  for (const row of data || []) {
    const leadId = row.lead_id as string | undefined;
    if (!leadId) continue;

    const current = byLead.get(leadId) || { sentAtByStage: new Map<string, number>() };
    const actionData = (row.action_data || {}) as { stage?: unknown; subtype?: unknown };
    const performedAt = new Date(String(row.performed_at || "")).getTime();

    if (actionData.subtype === "reply_received") {
      current.hasReply = true;
      byLead.set(leadId, current);
      continue;
    }

    const stage = normalizeStage(actionData.stage);
    if (!stage || !Number.isFinite(performedAt)) continue;

    if (!current.sentAtByStage.has(stage)) {
      current.sentAtByStage.set(stage, performedAt);
    }
    byLead.set(leadId, current);
  }

  const sentRowsByLead = new Map<string, number[]>();
  for (const row of emailRows || []) {
    const leadId = row.lead_id as string | undefined;
    const createdAt = new Date(String(row.created_at || "")).getTime();
    const status = row.status as string | undefined;
    if (!leadId || !Number.isFinite(createdAt)) continue;

    if (status === "Replied") {
      const current = byLead.get(leadId) || { sentAtByStage: new Map<string, number>() };
      current.hasReply = true;
      byLead.set(leadId, current);
      continue;
    }

    if (status !== "Sent") continue;
    if (!sentRowsByLead.has(leadId)) sentRowsByLead.set(leadId, []);
    sentRowsByLead.get(leadId)!.push(createdAt);
  }

  const templates = await getOutreachTemplates();
  const stageOrder = templates.stages.map((stage) => stage.id);

  for (const [leadId, timestamps] of sentRowsByLead.entries()) {
    const current = byLead.get(leadId) || { sentAtByStage: new Map<string, number>() };
    const sorted = [...timestamps].sort((a, b) => a - b);

    for (const [index, timestamp] of sorted.entries()) {
      const stageId = stageOrder[index];
      if (!stageId) break;
      if (!current.sentAtByStage.has(stageId)) {
        current.sentAtByStage.set(stageId, timestamp);
      }
    }

    byLead.set(leadId, current);
  }

  return byLead;
}

async function sendAndLogEmail(lead: Lead, stageId: OutreachTemplateStage, stageLabel: string) {
  const response = await sendOutreachEmail({
    to: lead.email,
    stage: stageId,
    contactName: lead.contact || "there",
    businessName: lead.business,
  });

  await addEmailLog(lead.id, response.subject, "Sent");
  await logOutreachAction(lead.id, "email", {
    stage: stageId,
    subject: response.subject,
    resendId: response.id || null,
  });

  const updates: Parameters<typeof updateLead>[1] = {
    lastActivity: `${stageLabel} sent - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  };
  if (stageId === "follow_up_1") updates.followUp1Sent = true;
  if (stageId === "follow_up_2") updates.followUp2Sent = true;
  await updateLead(lead.id, updates);

  return response.subject;
}

export async function processOutreachFollowUps(leads: Lead[]) {
  const templates = await getOutreachTemplates();
  const followUps = getFollowUpStages(templates);

  const results = {
    followUp1Sent: 0,
    followUp2Sent: 0,
    additionalFollowUpsSent: 0,
    closedAsNotInterested: 0,
    errors: 0,
  };

  if (followUps.length === 0) {
    return results;
  }

  const timeline = await getLatestEmailTimeline();
  const now = Date.now();

  for (const lead of leads) {
    if (CLOSED_STAGES.has(lead.stage) || !lead.email || !lead.emailSent) {
      continue;
    }

    const leadTimeline = timeline.get(lead.id) || { sentAtByStage: new Map<string, number>() };
    if (leadTimeline.hasReply) {
      continue;
    }

    const primaryAt = leadTimeline.sentAtByStage.get("primary");
    if (!primaryAt) {
      continue;
    }

    try {
      let sentNewFollowUp = false;
      let previousSentAt = primaryAt;

      for (const stage of followUps) {
        const currentSentAt = leadTimeline.sentAtByStage.get(stage.id);
        if (currentSentAt) {
          previousSentAt = currentSentAt;
          continue;
        }

        const delayMs = Math.max(1, stage.delayDays || 1) * ONE_DAY_MS;
        if (now - previousSentAt >= delayMs) {
          await sendAndLogEmail(lead, stage.id, stage.label);
          if (stage.id === "follow_up_1") results.followUp1Sent += 1;
          else if (stage.id === "follow_up_2") results.followUp2Sent += 1;
          else results.additionalFollowUpsSent += 1;
        }
        sentNewFollowUp = true;
        break;
      }

      if (sentNewFollowUp) {
        continue;
      }

      const lastFollowUp = followUps[followUps.length - 1];
      const lastFollowUpAt = leadTimeline.sentAtByStage.get(lastFollowUp.id);
      if (lastFollowUpAt && now - lastFollowUpAt >= CLOSE_AFTER_LAST_FOLLOW_UP_MS) {
        await updateLead(lead.id, {
          stage: "Not Interested",
          lastActivity: `Closed after email follow-ups - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        });
        await logOutreachAction(lead.id, "email", {
          stage: "closed_after_follow_ups",
          reason: `No response after primary email and ${followUps.length} follow-up email${followUps.length === 1 ? "" : "s"}.`,
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
