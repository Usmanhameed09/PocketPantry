/**
 * Leads Store — backed by Supabase PostgreSQL
 *
 * All lead CRUD operations and call/email log management.
 * Used by API routes (server-side) via service_role client.
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
// Helpers: Map DB rows ↔ App types
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

// ----------------------------------------------------------------
// Generate Lead ID
// ----------------------------------------------------------------

async function generateLeadId(): Promise<string> {
  const supabase = createServerClient();
  const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
  return `L-${String((count || 0) + 1).padStart(3, "0")}`;
}

// ----------------------------------------------------------------
// CRUD Operations
// ----------------------------------------------------------------

/**
 * Get all leads with their call and email logs
 */
export async function getAllLeads(): Promise<Lead[]> {
  const supabase = createServerClient();

  const { data: leadRows, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !leadRows) {
    console.error("[Leads] Error fetching leads:", error);
    return [];
  }

  // Fetch all call logs and email logs in batch
  const leadIds = leadRows.map((r) => r.id);

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

/**
 * Get a single lead by ID
 */
export async function getLead(id: string): Promise<Lead | null> {
  const supabase = createServerClient();

  const { data: row, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) return null;

  const [callResult, emailResult] = await Promise.all([
    supabase.from("call_logs").select("*").eq("lead_id", id).order("attempt"),
    supabase.from("email_logs").select("*").eq("lead_id", id).order("created_at"),
  ]);

  return dbToLead(
    row,
    (callResult.data || []).map(dbToCallLog),
    (emailResult.data || []).map(dbToEmailLog)
  );
}

/**
 * Add a new lead
 */
export async function addLead(data: {
  business: string;
  contact: string;
  phone: string;
  email?: string;
  address?: string;
  distance?: string;
  businessType?: string;
  source?: Lead["source"];
  contactMethod?: Lead["contactMethod"];
}): Promise<Lead | null> {
  const supabase = createServerClient();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let id: string;
  try {
    id = await generateLeadId();
  } catch {
    // Fallback ID generation
    id = `L-${Date.now().toString().slice(-6)}`;
  }

  const { data: row, error } = await supabase
    .from("leads")
    .insert({
      id,
      business: data.business,
      contact: data.contact,
      phone: data.phone,
      email: data.email || "",
      address: data.address || "",
      distance: data.distance || "—",
      business_type: data.businessType || "",
      source: data.source || "Manual",
      stage: "New Lead",
      contact_method: data.contactMethod || "Call",
      call_attempts: 0,
      added_date: dateStr,
      last_activity: `Added ${dateStr}`,
    })
    .select()
    .single();

  if (error) {
    console.error("[Leads] Error adding lead:", error);
    return null;
  }

  return dbToLead(row, [], []);
}

/**
 * Update a lead
 */
export async function updateLead(
  id: string,
  updates: Partial<{
    business: string;
    contact: string;
    phone: string;
    email: string;
    address: string;
    stage: Lead["stage"];
    lastActivity: string;
    vapiCallId: string;
    callAttempts: number;
    callbackDate: string;
    callbackTime: string;
  }>
): Promise<boolean> {
  const supabase = createServerClient();

  // Map camelCase to snake_case
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.business !== undefined) dbUpdates.business = updates.business;
  if (updates.contact !== undefined) dbUpdates.contact = updates.contact;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
  if (updates.lastActivity !== undefined) dbUpdates.last_activity = updates.lastActivity;
  if (updates.vapiCallId !== undefined) dbUpdates.vapi_call_id = updates.vapiCallId;
  if (updates.callAttempts !== undefined) dbUpdates.call_attempts = updates.callAttempts;
  if (updates.callbackDate !== undefined) dbUpdates.callback_date = updates.callbackDate;
  if (updates.callbackTime !== undefined) dbUpdates.callback_time = updates.callbackTime;

  const { error } = await supabase
    .from("leads")
    .update(dbUpdates)
    .eq("id", id);

  if (error) {
    console.error("[Leads] Error updating lead:", error);
    return false;
  }
  return true;
}

/**
 * Add a call log and update the lead's stage based on outcome
 */
export async function addCallLogAndUpdateStage(
  leadId: string,
  callLog: CallLog,
  outcome: string
): Promise<boolean> {
  const supabase = createServerClient();

  // Insert call log
  const { error: callError } = await supabase.from("call_logs").insert({
    lead_id: leadId,
    attempt: callLog.attempt,
    call_date: callLog.date,
    duration: callLog.duration,
    outcome: callLog.outcome,
    summary: callLog.summary,
    vapi_call_id: callLog.vapiCallId || null,
  });

  if (callError) {
    console.error("[Leads] Error adding call log:", callError);
    return false;
  }

  // Map outcome to pipeline stage
  let stage: Lead["stage"];
  switch (outcome) {
    case "interested":
      stage = "Interested";
      break;
    case "not_interested":
      stage = "Not Interested";
      break;
    case "callback":
      stage = "Callback";
      break;
    case "site_visit":
      stage = "Site Visit Requested";
      break;
    case "proposal":
      stage = "Proposal Requested";
      break;
    case "voicemail":
    case "gatekeeper":
    case "no_answer":
      stage = "Contacted";
      break;
    case "wrong_number":
      stage = "Not Interested";
      break;
    default:
      stage = "Contacted";
  }

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Update lead
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      stage,
      call_attempts: callLog.attempt,
      last_activity: `Call ${outcome} — ${dateStr}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (updateError) {
    console.error("[Leads] Error updating lead stage:", updateError);
    return false;
  }

  // Log to outreach_log
  await supabase.from("outreach_log").insert({
    lead_id: leadId,
    action_type: "call",
    action_data: { outcome, summary: callLog.summary, duration: callLog.duration },
  });

  return true;
}

/**
 * Update the duration of the last call log for a lead
 */
export async function updateLastCallDuration(
  leadId: string,
  duration: string,
  summary?: string
): Promise<void> {
  const supabase = createServerClient();

  // Get the most recent call log for this lead
  const { data: logs } = await supabase
    .from("call_logs")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (logs && logs.length > 0) {
    const updates: Record<string, unknown> = { duration };
    if (summary) updates.summary = summary;

    await supabase.from("call_logs").update(updates).eq("id", logs[0].id);
  }
}

/**
 * Log an outreach action
 */
export async function logOutreachAction(
  leadId: string,
  actionType: "call" | "email" | "voicemail" | "callback_scheduled" | "site_visit_scheduled",
  actionData: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createServerClient();
  await supabase.from("outreach_log").insert({
    lead_id: leadId,
    action_type: actionType,
    action_data: actionData,
  });
}

/**
 * Delete a lead
 */
export async function deleteLead(id: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  return !error;
}
