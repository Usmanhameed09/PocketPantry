/**
 * Product proposals + underperformer detection + replacements (Sprint 6).
 * Uses OpenAI GPT-4o for proposal reasoning. Same SDK setup as email-agent.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

async function callOpenAI(systemPrompt: string, userPayload: unknown): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

export type ProductProposal = {
  id: string;
  candidateName: string;
  category: string | null;
  reason: string | null;
  status: "Proposed" | "Approved" | "Rejected";
  suggestedInitialQty: number | null;
  targetLocations: string[];
  suggestedPriceMin: number | null;
  suggestedPriceMax: number | null;
  reasoningText: string | null;
  comparableSkuId: string | null;
  comparableSkuName: string | null;
  proposedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
};

async function findComparableSku(category: string): Promise<{ id: string; name: string; velocity: number; price: number } | null> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, default_vend_price, unit_cost")
    .eq("company_id", companyId)
    .eq("category", category)
    .eq("status", "Active")
    .limit(50);

  if (!products?.length) return null;

  // Pull last 4 weeks sales for these products
  const since = new Date();
  since.setDate(since.getDate() - 28);
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("product_id, qty")
    .eq("reason", "sale_estimate")
    .gte("created_at", since.toISOString())
    .in("product_id", products.map((p) => p.id as string));

  const byProduct = new Map<string, number>();
  for (const m of moves || []) {
    byProduct.set(m.product_id as string, (byProduct.get(m.product_id as string) || 0) + Math.abs(m.qty as number));
  }

  let best: { id: string; name: string; velocity: number; price: number } | null = null;
  for (const p of products) {
    const v = (byProduct.get(p.id as string) || 0) / 28;
    if (!best || v > best.velocity) {
      best = {
        id: p.id as string,
        name: p.name as string,
        velocity: v,
        price: (p.default_vend_price as number) || 0,
      };
    }
  }
  return best;
}

export async function createProposal(input: {
  candidateName: string;
  category: string;
  reason: string;
  proposedBy?: string;
}): Promise<ProductProposal> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const comparable = await findComparableSku(input.category);

  let reasoningText = "Proposal created.";
  let suggestedInitialQty: number | null = null;
  let suggestedPriceMin: number | null = null;
  let suggestedPriceMax: number | null = null;
  let targetLocations: string[] = [];

  // GPT-4o reasoning (via raw fetch — same pattern as email-agent.ts)
  try {
    const raw = await callOpenAI(
      "You are a vending-machine assortment advisor. Given a candidate product, return concise JSON only with keys: initialQty (integer 12-48), targetLocations (array of 2-4 short location descriptors), priceMin (decimal), priceMax (decimal), reasoning (one or two sentences).",
      {
        candidate: input.candidateName,
        category: input.category,
        reason: input.reason,
        comparable: comparable
          ? { name: comparable.name, daily_velocity: comparable.velocity, current_price: comparable.price }
          : null,
      }
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    suggestedInitialQty = Number(parsed.initialQty) || (comparable ? Math.ceil(comparable.velocity * 14) : 24);
    suggestedPriceMin = Number(parsed.priceMin) || (comparable ? comparable.price * 0.9 : null);
    suggestedPriceMax = Number(parsed.priceMax) || (comparable ? comparable.price * 1.2 : null);
    targetLocations = Array.isArray(parsed.targetLocations)
      ? (parsed.targetLocations as unknown[]).map(String).slice(0, 4)
      : [];
    reasoningText = String(parsed.reasoning || "GPT proposal generated.");
  } catch (err) {
    console.warn("[product-proposals] GPT-4o failed, using fallback:", err);
    suggestedInitialQty = comparable ? Math.ceil(comparable.velocity * 14) : 24;
    suggestedPriceMin = comparable ? Math.round(comparable.price * 0.9 * 100) / 100 : null;
    suggestedPriceMax = comparable ? Math.round(comparable.price * 1.2 * 100) / 100 : null;
    targetLocations = ["Top-velocity machine", "Mixed-traffic site", "Test pilot"];
    reasoningText = comparable
      ? `Based on ${comparable.name} (${comparable.velocity.toFixed(2)}/day), suggest 2-week test stock and ±10–20% of its current price.`
      : "No comparable product found — defaulting to conservative test stock.";
  }

  const { data, error } = await supabase
    .from("product_proposals")
    .insert({
      company_id: companyId,
      candidate_name: input.candidateName,
      category: input.category,
      reason: input.reason,
      status: "Proposed",
      suggested_initial_qty: suggestedInitialQty,
      target_locations: targetLocations,
      suggested_price_min: suggestedPriceMin,
      suggested_price_max: suggestedPriceMax,
      reasoning_text: reasoningText,
      comparable_sku_id: comparable?.id || null,
      proposed_by: input.proposedBy || null,
    })
    .select("*, products!product_proposals_comparable_sku_id_fkey(name)")
    .single();

  if (error || !data) throw new Error(`createProposal: ${error?.message}`);
  return rowToProposal(data);
}

function rowToProposal(row: Record<string, unknown>): ProductProposal {
  const comparable = row.products as { name?: string } | null;
  return {
    id: row.id as string,
    candidateName: row.candidate_name as string,
    category: (row.category as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    status: row.status as ProductProposal["status"],
    suggestedInitialQty: (row.suggested_initial_qty as number | null) ?? null,
    targetLocations: Array.isArray(row.target_locations) ? (row.target_locations as string[]) : [],
    suggestedPriceMin: (row.suggested_price_min as number | null) ?? null,
    suggestedPriceMax: (row.suggested_price_max as number | null) ?? null,
    reasoningText: (row.reasoning_text as string | null) ?? null,
    comparableSkuId: (row.comparable_sku_id as string | null) ?? null,
    comparableSkuName: comparable?.name ?? null,
    proposedBy: (row.proposed_by as string | null) ?? null,
    createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string | null) ?? null,
  };
}

export async function listProposals(): Promise<ProductProposal[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("product_proposals")
    .select("*, products!product_proposals_comparable_sku_id_fkey(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listProposals: ${error.message}`);
  return (data || []).map((r) => rowToProposal(r as Record<string, unknown>));
}

export async function decideProposal(
  proposalId: string,
  decision: "Approved" | "Rejected",
  decidedBy?: string
) {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data: proposal, error: pErr } = await supabase
    .from("product_proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle();
  if (pErr || !proposal) throw new Error("Proposal not found");

  let approvedProductId: string | null = null;

  if (decision === "Approved") {
    const sku = String(proposal.candidate_name).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 28);
    const { data: prod, error: prodErr } = await supabase
      .from("products")
      .insert({
        company_id: companyId,
        name: proposal.candidate_name,
        sku: `PROP-${sku}-${proposalId.slice(0, 4)}`,
        category: proposal.category || "Snacks",
        status: "Active",
        default_vend_price: proposal.suggested_price_max,
      })
      .select("id")
      .single();
    if (prodErr) throw new Error(`approveProposal create product: ${prodErr.message}`);
    approvedProductId = prod?.id as string;
  }

  const { error } = await supabase
    .from("product_proposals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy || null,
      approved_product_id: approvedProductId,
    })
    .eq("id", proposalId);
  if (error) throw new Error(`decideProposal: ${error.message}`);
}

// ──────────────── Underperformer detection ──────────────────────────

export type Underperformer = {
  productId: string;
  productName: string;
  category: string;
  unitsLast4Weeks: number;
  averageWeekly: number;
  margin: number | null;
  reason: string;
};

const WEEKLY_VOLUME_FLOOR = 5;     // less than 5 units/week for 4 weeks
const MARGIN_FLOOR_PCT = 25;       // margin < 25%

export async function findUnderperformers(): Promise<Underperformer[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, unit_cost, default_vend_price")
    .eq("company_id", companyId)
    .eq("status", "Active");
  if (!products?.length) return [];

  const since = new Date();
  since.setDate(since.getDate() - 28);
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("product_id, qty, created_at")
    .eq("reason", "sale_estimate")
    .gte("created_at", since.toISOString());

  const unitsByProduct = new Map<string, number>();
  for (const m of moves || []) {
    unitsByProduct.set(
      m.product_id as string,
      (unitsByProduct.get(m.product_id as string) || 0) + Math.abs(m.qty as number)
    );
  }

  const out: Underperformer[] = [];
  for (const p of products) {
    const units = unitsByProduct.get(p.id as string) || 0;
    const weekly = units / 4;
    const cost = (p.unit_cost as number) || 0;
    const price = (p.default_vend_price as number) || 0;
    const margin = price > 0 ? ((price - cost) / price) * 100 : null;

    const reasons: string[] = [];
    if (weekly < WEEKLY_VOLUME_FLOOR) reasons.push(`only ${weekly.toFixed(1)} units/week`);
    if (margin !== null && margin < MARGIN_FLOOR_PCT) reasons.push(`${margin.toFixed(0)}% margin`);
    if (reasons.length === 0) continue;

    out.push({
      productId: p.id as string,
      productName: p.name as string,
      category: p.category as string,
      unitsLast4Weeks: units,
      averageWeekly: Math.round(weekly * 10) / 10,
      margin: margin !== null ? Math.round(margin) : null,
      reason: reasons.join("; "),
    });
  }
  return out.sort((a, b) => a.averageWeekly - b.averageWeekly);
}

// ──────────────── Replacement plans ─────────────────────────────────

export async function createReplacementPlan(input: {
  oldProductId: string;
  newProductId: string;
  notes?: string;
}) {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { error: rpErr } = await supabase.from("replacement_plans").insert({
    company_id: companyId,
    old_product_id: input.oldProductId,
    new_product_id: input.newProductId,
    notes: input.notes || null,
  });
  if (rpErr) throw new Error(`createReplacementPlan: ${rpErr.message}`);

  // Old product moves to PhaseOut (still sellable, no longer in buy lists)
  await supabase
    .from("products")
    .update({ status: "PhaseOut" })
    .eq("id", input.oldProductId);
}

export type ReplacementPlanRow = {
  id: string;
  oldProductId: string;
  oldProductName: string;
  newProductId: string;
  newProductName: string;
  status: "Active" | "Completed" | "Cancelled";
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
};

export async function listReplacementPlans(): Promise<ReplacementPlanRow[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("replacement_plans")
    .select("id, old_product_id, new_product_id, status, started_at, completed_at, notes, old:products!replacement_plans_old_product_id_fkey(name), new:products!replacement_plans_new_product_id_fkey(name)")
    .eq("company_id", companyId)
    .order("started_at", { ascending: false });
  if (error) throw new Error(`listReplacementPlans: ${error.message}`);
  return (data || []).map((r) => ({
    id: r.id as string,
    oldProductId: r.old_product_id as string,
    oldProductName: ((r as Record<string, unknown>).old as { name?: string } | null)?.name || "—",
    newProductId: r.new_product_id as string,
    newProductName: ((r as Record<string, unknown>).new as { name?: string } | null)?.name || "—",
    status: r.status as ReplacementPlanRow["status"],
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));
}

// ──────────────── Trend tags ────────────────────────────────────────

export async function setProductTrendTags(productId: string, tags: string[], addedBy?: string) {
  const supabase = createServerClient();
  // Replace all tags for the product
  await supabase.from("product_trend_tags").delete().eq("product_id", productId);
  if (tags.length === 0) return;
  await supabase.from("product_trend_tags").insert(
    tags.map((t) => ({ product_id: productId, tag: t, added_by: addedBy || null }))
  );
}

export async function getProductTrendTags(productId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("product_trend_tags")
    .select("tag")
    .eq("product_id", productId);
  return (data || []).map((r) => r.tag as string);
}
