import { NextRequest, NextResponse } from "next/server";
import { searchGoogleMapsLeads } from "@/lib/google-maps";

// Search now enriches results with emails (Apollo/Hunter lookups), so give
// it room beyond the default function timeout.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const zipcode = String(body?.zipcode || "").trim();
    const category = String(body?.category || "").trim();
    const radiusMiles = Number(body?.radiusMiles);
    const mode = body?.mode === "category" && category ? "category" : "all";

    if (!zipcode) {
      return NextResponse.json({ error: "ZIP code is required." }, { status: 400 });
    }

    if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
      return NextResponse.json({ error: "Radius must be greater than 0." }, { status: 400 });
    }

    const results = await searchGoogleMapsLeads({
      zipcode,
      category,
      radiusMiles,
      mode,
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("[API /google-maps/search POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to search Google Maps";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
