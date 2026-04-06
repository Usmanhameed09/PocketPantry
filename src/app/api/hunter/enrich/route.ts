import { NextRequest, NextResponse } from "next/server";
import { findHunterContact } from "@/lib/hunter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const enrichment = await findHunterContact({
      website: typeof body?.website === "string" ? body.website : undefined,
      company: typeof body?.company === "string" ? body.company : undefined,
    });

    return NextResponse.json({
      ok: true,
      enrichment,
    });
  } catch (error) {
    console.error("[API /hunter/enrich POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to enrich with Hunter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
