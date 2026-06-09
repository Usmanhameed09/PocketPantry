import { NextResponse } from "next/server";
import { getPurchaseOrder, transitionPO, deletePurchaseOrder } from "@/lib/buy-list-generator";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const po = await getPurchaseOrder(id);
    if (!po) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: po });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.status && ["Approved", "Purchased", "Cancelled"].includes(body.status)) {
      await transitionPO(id, body.status, body.actor as string | undefined);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = new URL(req.url).searchParams.get("actor") || undefined;
    await deletePurchaseOrder(id, actor);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
