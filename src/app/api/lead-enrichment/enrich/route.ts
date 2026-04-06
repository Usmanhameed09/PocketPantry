import { NextRequest, NextResponse } from "next/server";
import { enrichLeadContact } from "@/lib/lead-enrichment";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await enrichLeadContact({
      website: typeof body?.website === "string" ? body.website : undefined,
      company: typeof body?.company === "string" ? body.company : undefined,
    });

    return NextResponse.json({
      ok: true,
      enrichment: result.enrichment,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("[API /lead-enrichment/enrich POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to enrich lead contact.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
