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
/**
 * Pagination:
 *   ?page=N&pageSize=M — return the Mth slice. Default page=1, pageSize=50.
 *   pageSize is capped at 200 server-side. The UI uses "Load more" — sends
 *   page=2, 3, ... until pagination.hasMore is false.
 *   The cache key is the full filter shape so each page is cached separately.
 *   Stats counts are unchanged regardless of which page is requested.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bypass = searchParams.get("fresh") === "1";
    const includeEmpty = searchParams.get("includeEmpty") === "1";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.max(1, Math.min(200, Number(searchParams.get("pageSize")) || 50));
    const key = `${CACHE_KEYS.inventoryOverview}${includeEmpty ? ":all" : ""}:p${page}:s${pageSize}`;
    const fetcher = () => buildOverview(includeEmpty, page, pageSize);
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

async function buildOverview(includeEmpty: boolean, page = 1, pageSize = 50): Promise<Record<string, unknown>> {
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
  const filtered = includeEmpty
    ? allProducts
    : allProducts.filter(
        (p) => p.onHand > 0 || p.inMachines > 0 || p.dailySales > 0
      );

  // Strip fields the table doesn't render. Each product was carrying a
  // full machines[] array (avg ~200 bytes each) AND hasStockSignal, of
  // which the table only ever shows a machineCount + nothing for the
  // signal. Replacing those two saves ~25% off the wire.
  const slimmed = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    onHand: p.onHand,
    inMachines: p.inMachines,
    dailySales: p.dailySales,
    daysLeft: p.daysLeft,
    leadTimeDays: p.leadTimeDays,
    restockStatus: p.restockStatus,
    machineCount: Array.isArray(p.machines) ? p.machines.length : 0,
  }));

  // Pagination — slice the filtered+slimmed list. Default 50/page keeps
  // the first paint under ~5 KB even for an operator with 1000 active SKUs.
  const start = (page - 1) * pageSize;
  const products = slimmed.slice(start, start + pageSize);
  const total = slimmed.length;
  const hasMore = start + products.length < total;

  return {
    success: true,
    products,
    machines,
    productList,
    pagination: {
      page,
      pageSize,
      total,
      hasMore,
    },
    stats: {
      totalProducts,
      lowStockCount,
      outOfStockCount,
      totalUnits: totalValue,
      shownProducts: total,
      hiddenEmpty: includeEmpty ? 0 : allProducts.length - filtered.length,
    },
  };
}
