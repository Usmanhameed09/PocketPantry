import { NextResponse } from "next/server";
import { receivePOLines, getPurchaseOrder } from "@/lib/buy-list-generator";
import { invalidateOnPOWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    await receivePOLines(id, body.receipts || [], body.createdBy);
    await invalidateOnPOWrite();
    const po = await getPurchaseOrder(id);
    return NextResponse.json({ success: true, data: po });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
