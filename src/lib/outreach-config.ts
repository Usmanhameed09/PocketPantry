/**
 * Outreach config — operator-tunable routing + cadence settings (US6.3).
 *
 * Lets the admin change WITHOUT a code deploy:
 *   - callers / closers        → who Tier-A leads and Interested leads route to
 *   - autoAssignEnabled        → master switch for tier/stage auto-assignment
 *   - maxCallAttempts          → when "Max attempts reached" kicks in
 *   - retryCadenceDays         → spacing between no-answer retries
 *   - apolloTitles             → decision-maker titles Apollo searches for
 *
 * Persisted as a single JSON row in `outreach_config` (migration 007). If the
 * table is missing/empty the loader returns DEFAULT_OUTREACH_CONFIG, so the
 * app keeps working pre-migration.
 */

import { createServerClient } from "./supabase";

export type OutreachConfig = {
  autoAssignEnabled: boolean;
  callers: string[];
  closers: string[];
  maxCallAttempts: number;
  retryCadenceDays: number[];
  apolloTitles: string[];
};

export const DEFAULT_OUTREACH_CONFIG: OutreachConfig = {
  autoAssignEnabled: true,
  callers: [],
  closers: [],
  maxCallAttempts: 6,
  retryCadenceDays: [1, 2, 4],
  apolloTitles: [
    "manager",
    "operations manager",
    "office manager",
    "facilities manager",
    "property manager",
    "owner",
    "director of operations",
    "administrator",
  ],
};

let cached: { config: OutreachConfig; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

/** Merge a partial stored config over the defaults, sanitizing each field. */
function normalize(raw: Partial<OutreachConfig> | null | undefined): OutreachConfig {
  const d = DEFAULT_OUTREACH_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d };
  const arrStr = (v: unknown, fallback: string[]) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : fallback;
  const arrNum = (v: unknown, fallback: number[]) => {
    if (!Array.isArray(v)) return fallback;
    const nums = v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0);
    return nums.length ? nums : fallback;
  };
  const maxAttempts = Number(raw.maxCallAttempts);
  return {
    autoAssignEnabled: typeof raw.autoAssignEnabled === "boolean" ? raw.autoAssignEnabled : d.autoAssignEnabled,
    callers: arrStr(raw.callers, d.callers),
    closers: arrStr(raw.closers, d.closers),
    maxCallAttempts: Number.isFinite(maxAttempts) && maxAttempts >= 1 ? Math.floor(maxAttempts) : d.maxCallAttempts,
    retryCadenceDays: arrNum(raw.retryCadenceDays, d.retryCadenceDays),
    apolloTitles: arrStr(raw.apolloTitles, d.apolloTitles),
  };
}

export async function loadOutreachConfig(): Promise<OutreachConfig> {
  if (cached && Date.now() - cached.loadedAt < CONFIG_TTL_MS) return cached.config;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("outreach_config")
      .select("config")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const config = normalize(data?.config as Partial<OutreachConfig> | undefined);
    cached = { config, loadedAt: Date.now() };
    return config;
  } catch {
    return { ...DEFAULT_OUTREACH_CONFIG };
  }
}

export function invalidateOutreachConfigCache() {
  cached = null;
}

/** Persist a new config (merged + sanitized). Returns the saved config. */
export async function saveOutreachConfig(raw: Partial<OutreachConfig>): Promise<OutreachConfig> {
  const config = normalize(raw);
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("outreach_config")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from("outreach_config").update({ config, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("outreach_config").insert({ config });
  }
  invalidateOutreachConfigCache();
  return config;
}

/**
 * Deterministic round-robin pick — same leadId always maps to the same person,
 * and the distribution is roughly even across the list. Avoids needing a stored
 * counter (which would race during bulk re-scoring).
 */
export function pickRoundRobin(names: string[], leadId: string): string | null {
  if (!names.length) return null;
  let hash = 0;
  for (let i = 0; i < leadId.length; i++) {
    hash = (hash * 31 + leadId.charCodeAt(i)) & 0x7fffffff;
  }
  return names[hash % names.length];
}
