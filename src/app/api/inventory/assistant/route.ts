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

const SYSTEM_PROMPT = `You are PocketPantry's inventory advisor for a vending-machine operator.

The data snapshot you receive includes:
- topSellers: products with their per-day velocity (Nayax's own 30-day average), 30-day projected units, margin %, and how many machines stock them
- underperformers: low-velocity/low-margin products with monthly unit counts (NOT weekly)
- categoryBreakdown: per-category product count + total daily velocity + projected monthly units
- machines: each machine's daily sales, product count, top sellers, and category mix
- alerts: open low-stock and spike alerts

IMPORTANT — interpret data correctly:
- "velocityPerDay" is units sold per day on average over Nayax's last 30 days (not "this week" alone)
- A velocity of 2.6/day = 78 units/month. A velocity of 0.07/day = ~2 units/month (true underperformer)
- "monthlyProjection" is velocity × 30 (×seasonal). Always cite the 30-day figure when recommending decisions.
- For placement recommendations, look at the target machine's categoryMix AND topProducts to match demographics

Rules:
1. Be concise. Bullets + short reasoning, no long preambles.
2. Always cite real numbers from the snapshot ("Coke 12oz sells 2.6/day = ~78/month at Hartman 16300").
3. When the user asks about "this week" specifically, note that velocity figures are 30-day averages and the snapshot doesn't have day-by-day data — give the monthly average and call out the limitation.
4. When recommending placement: factor in category mix balance, top-selling products in similar machines, and avoid cannibalising existing best-sellers in that machine.
5. When recommending removal: cite monthly units AND margin; threshold is <2 units/month or <25% margin.
6. Format with markdown (headers, bold, bullets) for readability.
7. If asked for data you don't have (e.g. specific demographic info per machine), say so plainly.`;

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
