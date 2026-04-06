import { promises as fs } from "fs";
import path from "path";
import { createServerClient } from "@/lib/supabase";
import { TEMPLATE_SYSTEM_LEAD_ID } from "@/lib/system-records";

export type OutreachTemplateStage = "primary" | "follow_up_1" | "follow_up_2";

export type StoredOutreachTemplate = {
  subject: string;
  body: string;
};

export type OutreachTemplateMap = Record<OutreachTemplateStage, StoredOutreachTemplate>;

const DATA_DIR = path.resolve(process.cwd(), ".data");
const LEGACY_TEMPLATE_FILE = path.join(DATA_DIR, "outreach-email-templates.json");
const TEMPLATE_ACTION_TYPE = "email";

const DEFAULT_TEMPLATES: OutreachTemplateMap = {
  primary: {
    subject: "Customizable Vending Machines for {{businessName}}",
    body: `Hi {{contactFirstName}},

My name is {{senderName}} and I am emailing you regarding {{businessName}} and its current vending machine solution. If you are looking to fill an empty space within a breakroom or a thoroughfare, our machines are restocked every week and can be filled with any products of your choice, making it a convenient and personalized solution for your employees or customers.

If you are interested I would be happy to jump on a call with you to discuss how we can make this happen.

Thank you,
{{senderName}}
PocketPantry
{{contactPhone}}
{{replyToEmail}}`,
  },
  follow_up_1: {
    subject: "Following up on vending for {{businessName}}",
    body: `Hi {{contactFirstName}},

I wanted to follow up in case my last email was lost in your inbox. Are you currently looking to fill an empty space at your location with a vending machine?

If you currently have a vending services solution for {{businessName}} that you are not happy with, our machines are consistently restocked weekly and can be filled with any products that your customers or employees wish. If you are interested, I would love to jump on a call to discuss the details further.

Thank you,
{{senderName}}
PocketPantry
{{contactPhone}}
{{replyToEmail}}`,
  },
  follow_up_2: {
    subject: "Checking in about vending at {{businessName}}",
    body: `Hi {{contactFirstName}},

I wanted to reach out again just in case you missed my last email. If you are currently interested in having a vending machine placed at {{businessName}} or are unhappy with your current vending services provider, I would love to jump on a call to discuss in detail how we can help if you have the time.

Thank you,
{{senderName}}
PocketPantry
{{contactPhone}}
{{replyToEmail}}`,
  },
};

function sanitizeTemplateMap(value: unknown): OutreachTemplateMap {
  const input = (value || {}) as Partial<OutreachTemplateMap>;

  return {
    primary: {
      subject: input.primary?.subject?.trim() || DEFAULT_TEMPLATES.primary.subject,
      body: input.primary?.body?.trim() || DEFAULT_TEMPLATES.primary.body,
    },
    follow_up_1: {
      subject: input.follow_up_1?.subject?.trim() || DEFAULT_TEMPLATES.follow_up_1.subject,
      body: input.follow_up_1?.body?.trim() || DEFAULT_TEMPLATES.follow_up_1.body,
    },
    follow_up_2: {
      subject: input.follow_up_2?.subject?.trim() || DEFAULT_TEMPLATES.follow_up_2.subject,
      body: input.follow_up_2?.body?.trim() || DEFAULT_TEMPLATES.follow_up_2.body,
    },
  };
}

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
    distance: "—",
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
  const initialTemplates = legacyTemplates || DEFAULT_TEMPLATES;
  await writeTemplateRecord(initialTemplates);
  return sanitizeTemplateMap(initialTemplates);
}

export async function saveOutreachTemplates(templates: OutreachTemplateMap): Promise<OutreachTemplateMap> {
  const sanitized = sanitizeTemplateMap(templates);
  await writeTemplateRecord(sanitized);
  return sanitized;
}

export { DEFAULT_TEMPLATES, TEMPLATE_SYSTEM_LEAD_ID };
