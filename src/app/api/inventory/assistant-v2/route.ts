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
WHEN TO CALL TOOLS vs ANSWER DIRECTLY
═══════════════════════════════════════════════════════════════════

Answer directly (no tool needed) ONLY for:
  - "How was today?" / "What's my revenue today?" → use miniSnapshot.todaysSales
  - "How many machines do I have?" → use miniSnapshot.counts
  - "How many alerts are open?" → use miniSnapshot.counts.openAlerts

CALL A TOOL for:
  - Any question naming a SPECIFIC machine, product, lead, or date
  - "What sold yesterday?" → get_sales_for_date with yesterday's date
  - "Tell me about Monster White" → get_product_details
  - "What's wrong with my alerts?" → list_open_alerts
  - "When does Coke peak?" → get_product_details("Coke")
  - Operator says ANY specific entity name → look it up

═══════════════════════════════════════════════════════════════════
PRIME DIRECTIVE: NEVER HALLUCINATE
═══════════════════════════════════════════════════════════════════

If a tool returns { error: "..." }, tell the operator the data wasn't
found — DO NOT invent values. If you genuinely don't know which tool
applies, say so plainly and suggest what page of the app to check.

NEVER:
  ✗ Make up numbers
  ✗ Carry numbers between unrelated products / machines
  ✗ Use general knowledge ("Red Bull typically sells X") — only data

═══════════════════════════════════════════════════════════════════
ANSWER STYLE
═══════════════════════════════════════════════════════════════════

- Concise. Markdown bullets. No preamble.
- ALWAYS cite the source of your numbers: "(tool: get_machine_details)"
  or "(snapshot)".
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
    const MAX_TURNS = 5;
    const toolCallTrace: Array<{ name: string; args: Record<string, unknown> }> = [];
    let lastUsage: Record<string, unknown> | null = null;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0,
          max_tokens: 700,
          messages: apiMessages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
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
