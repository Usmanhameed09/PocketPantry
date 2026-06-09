import { NextResponse } from "next/server";
import {
  generateBuyList,
  createPurchaseOrdersFromBuyList,
} from "@/lib/buy-list-generator";
import { withCache, CACHE_KEYS, TTL, invalidateOnPOWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const result = bypass
      ? await generateBuyList()
      : await withCache(CACHE_KEYS.buyList, TTL.buyList, generateBuyList);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  // POST = "convert to POs" — always regenerate live (don't trust the
  // cached one — the operator may have just changed projections).
  try {
    const body = await req.json().catch(() => ({}));
    const result = await generateBuyList();
    const ids = await createPurchaseOrdersFromBuyList(result, body.createdBy);
    // PO created → invalidate everything that shows PO/buy-list state.
    await invalidateOnPOWrite();
    return NextResponse.json({ success: true, poIds: ids, buyList: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
