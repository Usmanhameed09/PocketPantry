import { NextResponse } from "next/server";
import { getInventoryOverview, getMachineList, getProductList } from "@/lib/inventory-store";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory — Returns aggregated inventory overview.
 * Cached for 2 min; invalidated by inventory writes (refill, scan, PO receive).
 * ?fresh=1 forces a live recompute.
 */
export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildOverview()
      : await withCache(CACHE_KEYS.inventoryOverview, TTL.inventoryOverview, buildOverview);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("[inventory] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function buildOverview(): Promise<Record<string, unknown>> {
  const [products, machines, productList] = await Promise.all([
    getInventoryOverview(),
    getMachineList(),
    getProductList(),
  ]);

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

  return {
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
  };
}
