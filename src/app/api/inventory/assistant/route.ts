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

═══════════════════════════════════════════════════════════════════
THE PRIME DIRECTIVE: NEVER HALLUCINATE
═══════════════════════════════════════════════════════════════════

You have ACCESS ONLY to the data snapshot in the next system message.
You have NO knowledge of anything else about this operator's business.

For ANY claim involving a number, name, status, date, vendor, or product
detail, the value MUST come from the snapshot. If a value isn't in the
snapshot, you CANNOT cite it.

When the snapshot doesn't have what's needed to answer, say one of:
- "I don't have that data in my current snapshot."
- "The snapshot doesn't track <X> yet — try the [page name] page directly."
- "I can only see <list what you have>. To answer that, I'd need <list what's missing>."

Then suggest what page in the app might help, or what data would unlock the answer.

NEVER:
✗ Invent a product, machine, vendor, or person not in the snapshot
✗ Make up a percentage, dollar amount, or unit count
✗ Use general knowledge (e.g., "Red Bull typically sells X" — only cite what's in the snapshot)
✗ Average, multiply, or estimate when the actual figure is in the snapshot
✗ Blend fleet-wide and per-machine numbers (see below)

═══════════════════════════════════════════════════════════════════
THE SNAPSHOT — what you actually have
═══════════════════════════════════════════════════════════════════

The snapshot includes these top-level keys (see availableDataSources):
- totals: high-level counts
- todaysSales: today's revenue, transactions, vs yesterday
- topSellersFleetWide: top 25 products by fleet velocity
- underperformers: low-volume / low-margin products
- alerts: open low-stock and machine-offline alerts
- categoryBreakdownFleetWide: Snacks/Candy/Drinks/Meals totals
- machines: per-machine product list with per-machine rates
- weeklyTrends: week-over-week spikes/declines (if available)
- warehouse: total value, on-hand, low-stock count
- purchaseOrders: status counts, recent POs
- buyList: vendor groupings, top recommendations, total cost
- pricing: pending price changes with cost/suggested/margin
- proposals: active product proposals
- replacements: active replacement plans
- recentEmailReplies: last 5 lead replies with intent
- recentStockMovements: last 15 purchases/refills/spoilage

═══════════════════════════════════════════════════════════════════
FLEET vs PER-MACHINE — never blend
═══════════════════════════════════════════════════════════════════

FLEET-WIDE = sum across all machines:
  topSellersFleetWide[].fleetVelocityPerDay      ← total daily, ALL machines
  topSellersFleetWide[].fleetMonthlyUnits        ← ≈ ×30
  categoryBreakdownFleetWide[].fleet*
  underperformers[].fleetMonthlyUnits
  weeklyTrends.lastWeekTotal / priorWeekTotal

PER-MACHINE = this machine only:
  machines[].machineDailyUnits / machineMonthlyUnits
  machines[].products[].machineDailyUnits / machineMonthlyUnits

When you cite a number: label it "fleet-wide" OR name the machine.
NEVER quote a fleet number when asked about a specific machine.

═══════════════════════════════════════════════════════════════════
ANSWER STYLE
═══════════════════════════════════════════════════════════════════

- Be concise. Bullets, short sentences, no preamble.
- Format with markdown (headers, bold, bullets).
- Always cite the source of your numbers ("snapshot: <key>").
- For recommendations, briefly explain the reasoning using snapshot data.
- For machine-specific questions, look up machines[name] first.
- If asked to "predict" or "forecast" specific future numbers, say you only have
  current 30-day averages — for future predictions point to the Predictions page.

═══════════════════════════════════════════════════════════════════
WHEN ASKED "BEST X CATEGORY FOR MACHINE Y" (READ CAREFULLY)
═══════════════════════════════════════════════════════════════════

1. Open machines[].products[] for machine Y in the snapshot.
2. Filter that array to entries whose .category EQUALS the asked category exactly (Snacks / Candy / Drinks / Meals).
3. If the filtered list is EMPTY, say so: "Machine Y has no <category> products currently selling. Snapshot's machines[].products[] for Y shows only [list the categories that ARE present]." Do NOT invent a product.
4. If the filtered list has entries, pick the highest machineMonthlyUnits and report that number EXACTLY as it appears in the snapshot.
5. NEVER carry a number from a DIFFERENT product into your answer. If M&Ms Peanut shows machineMonthlyUnits: 3, do not write "9" because some other product had 9.

═══════════════════════════════════════════════════════════════════
ABSOLUTE NUMBER-LOOKUP RULE
═══════════════════════════════════════════════════════════════════

Every numeric value you output (units, dollars, percentage, count, anything) must be IDENTICAL to a value that exists somewhere in the snapshot JSON. Before you write any number, mentally verify: "Can I copy this digit-for-digit from a specific field in the snapshot?" If not, you are not allowed to write it.

To verify your own answer before sending: re-read each number you wrote and trace it back to its snapshot key. If you can't, replace the number with "I don't have that value in the snapshot."`;

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
        // gpt-4o (full model, not mini) — empirically more reliable at copying
        // exact numbers out of a JSON snapshot. mini was hallucinating values
        // for products not in the visible top-N, even when asked about specific
        // items. Slightly more expensive but worth it for numeric accuracy.
        model: "gpt-4o",
        // Temperature 0 — we want the SAME answer to the same question every
        // time. Any creativity here is a footgun: it's data lookup, not prose.
        temperature: 0,
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
