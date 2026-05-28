/**
 * Leads Store — backed by Supabase PostgreSQL
 * Full outreach workflow support per all 3 docs.
 */

import { createServerClient } from "./supabase";
import { isSystemLeadId } from "./system-records";
import { createTask, nextTaskForOutcome } from "./lead-tasks";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export type LeadStage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Not Interested"
  | "Site Visit Requested"
  | "Proposal Requested"
  | "Meeting Booked"
  | "Won"
  | "Installed"
  | "Callback";

export type LeadTier = "A" | "B" | "C";

export interface Lead {
  id: string;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  businessType: string;
  source: "Manual" | "Excel Import" | "Google Maps";
  stage: LeadStage;
  contactMethod: "Call" | "Email" | "Call + Email";
  callLogs: CallLog[];
  emailLogs: EmailLog[];
  addedDate: string;
  lastActivity: string;
  callAttempts: number;
  vapiCallId?: string;
  callbackDate?: string;
  callbackTime?: string;
  contactTitle?: string;
  employeeCount?: string;
  currentVendingStatus?: string;
  currentVendorName?: string;
  productPreferences?: string;
  painPoints?: string[];
  decisionMakerName?: string;
  decisionMakerPhone?: string;
  decisionMakerEmail?: string;
  visitDate?: string;
  visitTime?: string;
  emailSent?: boolean;
  followUp1Sent?: boolean;
  followUp2Sent?: boolean;
  // ─── Pipeline v2 fields ────────────────────────────────────────
  tier?: LeadTier;
  tierReason?: string;
  tierScore?: number;
  owner?: string;
  vertical?: string;
  employeeCountNumeric?: number;
  footTrafficScore?: number;
  website?: string;
  apolloMobile?: string;
  apolloTitle?: string;
  apolloLastEnrichedAt?: string;
  maxCallAttempts?: number;
  nextAction?: string;
  nextActionAt?: string;
  notInterestedReason?: string;
  isCallReady?: boolean;
  lastTouchAt?: string;
}

export interface CallLog {
  attempt: number;
  date: string;
  duration: string;
  outcome: string;
  summary: string;
  vapiCallId?: string;
}

export interface EmailLog {
  date: string;
  status: "Sent" | "Opened" | "Replied" | "Bounced";
  subject: string;
}

