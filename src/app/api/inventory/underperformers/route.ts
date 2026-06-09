import { NextResponse } from "next/server";
import { findUnderperformers } from "@/lib/product-proposals";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const data = bypass
      ? await findUnderperformers()
      : await withCache(CACHE_KEYS.underperformers, TTL.underperformers, findUnderperformers);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
