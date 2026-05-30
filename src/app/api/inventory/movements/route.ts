import { NextResponse } from "next/server";
import { recordStockMovement, listStockMovements } from "@/lib/inventory-ledger";
import { resolveAlertsForProduct } from "@/lib/alerts-engine";

export const dynamic = "force-dynamic";

// "Add stock" reasons — when one of these fires we re-check low-stock alerts
// for the affected product so a scan/refill clears the matching alert on
// the spot instead of waiting for the next cron.
const STOCK_IN_REASONS = new Set(["purchase", "refill", "count_correction"]);

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

    // If this was an inbound stock movement, immediately re-evaluate low-stock
    // alerts for the product so the scanner UX feels real-time: scan → stock
    // added → alert disappears. Best-effort: don't fail the whole request if
    // the alert recompute errors.
    let alertsResolved = 0;
    if (body.productId && STOCK_IN_REASONS.has(String(body.reason))) {
      try {
        alertsResolved = await resolveAlertsForProduct(String(body.productId));
      } catch {}
    }

    return NextResponse.json({ success: true, id, alertsResolved });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