function stageForOutcome(outcome: string): Lead["stage"] {
  switch (outcome) {
    case "interested": return "Interested";
    case "not_interested": return "Not Interested";
    case "callback": return "Callback";
    case "site_visit": return "Site Visit Requested";
    case "proposal": return "Proposal Requested";
    case "voicemail":
    case "gatekeeper":
    case "no_answer":
      return "Contacted";
    case "wrong_number":
      return "Not Interested";
    default:
      return "Contacted";
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function dbToLead(row: Record<string, unknown>, callLogs: CallLog[], emailLogs: EmailLog[]): Lead {
  return {
    id: row.id as string,
    business: row.business as string,
    contact: row.contact as string,
    phone: row.phone as string,
    email: (row.email as string) || "",
    address: (row.address as string) || "",
    distance: (row.distance as string) || "—",
    businessType: (row.business_type as string) || "",
    source: row.source as Lead["source"],
    stage: row.stage as Lead["stage"],
    contactMethod: (row.contact_method as Lead["contactMethod"]) || "Call",
    callLogs,
    emailLogs,
    addedDate: row.added_date as string,
    lastActivity: row.last_activity as string,
    callAttempts: (row.call_attempts as number) || 0,
    vapiCallId: row.vapi_call_id as string | undefined,
    callbackDate: row.callback_date as string | undefined,
    callbackTime: row.callback_time as string | undefined,
    contactTitle: (row.contact_title as string) || undefined,
    employeeCount: (row.employee_count as string) || undefined,
    currentVendingStatus: (row.current_vending_status as string) || undefined,
    currentVendorName: (row.current_vendor_name as string) || undefined,
    productPreferences: (row.product_preferences as string) || undefined,
    painPoints: (row.pain_points as string[]) || [],
    decisionMakerName: (row.decision_maker_name as string) || undefined,
    decisionMakerPhone: (row.decision_maker_phone as string) || undefined,
    decisionMakerEmail: (row.decision_maker_email as string) || undefined,
    visitDate: (row.visit_date as string) || undefined,
    visitTime: (row.visit_time as string) || undefined,
    emailSent: (row.email_sent as boolean) || false,
    followUp1Sent: (row.follow_up_1_sent as boolean) || false,
    followUp2Sent: (row.follow_up_2_sent as boolean) || false,
    tier: (row.tier as LeadTier) || undefined,
    tierReason: (row.tier_reason as string) || undefined,
    tierScore: (row.tier_score as number) ?? undefined,
    owner: (row.owner as string) || undefined,
    vertical: (row.vertical as string) || undefined,
    employeeCountNumeric: (row.employee_count as number) ?? undefined,
    footTrafficScore: (row.foot_traffic_score as number) ?? undefined,
    website: (row.website as string) || undefined,
    apolloMobile: (row.apollo_mobile as string) || undefined,
    apolloTitle: (row.apollo_title as string) || undefined,
    apolloLastEnrichedAt: (row.apollo_last_enriched_at as string) || undefined,
    maxCallAttempts: (row.max_call_attempts as number) ?? undefined,
    nextAction: (row.next_action as string) || undefined,
    nextActionAt: (row.next_action_at as string) || undefined,
    notInterestedReason: (row.not_interested_reason as string) || undefined,
    isCallReady: (row.is_call_ready as boolean) || false,
    lastTouchAt: (row.last_touch_at as string) || undefined,
  };
}

function dbToCallLog(row: Record<string, unknown>): CallLog {
  return {
    attempt: row.attempt as number,
    date: row.call_date as string,
    duration: (row.duration as string) || "—",
    outcome: row.outcome as string,
    summary: (row.summary as string) || "",
    vapiCallId: row.vapi_call_id as string | undefined,
  };
}

function dbToEmailLog(row: Record<string, unknown>): EmailLog {
  return {
    date: row.email_date as string,
    status: row.status as EmailLog["status"],
    subject: row.subject as string,
  };
}

async function generateLeadId(): Promise<string> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .like("id", "L-%");

  if (error) {
    throw error;
  }

  const nextNumber =
    (data || []).reduce((max, row) => {
      const id = row.id as string | undefined;
      const match = id?.match(/^L-(\d+)$/i);
      const value = match ? Number(match[1]) : 0;
      return Math.max(max, Number.isFinite(value) ? value : 0);
    }, 0) + 1;
  return `L-${String(nextNumber).padStart(3, "0")}`;
}

function buildLeadInsertPayload(
  id: string,
  data: {
    business: string;
    contact: string;
    phone: string;
    email?: string;
    address?: string;
    distance?: string;
    businessType?: string;
    source?: Lead["source"];
    contactMethod?: Lead["contactMethod"];
    contactTitle?: string;
    decisionMakerName?: string;
    decisionMakerPhone?: string;
    decisionMakerEmail?: string;
  },
  dateStr: string
) {
  const payload: Record<string, unknown> = {
    id,
    business: data.business,
    contact: data.contact,
    phone: data.phone,
    email: data.email || "",
    address: data.address || "",
    distance: data.distance || "â€”",
    business_type: data.businessType || "",
    source: data.source || "Manual",
    stage: "New Lead",
    contact_method: data.contactMethod || "Call",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: `Added ${dateStr}`,
  };

  if (data.contactTitle?.trim()) payload.contact_title = data.contactTitle.trim();
  if (data.decisionMakerName?.trim()) payload.decision_maker_name = data.decisionMakerName.trim();
  if (data.decisionMakerPhone?.trim()) payload.decision_maker_phone = data.decisionMakerPhone.trim();
  if (data.decisionMakerEmail?.trim()) payload.decision_maker_email = data.decisionMakerEmail.trim();

  return payload;
}

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

export async function getAllLeads(): Promise<Lead[]> {
  const supabase = createServerClient();
  const { data: leadRows, error } = await supabase
    .from("leads").select("*").order("created_at", { ascending: false });

  if (error || !leadRows) { console.error("[Leads] Fetch error:", error); return []; }

  const visibleLeadRows = leadRows.filter((row) => !isSystemLeadId(row.id as string));
  const leadIds = visibleLeadRows.map((r) => r.id);
  if (leadIds.length === 0) return [];

  const [callResult, emailResult] = await Promise.all([
    supabase.from("call_logs").select("*").in("lead_id", leadIds).order("attempt"),
    supabase.from("email_logs").select("*").in("lead_id", leadIds).order("created_at"),
  ]);

  const callsByLead = new Map<string, CallLog[]>();
  const emailsByLead = new Map<string, EmailLog[]>();

  (callResult.data || []).forEach((row) => {
    const id = row.lead_id as string;
    if (!callsByLead.has(id)) callsByLead.set(id, []);
    callsByLead.get(id)!.push(dbToCallLog(row));
  });

  (emailResult.data || []).forEach((row) => {
    const id = row.lead_id as string;
    if (!emailsByLead.has(id)) emailsByLead.set(id, []);
    emailsByLead.get(id)!.push(dbToEmailLog(row));
  });

  return visibleLeadRows.map((row) =>
    dbToLead(row, callsByLead.get(row.id) || [], emailsByLead.get(row.id) || [])
  );
}

export async function getLead(id: string): Promise<Lead | null> {
  if (isSystemLeadId(id)) return null;
  const supabase = createServerClient();
  const { data: row, error } = await supabase.from("leads").select("*").eq("id", id).single();
  if (error || !row) return null;

  const [callResult, emailResult] = await Promise.all([
    supabase.from("call_logs").select("*").eq("lead_id", id).order("attempt"),
    supabase.from("email_logs").select("*").eq("lead_id", id).order("created_at"),
  ]);

  return dbToLead(row, (callResult.data || []).map(dbToCallLog), (emailResult.data || []).map(dbToEmailLog));
}

export async function addLead(data: {
  business: string; contact: string; phone: string;
  email?: string; address?: string; distance?: string;
  businessType?: string; source?: Lead["source"]; contactMethod?: Lead["contactMethod"];
  contactTitle?: string;
  decisionMakerName?: string;
  decisionMakerPhone?: string;
  decisionMakerEmail?: string;
}): Promise<Lead | null> {
  const supabase = createServerClient();
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let id: string;
  try { id = await generateLeadId(); } catch { id = `L-${Date.now().toString().slice(-6)}`; }

  const { data: row, error } = await supabase
    .from("leads")
    .insert(buildLeadInsertPayload(id, data, dateStr))
    .select()
    .single();

  if (error || !row) {
    console.error("[Leads] Add error:", error);
    return null;
  }

  return dbToLead(row, [], []);
}

export async function updateLead(
  id: string,
  updates: Partial<{
    business: string; businessType: string; contact: string; phone: string; email: string; address: string;
    stage: Lead["stage"]; lastActivity: string; vapiCallId: string; callAttempts: number;
    callbackDate: string; callbackTime: string; contactTitle: string;
    employeeCount: string; currentVendingStatus: string; currentVendorName: string;
    productPreferences: string; painPoints: string[];
    decisionMakerName: string; decisionMakerPhone: string; decisionMakerEmail: string;
    visitDate: string; visitTime: string;
    emailSent: boolean; followUp1Sent: boolean; followUp2Sent: boolean;
    tier: LeadTier; tierReason: string; tierScore: number;
    owner: string; vertical: string; employeeCountNumeric: number; footTrafficScore: number;
    website: string; apolloMobile: string; apolloTitle: string; apolloLastEnrichedAt: string;
    maxCallAttempts: number; nextAction: string; nextActionAt: string;
    notInterestedReason: string; isCallReady: boolean; lastTouchAt: string;
  }>
): Promise<boolean> {
  const supabase = createServerClient();
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const map: Record<string, string> = {
    business: "business", businessType: "business_type", contact: "contact", phone: "phone", email: "email",
    address: "address", stage: "stage", vapiCallId: "vapi_call_id",
    callAttempts: "call_attempts", callbackDate: "callback_date", callbackTime: "callback_time",
    lastActivity: "last_activity", contactTitle: "contact_title",
    employeeCount: "employee_count", currentVendingStatus: "current_vending_status",
    currentVendorName: "current_vendor_name", productPreferences: "product_preferences",
    painPoints: "pain_points", decisionMakerName: "decision_maker_name",
    decisionMakerPhone: "decision_maker_phone", decisionMakerEmail: "decision_maker_email",
    visitDate: "visit_date", visitTime: "visit_time",
    emailSent: "email_sent", followUp1Sent: "follow_up_1_sent", followUp2Sent: "follow_up_2_sent",
    tier: "tier", tierReason: "tier_reason", tierScore: "tier_score",
    owner: "owner", vertical: "vertical",
    footTrafficScore: "foot_traffic_score",
    website: "website", apolloMobile: "apollo_mobile", apolloTitle: "apollo_title",
    apolloLastEnrichedAt: "apollo_last_enriched_at", maxCallAttempts: "max_call_attempts",
    nextAction: "next_action", nextActionAt: "next_action_at",
    notInterestedReason: "not_interested_reason", isCallReady: "is_call_ready",
    lastTouchAt: "last_touch_at",
  };

  for (const [key, dbKey] of Object.entries(map)) {
    if ((updates as Record<string, unknown>)[key] !== undefined) {
      db[dbKey] = (updates as Record<string, unknown>)[key];
    }
  }

  const { error } = await supabase.from("leads").update(db).eq("id", id);
  if (error) { console.error("[Leads] Update error:", error); return false; }
  return true;
}

export async function addCallLogAndUpdateStage(
  leadId: string, callLog: CallLog, outcome: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { error: callError } = await supabase.from("call_logs").insert({
    lead_id: leadId, attempt: callLog.attempt, call_date: callLog.date,
    duration: callLog.duration, outcome: callLog.outcome, summary: callLog.summary,
    vapi_call_id: callLog.vapiCallId || null,
  });
  if (callError) { console.error("[Leads] Call log error:", callError); return false; }

  const stage = stageForOutcome(outcome);

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Pull max_call_attempts + callback fields so we can compute next_action.
  const { data: leadRow } = await supabase.from("leads")
    .select("max_call_attempts, callback_date, callback_time")
    .eq("id", leadId).maybeSingle();
  const maxAttempts = (leadRow?.max_call_attempts as number) ?? 6;
  const cbDate = (leadRow?.callback_date as string) || undefined;
  const cbTime = (leadRow?.callback_time as string) || undefined;

  const next = nextTaskForOutcome({
    outcome,
    attempts: callLog.attempt,
    maxAttempts,
    callbackDate: cbDate,
    callbackTime: cbTime,
  });

  // Build the update with next-action + last_touch fields. Wrapped in try/catch
  // for the v2 columns so we still work pre-migration.
  const baseUpdate: Record<string, unknown> = {
    stage, call_attempts: callLog.attempt,
    last_activity: `Call ${outcome} — ${dateStr}`,
    updated_at: new Date().toISOString(),
  };
  const v2Update: Record<string, unknown> = {
    last_touch_at: new Date().toISOString(),
    next_action: next ? `${next.taskType === "call" ? "Call" : "Email"} — ${next.reason}` : null,
    next_action_at: next ? next.scheduledFor.toISOString() : null,
  };
  if (outcome === "not_interested") {
    v2Update.not_interested_reason = (callLog.summary || "marked not interested").slice(0, 200);
  }
  let { error: updErr } = await supabase.from("leads").update({ ...baseUpdate, ...v2Update }).eq("id", leadId);
  if (updErr) {
    // pre-v2 fallback
    updErr = (await supabase.from("leads").update(baseUpdate).eq("id", leadId)).error;
  }

  // Create the next task in lead_tasks (best-effort — if the table isn't there
  // yet we silently skip)
  if (next) {
    try {
      await createTask({
        leadId,
        taskType: next.taskType,
        scheduledFor: next.scheduledFor,
        priority: next.priority,
        reason: next.reason,
      });
    } catch { /* table may not exist yet */ }
  }

  await supabase.from("outreach_log").insert({
    lead_id: leadId, action_type: "call",
    action_data: { outcome, summary: callLog.summary, duration: callLog.duration, next_action: next?.reason || null },
  });

  return true;
}

export async function updateCallLogByConversationId(params: {
  leadId: string;
  vapiCallId: string;
  duration?: string;
  summary?: string;
  outcome?: string;
}): Promise<boolean> {
  const supabase = createServerClient();
  const updates: Record<string, unknown> = {};

  if (params.duration !== undefined) updates.duration = params.duration;
  if (params.summary !== undefined) updates.summary = params.summary;
  if (params.outcome !== undefined) updates.outcome = params.outcome;

  if (Object.keys(updates).length === 0) {
    return true;
  }

  const { error } = await supabase
    .from("call_logs")
    .update(updates)
    .eq("lead_id", params.leadId)
    .eq("vapi_call_id", params.vapiCallId);

  if (error) {
    console.error("[Leads] Call log update error:", error);
    return false;
  }

  if (params.outcome !== undefined) {
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await supabase
      .from("leads")
      .update({
        stage: stageForOutcome(params.outcome),
        last_activity: `Call ${params.outcome} â€” ${dateStr}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.leadId);

    await supabase.from("outreach_log").insert({
      lead_id: params.leadId,
      action_type: "call",
      action_data: { outcome: params.outcome, summary: params.summary, duration: params.duration },
    });
  }

  return true;
}

export async function updateLastCallDuration(leadId: string, duration: string, summary?: string): Promise<void> {
  const supabase = createServerClient();
  const { data: logs } = await supabase.from("call_logs").select("id")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1);

  if (logs && logs.length > 0) {
    const updates: Record<string, unknown> = { duration };
    if (summary) updates.summary = summary;
    await supabase.from("call_logs").update(updates).eq("id", logs[0].id);
  }
}

export async function addEmailLog(leadId: string, subject: string, status: EmailLog["status"] = "Sent"): Promise<void> {
  const supabase = createServerClient();
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  await supabase.from("email_logs").insert({
    lead_id: leadId, email_date: dateStr, status, subject,
  });
  await supabase.from("outreach_log").insert({
    lead_id: leadId, action_type: "email", action_data: { subject, status },
  });
}

export async function logOutreachAction(
  leadId: string,
  actionType: "call" | "email" | "voicemail" | "callback_scheduled" | "site_visit_scheduled",
  actionData: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createServerClient();
  await supabase.from("outreach_log").insert({ lead_id: leadId, action_type: actionType, action_data: actionData });
}

export async function deleteLead(id: string): Promise<boolean> {
  if (isSystemLeadId(id)) {
    return false;
  }
  const supabase = createServerClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  return !error;
}
