/**
 * Leads Store — backed by Supabase PostgreSQL
 * Full outreach workflow support per all 3 docs.
 */

import { createServerClient } from "./supabase";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

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
  stage: "New Lead" | "Contacted" | "Interested" | "Not Interested" | "Site Visit Requested" | "Proposal Requested" | "Callback";
  contactMethod: "Call" | "Email" | "Call + Email";
  callLogs: CallLog[];
  emailLogs: EmailLog[];
  addedDate: string;
  lastActivity: string;
  callAttempts: number;
  vapiCallId?: string;
  callbackDate?: string;
  callbackTime?: string;
  // Extended fields (Doc 1 lead form)
  contactTitle?: string;
  employeeCount?: string;
  currentVendingStatus?: string;
  currentVendorName?: string;
  productPreferences?: string;
  painPoints?: string[];
  // Gatekeeper referral (Doc 2)
  decisionMakerName?: string;
  decisionMakerPhone?: string;
  decisionMakerEmail?: string;
  // Visit scheduling
  visitDate?: string;
  visitTime?: string;
  // Email follow-up tracking (Doc 3)
  emailSent?: boolean;
  followUp1Sent?: boolean;
  followUp2Sent?: boolean;
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
  const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
  return `L-${String((count || 0) + 1).padStart(3, "0")}`;
}

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

export async function getAllLeads(): Promise<Lead[]> {
  const supabase = createServerClient();
  const { data: leadRows, error } = await supabase
    .from("leads").select("*").order("created_at", { ascending: false });

  if (error || !leadRows) { console.error("[Leads] Fetch error:", error); return []; }

  const leadIds = leadRows.map((r) => r.id);
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

  return leadRows.map((row) =>
    dbToLead(row, callsByLead.get(row.id) || [], emailsByLead.get(row.id) || [])
  );
}

export async function getLead(id: string): Promise<Lead | null> {
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
}): Promise<Lead | null> {
  const supabase = createServerClient();
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let id: string;
  try { id = await generateLeadId(); } catch { id = `L-${Date.now().toString().slice(-6)}`; }

  const { data: row, error } = await supabase.from("leads").insert({
    id, business: data.business, contact: data.contact, phone: data.phone,
    email: data.email || "", address: data.address || "", distance: data.distance || "—",
    business_type: data.businessType || "", source: data.source || "Manual",
    stage: "New Lead", contact_method: data.contactMethod || "Call",
    call_attempts: 0, added_date: dateStr, last_activity: `Added ${dateStr}`,
  }).select().single();

  if (error) { console.error("[Leads] Add error:", error); return null; }
  return dbToLead(row, [], []);
}

export async function updateLead(
  id: string,
  updates: Partial<{
    business: string; contact: string; phone: string; email: string; address: string;
    stage: Lead["stage"]; lastActivity: string; vapiCallId: string; callAttempts: number;
    callbackDate: string; callbackTime: string; contactTitle: string;
    employeeCount: string; currentVendingStatus: string; currentVendorName: string;
    productPreferences: string; painPoints: string[];
    decisionMakerName: string; decisionMakerPhone: string; decisionMakerEmail: string;
    visitDate: string; visitTime: string;
    emailSent: boolean; followUp1Sent: boolean; followUp2Sent: boolean;
  }>
): Promise<boolean> {
  const supabase = createServerClient();
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Map camelCase → snake_case
  const map: Record<string, string> = {
    business: "business", contact: "contact", phone: "phone", email: "email",
    address: "address", stage: "stage", vapiCallId: "vapi_call_id",
    callAttempts: "call_attempts", callbackDate: "callback_date", callbackTime: "callback_time",
    lastActivity: "last_activity", contactTitle: "contact_title",
    employeeCount: "employee_count", currentVendingStatus: "current_vending_status",
    currentVendorName: "current_vendor_name", productPreferences: "product_preferences",
    painPoints: "pain_points", decisionMakerName: "decision_maker_name",
    decisionMakerPhone: "decision_maker_phone", decisionMakerEmail: "decision_maker_email",
    visitDate: "visit_date", visitTime: "visit_time",
    emailSent: "email_sent", followUp1Sent: "follow_up_1_sent", followUp2Sent: "follow_up_2_sent",
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

  let stage: Lead["stage"];
  switch (outcome) {
    case "interested": stage = "Interested"; break;
    case "not_interested": stage = "Not Interested"; break;
    case "callback": stage = "Callback"; break;
    case "site_visit": stage = "Site Visit Requested"; break;
    case "proposal": stage = "Proposal Requested"; break;
    case "voicemail": case "gatekeeper": case "no_answer": stage = "Contacted"; break;
    case "wrong_number": stage = "Not Interested"; break;
    default: stage = "Contacted";
  }

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  await supabase.from("leads").update({
    stage, call_attempts: callLog.attempt,
    last_activity: `Call ${outcome} — ${dateStr}`, updated_at: new Date().toISOString(),
  }).eq("id", leadId);

  await supabase.from("outreach_log").insert({
    lead_id: leadId, action_type: "call",
    action_data: { outcome, summary: callLog.summary, duration: callLog.duration },
  });

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
  const supabase = createServerClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  return !error;
}
