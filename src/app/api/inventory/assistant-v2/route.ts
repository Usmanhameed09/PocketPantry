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
export const maxDuration = 60;

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
  - get_sales_summary(startDate, endDate, groupBy?, machineId?) — REQUIRED for
    any sales-over-a-DATE-RANGE question (last week, last month, May 2026, etc.).
    groupBy = 'machine' returns per-machine breakdown with NAMES (not UUIDs).
    groupBy = 'product' returns per-product. groupBy = 'day' returns per-day.
    groupBy = 'none' returns just totals. DO NOT use query_table for sales
    aggregation — it can't join names or compute averages.
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
  - get_predictions(by?, limit?)          — 30-day forecast (units OR cogs)
  - get_warehouse_summary()               — totals + top-stocked
  - get_recent_stock_movements(limit?)    — ledger entries

  FALLBACK / ESCAPE HATCH (use only when no named tool fits)
  - describe_schema()                     — list queryable tables + columns
  - query_table(table, filters?, ...)     — safe read-only generic query
    Call describe_schema() first. Always prefer the named tools above —
    they return cleaner data. query_table is for questions like "show me
    products with case_size > 24 from Coca Cola" that no named tool covers.

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
returns NOTHING. If the tool returns an "alsoMatched" list and the choice
could change the answer, still give the best-guess answer FIRST, then add a
one-line "(if you meant <other>, say so)".

A bare name (RACO, NEC, 84L, Baker Nissan, Morada…) is usually a MACHINE —
"how is RACO doing?" → get_machine_details("RACO"). If a name isn't found
as a lead or product, TRY get_machine_details before giving up.

═══════════════════════════════════════════════════════════════════
ANSWER STYLE
═══════════════════════════════════════════════════════════════════

- Concise. Markdown bullets. No preamble.
- Cite the source of BUSINESS numbers: "(tool: get_machine_details)" or
  "(snapshot)". General-knowledge advice needs no citation — but don't
  dress up general advice as if it were their actual data.
- Buy List rule (when relevant): if caseSize === 1 say "units" not
  "cases". Always show unitCost + unitVendPrice for buy recommendations.
- For dates: today is in miniSnapshot.today. "Yesterday" = subtract 1.
  "Last Monday" = compute from today. If ambiguous, ask.`;

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

    // Tool call loop — cap at 5 turns to prevent runaway. Most real
    // questions finish in 1-2 turns. The cap matters because a buggy
    // tool could otherwise cause the model to call it repeatedly.
    const MAX_TURNS = 8;
    const toolCallTrace: Array<{ name: string; args: Record<string, unknown> }> = [];
    let lastUsage: Record<string, unknown> | null = null;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await openAiChat({
        model: "gpt-4o",
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
        return NextResponse.json({
          success: true,
          reply: message.content || "(no response)",
          usage: lastUsage,
          toolCallTrace,
          turns: turn + 1,
          snapshot,
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
        apiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
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
