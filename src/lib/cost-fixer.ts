/**
 * Cost Fixer — detects unit-cost-vs-case-cost mismatches and proposes
 * corrected unit costs.
 *
 * The problem: scrapers sometimes pull a CASE price (e.g. $24.99 for a
 * 36-pack of Twix) and store it as the UNIT cost. Margins go wild
 * (negative -1500%), Buy List math breaks, Pricing suggestions are off.
 *
 * Detection layers:
 *   1. cheap heuristic — `unit_cost > 1.2 × avg revenue/unit` (already used
 *      by the Exception Queue's suspicious_cost rule).
 *   2. structural pattern — cost > $5 for a snack/candy/drink unit is
 *      almost always a case price (real snack units cost $0.20-$1.50).
 *
 * Fix layers:
 *   1. If products.case_size > 1, just divide: corrected = cost / case_size.
 *      Zero AI cost, deterministic.
 *   2. If case_size = 1 or absent, parse the product name for pack hints
 *      ("36 ct", "12 pack", "case of 24"). If found, divide.
 *   3. If still no pack info, ask GPT-4o using the product name + price +
 *      avg vend price. AI returns
 *        { isCasePrice, suggestedUnitCost, packSize, confidence, reasoning }
 *      Confidence ≥ 0.8 → auto-stage the fix. Lower → flag for review.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export type CostFixProposal = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  currentCost: number;
  vendPrice: number | null;
  avgRevPerUnit: number | null;
  caseSize: number;
  suggestedCost: number;
  inferredPackSize: number | null;
  confidence: number; // 0..1
  method: "case_size_divide" | "title_parse" | "ai" | "ai_low_confidence";
  reasoning: string;
};

const CASE_SIZE_FROM_TITLE_RE =
  /\b(?:(\d{1,3})\s*(?:ct|count|pack|pk|pcs|piece|case|cs|box|tin))\b|\b(?:case\s*of\s*(\d{1,3}))\b|\b(\d{1,3})\s*[-\s]?(?:pack)\b/i;

function parsePackSizeFromTitle(name: string): number | null {
  const m = name.match(CASE_SIZE_FROM_TITLE_RE);
  if (!m) return null;
  const n = Number(m[1] || m[2] || m[3]);
  // Sanity bounds: vending products almost never come in cases > 144 or
  // smaller than 4.
  if (!Number.isFinite(n) || n < 4 || n > 144) return null;
  return n;
}

// Cheap structural check: vending UNIT costs are tiny. A candy bar costs
// $0.50, a soda $0.40-$0.80, a meal $2-$4. Anything > $5 stored as a unit
// cost is almost certainly a case price.
function looksLikeCasePrice(category: string, cost: number): boolean {
  const c = category.toLowerCase();
  if (c.includes("meal")) return cost > 8;
  return cost > 5;
}

export async function scanSuspiciousProducts(): Promise<
  Array<{
    productId: string;
    productName: string;
    sku: string;
    category: string;
    cost: number;
    vendPrice: number | null;
    avgRevPerUnit: number | null;
    caseSize: number;
    productInMachine: boolean;
  }>
> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // Pull all active products in pages (1000 row cap)
  type Row = {
    id: string;
    name: string;
    sku: string;
    category: string;
    unit_cost: number | null;
    default_vend_price: number | null;
    case_size: number | null;
  };
  const products: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 50000; from += PAGE) {
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, category, unit_cost, default_vend_price, case_size")
      .eq("company_id", companyId)
      .eq("status", "Active")
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    products.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }

  // 30d sales for avg revenue/unit
  const since = dateNDaysAgoInOperatorTz(30);
  const { data: salesRows } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue")
    .gte("sale_date", since)
    .range(0, 49999);
  const salesByProduct = new Map<string, { units: number; revenue: number }>();
  for (const r of salesRows || []) {
    const pid = r.product_id as string;
    const e = salesByProduct.get(pid) || { units: 0, revenue: 0 };
    e.units += (r.units_sold as number) || 0;
    e.revenue += (r.revenue as number) || 0;
    salesByProduct.set(pid, e);
  }

  // Machine presence — if not in a machine and never sold, ignore
  const { data: machineInv } = await supabase
    .from("machine_inventory")
    .select("product_id")
    .range(0, 9999);
  const inMachineSet = new Set((machineInv || []).map((m) => m.product_id as string));

  const suspicious: Awaited<ReturnType<typeof scanSuspiciousProducts>> = [];
  for (const p of products) {
    const cost = p.unit_cost;
    if (cost == null || cost <= 0) continue;
    const recent = salesByProduct.get(p.id);
    const inMachine = inMachineSet.has(p.id);
    if (!inMachine && (!recent || recent.units === 0)) continue;

    const avgRev = recent && recent.units > 0 ? recent.revenue / recent.units : null;
    const vendPrice = p.default_vend_price;
    const category = p.category || "Snacks";

    // Two signals — either is enough to flag.
    const sig1 = avgRev != null && cost > avgRev * 1.2;
    const sig2 = looksLikeCasePrice(category, cost);
    const sig3 = vendPrice != null && vendPrice > 0 && cost > vendPrice * 1.2;
    if (!sig1 && !sig2 && !sig3) continue;

    suspicious.push({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      category,
      cost,
      vendPrice,
      avgRevPerUnit: avgRev,
      caseSize: p.case_size || 1,
      productInMachine: inMachine,
    });
  }
  return suspicious;
}

async function aiProposeUnitCost(input: {
  name: string;
  storedCost: number;
  vendPrice: number | null;
  avgRevPerUnit: number | null;
  category: string;
}): Promise<{
  isCasePrice: boolean;
  suggestedUnitCost: number;
  packSize: number | null;
  confidence: number;
  reasoning: string;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const sys =
    "You are a vending-machine product cost auditor. Decide whether the " +
    "stored cost for a product is the UNIT price or a CASE price. Vending " +
    "products usually cost $0.20–$2.00 per unit. Cases of 12, 24, 36, or " +
    "even 48 are common. Use the product name (which often includes pack " +
    "hints like '12 oz', '36 ct', '24 pack'), the stored cost, and the " +
    "vending selling price (a hint at the real economics). Reply with " +
    "JSON only.";
  const user = {
    name: input.name,
    category: input.category,
    storedUnitCost: input.storedCost,
    defaultVendPrice: input.vendPrice,
    avgRevenuePerUnitFromSales: input.avgRevPerUnit,
    instruction:
      "Return { isCasePrice: bool, suggestedUnitCost: number, packSize: number|null, confidence: 0..1, reasoning: string }. " +
      "If you're confident the stored cost is a case price, packSize is how many units the case contains. " +
      "If the stored cost is already correct, isCasePrice = false and suggestedUnitCost = storedUnitCost.",
  };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(user) },
        ],
        max_tokens: 250,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const suggested = Number(parsed.suggestedUnitCost);
    if (!Number.isFinite(suggested) || suggested <= 0) return null;
    return {
      isCasePrice: Boolean(parsed.isCasePrice),
      suggestedUnitCost: Math.round(suggested * 100) / 100,
      packSize:
        parsed.packSize != null && Number.isFinite(Number(parsed.packSize))
          ? Number(parsed.packSize)
          : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reasoning: String(parsed.reasoning || ""),
    };
  } catch {
    return null;
  }
}

export async function proposeCostFix(input: {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  cost: number;
  vendPrice: number | null;
  avgRevPerUnit: number | null;
  caseSize: number;
}): Promise<CostFixProposal | null> {
  const { productId, productName, sku, category, cost, vendPrice, avgRevPerUnit, caseSize } = input;

  // Layer 1 — case_size already set, deterministic
  if (caseSize > 1) {
    const suggested = Math.round((cost / caseSize) * 100) / 100;
    return {
      productId,
      productName,
      sku,
      category,
      currentCost: cost,
      vendPrice,
      avgRevPerUnit,
      caseSize,
      suggestedCost: suggested,
      inferredPackSize: caseSize,
      confidence: 1.0,
      method: "case_size_divide",
      reasoning: `case_size = ${caseSize} on the product. Divided stored cost by case size.`,
    };
  }

  // Layer 2 — parse pack size from title
  const titlePack = parsePackSizeFromTitle(productName);
  if (titlePack && titlePack > 1) {
    const suggested = Math.round((cost / titlePack) * 100) / 100;
    return {
      productId,
      productName,
      sku,
      category,
      currentCost: cost,
      vendPrice,
      avgRevPerUnit,
      caseSize,
      suggestedCost: suggested,
      inferredPackSize: titlePack,
      confidence: 0.9,
      method: "title_parse",
      reasoning: `Found "${titlePack}" pack hint in product name. Divided stored cost by ${titlePack}.`,
    };
  }

  // Layer 3 — AI
  const ai = await aiProposeUnitCost({
    name: productName,
    storedCost: cost,
    vendPrice,
    avgRevPerUnit,
    category,
  });
  if (!ai) {
    return {
      productId,
      productName,
      sku,
      category,
      currentCost: cost,
      vendPrice,
      avgRevPerUnit,
      caseSize,
      suggestedCost: cost,
      inferredPackSize: null,
      confidence: 0,
      method: "ai_low_confidence",
      reasoning: "AI call failed or unavailable — needs human review.",
    };
  }
  if (!ai.isCasePrice || ai.suggestedUnitCost >= cost * 0.95) {
    // AI says the stored cost is fine — don't propose a fix.
    return null;
  }
  return {
    productId,
    productName,
    sku,
    category,
    currentCost: cost,
    vendPrice,
    avgRevPerUnit,
    caseSize,
    suggestedCost: ai.suggestedUnitCost,
    inferredPackSize: ai.packSize,
    confidence: ai.confidence,
    method: ai.confidence >= 0.8 ? "ai" : "ai_low_confidence",
    reasoning: ai.reasoning || "AI proposed correction.",
  };
}

export async function applyCostFix(
  productId: string,
  newUnitCost: number,
  caseSize?: number | null,
  actor?: string | null,
  notes?: string | null,
): Promise<void> {
  const supabase = createServerClient();
  const { data: oldRow } = await supabase
    .from("products")
    .select("name, unit_cost, case_size")
    .eq("id", productId)
    .maybeSingle();
  const update: Record<string, unknown> = { unit_cost: newUnitCost };
  if (caseSize && caseSize > 1) update.case_size = caseSize;
  const { error } = await supabase.from("products").update(update).eq("id", productId);
  if (error) throw new Error(`applyCostFix: ${error.message}`);

  // Audit log — cost-fixer is exactly the kind of "owner wants to know
  // who changed cost from $X to $Y" event the client asked for.
  const { recordAuditEvent } = await import("@/lib/audit-log");
  await recordAuditEvent({
    actionType: "cost_change",
    entityType: "product",
    entityId: productId,
    entityName: (oldRow?.name as string) || productId,
    actor: actor ?? "cost-fixer",
    oldValue: { unit_cost: oldRow?.unit_cost ?? null, case_size: oldRow?.case_size ?? null },
    newValue: { unit_cost: newUnitCost, case_size: caseSize ?? oldRow?.case_size ?? null },
    notes: notes || "Applied via Cost Fixer",
  });
}

// Hard cap for the scan endpoint so a runaway doesn't burn unbounded
// OpenAI tokens. Operators can re-run after addressing the first batch.
export const COST_FIXER_BATCH_CAP = 50;

export async function buildCostFixProposals(limit?: number): Promise<{
  proposals: CostFixProposal[];
  totalSuspicious: number;
}> {
  const suspicious = await scanSuspiciousProducts();
  const cap = Math.min(limit ?? COST_FIXER_BATCH_CAP, COST_FIXER_BATCH_CAP);
  const slice = suspicious.slice(0, cap);
  // Sequential to keep OpenAI usage predictable. Most slots use the
  // deterministic Layer 1/2 path anyway (no API calls).
  const proposals: CostFixProposal[] = [];
  for (const s of slice) {
    const p = await proposeCostFix({
      productId: s.productId,
      productName: s.productName,
      sku: s.sku,
      category: s.category,
      cost: s.cost,
      vendPrice: s.vendPrice,
      avgRevPerUnit: s.avgRevPerUnit,
      caseSize: s.caseSize,
    });
    if (p) proposals.push(p);
  }
  return { proposals, totalSuspicious: suspicious.length };
}

// ─────────────────────────────────────────────────────────────────────
// Phase 2 — scrape-time guard
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate (and possibly correct) a freshly-scraped supplier price BEFORE
 * it lands in the pricing catalog. Apply this in live-pricing-catalog's
 * save path so future scrapes can't pollute the catalog with case prices.
 *
 * Returns the corrected unit cost + how it was corrected. If no fix is
 * possible (low confidence + no heuristic), returns the raw cost with
 * `flag = true` so the caller can mark it for human review.
 */
