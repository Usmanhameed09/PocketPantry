import { NextResponse } from "next/server";
import { logRefill, getMachineList, getProductList } from "@/lib/inventory-store";
import { invalidateOnInventoryWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/inventory/refill — Log a machine refill.
 * Body: { machineId, items: [{ productId, quantity }], refillDate? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { machineId, items, refillDate } = body;

    if (!machineId) {
      return NextResponse.json(
        { success: false, error: "machineId is required" },
        { status: 400 }
      );
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "items array is required (productId + quantity)" },
        { status: 400 }
      );
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || typeof item.quantity !== "number" || item.quantity < 0) {
        return NextResponse.json(
          { success: false, error: `Invalid item: ${JSON.stringify(item)}` },
          { status: 400 }
        );
      }
    }

    await logRefill({ machineId, items, refillDate });

    // Cache invalidation — refill changes warehouse on-hand, machine
    // estimates, and downstream buy-list + waste numbers.
    await invalidateOnInventoryWrite();

    return NextResponse.json({
      success: true,
      message: `Refill logged: ${items.length} products for machine ${machineId}`,
    });
  } catch (error: any) {
    console.error("[inventory/refill] error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inventory/refill — Return machines + products for the refill form.
 */
export async function GET() {
  try {
    const [machines, products] = await Promise.all([
      getMachineList(),
      getProductList(),
    ]);
    return NextResponse.json({ success: true, machines, products });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
