import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { createServerClient } from "@/lib/supabase";
import { TEMPLATE_SYSTEM_LEAD_ID } from "@/lib/system-records";
import {
  DEFAULT_TEMPLATES,
  getFollowUpStages,
  getTemplateStage,
  sanitizeTemplateMap,
  type OutreachTemplateMap,
  type OutreachTemplateStage,
} from "@/lib/outreach-template-model";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const LEGACY_TEMPLATE_FILE = path.join(DATA_DIR, "outreach-email-templates.json");
const TEMPLATE_ACTION_TYPE = "email";

async function loadLegacyTemplates(): Promise<OutreachTemplateMap | null> {
  try {
    const raw = await fs.readFile(LEGACY_TEMPLATE_FILE, "utf8");
    return sanitizeTemplateMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function ensureTemplateSystemLead() {
  const supabase = createServerClient();
  const { data: existing, error: lookupError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", TEMPLATE_SYSTEM_LEAD_ID)
    .maybeSingle();

  if (lookupError && lookupError.code !== "PGRST116") {
    throw lookupError;
  }

  if (existing?.id) {
    return;
  }

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const { error: insertError } = await supabase.from("leads").insert({
    id: TEMPLATE_SYSTEM_LEAD_ID,
    business: "__SYSTEM__ Outreach Templates",
    contact: "System",
    phone: "0000000000",
    email: "",
    address: "",
    distance: "--",
    business_type: "system",
    source: "Manual",
    stage: "New Lead",
    contact_method: "Email",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: "System template store",
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
}

async function getLatestTemplateRecord() {
  await ensureTemplateSystemLead();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("outreach_log")
    .select("id, action_data, performed_at")
    .eq("lead_id", TEMPLATE_SYSTEM_LEAD_ID)
    .eq("action_type", TEMPLATE_ACTION_TYPE)
    .order("performed_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function writeTemplateRecord(templates: OutreachTemplateMap) {
  await ensureTemplateSystemLead();
  const supabase = createServerClient();
  const { error } = await supabase.from("outreach_log").insert({
    lead_id: TEMPLATE_SYSTEM_LEAD_ID,
    action_type: TEMPLATE_ACTION_TYPE,
    action_data: {
      templates,
      updatedAt: new Date().toISOString(),
    },
  });

  if (error) {
    throw error;
  }
}

export async function getOutreachTemplates(): Promise<OutreachTemplateMap> {
  const latestRecord = await getLatestTemplateRecord();
  if (latestRecord?.action_data && typeof latestRecord.action_data === "object") {
    const templatePayload =
      (latestRecord.action_data as { templates?: unknown }).templates ?? latestRecord.action_data;
    return sanitizeTemplateMap(templatePayload);
  }

  const legacyTemplates = await loadLegacyTemplates();
  const initialTemplates = legacyTemplates || sanitizeTemplateMap(DEFAULT_TEMPLATES);
  await writeTemplateRecord(initialTemplates);
  return sanitizeTemplateMap(initialTemplates);
}

export async function saveOutreachTemplates(templates: OutreachTemplateMap): Promise<OutreachTemplateMap> {
  const sanitized = sanitizeTemplateMap(templates);
  await writeTemplateRecord(sanitized);
  return sanitized;
}

export {
  DEFAULT_TEMPLATES,
  getFollowUpStages,
  getTemplateStage,
  TEMPLATE_SYSTEM_LEAD_ID,
  type OutreachTemplateMap,
  type OutreachTemplateStage,
};
