import { NextResponse } from "next/server";
import { listPurchaseOrders } from "@/lib/buy-list-generator";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const pos = bypass
      ? await listPurchaseOrders()
      : await withCache(CACHE_KEYS.posList, TTL.posList, listPurchaseOrders);
    return NextResponse.json({ success: true, data: pos });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
