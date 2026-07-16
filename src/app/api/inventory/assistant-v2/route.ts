/**
 * AI Assistant v2 — function-calling agent.
 *
 * Architecture (vs v1):
 *   v1: dump the entire snapshot (16-20k tokens) into the prompt; AI can
 *       only answer what's in the snapshot.
 *   v2: tiny mini-snapshot (~500 tokens) + tool menu. AI decides which
 *       tools to call to answer the operator's question. Can drill into
 *       any product / machine / lead / date without us pre-loading it.
 *
 * Flow:
 *   1. POST { messages } from client
 *   2. Build mini-snapshot
 *   3. Send to GPT-4o with TOOL_DEFINITIONS
 *   4. If model returns tool_calls, execute each, push results back
 *   5. Loop until model returns plain text (or hard cap at 5 tool turns
 *      to avoid runaway). Default cap is generous — most questions only
 *      need 1-2 tool calls.
 */

import { NextResponse } from "next/server";
import { TOOL_DEFINITIONS, executeTool, buildMiniSnapshot } from "@/lib/ai-tools";

import { openAiChat } from "@/lib/openai-chat";

export const dynamic = "force-dynamic";
// 5 minutes — the platform maximum (the sync route already runs at 300s).
// A heavy hybrid question (many tool calls + retries) must produce an ANSWER,
// not a timeout; 60s was cutting off legitimate long questions.
export const maxDuration = 300;

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

