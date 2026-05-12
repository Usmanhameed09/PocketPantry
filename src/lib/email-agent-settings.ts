/**
 * Email agent settings — auto-reply caps and behaviour, persisted in Supabase
 * (no redeploy needed to change). Settings record lives on the system lead
 * (TEMPLATE_SYSTEM_LEAD_ID) as an outreach_log entry of type "email_agent_settings".
 *
 * Load priority:
 *   1. Supabase settings record (if exists)
 *   2. Process env vars (EMAIL_AUTO_REPLY_DAILY_CAP, EMAIL_AUTO_REPLY_PER_LEAD_CAP)
 *   3. Hard-coded defaults (50/day, 20/lead)
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { TEMPLATE_SYSTEM_LEAD_ID } from "@/lib/system-records";

const ACTION_TYPE = "email_agent_settings";

export type EmailAgentSettings = {
  dailyCap: number;       // max auto-replies fleet-wide per calendar day
  perLeadCap: number;     // max auto-replies per single lead, lifetime
  enabled: boolean;       // master switch — when false, no auto-replies are sent
};

const HARD_DEFAULTS: EmailAgentSettings = {
  dailyCap: 50,
  perLeadCap: 20,
  enabled: true,
};

function fromEnvOrDefaults(): EmailAgentSettings {
  return {
    dailyCap: Number(process.env.EMAIL_AUTO_REPLY_DAILY_CAP) || HARD_DEFAULTS.dailyCap,
    perLeadCap: Number(process.env.EMAIL_AUTO_REPLY_PER_LEAD_CAP) || HARD_DEFAULTS.perLeadCap,
    enabled: process.env.EMAIL_AUTO_REPLY_ENABLED !== "false",
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitize(input: unknown): EmailAgentSettings {
  const fallback = fromEnvOrDefaults();
  const obj = (input || {}) as Partial<EmailAgentSettings>;
  return {
    dailyCap: clamp(obj.dailyCap, 1, 5000, fallback.dailyCap),
    perLeadCap: clamp(obj.perLeadCap, 1, 500, fallback.perLeadCap),
    enabled: obj.enabled !== false,
  };
}

export async function getEmailAgentSettings(): Promise<EmailAgentSettings> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("outreach_log")
      .select("action_data")
      .eq("lead_id", TEMPLATE_SYSTEM_LEAD_ID)
      .eq("action_type", ACTION_TYPE)
      .order("performed_at", { ascending: false })
      .limit(1);

    const row = data?.[0];
    if (row?.action_data) {
      const payload = (row.action_data as { settings?: unknown }).settings ?? row.action_data;
      return sanitize(payload);
    }
  } catch (err) {
    console.warn("[email-agent-settings] Falling back to env defaults:", err);
  }
  return fromEnvOrDefaults();
}

export async function saveEmailAgentSettings(input: Partial<EmailAgentSettings>): Promise<EmailAgentSettings> {
  const current = await getEmailAgentSettings();
  const merged = sanitize({ ...current, ...input });

  const supabase = createServerClient();
  const { error } = await supabase.from("outreach_log").insert({
    lead_id: TEMPLATE_SYSTEM_LEAD_ID,
    action_type: ACTION_TYPE,
    action_data: {
      settings: merged,
      updatedAt: new Date().toISOString(),
    },
  });

  if (error) {
    throw error;
  }
  return merged;
}
