import { NextResponse } from "next/server";
import { getInventoryOverview, getMachineList, getProductList } from "@/lib/inventory-store";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory — Returns aggregated inventory overview.
 *
 * Default mode (?includeEmpty=0, the typical case): only returns products
 * that are actually in play — on hand somewhere, in a machine, or selling.
 * This cuts the response from ~416KB (all 1000+ catalog rows) to ~20KB
 * (only the rows the operator cares about). Stats counts ALL products so
 * the "Total Products" tile still shows the full catalog size.
 *
 * ?includeEmpty=1  — when the operator ticks "Show empty products" in the
 * UI, return the full catalog. Cached under a separate key.
 *
 * ?fresh=1 — bypass cache entirely (Refresh button + AI agent live mode).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bypass = searchParams.get("fresh") === "1";
    const includeEmpty = searchParams.get("includeEmpty") === "1";
    const key = includeEmpty
      ? `${CACHE_KEYS.inventoryOverview}:all`
      : CACHE_KEYS.inventoryOverview;
    const fetcher = () => buildOverview(includeEmpty);
    const payload = bypass ? await fetcher() : await withCache(key, TTL.inventoryOverview, fetcher);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("[inventory] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function buildOverview(includeEmpty: boolean): Promise<Record<string, unknown>> {
  const [allProducts, machines, productList] = await Promise.all([
    getInventoryOverview(),
    getMachineList(),
    getProductList(),
  ]);

  // Stats reflect the FULL catalog regardless of which list we return —
  // operators expect "Total Products: 6,418" even if we only ship 50
  // rows for the table.
  const totalProducts = allProducts.length;
  const lowStockCount = allProducts.filter(
    (p) => p.restockStatus === "Low" || p.restockStatus === "Critical"
  ).length;
  const outOfStockCount = allProducts.filter(
    (p) => p.restockStatus === "Out"
  ).length;
  const totalValue = allProducts.reduce(
    (sum, p) => sum + p.onHand + p.inMachines,
    0
  );

  // Server-side empty-row filter (was browser-side via UI checkbox).
  // A product is "empty" when nothing has ever happened to it: no
  // warehouse stock, no in-machine units, no recent sales. Catalog-
  // import-only rows are typically empty until they actually move.
  const products = includeEmpty
    ? allProducts
    : allProducts.filter(
        (p) => p.onHand > 0 || p.inMachines > 0 || p.dailySales > 0
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
      shownProducts: products.length,
      hiddenEmpty: includeEmpty ? 0 : allProducts.length - products.length,
    },
  };
}
