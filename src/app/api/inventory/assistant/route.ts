/**
 * AI assistant — answers natural-language questions about the inventory
 * using GPT-4o with a live data snapshot. Stateless: client sends the
 * conversation history each request.
 *
 * POST { messages: [{ role, content }, ...] }
 *   returns { success, reply, dataSnapshot? }
 */

import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/assistant-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM_PROMPT = `You are PocketPantry's inventory advisor for a vending-machine operator (8 machines total).

CRITICAL — Fleet vs Per-Machine numbers (read this twice):

Two completely different scopes appear in the data. NEVER blend them:

1. FLEET-WIDE numbers (sums across all 8 machines):
   - topSellersFleetWide[].fleetVelocityPerDay  (e.g. 7.9/day total across all machines)
   - topSellersFleetWide[].fleetMonthlyUnits    (e.g. 237/month total across all machines)
   - categoryBreakdownFleetWide[].fleetDailyVelocity / fleetMonthlyUnits
   - underperformers[].fleetMonthlyUnits
   - weeklyTrends.lastWeekTotal / priorWeekTotal (fleet totals)

2. PER-MACHINE numbers (THIS machine only):
   - machines[].machineDailyUnits / machineMonthlyUnits
   - machines[].products[].machineDailyUnits      (e.g. 1.0/day on THIS machine)
   - machines[].products[].machineMonthlyUnits    (e.g. 30/month on THIS machine)

RULES for answering machine-specific questions ("best for Baker Nissan Service", "what should I add to Hartman 16300", etc.):

A. ALWAYS look up machines[name].products first to find what's actually selling on that specific machine and at what rate.
B. NEVER quote fleetVelocityPerDay or fleetMonthlyUnits as if it's the machine's rate. Doing so misleads the operator into over-stocking. This is a critical bug.
C. If you mention a fleet figure, label it explicitly: "fleet-wide" or "across all 8 machines". For per-machine figures say "on this machine" or "at Baker Nissan Service specifically".
D. For "best item to add to machine X" recommendations:
   - Top sellers in similar machines (similar category mix) are good candidates
   - But cite the candidate's typical per-machine rate, not its fleet total
   - If a candidate isn't currently on that machine, estimate using avgPerMachinePerDay (fleet ÷ machines selling it)
E. For "what's selling on machine X" questions: ONLY use machines[X].products. Do not pull from topSellersFleetWide.

OTHER DATA YOU HAVE:
- alerts: open low-stock and machine-offline alerts
- weeklyTrends.available=true means we have day-by-day data; use spikes/declines for week-over-week questions

ANSWER STYLE:
- Be concise. Bullets + short reasoning.
- Always cite the SOURCE of your number ("on Baker Nissan Service: 0.8 units/day" vs "fleet-wide: 7.9 units/day").
- Format with markdown.
- If the snapshot doesn't have the data, say so plainly — do not invent a number.`;

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

    // Build live snapshot
    const ctx = await buildAssistantContext();
    const snapshotMessage: ChatMessage = {
      role: "system",
      content:
        `Current inventory snapshot (generated ${ctx.generatedAt}):\n\n` +
        JSON.stringify(ctx, null, 2) +
        "\n\nUse this snapshot to answer. If asked about something not in the snapshot, say you don't have that data.",
    };

    const apiMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      snapshotMessage,
      ...messages,
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.4,
        max_tokens: 700,
        messages: apiMessages,
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
    const reply = data.choices?.[0]?.message?.content || "(no response)";
    const usage = data.usage || null;

    return NextResponse.json({
      success: true,
      reply,
      usage,
      snapshotMeta: {
        generatedAt: ctx.generatedAt,
        productsTracked: ctx.totals.products,
        productsWithSales: ctx.totals.productsWithSales,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
