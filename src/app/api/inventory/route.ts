import { NextResponse } from "next/server";
import { getInventoryOverview, getMachineList, getProductList } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory — Returns aggregated inventory overview.
 */
export async function GET() {
  try {
    const [products, machines, productList] = await Promise.all([
      getInventoryOverview(),
      getMachineList(),
      getProductList(),
    ]);

    // Summary stats
    const totalProducts = products.length;
    const lowStockCount = products.filter(
      (p) => p.restockStatus === "Low" || p.restockStatus === "Critical"
    ).length;
    const outOfStockCount = products.filter(
      (p) => p.restockStatus === "Out"
    ).length;
    const totalValue = products.reduce(
      (sum, p) => sum + p.onHand + p.inMachines,
      0
    );

    return NextResponse.json({
      success: true,
      products,
      machines,
      productList,
      stats: {
        totalProducts,
        lowStockCount,
        outOfStockCount,
        totalUnits: totalValue,
      },
    });
  } catch (error: any) {
    console.error("[inventory] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
