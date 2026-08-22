import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { recordStockMovement } from "@/lib/inventory-ledger";
import { ensureProduct } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/inventory/receipt-import/commit — after the operator reviews the
 * parsed receipt, write the confirmed lines into warehouse stock.
 *
 * Body: {
 *   receiptRef: string,           // e.g. "receipt-10450564078" — dedupe guard
 *   store?: string, date?: string,
 *   lines: Array<{
 *     productId?: string,         // existing product picked in review
 *     newProductName?: string,    // OR create a new product with this name
 *     units: number,              // total units to add
 *     unitCost?: number,          // per-unit cost from the receipt
 *     caseSize?: number,          // units per pack (stored on new products)
 *     updateCost?: boolean,       // also update products.unit_cost
 *   }>
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      receiptRef?: string; store?: string; date?: string;
      lines?: Array<{ productId?: string; newProductName?: string; units: number; unitCost?: number; caseSize?: number; updateCost?: boolean }>;
    };
    const lines = (body.lines || []).filter((l) => (l.productId || l.newProductName) && l.units > 0);
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: "No confirmed lines to import." }, { status: 400 });
    }
    const receiptRef = (body.receiptRef || `receipt-${Date.now()}`).slice(0, 60);
    const supabase = createServerClient();

    // Duplicate guard — the same receipt must not add stock twice.
    const { data: existing } = await supabase
      .from("stock_movements").select("id").eq("reference_id", receiptRef).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: false,
        error: "This receipt was already imported — its stock is in the warehouse. (Delete those movements first if you need to re-import.)",
      }, { status: 409 });
    }

    let added = 0, created = 0, costUpdates = 0;
    const errors: string[] = [];
    for (const line of lines) {
      try {
        let productId = line.productId;
        if (!productId && line.newProductName) {
          productId = await ensureProduct(line.newProductName.trim());
          created++;
        }
        if (!productId) continue;
        await recordStockMovement({
          productId,
          location: "warehouse",
          qty: Math.round(line.units),
          reason: "purchase",
          referenceId: receiptRef,
          notes: `Receipt import${body.store ? ` — ${body.store}` : ""}${body.date ? ` (${body.date})` : ""}`,
          createdBy: null,
        });
        added += Math.round(line.units);
        // Receipt = ground truth for what a unit actually costs. Optionally
        // fix the stored unit_cost (Arthur's cost data has been wrong from
        // scraped case prices — this corrects it at the source).
        const patch: Record<string, unknown> = {};
        if (line.updateCost && line.unitCost && line.unitCost > 0 && line.unitCost < 20) patch.unit_cost = line.unitCost;
        if (line.caseSize && line.caseSize > 1) patch.case_size = line.caseSize;
        if (Object.keys(patch).length > 0) {
          await supabase.from("products").update(patch).eq("id", productId);
          if (patch.unit_cost) costUpdates++;
        }
      } catch (e) {
        errors.push(`${line.newProductName || line.productId}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }

    return NextResponse.json({
      success: true,
      unitsAdded: added,
      linesImported: lines.length - errors.length,
      newProducts: created,
      costUpdates,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error("[receipt-import/commit] error:", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Commit failed" }, { status: 500 });
  }
}
