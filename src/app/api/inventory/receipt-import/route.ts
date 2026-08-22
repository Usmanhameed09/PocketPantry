import { NextResponse } from "next/server";
import { resolveProducts } from "@/lib/product-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/inventory/receipt-import — parse a store receipt (PDF or photo)
 * into structured line items and auto-match each to the operator's ACTIVE
 * products. Returns a review payload; nothing is written to stock here.
 * The commit happens in ./commit after the operator confirms.
 *
 * Body (JSON): { fileBase64, mimeType, fileName? }
 *   - application/pdf  → text extracted server-side, GPT-4o parses the text
 *   - image/*          → GPT-4o vision reads the photo directly
 *   - text/plain       → treated as already-extracted receipt text
 */

type ParsedItem = {
  name: string;
  packQty: number;
  unitsPerPack: number;
  totalUnits: number;
  totalPrice: number;
};

const EXTRACT_PROMPT = `You are parsing a store receipt (Sam's Club, Costco, etc.) for a vending operator's inventory system.

Extract EVERY purchased product line. Ignore subtotals, tax, fees, shipping, addresses, payment info.

For each line determine:
- name: the product name WITHOUT pack/size suffixes (e.g. "Monster Energy Zero Ultra" not "Monster Energy Zero Ultra 16 fl. oz., 24 pk.")
- packQty: how many packs/cases were bought (the "Qty N" number)
- unitsPerPack: units in one pack — from "24 pk." → 24, "18 pk." → 18, "9 pk." → 9, "24 ct." → 24. If no pack size is shown, use 1.
- totalUnits: packQty × unitsPerPack
- totalPrice: the line's dollar amount (number, no $)

Respond with ONLY valid JSON, no markdown:
{"store":"...","date":"YYYY-MM-DD or null","orderNumber":"... or null","items":[{"name":"...","packQty":1,"unitsPerPack":24,"totalUnits":24,"totalPrice":12.34}]}`;

async function pdfToText(base64: string): Promise<string> {
  // pdf-parse v2 API: new PDFParse({ data }) → getText() → { text }.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(Buffer.from(base64, "base64")) });
  try {
    const out = await parser.getText();
    return (out as { text?: string }).text || "";
  } finally {
    try { await parser.destroy(); } catch { /* ignore */ }
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, error: "OPENAI_API_KEY not configured" }, { status: 500 });

    const body = await req.json() as { fileBase64?: string; mimeType?: string; fileName?: string };
    if (!body.fileBase64 || !body.mimeType) {
      return NextResponse.json({ success: false, error: "fileBase64 and mimeType are required" }, { status: 400 });
    }

    // Build the model input: text for PDFs, image content for photos.
    let userContent: unknown;
    if (body.mimeType === "application/pdf") {
      const text = await pdfToText(body.fileBase64);
      if (text.trim().length < 30) {
        return NextResponse.json({ success: false, error: "Couldn't read text from this PDF — try a photo of the receipt instead." });
      }
      userContent = `Receipt text:\n\n${text.slice(0, 12000)}`;
    } else if (body.mimeType.startsWith("image/")) {
      userContent = [
        { type: "text", text: "Parse this receipt photo." },
        { type: "image_url", image_url: { url: `data:${body.mimeType};base64,${body.fileBase64}` } },
      ];
    } else if (body.mimeType === "text/plain") {
      userContent = `Receipt text:\n\n${Buffer.from(body.fileBase64, "base64").toString("utf8").slice(0, 12000)}`;
    } else {
      return NextResponse.json({ success: false, error: `Unsupported file type: ${body.mimeType}. Upload a PDF or a photo.` }, { status: 400 });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: "The AI parser is temporarily unavailable — try again in a minute." }, { status: 502 });
    }
    const data = await res.json();
    let parsed: { store?: string; date?: string | null; orderNumber?: string | null; items?: ParsedItem[] };
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    } catch {
      return NextResponse.json({ success: false, error: "Couldn't parse the receipt — try a clearer copy." });
    }
    const items = (parsed.items || []).filter((i) => i && i.name && (i.totalUnits || 0) > 0);
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "No product lines found on that receipt." });
    }

    // Auto-match each line against the ACTIVE product universe (with brand
    // synonyms). The review UI shows the top candidates; the operator confirms.
    const out = [];
    for (const item of items) {
      const matches = await resolveProducts(item.name);
      // Fall back to matching on the first 2-3 meaningful words (receipt names
      // are verbose: "Monster Energy Ultra, Sugar Free Energy Drink, Red White…")
      let candidates = matches;
      if (candidates.length === 0) {
        const words = item.name.split(/[,]| - /)[0].trim();
        candidates = await resolveProducts(words);
      }
      if (candidates.length === 0) {
        const firstTwo = item.name.split(/\s+/).slice(0, 2).join(" ");
        candidates = await resolveProducts(firstTwo);
      }
      const perUnit = item.totalUnits > 0 ? Math.round((item.totalPrice / item.totalUnits) * 100) / 100 : 0;
      out.push({
        rawName: item.name,
        packQty: item.packQty || 1,
        unitsPerPack: item.unitsPerPack || 1,
        totalUnits: item.totalUnits,
        totalPrice: item.totalPrice,
        unitCost: perUnit,
        suggested: candidates[0] ? { id: candidates[0].id, name: candidates[0].name } : null,
        candidates: candidates.slice(0, 5).map((c) => ({ id: c.id, name: c.name, units90: c.units90 })),
      });
    }

    return NextResponse.json({
      success: true,
      store: parsed.store || null,
      date: parsed.date || null,
      orderNumber: parsed.orderNumber || null,
      items: out,
    });
  } catch (e) {
    console.error("[receipt-import] parse error:", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Parse failed" }, { status: 500 });
  }
}
