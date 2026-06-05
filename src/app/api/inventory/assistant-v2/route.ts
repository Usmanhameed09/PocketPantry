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
  - get_machine_details(name)    — one machine's full breakdown
  - search_products(query)       — catalog search by name/SKU/vendor
  - get_product_details(name)    — one product: sales + machines + seasonality
  - get_sales_for_date(date)     — one day's totals + top sellers
  - find_lead(query)             — pipeline lookup by business/owner
  - list_open_alerts()           — current alerts

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
