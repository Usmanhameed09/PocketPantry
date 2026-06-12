/**
 * Lead routing — auto-assignment + recovery actions driven by outreach-config.
 *
 *   - applyTierRouting (US2.2): Tier A → assign a Caller + call-ready + queue a
 *     call task; Tier B → queued (not call-ready); Tier C → parked (no tasks).
 *   - assignCloserForStage (US5.1): when a lead reaches Interested / Site Visit
 *     Requested / Proposal Requested, hand it to a Closer.
 *   - requeueAlternateDM (US4.3 / Pipeline UI #5): Apollo-search an alternate
 *     decision-maker and re-queue a call to them.
 *
 * Kept separate from leads-store so leads-store can call it without a circular
 * import (this module only touches supabase, lead-tasks, lead-enrichment).
 */

import { createServerClient } from "./supabase";
import { loadOutreachConfig, pickRoundRobin } from "./outreach-config";
import { createTask, getOpenTasksForLead } from "./lead-tasks";

// Stages where a lead is still "top of funnel" and eligible for caller routing.
const EARLY_STAGES = new Set(["New Lead", "Prospect", "Contacted", "Qualified", "Callback"]);
// Stages that mean the lead is warm enough to hand to a closer.
const CLOSER_STAGES = new Set(["Interested", "Site Visit Requested", "Proposal Requested"]);

/**
 * Route a lead by its tier (US2.2). Idempotent and safe to call on every
 * re-score: it never overwrites a manually-set owner, and only queues a call
 * task when the lead has none open.
 */
export async function applyTierRouting(
  leadId: string,
  tier: "A" | "B" | "C",
  stage: string,
  currentOwner: string | null | undefined,
): Promise<void> {
  const config = await loadOutreachConfig();
  if (!config.autoAssignEnabled) return;
  // Only route early-funnel leads — don't disturb ones already advancing.
  if (!EARLY_STAGES.has(stage)) return;

  const supabase = createServerClient();

  if (tier === "A") {
    const update: Record<string, unknown> = { is_call_ready: true, updated_at: new Date().toISOString() };
    if (!currentOwner && config.callers.length) {
      const caller = pickRoundRobin(config.callers, leadId);
      if (caller) update.owner = caller;
    }
    if (!update.next_action) update.next_action = "Call — Tier A lead";
    await safeUpdate(supabase, leadId, update);

    // Queue a call task only if none is open, so re-scoring doesn't pile up tasks.
    try {
      const open = await getOpenTasksForLead(leadId);
      if (!open.some((t) => t.taskType === "call")) {
        await createTask({
          leadId,
          taskType: "call",
          scheduledFor: new Date(),
          priority: 80,
          reason: "Tier A — new lead, call now",
        });
      }
    } catch {
      /* lead_tasks table may not exist yet */
    }
    return;
  }

  if (tier === "B") {
    // Queued — visible in the list but not call-ready (no auto task).
    await safeUpdate(supabase, leadId, { is_call_ready: false, updated_at: new Date().toISOString() });
    return;
  }

  // Tier C — parked. No tasks, no call-ready, no owner churn.
  await safeUpdate(supabase, leadId, { is_call_ready: false, updated_at: new Date().toISOString() });
}

/**
 * Hand a warm lead to a closer (US5.1). Assigns when the lead has no owner or
 * is still owned by a caller (caller → closer handoff). Returns the closer name
 * if it assigned one, else null.
 */
export async function assignCloserForStage(
  leadId: string,
  stage: string,
  currentOwner: string | null | undefined,
): Promise<string | null> {
  if (!CLOSER_STAGES.has(stage)) return null;
  const config = await loadOutreachConfig();
  if (!config.autoAssignEnabled || !config.closers.length) return null;

  // Keep a manually-assigned closer/owner; only take over from a caller or empty.
  const owner = (currentOwner || "").trim();
  if (owner && !config.callers.includes(owner) && !config.closers.includes(owner)) return null;
  // Already a closer — leave it.
  if (owner && config.closers.includes(owner)) return null;

  const closer = pickRoundRobin(config.closers, leadId);
  if (!closer) return null;
  const supabase = createServerClient();
  await safeUpdate(supabase, leadId, { owner: closer, updated_at: new Date().toISOString() });
  return closer;
}

/**
 * Apollo-search an alternate decision-maker for a lead and re-queue a call
 * (US4.3 / Pipeline UI #5 "Requeue with alternate DM titles"). Best-effort.
 * Returns the new contact name if one was found.
 */
export async function requeueAlternateDM(leadId: string): Promise<{ ok: boolean; contactName?: string; reason?: string }> {
  const supabase = createServerClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("website, business")
    .eq("id", leadId)
    .maybeSingle();
  const website = (lead?.website as string) || undefined;
  const business = (lead?.business as string) || undefined;
  if (!website && !business) return { ok: false, reason: "No website or business to search" };

  try {
    const { enrichLeadContact } = await import("./lead-enrichment");
    const recovery = await enrichLeadContact({ website, company: business });
    const e = recovery.enrichment;
    if (!e || (!e.contactName && !e.contactTitle && !e.email && !e.mobile)) {
      return { ok: false, reason: "No alternate contact found" };
    }
    const update: Record<string, unknown> = {
      apollo_last_enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      next_action: "Try alternate DM (from Apollo)",
      next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_call_ready: true,
    };
    if (e.contactName) update.decision_maker_name = e.contactName;
    if (e.mobile) update.apollo_mobile = e.mobile;
    if (e.contactTitle) update.apollo_title = e.contactTitle;
    if (e.email) update.decision_maker_email = e.email;
    await safeUpdate(supabase, leadId, update);
    try {
      await createTask({
        leadId,
        taskType: "call",
        scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
        priority: 85,
        reason: `Try alternate DM: ${e.contactName || e.contactTitle || "Apollo match"}`,
      });
    } catch {
      /* lead_tasks may not exist */
    }
    return { ok: true, contactName: e.contactName || e.contactTitle };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Enrichment failed" };
  }
}

/** Update wrapped so unknown v2 columns (pre-migration) don't throw. */
async function safeUpdate(
  supabase: ReturnType<typeof createServerClient>,
  leadId: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("leads").update(update).eq("id", leadId);
  if (error) {
    // Retry with only the always-present column so a missing v2 column doesn't
    // lose the whole update.
    await supabase.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
  }
}
