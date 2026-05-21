/**
 * Warehouse on-hand list per product. Source of truth is the
 * warehouse_inventory rollup table (kept in sync by the ledger).
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("warehouse_inventory")
      .select("product_id, on_hand, updated_at")
      .eq("company_id", companyId);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: (data || []).map((r) => ({
        productId: r.product_id,
        onHand: r.on_hand,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