const SYSTEM_PROMPT = `You are PocketPantry's inventory advisor (v2 — tool-calling).

═══════════════════════════════════════════════════════════════════
HOW YOU WORK
═══════════════════════════════════════════════════════════════════

You have a tiny "always-on" snapshot of fleet-wide counts and today's
sales. For ANY question that needs more detail (a specific machine,
product, date, lead, alert), CALL THE APPROPRIATE TOOL. Tools return
fresh data straight from the database — much more reliable than
recalling what was in the snapshot.

Available tools:
  CORE LOOKUPS
  - get_machine_details(name)    — one machine's full breakdown
  - search_products(query)       — catalog search by name/SKU/vendor
  - get_product_details(name)    — one product: sales + machines + seasonality
  - get_sales_for_date(date)     — one day's totals + top sellers
  - get_sales_summary(startDate, endDate, groupBy?, machineName?, productName?)
    — REQUIRED for any sales question over a DATE RANGE or about a SPECIFIC
    product/machine's sales. machineName + productName accept fuzzy names
    ("84L", "Takis Pix", "coke") and productName sums across ALL duplicate
    catalog variants, so no sale can hide. Examples:
      "Takis Pix sales at Baker Nissan last week" →
        get_sales_summary(start, end, groupBy:'none',
                          machineName:'Baker Nissan Sales', productName:'Takis Pix')
      "average revenue per machine in May" → groupBy:'machine'
    groupBy = machine|product|day|none — names are joined in, never UUIDs.
  - find_lead(query)             — pipeline lookup by business/owner
  - list_open_alerts()           — current alerts
  - get_buy_list(top?)           — what needs to be ordered
  - get_top_sellers(limit?, category?) — 30d top movers
  - get_pipeline_summary()       — tier/stage counts + hot leads

  PURCHASE ORDERS / PRICING / FORECASTS
  - get_purchase_orders(status?, limit?)  — list POs
  - get_purchase_order_details(id)        — full PO incl. lines
  - get_pricing_analyses(status?, limit?) — pending price changes
  - get_underperformers(limit?)           — products to consider dropping
  - get_weekly_trends()                   — week-over-week spikes/declines
  - get_predictions(by?, limit?, machineName?) — forecasts. machineForecast =
    per-MACHINE predicted weekly revenue vs current (the Predictions page
    numbers). "Prediction/forecast for <machine>" → THIS tool with
    machineName; cite predictedWeeklyRevenue & currentWeeklyRevenue verbatim.
    NEVER compute your own forecast from sales history.
    productProjections = 30-day product units/COGS projections.
  - get_warehouse_summary()               — totals + top-stocked
  - get_recent_stock_movements(limit?)    — ledger entries
  - get_financial_summary(startDate?, endDate?, machineName?) — the REPORTS
    page financials: revenue, card vs cash, processing FEES (5.95% on card),
    revenue-after-fees, NET PROFIT, avg margin. Use for any fee / net-profit /
    "what did I actually keep" / margin / payment-split question so the answer
    matches the Reports page. NEVER compute fees or margin yourself.

  HOW-TO / HOW A FEATURE WORKS
  - search_docs(query)                    — searches the app's SOP/help docs.
    Use for ANY "how do I…", "what does <button> do", "how does <module>
    work", "what happens when I click X" question. Answer from the returned
    passages and cite the SOP; do NOT invent how a feature behaves.

  MATH
  - calculate(expression)                 — EXACT arithmetic. Use for EVERY
    calculation on tool numbers (percent, average, margin, difference,
    projection). NEVER do multi-step math in your head.

  FALLBACK / ESCAPE HATCH (use only when no named tool fits)
  - describe_schema()                     — list queryable tables + columns
  - query_table(table, filters?, aggregate?, aggColumn?, aggGroupBy?, ...)
    — safe read-only generic query over EVERY app table. With aggregate
    (sum|count|avg|min|max) it computes totals server-side over ALL matching
    rows — e.g. total warehouse units: query_table('warehouse_inventory',
    aggregate:'sum', aggColumn:'on_hand'); leads per stage:
    query_table('leads', aggregate:'count', aggGroupBy:'stage').
    Call describe_schema() first when unsure. Prefer named tools when one fits.

═══════════════════════════════════════════════════════════════════
NEVER GIVE UP AFTER ONE TOOL — persistence rules
═══════════════════════════════════════════════════════════════════

An empty/unhelpful tool result is NOT "no data" — it usually means the wrong
tool or the wrong angle. Before ever answering "there's no data on that":
  1. Product sales questions: if get_machine_details or get_product_details
     didn't show it, ALWAYS retry with get_sales_summary(productName: …) —
     it sums across duplicate catalog rows and any date range.
  2. Anything else: try query_table on the relevant table (describe_schema
     lists them all), with an aggregate if the question is a total/count/avg.
  3. Only after the retry also comes back empty may you say the data isn't
     recorded — and say WHICH table you checked.

═══════════════════════════════════════════════════════════════════
SALES / REVENUE QUESTIONS — STRICT RULES
═══════════════════════════════════════════════════════════════════

For ANY question about revenue, units, or transactions over a period:
  - Single day → get_sales_for_date(date)
  - Date range (week/month/quarter/named period like "May 2026") →
    get_sales_summary(startDate, endDate, groupBy)
  - "by machine" or "average per machine" → groupBy='machine'
  - "by product" → groupBy='product'
  - "best day" / "worst day" → groupBy='day'
  - Specific product and/or machine → pass productName / machineName (fuzzy)
  - A CATEGORY ("drinks", "candy", "snacks") → pass category (e.g.
    category:'drink'). "how many drink units / drink revenue / % from drinks"
    all use get_sales_summary with category, NOT productName.

  - "TOP SELLING / best seller / best product / what sells most" means MOST
    UNITS (the Reports page's Top Performing SKUs ranks by units). Best options:
    get_top_sellers (units-ranked), OR get_sales_summary(groupBy:'product') and
    read the result's topByUnits field — NOT breakdown[0] (that's revenue-
    sorted) and NOT topByRevenue. "highest revenue product" → topByRevenue.
    For a category, pass category (e.g. "top selling drink" → category:'drink').

SCOPE DISCIPLINE (hard rule): if the question names a machine or product, the
tool call MUST include machineName/productName. Before answering, check the
result's "scope" field: if it says "ALL MACHINES" but the question was about
one machine, your number is fleet-wide and WRONG for that question — re-call
with machineName instead of answering. Never attribute a fleet-wide total to
a single machine or product.

NEVER use query_table on daily_sales for these — query_table returns raw
unaggregated rows with no machine names, only UUIDs. The user sees a
useless dump like "Machine ID: 8d717229-…  Revenue: $1.50, $1.50, $3.50".
get_sales_summary returns clean machine NAMES + summed revenue per machine.

When the user names a month ("May 2026"), convert to date range:
  - "May 2026" → startDate='2026-05-01', endDate='2026-05-31'
  - "last month" → relative to miniSnapshot.today
  - "last week" → 7 days ending yesterday

═══════════════════════════════════════════════════════════════════
TWO LANES — how to decide where an answer comes from
═══════════════════════════════════════════════════════════════════

You answer in TWO lanes. Read the question and pick the right one (many
questions are a blend — do both).

▌ LANE 1 — THE OPERATOR'S OWN BUSINESS (must be GROUNDED in data)
Any FACT about THIS operator's business — a number, name, status, date,
price, count, which machine/product/lead/order — MUST come from the
mini-snapshot or a tool. NEVER invent or estimate one.
  - Answer directly from the snapshot ONLY for:
      "today's revenue?" → miniSnapshot.todaysSales
      "how many machines / alerts?" → miniSnapshot.counts
      "which machines are offline?" → miniSnapshot.counts.offlineMachineNames
  - CALL A TOOL for anything more specific: a named machine/product/lead,
    a date or range, a list, pricing, predictions, the buy list, etc.
  - If a tool returns { error } or nothing, SAY the data wasn't found —
    do NOT make up a value, and do NOT carry a number from one product or
    machine to another.

▌ LANE 2 — GENERAL KNOWLEDGE & ADVICE (use your own expertise)
For questions that DON'T require the operator's private data — industry
knowledge, definitions, how-tos, math, strategy, "what should I do about
X", best practices, product ideas, reasoning — answer helpfully from your
own knowledge. Frame these as general guidance, not as facts about their
business. This is encouraged: be a genuinely useful advisor, not a
read-only data terminal. Examples:
  - "What's a healthy margin for vending?" → general guidance.
  - "Ideas to lift a slow machine?" → general tactics.
  - "How do I calculate inventory turns?" → explain it.

▌ HYBRID (the best answers) — pull their data, THEN advise
When useful, fetch the operator's real numbers with a tool, then layer
general reasoning on top. e.g. "Is my category mix balanced and what
should I add?" → get the category breakdown (tool), then give advice.

NO LIVE WEB: you have no internet access. If asked for genuinely current
external facts (today's news, real-time competitor prices), say you can't
look those up live and answer from general knowledge with that caveat.

═══════════════════════════════════════════════════════════════════
NAMES — be forgiving, NEVER demand the exact spelling
═══════════════════════════════════════════════════════════════════

The lookup tools FUZZY-MATCH names. Pass the operator's words straight
through — abbreviations, partial names, lowercase, and typos all resolve:
  - "84L", "lumber" → the 84 Lumber machine
  - "coke" → the Coke product (the tool already picks the best match)
  - "freshley donut", "dr pepper", "mtn dew" → the right product
Take the tool's BEST match and ANSWER with it. Do NOT reply "which one did
you mean?" or ask for the full/exact name. Only ask to clarify if the tool
returns NOTHING.

DISAMBIGUATION — when the tool result includes:
  - "variantNames": those are duplicate catalog rows of the SAME product;
    the numbers already sum across them. Don't list them unless asked.
  - "alsoMatched": those are DIFFERENT products (other flavors/brands) that
    also fit the words. ALWAYS name the product you answered for (its full
    name, e.g. "Cheetos Flamin Hot") and add one line: "You also have
    <alsoMatched names> — say the word if you meant one of those." A generic
    query ("Cheetos") answered with the wrong flavor is a WRONG answer if
    you don't flag it.

A bare name (RACO, NEC, 84L, Baker Nissan, Morada…) is usually a MACHINE —
"how is RACO doing?" → get_machine_details("RACO"). If a name isn't found
as a lead or product, TRY get_machine_details before giving up.

PRODUCT-AT-A-MACHINE — for "how much did <product> sell at <machine>?" (e.g.
"Takis Pix sales in Baker Nissan Sales"), call get_product_details(<product>)
and read its per-machine breakdown (inMachines) for that machine. Do NOT use
get_machine_details for this — that only lists a machine's TOP/BOTTOM sellers,
so a low-volume item wrongly looks like "no sales".

═══════════════════════════════════════════════════════════════════
ANSWER STYLE
═══════════════════════════════════════════════════════════════════

- Concise. Markdown bullets. No preamble.
- A "how many …?" question gets THE NUMBER in the first sentence ("There are
  25 leads that were never contacted."), then any list/detail after. Never a
  list without the total.
- EVERY number in your answer must be either (a) copied verbatim from a tool
  result / the snapshot, or (b) the output of the calculate tool. If you find
  yourself computing "X / Y" or "X% of Y" mentally — STOP and call calculate.
  When you show derived math, show the formula: "avg = $413.62 ($4,136.20 / 10)".
- Cite the source of BUSINESS numbers: "(tool: get_machine_details)" or
  "(snapshot)". General-knowledge advice needs no citation — but don't
  dress up general advice as if it were their actual data.
- Buy List rule (when relevant): if caseSize === 1 say "units" not
  "cases". Always show unitCost + unitVendPrice for buy recommendations.
- For dates: today is in miniSnapshot.today. "Yesterday" = subtract 1.
  "Last Monday" = compute from today. If ambiguous, ask.`;

