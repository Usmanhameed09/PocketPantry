import { NextResponse } from "next/server";
import { recordStockMovement, listStockMovements } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    if (!productId) {
      return NextResponse.json({ success: false, error: "productId required" }, { status: 400 });
    }
    const movements = await listStockMovements(productId, Number(searchParams.get("limit") || 50));
    return NextResponse.json({ success: true, data: movements });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = await recordStockMovement({
      productId: body.productId,
      location: body.location || "warehouse",
      machineId: body.machineId ?? null,
      qty: Number(body.qty),
      reason: body.reason,
      referenceId: body.referenceId ?? null,
      notes: body.notes ?? null,
      createdBy: body.createdBy ?? null,
    });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
