import { NextResponse } from "next/server";
import { listPurchaseOrders } from "@/lib/buy-list-generator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pos = await listPurchaseOrders();
    return NextResponse.json({ success: true, data: pos });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