// ── Verification gate (RAG Phase 3) ─────────────────────────────────────────
// After the model produces a final answer, cross-check that every BUSINESS
// number in it actually appears in a tool result or the snapshot. A number
// that doesn't is almost always mental math (the top hallucination source) —
// we bounce ONE corrective turn asking the model to recompute via calculate()
// or fix it. Conservative on what must be grounded, to avoid nagging good
// answers: only money amounts and sizeable quantities; years/dates/small ints
// are exempt.
function unverifiedNumbers(reply: string, groundedText: string): string[] {
  const groundedNums = new Set(
    [...groundedText.replace(/,/g, "").matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => m[0]),
  );
  const near = (v: number) => {
    // Accept the value in any reasonable rounded form the model might print.
    const forms = [v, Math.round(v), Math.round(v * 10) / 10, Math.round(v * 100) / 100];
    return forms.some((f) => {
      if (groundedNums.has(String(f))) return true;
      // tolerance scan for rounding drift (e.g. 142.6 vs 142.62)
      for (const g of groundedNums) {
        const gn = Number(g);
        if (Number.isFinite(gn) && Math.abs(gn - v) <= Math.max(0.05, Math.abs(v) * 0.01)) return true;
      }
      return false;
    });
  };
  const stripped = reply.replace(/\b(19|20)\d{2}\b/g, " ").replace(/\d{4}-\d{2}-\d{2}/g, " "); // drop years/ISO dates
  const candidates = new Map<string, number>();
  // $-amounts
  for (const m of stripped.matchAll(/\$\s?(-?\d[\d,]*(?:\.\d+)?)/g)) {
    const v = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(v) && Math.abs(v) >= 1) candidates.set(m[1], v);
  }
  // quantities followed by a unit word
  for (const m of stripped.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*(?:units?|orders?|sold|leads?|items?|transactions?|machines?|cases?)\b/gi)) {
    const v = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(v) && Math.abs(v) >= 20) candidates.set(m[1], v);
  }
  const bad: string[] = [];
  for (const [label, v] of candidates) if (!near(v)) bad.push(label);
  return bad;
}

