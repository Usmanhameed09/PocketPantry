import { createServerClient } from "@/lib/supabase";
import { GOOGLE_CALENDAR_SYSTEM_LEAD_ID } from "@/lib/system-records";

const GOOGLE_CALENDAR_ACTION_TYPE = "call";
const GOOGLE_CALENDAR_KIND = "google_calendar_oauth";

export type GoogleCalendarTokenRecord = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
  calendar_id?: string;
  email?: string;
  connected_at?: string;
};

async function ensureGoogleCalendarSystemLead() {
  const supabase = createServerClient();
  const { data: existing, error: lookupError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", GOOGLE_CALENDAR_SYSTEM_LEAD_ID)
    .maybeSingle();

  if (lookupError && lookupError.code !== "PGRST116") {
    throw lookupError;
  }

  if (existing?.id) {
    return;
  }

  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const { error: insertError } = await supabase.from("leads").insert({
    id: GOOGLE_CALENDAR_SYSTEM_LEAD_ID,
    business: "__SYSTEM__ Google Calendar",
    contact: "System",
    phone: "0000000000",
    email: "",
    address: "",
    distance: "—",
    business_type: "system",
    source: "Manual",
    stage: "New Lead",
    contact_method: "Call",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: "Google Calendar token store",
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
}

export async function getGoogleCalendarTokenRecord(): Promise<GoogleCalendarTokenRecord | null> {
  await ensureGoogleCalendarSystemLead();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("outreach_log")
    .select("action_data, performed_at")
    .eq("lead_id", GOOGLE_CALENDAR_SYSTEM_LEAD_ID)
    .eq("action_type", GOOGLE_CALENDAR_ACTION_TYPE)
    .order("performed_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const match = (data || []).find((row) => {
    const actionData = row.action_data as { kind?: string } | null;
    return actionData?.kind === GOOGLE_CALENDAR_KIND;
  });

  const payload = match?.action_data;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = { ...(payload as GoogleCalendarTokenRecord & { kind?: string }) };
  delete (record as { kind?: string }).kind;
  return record;
}

export async function saveGoogleCalendarTokenRecord(record: GoogleCalendarTokenRecord) {
  await ensureGoogleCalendarSystemLead();
  const supabase = createServerClient();
  const { error } = await supabase.from("outreach_log").insert({
    lead_id: GOOGLE_CALENDAR_SYSTEM_LEAD_ID,
    action_type: GOOGLE_CALENDAR_ACTION_TYPE,
    action_data: {
      kind: GOOGLE_CALENDAR_KIND,
      ...record,
      connected_at: record.connected_at || new Date().toISOString(),
    },
  });

  if (error) {
    throw error;
  }
}

export async function clearGoogleCalendarTokenRecord() {
  await ensureGoogleCalendarSystemLead();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("outreach_log")
    .select("id, action_data")
    .eq("lead_id", GOOGLE_CALENDAR_SYSTEM_LEAD_ID)
    .eq("action_type", GOOGLE_CALENDAR_ACTION_TYPE);

  if (error) {
    throw error;
  }

  const idsToDelete = (data || [])
    .filter((row) => {
      const actionData = row.action_data as { kind?: string } | null;
      return actionData?.kind === GOOGLE_CALENDAR_KIND;
    })
    .map((row) => row.id)
    .filter(Boolean);

  if (!idsToDelete.length) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("outreach_log")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    throw deleteError;
  }
}