export async function guardScrapedUnitCost(input: {
  productName: string;
  category?: string | null;
  scrapedUnitCost: number;
  packSize?: number | null;
  packPrice?: number | null;
  vendPrice?: number | null;
}): Promise<{
  unitCost: number;
  flag: boolean;
  source: "raw" | "pack_size_divide" | "title_parse" | "ai" | "ai_low_confidence";
  reasoning: string;
}> {
  const { productName, scrapedUnitCost, packSize, packPrice, vendPrice } = input;
  const category = input.category || "Snacks";

  // Trust an explicit pack size if it landed in the scrape — the source
  // page clearly told us this is N units.
  if (packSize && packSize > 1 && packPrice && packPrice > 0) {
    return {
      unitCost: Math.round((packPrice / packSize) * 100) / 100,
      flag: false,
      source: "pack_size_divide",
      reasoning: `Scraper provided packSize=${packSize}, packPrice=$${packPrice}. unit = packPrice/packSize.`,
    };
  }

  // Look at the cost on its own. If it doesn't look like a case price by
  // any signal, accept it as-is.
  const looksCase =
    looksLikeCasePrice(category, scrapedUnitCost) ||
    (vendPrice && vendPrice > 0 && scrapedUnitCost > vendPrice * 1.2);
  if (!looksCase) {
    return {
      unitCost: scrapedUnitCost,
      flag: false,
      source: "raw",
      reasoning: "Stored cost looks like a normal unit price; no correction needed.",
    };
  }

  // Smells like a case price. Try the title parser.
  const titlePack = parsePackSizeFromTitle(productName);
  if (titlePack && titlePack > 1) {
    return {
      unitCost: Math.round((scrapedUnitCost / titlePack) * 100) / 100,
      flag: false,
      source: "title_parse",
      reasoning: `Found "${titlePack}" pack hint in product name; dividing cost by ${titlePack}.`,
    };
  }

  // Ask AI as the last layer.
  const ai = await aiProposeUnitCost({
    name: productName,
    storedCost: scrapedUnitCost,
    vendPrice: vendPrice ?? null,
    avgRevPerUnit: null,
    category,
  });
  if (!ai) {
    return {
      unitCost: scrapedUnitCost,
      flag: true,
      source: "ai_low_confidence",
      reasoning: "Cost looks suspicious but AI unavailable — flagged for review.",
    };
  }
  if (!ai.isCasePrice) {
    return {
      unitCost: scrapedUnitCost,
      flag: false,
      source: "ai",
      reasoning: `AI: ${ai.reasoning}`,
    };
  }
  if (ai.confidence >= 0.8) {
    return {
      unitCost: ai.suggestedUnitCost,
      flag: false,
      source: "ai",
      reasoning: `AI (confidence ${ai.confidence}): ${ai.reasoning}`,
    };
  }
  return {
    unitCost: scrapedUnitCost,
    flag: true,
    source: "ai_low_confidence",
    reasoning: `AI uncertain (confidence ${ai.confidence}): ${ai.reasoning}. Flagged for review.`,
  };
}
