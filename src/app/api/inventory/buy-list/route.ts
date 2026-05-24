import { NextResponse } from "next/server";
import {
  generateBuyList,
  createPurchaseOrdersFromBuyList,
} from "@/lib/buy-list-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await generateBuyList();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  // POST = "convert to POs" — regenerate the buy list (so we're current) and
  // create PO drafts grouped by vendor.
  try {
    const body = await req.json().catch(() => ({}));
    const result = await generateBuyList();
    const ids = await createPurchaseOrdersFromBuyList(result, body.createdBy);
    return NextResponse.json({ success: true, poIds: ids, buyList: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
