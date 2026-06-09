/**
 * POST /api/exceptions/resolve
 *
 * Applies the fix for a given exception type.
 *
 * Body shape (one of):
 *   { type: "missing_cost",     productId, value: number }
 *   { type: "missing_price",    productId, value: number }
 *   { type: "suspicious_cost",  productId, value: number }
 *   { type: "negative_stock",   machineInventoryId }
 *   { type: "unmapped_product", productId }   // just returns the edit URL
 *   { type: "stale_machine",    machineId }   // sets status = offline
 *
 * Returns: { ok, message }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  invalidateKeys,
  invalidateOnInventoryWrite,
  invalidateOnPriceWrite,
  invalidateOnMachineWrite,
  CACHE_KEYS,
} from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const type = String(body.type || "");
    const supabase = createServerClient();

    // Every successful resolve type below also invalidates the exceptions
    // cache so the next list-load shows the fix immediately.
    const invalidateExceptions = () => invalidateKeys([CACHE_KEYS.exceptions]);

    switch (type) {
      case "missing_cost":
      case "suspicious_cost": {
        const v = Number(body.value);
        if (!body.productId || !Number.isFinite(v) || v <= 0) {
          return NextResponse.json({ ok: false, error: "productId + positive value required" }, { status: 400 });
        }
        const { error } = await supabase
          .from("products")
          .update({ unit_cost: v })
          .eq("id", body.productId);
        if (error) throw error;
        await invalidateOnPriceWrite();
        await invalidateExceptions();
        return NextResponse.json({ ok: true, message: `Cost set to $${v.toFixed(2)}.` });
      }

      case "missing_price": {
        const v = Number(body.value);
        if (!body.productId || !Number.isFinite(v) || v <= 0) {
          return NextResponse.json({ ok: false, error: "productId + positive value required" }, { status: 400 });
        }
        const { error } = await supabase
          .from("products")
          .update({ default_vend_price: v })
          .eq("id", body.productId);
        if (error) throw error;
        await invalidateOnPriceWrite();
        await invalidateExceptions();
        return NextResponse.json({ ok: true, message: `Vending price set to $${v.toFixed(2)}.` });
      }

      case "negative_stock": {
        const miId = String(body.machineInventoryId || "");
        if (!miId) {
          return NextResponse.json({ ok: false, error: "machineInventoryId required" }, { status: 400 });
        }
        // Read the row first so we know what to log as an adjustment.
        const { data: mi } = await supabase
          .from("machine_inventory")
          .select("product_id, machine_id, estimated_remaining")
          .eq("id", miId)
          .maybeSingle();
        if (!mi) {
          return NextResponse.json({ ok: false, error: "Row not found" }, { status: 404 });
        }
        const prev = (mi.estimated_remaining as number) || 0;
        const { error } = await supabase
          .from("machine_inventory")
          .update({ estimated_remaining: 0 })
          .eq("id", miId);
        if (error) throw error;
        // Log a count-correction stock_movement so the ledger reflects what
        // we changed (positive adjustment to bring the count from prev → 0).
        await supabase.from("stock_movements").insert({
          product_id: mi.product_id,
          machine_id: mi.machine_id,
          location: mi.machine_id,
          qty: Math.abs(prev),
          reason: "count_correction",
          notes: `Auto-reset from ${prev} via Exception Queue`,
        });
        await invalidateOnInventoryWrite();
        await invalidateExceptions();
        return NextResponse.json({ ok: true, message: `Reset estimated_remaining from ${prev} to 0 and logged a correction.` });
      }

      case "unmapped_product": {
        if (!body.productId) {
          return NextResponse.json({ ok: false, error: "productId required" }, { status: 400 });
        }
        // We don't auto-fix here — the operator needs to fill in vendor /
        // case size / barcode. Return the URL to navigate to.
        return NextResponse.json({
          ok: true,
          message: "Open the product to fill in vendor, case size, and barcode.",
          openUrl: `/inventory/products?focus=${body.productId}`,
        });
      }

      case "stale_machine": {
        if (!body.machineId) {
          return NextResponse.json({ ok: false, error: "machineId required" }, { status: 400 });
        }
        const { error } = await supabase
          .from("machines")
          .update({ status: "offline" })
          .eq("id", body.machineId);
        if (error) throw error;
        await invalidateOnMachineWrite();
        await invalidateExceptions();
        return NextResponse.json({ ok: true, message: "Marked machine offline." });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown exception type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