// Debug probe: GET returns which tools are registered. Lets us verify
// that a deploy actually picked up the latest tool registry.
export async function GET() {
  return NextResponse.json({
    toolCount: TOOL_DEFINITIONS.length,
    toolNames: TOOL_DEFINITIONS.map((t) => t.function.name),
  });
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const messages: ChatMessage[] = body.messages || [];
    if (messages.length === 0) {
      return NextResponse.json({ success: false, error: "No messages provided" }, { status: 400 });
    }

    const snapshot = await buildMiniSnapshot();

    const apiMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content:
          "Mini snapshot (always-on context):\n" +
          JSON.stringify(snapshot) +
          "\n\nUse this for simple totals. For everything else, call a tool.",
      },
      ...messages,
    ];

    // Tool call loop — capped to prevent runaway. Most real questions finish
    // in 1-3 turns; the persistence rules (retry with an alternate tool before
    // concluding "no data") plus calculate calls need headroom, hence 12.
    const MAX_TURNS = 12;
    const toolCallTrace: Array<{ name: string; args: Record<string, unknown> }> = [];
    const toolResultsText: string[] = []; // grounding corpus for the verification gate
    let lastUsage: Record<string, unknown> | null = null;
    let verificationRetried = false;

    // Model is env-switchable so a newer OpenAI model can be tried without a
    // code change (set OPENAI_ASSISTANT_MODEL in Vercel).
    const model = process.env.OPENAI_ASSISTANT_MODEL || "gpt-4o";

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await openAiChat({
        model,
        temperature: 0,
        max_tokens: 1000,
        messages: apiMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      }, apiKey);

      if (!res.ok) {
        const text = await res.text();
        // A 429 that survived all retries means the org is genuinely over its
        // rate limit — return a friendly, retryable message, not a raw 502.
        if (res.status === 429) {
          return NextResponse.json(
            { success: true, reply: "I'm handling a lot of requests right now — give me a few seconds and ask again." },
          );
        }
        return NextResponse.json(
          { success: false, error: `OpenAI ${res.status}: ${text.slice(0, 300)}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      lastUsage = data.usage || null;
      const message = data.choices?.[0]?.message;
      if (!message) {
        return NextResponse.json({ success: false, error: "OpenAI returned no message" }, { status: 502 });
      }

      // Did the model call any tools? If not, we have our final answer.
      const toolCalls = (message.tool_calls || []) as Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
      if (toolCalls.length === 0) {
        const reply = message.content || "(no response)";
        // Verification gate — only when tools were actually used (pure
        // general-knowledge answers have nothing to ground against) and only
        // once, so a genuinely un-sourced number can't loop forever.
        if (!verificationRetried && toolResultsText.length > 0) {
          const grounded = toolResultsText.join(" ") + " " + JSON.stringify(snapshot);
          const bad = unverifiedNumbers(reply, grounded);
          if (bad.length > 0) {
            verificationRetried = true;
            apiMessages.push({ role: "assistant", content: reply });
            apiMessages.push({
              role: "system",
              content:
                `VERIFICATION: these number(s) in your answer do not appear in any tool ` +
                `result or the snapshot: ${bad.join(", ")}. That means they were computed ` +
                `in your head or invented. Recompute each one with the calculate tool over ` +
                `the exact tool figures, or re-fetch the real value, then reply again. Do ` +
                `NOT restate an unverified number.`,
            });
            continue; // one corrective turn
          }
        }
        return NextResponse.json({
          success: true,
          reply,
          usage: lastUsage,
          toolCallTrace,
          turns: turn + 1,
          snapshot,
          verified: toolResultsText.length > 0,
        });
      }

      // Add the assistant's tool_calls message to history, then run each
      // tool and push results back as tool-role messages.
      apiMessages.push({
        role: "assistant",
        content: message.content,
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsedArgs = {};
        }
        toolCallTrace.push({ name: tc.function.name, args: parsedArgs });
        const result = await executeTool(tc.function.name, parsedArgs);
        const resultJson = JSON.stringify(result);
        toolResultsText.push(resultJson);
        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultJson,
        });
      }
    }

    // Hit the tool-turn cap — return what we have with a note.
    return NextResponse.json({
      success: true,
      reply: "(reached max tool turns — try a more specific question)",
      usage: lastUsage,
      toolCallTrace,
      turns: MAX_TURNS,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
