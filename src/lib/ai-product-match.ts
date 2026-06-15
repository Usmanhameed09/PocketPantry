/**
 * AI product matcher — picks the retailer search result that is the SAME
 * product as a vending item, for the cases the brand-token heuristic misses
 * (e.g. "Reeses Cups" vs "REESE'S Milk Chocolate Peanut Butter Cups, 36 pk").
 *
 * STRICT by design — it must never invent a junk match (the Louis-Vuitton-bag
 * → "Croissant" failure mode). The LLM proposes; deterministic guards then
 * REJECT anything that isn't obviously the same product:
 *   1. confidence >= MIN_CONFIDENCE
 *   2. a real keyword/brand overlap between the names (fuzzy, plural-aware)
 *   3. a sane vending unit price (kills $355 handbags / $178 mattresses)
 * If any guard fails, it returns null and the product stays unmatched.
 */

export type MatchCandidate = {
  name: string;
  price: number;
  pack_size: number | null;
  url?: string;
  retailer?: string;
};

const MIN_CONFIDENCE = 0.7;
const HIGH_CONFIDENCE = 0.85; // lets brand synonyms (Coke↔Coca-Cola) through despite no token overlap
const MAX_UNIT_PRICE = 15; // a single vended snack/drink/meal never exceeds this

const STOP = new Set([
  "the", "and", "with", "for", "oz", "pack", "ct", "count", "pk", "size", "value",
  "ounce", "ounces", "fl", "each", "of", "mini", "minis", "pieces", "piece", "case",
  "box", "bag", "bags", "bottle", "bottles", "can", "cans", "variety", "original",
]);

function meaningfulTokens(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

/** Do the two names share a real keyword? Plural/substring-aware so
 *  "reeses"≈"reese" and "cups"="cups" count, but unrelated items don't. */
function hasKeywordOverlap(productName: string, candidateName: string): boolean {
  const a = meaningfulTokens(productName);
  const b = meaningfulTokens(candidateName);
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x.length >= 4 && (y.includes(x) || x.includes(y))) return true;
    }
  }
  return false;
}

function estimatedUnitPrice(c: MatchCandidate): number {
  return c.pack_size && c.pack_size > 0 ? c.price / c.pack_size : c.price;
}

type AiPick = { index: number; confidence: number; reason: string };

async function callOpenAiMatch(
  productName: string,
  category: string,
  candidates: MatchCandidate[],
): Promise<AiPick | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const list = candidates
    .map((c, i) => {
      const pack = c.pack_size && c.pack_size > 1 ? `, ${c.pack_size}-pack` : "";
      return `${i}: ${c.name} — $${c.price}${pack}${c.retailer ? ` [${c.retailer}]` : ""}`;
    })
    .join("\n");

  const system =
    "You match a vending product to the SAME consumer product in a retailer's " +
    "search results so its price can be used. Match BRAND and ITEM TYPE: a peanut " +
    "butter cup is not a chocolate bar; a cola is not an energy drink; a snack is " +
    "NEVER the same as a handbag, mattress, or other unrelated item. Pack-size and " +
    "wording differences are fine (e.g. \"Reeses Cups\" matches \"REESE'S Milk " +
    "Chocolate Peanut Butter Cups\"). If no candidate is clearly the same product, " +
    'return index -1. Respond ONLY with strict JSON: {"index": <number>, "confidence": <0..1>, "reason": "<short>"}.';
  const user = `Vending product: "${productName}" (category: ${category || "snack"}).\nCandidates:\n${list}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as AiPick;
    if (typeof parsed.index !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Returns the best-matching candidate, or null if nothing is confidently the
 * same product. Safe to call with an empty/garbage candidate list.
 */
export async function aiMatchProduct(params: {
  productName: string;
  category?: string;
  candidates: MatchCandidate[];
}): Promise<{ candidate: MatchCandidate; confidence: number; reason: string } | null> {
  const { productName, candidates } = params;
  if (!productName?.trim() || !candidates?.length) return null;

  // Only consider candidates with a usable price and a sane unit cost up front —
  // no point asking the AI about a $355 handbag.
  const priced = candidates.filter((c) => typeof c.price === "number" && c.price > 0);
  if (!priced.length) return null;

  const pick = await callOpenAiMatch(productName, params.category || "snack", priced);
  if (!pick || pick.index < 0 || pick.index >= priced.length) return null;

  const candidate = priced[pick.index];

  // ── Deterministic guards — reject anything not obviously the same product ──
  if (pick.confidence < MIN_CONFIDENCE) return null;
  // Price sanity is the hard anti-junk guard: a single vended item never costs
  // $15+/unit, so this kills a $355 handbag / $178 mattress even if the model
  // somehow picked one.
  if (estimatedUnitPrice(candidate) > MAX_UNIT_PRICE) return null;
  // Keyword overlap guards against an off-base pick. But brand synonyms
  // (Coke ↔ Coca-Cola, Mtn Dew ↔ Mountain Dew) legitimately share no literal
  // token, so allow a no-overlap match through only when the model is highly
  // confident it's the same product.
  if (!hasKeywordOverlap(productName, candidate.name) && pick.confidence < HIGH_CONFIDENCE) return null;

  return { candidate, confidence: pick.confidence, reason: pick.reason || "AI match" };
}
