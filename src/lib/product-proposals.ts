/**
 * Product proposals + underperformer detection + replacements (Sprint 6).
 * Uses OpenAI GPT-4o for proposal reasoning. Same SDK setup as email-agent.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

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

// Vending velocities are low — most products sell well under 1 unit/day per
// machine. A "true" underperformer is one that doesn't even sell once a week
// across the entire fleet. Tunable via env if the operator's data is denser.
const WEEKLY_VOLUME_FLOOR = Number(process.env.UNDERPERFORMER_WEEKLY_FLOOR) || 0.5;
const MARGIN_FLOOR_PCT = Number(process.env.UNDERPERFORMER_MARGIN_FLOOR) || 25;
// Anything selling more than this many units a week is NOT an underperformer
// regardless of margin — the volume itself is the value. Without this cutoff
// the page flags fleet bestsellers (Monster, Celsius) just because their
// stored unit cost is a touch off and the margin reads ~10–20%. Operator
// feedback (2026-06): "Why is Monster at 50+ units an underperformer?".
const HIGH_VOLUME_EXEMPTION = Number(process.env.UNDERPERFORMER_HIGH_VOLUME) || 10;

export async function findUnderperformers(): Promise<Underperformer[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, unit_cost, default_vend_price")
    .eq("company_id", companyId)
    .eq("status", "Active");
  if (!products?.length) return [];

  // Velocity source: daily_sales (real per-day transaction log), NOT
  // machine_inventory.daily_sales_rate. Same fix as projection-engine —
  // the Nayax-derived rate field over-counts when summed across machines
  // and gives a fake "1/day forever" reading for one-time sales. With this
  // change underperformer counts match Reports for the same 30d window.
  const since = dateNDaysAgoInOperatorTz(30);
  // Pull a WIDE window (1 year) so we can measure each product's sales tenure
  // (first sale) and recency (last sale), not just the trailing 30 days. This
  // is what lets us honour Arthur's rules: a product needs ≥1 month of history
  // before it can be judged, and a product that's been out of every machine for
  // over a month is "removed", not "underperforming".
  const wideSince = dateNDaysAgoInOperatorTz(365);
  const dailyRows: Array<{ product_id: string; units_sold: number; sale_date: string }> = [];
  const PAGE = 1000;
  for (let from = 0; from < 500000; from += PAGE) {
    const { data, error } = await supabase
      .from("daily_sales")
      .select("product_id, units_sold, sale_date")
      .gte("sale_date", wideSince)
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    dailyRows.push(...(data as Array<{ product_id: string; units_sold: number; sale_date: string }>));
    if (data.length < PAGE) break;
  }

  // Per-product: 30-day units, first sale date, last sale date.
  const units30dByProduct = new Map<string, number>();
  const firstSaleByProduct = new Map<string, string>();
  const lastSaleByProduct = new Map<string, string>();
  for (const r of dailyRows) {
    const pid = r.product_id;
    if (r.sale_date >= since) {
      units30dByProduct.set(pid, (units30dByProduct.get(pid) || 0) + (r.units_sold || 0));
    }
    const f = firstSaleByProduct.get(pid);
    if (!f || r.sale_date < f) firstSaleByProduct.set(pid, r.sale_date);
    const l = lastSaleByProduct.get(pid);
    if (!l || r.sale_date > l) lastSaleByProduct.set(pid, r.sale_date);
  }

  // Which products are CURRENTLY loaded in at least one machine.
  const productsInAMachine = new Set<string>();
  for (let from = 0; from < 500000; from += PAGE) {
    const { data, error } = await supabase
      .from("machine_inventory")
      .select("product_id")
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ product_id: string }>) {
      if (r.product_id) productsInAMachine.add(r.product_id);
    }
    if (data.length < PAGE) break;
  }

  const thirtyDaysAgo = since; // ISO date string, operator tz

  const out: Underperformer[] = [];
  for (const p of products) {
    const pid = p.id as string;
    const units30d = units30dByProduct.get(pid) || 0;
    const daily = units30d / 30;
    const weekly = daily * 7;
    const cost = (p.unit_cost as number) || 0;
    const price = (p.default_vend_price as number) || 0;
    const margin = price > 0 ? ((price - cost) / price) * 100 : null;

    // Skip products with no sales in the window (no data ≠ underperforming)
    if (units30d === 0) continue;

    // ── Arthur's context rules ──────────────────────────────────────
    // (1) Require ≥1 month of sales history. A product first sold within the
    //     last 30 days is still being trialled — don't call it a failure yet.
    const firstSale = firstSaleByProduct.get(pid);
    if (!firstSale || firstSale > thirtyDaysAgo) continue;
    // (2) Exclude products that are effectively REMOVED: not currently in any
    //     machine AND no sale in the last 30 days. (Still-selling items stay.)
    const lastSale = lastSaleByProduct.get(pid) || "";
    if (!productsInAMachine.has(pid) && lastSale < thirtyDaysAgo) continue;

    // Skip high-volume movers entirely — see HIGH_VOLUME_EXEMPTION comment.
    if (weekly >= HIGH_VOLUME_EXEMPTION) continue;

    const reasons: string[] = [];
    if (weekly < WEEKLY_VOLUME_FLOOR) reasons.push(`only ${weekly.toFixed(1)} units/week (~${units30d}/month)`);

    // Negative margin = bad cost data (case price stored as unit cost, etc.),
    // NOT a real money-losing product. A bottle of Monster doesn't actually
    // cost 5x its sell price. Flag for low margin only if margin is positive
    // but below floor — that's a real "could earn more per unit" signal.
    // Reports already surfaces the bad-cost-data list via dataQuality.
    if (margin !== null && margin >= 0 && margin < MARGIN_FLOOR_PCT) {
      reasons.push(`${margin.toFixed(0)}% margin`);
    }

    if (reasons.length === 0) continue;

    out.push({
      productId: p.id as string,
      productName: p.name as string,
      category: p.category as string,
      unitsLast4Weeks: units30d,
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

// ──────────────── Trending discovery ────────────────────────────────
// Ask GPT-4o to suggest products that are trending in the broader market AND
// look like they'd be a good fit for this operator's catalog. The model sees
// the existing catalog (so it can avoid suggesting duplicates) plus a list
// of vending-relevant categories, and returns 5-8 candidates. We persist
// each one as a Proposed product_proposal so the operator can Approve/Reject
// from the Trending page like any other proposal.

export type TrendingCandidate = {
  candidateName: string;
  category: string;
  reason: string;
};

export async function discoverTrendingProducts(): Promise<number> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // Pull the existing catalog so the model can avoid duplicate suggestions.
  // We page through because there's a 1000-row cap.
  const existing: string[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("name")
      .eq("company_id", companyId)
      .neq("status", "Inactive")
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    existing.push(...data.map((d) => String(d.name)));
    if (data.length < PAGE) break;
  }

  // Cap the prompt size — we just need the model to AVOID suggesting these,
  // so a representative sample is fine.
  const sample = existing.slice(0, 250);

  let candidates: TrendingCandidate[] = [];
  try {
    const raw = await callOpenAI(
      `You are a vending-machine assortment advisor. Suggest 5-8 trending snack, candy, or beverage products that are
       currently popular in the US market based on social media trends, Google Trends, and grocery retail sell-through.
       Avoid suggesting anything already in the operator's catalog (case-insensitive substring match).
       Reply with JSON ONLY: { "candidates": [{ "candidateName": "...", "category": "Snacks|Candy|Drinks|Meals", "reason": "1 sentence why it's trending NOW" }] }`,
      { existingCatalogSample: sample }
    );
    const parsed = JSON.parse(raw) as { candidates?: unknown };
    if (Array.isArray(parsed.candidates)) {
      candidates = (parsed.candidates as Array<Record<string, unknown>>)
        .map((c) => ({
          candidateName: String(c.candidateName || "").trim(),
          category: String(c.category || "Snacks"),
          reason: String(c.reason || "").trim(),
        }))
        .filter((c) => c.candidateName.length > 0);
    }
  } catch (err) {
    console.warn("[trending] GPT-4o failed:", err);
    return 0;
  }

  if (candidates.length === 0) return 0;

  // Don't insert duplicates of existing proposals or catalog items
  const existingLower = new Set(existing.map((n) => n.toLowerCase()));
  const { data: openProposals } = await supabase
    .from("product_proposals")
    .select("candidate_name")
    .eq("company_id", companyId)
    .eq("status", "Proposed");
  for (const p of openProposals || []) {
    existingLower.add(String(p.candidate_name).toLowerCase());
  }

  let added = 0;
  for (const c of candidates) {
    if (existingLower.has(c.candidateName.toLowerCase())) continue;
    try {
      await createProposal({
        candidateName: c.candidateName,
        category: c.category,
        reason: c.reason || "Trending in the broader market",
        proposedBy: "ai-trending",
      });
      added++;
      existingLower.add(c.candidateName.toLowerCase());
    } catch (err) {
      console.warn("[trending] insert failed:", err);
    }
  }
  return added;
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
