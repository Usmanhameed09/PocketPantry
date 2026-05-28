/**
 * Lead tasks — forward-looking work the caller / system needs to do on a lead.
 *
 * Different from call_logs (which is past calls). A task = "call this lead
 * tomorrow at 10am because they said callback then" or "send 3rd-touch email
 * in 2 days because they didn't reply".
 *
 * Cadence rules:
 *   - Hot lead (just submitted a form / replied positively) → first call within 1 hour
 *   - No answer / voicemail → retry next business day, then +2d, +4d up to max_call_attempts
 *   - Callback at specific time → exact-time task
 *   - Gatekeeper → email follow-up + retry next business day
 *   - Wrong number → no automatic retry (operator must re-enrich first)
 *
 * Tasks are dequeued by the call-ready queue UI and by the email cron.
 */

import { createServerClient } from "./supabase";

export type TaskType = "call" | "email" | "follow_up";
export type TaskStatus = "open" | "done" | "skipped";

export type LeadTask = {
  id: string;
  leadId: string;
  taskType: TaskType;
  scheduledFor: string;
  priority: number;
  status: TaskStatus;
  reason: string | null;
  completedAt: string | null;
  completedOutcome: string | null;
  createdAt: string;
};

function dbToTask(row: Record<string, unknown>): LeadTask {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    taskType: row.task_type as TaskType,
    scheduledFor: row.scheduled_for as string,
    priority: (row.priority as number) ?? 50,
    status: row.status as TaskStatus,
    reason: (row.reason as string) || null,
    completedAt: (row.completed_at as string) || null,
    completedOutcome: (row.completed_outcome as string) || null,
    createdAt: row.created_at as string,
  };
}

export async function createTask(params: {
  leadId: string;
  taskType: TaskType;
  scheduledFor: Date | string;
  priority?: number;
  reason?: string;
}): Promise<LeadTask | null> {
  const supabase = createServerClient();
  const scheduledIso = typeof params.scheduledFor === "string"
    ? params.scheduledFor
    : params.scheduledFor.toISOString();

  const { data, error } = await supabase
    .from("lead_tasks")
    .insert({
      lead_id: params.leadId,
      task_type: params.taskType,
      scheduled_for: scheduledIso,
      priority: params.priority ?? 50,
      reason: params.reason || null,
    })
    .select()
    .single();
  if (error || !data) {
    console.error("[lead-tasks] create failed", error);
    return null;
  }
  return dbToTask(data);
}

export async function completeTask(taskId: string, outcome: string): Promise<boolean> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("lead_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_outcome: outcome,
    })
    .eq("id", taskId);
  if (error) console.error("[lead-tasks] complete failed", error);
  return !error;
}

export async function getOpenTasksForLead(leadId: string): Promise<LeadTask[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("lead_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .eq("status", "open")
    .order("scheduled_for", { ascending: true });
  return (data || []).map(dbToTask);
}

export async function getDueTasks(opts: { limit?: number; type?: TaskType } = {}): Promise<LeadTask[]> {
  const supabase = createServerClient();
  let q = supabase
    .from("lead_tasks")
    .select("*")
    .eq("status", "open")
    .lte("scheduled_for", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("scheduled_for", { ascending: true })
    .limit(opts.limit ?? 100);
  if (opts.type) q = q.eq("task_type", opts.type);
  const { data } = await q;
  return (data || []).map(dbToTask);
}

/**
 * Plus business-day calculator — skips weekends. Cron jobs that schedule
 * "next business day" callbacks need this so we don't call leads on Saturday.
 */
export function addBusinessDays(base: Date, days: number): Date {
  const result = new Date(base);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}

/**
 * Cadence rules. Given the outcome of a call/email, what's the next task?
 * Returns null if no follow-up is appropriate (eg "not_interested").
 */
export function nextTaskForOutcome(params: {
  outcome: string;
  attempts: number;
  maxAttempts: number;
  callbackDate?: string;
  callbackTime?: string;
  now?: Date;
}): { taskType: TaskType; scheduledFor: Date; priority: number; reason: string } | null {
  const now = params.now || new Date();
  const o = params.outcome.toLowerCase();

  if (o === "callback" && params.callbackDate) {
    const time = params.callbackTime || "10:00";
    const when = new Date(`${params.callbackDate}T${time}:00`);
    if (!isNaN(when.getTime())) {
      return { taskType: "call", scheduledFor: when, priority: 90, reason: "Lead requested callback" };
    }
  }
  if (o === "interested" || o === "proposal" || o === "site_visit") {
    return { taskType: "follow_up", scheduledFor: addBusinessDays(now, 1), priority: 95, reason: `Hot — outcome ${o}` };
  }
  if (o === "voicemail" || o === "no_answer") {
    if (params.attempts >= params.maxAttempts) return null;
    const days = params.attempts <= 1 ? 1 : params.attempts <= 3 ? 2 : 4;
    return { taskType: "call", scheduledFor: addBusinessDays(now, days), priority: 50, reason: `Retry — ${o} attempt ${params.attempts}` };
  }
  if (o === "gatekeeper") {
    return { taskType: "email", scheduledFor: addBusinessDays(now, 0), priority: 60, reason: "Gatekeeper — try email DM" };
  }
  // not_interested, wrong_number → no follow-up
  return null;
}

/**
 * "Hot lead" trigger — fire immediately when a lead replies positively
 * to an email or a web form submission. Schedules a high-priority call task
 * within 1 hour (or as soon as the queue picks it up).
 */
export async function fireHotLeadTrigger(leadId: string, reason: string): Promise<LeadTask | null> {
  const supabase = createServerClient();
  await supabase.from("leads").update({
    is_call_ready: true,
    next_action: "Call within 1 hour — hot reply",
    next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    last_touch_at: new Date().toISOString(),
  }).eq("id", leadId);
  return createTask({
    leadId,
    taskType: "call",
    scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
    priority: 100,
    reason,
  });
}
