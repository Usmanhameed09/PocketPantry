/**
 * Lead tier scoring — assigns A/B/C tier from configurable weights.
 *
 * Weights live in scoring_config.weights (jsonb) so the operator can
 * tune them without a redeploy. Score = sum of:
 *   - vertical weight  (eg "Auto Dealership" = 30)
 *   - employee count   (50+ = 20, 100+ = 30, 250+ = 35)
 *   - data completeness (mobile +15, email +10, address +5, DM title +8)
 * Tier is then bucketed via thresholds (default: A ≥ 70, B ≥ 40, else C).
 *
 * Used by:
 *   - /api/leads/score                (score one lead or all leads)
 *   - lead create / Apollo enrich path (auto-tier on insert)
 *   - cron/leads-rescore              (nightly re-tier when data changes)
 */

import { createServerClient } from "./supabase";
import type { Lead } from "./leads-store";

export type ScoringWeights = {
  verticals: Record<string, number>;
  employees: { min_25?: number; min_50?: number; min_100?: number; min_250?: number };
  data: { has_mobile?: number; has_email?: number; has_address?: number; has_dm_title?: number };
};

export type ScoringThresholds = { A: number; B: number };

export const DEFAULT_WEIGHTS: ScoringWeights = {
  verticals: {
    "Auto Dealership":     30,
    "Construction Supply": 28,
    "Manufacturing":       28,
    "Warehousing":         26,
    "Office Park":         24,
    "Call Center":         22,
    "Gym":                 18,
    "Hospital":            16,
    "Hotel":               14,
    "School":              12,
    "Car Wash":            12,
    "Apartments":          10,
  },
  employees: { min_25: 10, min_50: 20, min_100: 30, min_250: 35 },
  data:      { has_mobile: 15, has_email: 10, has_address: 5, has_dm_title: 8 },
};

export const DEFAULT_THRESHOLDS: ScoringThresholds = { A: 70, B: 40 };

let cachedConfig: { weights: ScoringWeights; thresholds: ScoringThresholds; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

export async function loadScoringConfig(): Promise<{ weights: ScoringWeights; thresholds: ScoringThresholds }> {
  if (cachedConfig && Date.now() - cachedConfig.loadedAt < CONFIG_TTL_MS) {
    return { weights: cachedConfig.weights, thresholds: cachedConfig.thresholds };
  }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("scoring_config")
      .select("weights, thresholds")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const weights = (data?.weights as ScoringWeights) || DEFAULT_WEIGHTS;
    const thresholds = (data?.thresholds as ScoringThresholds) || DEFAULT_THRESHOLDS;
    cachedConfig = { weights, thresholds, loadedAt: Date.now() };
    return { weights, thresholds };
  } catch {
    return { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS };
  }
}

export function invalidateScoringConfigCache() {
  cachedConfig = null;
}

export type ScoredLeadInput = {
  vertical?: string;
  businessType?: string;
  employeeCount?: string | number;
  apolloMobile?: string;
  phone?: string;
  email?: string;
  address?: string;
  contactTitle?: string;
  decisionMakerName?: string;
  decisionMakerEmail?: string;
};

export type ScoreResult = {
  score: number;
  tier: "A" | "B" | "C";
  reason: string;
  breakdown: { label: string; points: number }[];
};

function parseEmployees(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = value.toString().replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

export function scoreLead(lead: ScoredLeadInput, weights: ScoringWeights, thresholds: ScoringThresholds): ScoreResult {
  const breakdown: { label: string; points: number }[] = [];
  let score = 0;

  // 1. Vertical — match against businessType too since older leads use that
  const verticalKey = (lead.vertical || lead.businessType || "").trim();
  if (verticalKey) {
    const exact = weights.verticals[verticalKey];
    const fuzzy = exact ?? Object.entries(weights.verticals).find(([k]) =>
      verticalKey.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(verticalKey.toLowerCase())
    )?.[1];
    if (fuzzy) {
      score += fuzzy;
      breakdown.push({ label: `Vertical: ${verticalKey}`, points: fuzzy });
    }
  }

  // 2. Employee count bands — most specific (largest) wins
  const emp = parseEmployees(lead.employeeCount);
  if (emp >= 250 && weights.employees.min_250) {
    score += weights.employees.min_250;
    breakdown.push({ label: `${emp} employees (≥250)`, points: weights.employees.min_250 });
  } else if (emp >= 100 && weights.employees.min_100) {
    score += weights.employees.min_100;
    breakdown.push({ label: `${emp} employees (≥100)`, points: weights.employees.min_100 });
  } else if (emp >= 50 && weights.employees.min_50) {
    score += weights.employees.min_50;
    breakdown.push({ label: `${emp} employees (≥50)`, points: weights.employees.min_50 });
  } else if (emp >= 25 && weights.employees.min_25) {
    score += weights.employees.min_25;
    breakdown.push({ label: `${emp} employees (≥25)`, points: weights.employees.min_25 });
  }

  // 3. Data completeness — the human caller needs these to actually reach the DM
  const hasMobile = Boolean(lead.apolloMobile?.trim() || lead.phone?.trim());
  if (hasMobile && weights.data.has_mobile) {
    score += weights.data.has_mobile;
    breakdown.push({ label: "Has mobile/phone", points: weights.data.has_mobile });
  }
  if (lead.email?.trim() && weights.data.has_email) {
    score += weights.data.has_email;
    breakdown.push({ label: "Has email", points: weights.data.has_email });
  }
  if (lead.address?.trim() && weights.data.has_address) {
    score += weights.data.has_address;
    breakdown.push({ label: "Has address", points: weights.data.has_address });
  }
  const hasDmTitle = Boolean(lead.contactTitle?.trim() || lead.decisionMakerName?.trim() || lead.decisionMakerEmail?.trim());
  if (hasDmTitle && weights.data.has_dm_title) {
    score += weights.data.has_dm_title;
    breakdown.push({ label: "Has DM title/contact", points: weights.data.has_dm_title });
  }

  // 4. Bucket
  let tier: "A" | "B" | "C";
  if (score >= thresholds.A) tier = "A";
  else if (score >= thresholds.B) tier = "B";
  else tier = "C";

  const reason = breakdown.length
    ? breakdown.map((b) => `${b.label} +${b.points}`).join(", ")
    : "No scoring signals matched — assigned default tier C";

  return { score, tier, reason, breakdown };
}

export async function scoreAndPersist(leadId: string, leadData: Lead): Promise<ScoreResult> {
  const { weights, thresholds } = await loadScoringConfig();
  const result = scoreLead({
    vertical: leadData.vertical,
    businessType: leadData.businessType,
    employeeCount: leadData.employeeCountNumeric ?? leadData.employeeCount,
    apolloMobile: leadData.apolloMobile,
    phone: leadData.phone,
    email: leadData.email,
    address: leadData.address,
    contactTitle: leadData.contactTitle,
    decisionMakerName: leadData.decisionMakerName,
    decisionMakerEmail: leadData.decisionMakerEmail,
  }, weights, thresholds);

  const supabase = createServerClient();
  await supabase.from("leads").update({
    tier: result.tier,
    tier_reason: result.reason,
    tier_score: result.score,
    updated_at: new Date().toISOString(),
  }).eq("id", leadId);

  return result;
}
