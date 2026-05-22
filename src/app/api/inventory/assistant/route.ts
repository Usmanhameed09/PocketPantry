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

const SYSTEM_PROMPT = `You are PocketPantry's inventory advisor. The operator runs vending machines and wants concise, actionable advice based on real sales data.

You have access to a live snapshot of their inventory, sales velocity, alerts, and machine state. Use it to answer questions like:
- "What products should I remove?"
- "Where should I place a new product?"
- "What's selling well this week?"
- "Which machines need restocking?"
- "Recommend products to add for the office demographic"

Rules:
1. Be concise. Bullet points + short reasoning. No long preambles.
2. Always cite numbers from the snapshot when relevant (e.g. "Sun Chips sells 4.3 units/day").
3. When recommending placement, look at category mix per machine and customer patterns.
4. When recommending removal, point to weekly velocity + margin (less than 0.5/week or under 25% margin is the threshold).
5. If the snapshot has no relevant data, say so plainly — don't invent numbers.
6. Format with markdown for readability (headers, bold, bullets).`;

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
