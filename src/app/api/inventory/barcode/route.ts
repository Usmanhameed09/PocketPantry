/**
 * Barcode lookup + register endpoint.
 *
 * GET ?barcode=XYZ → returns product if found
 * POST { barcode, productId } → attaches barcode to existing product
 * POST { barcode, name, category, caseSize, unitCost, vendor } → creates new product with barcode
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = (searchParams.get("barcode") || "").trim();
    if (!barcode) {
      return NextResponse.json({ success: false, error: "barcode required" }, { status: 400 });
    }
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, category, vendor, unit_cost, default_vend_price, case_size, barcode, status")
      .eq("company_id", companyId)
      .eq("barcode", barcode)
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ success: true, product: data || null });
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
    const barcode = String(body.barcode || "").trim();
    if (!barcode) {
      return NextResponse.json({ success: false, error: "barcode required" }, { status: 400 });
    }
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Attach barcode to an existing product
    if (body.productId) {
      const { error } = await supabase
        .from("products")
        .update({ barcode })
        .eq("id", body.productId);
      if (error) throw error;
      return NextResponse.json({ success: true, productId: body.productId });
    }

    // Register a new product (with barcode + case size)
    if (!body.name) {
      return NextResponse.json({ success: false, error: "name required for new product" }, { status: 400 });
    }
    const sku = String(body.name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 28);

    const { data, error } = await supabase
      .from("products")
      .insert({
        company_id: companyId,
        name: body.name,
        sku,
        barcode,
        category: body.category || "Snacks",
        vendor: body.vendor || null,
        unit_cost: Number(body.unitCost) || 0,
        default_vend_price: body.defaultVendPrice ? Number(body.defaultVendPrice) : null,
        case_size: Math.max(1, Number(body.caseSize) || 1),
        status: "Active",
      })
      .select("id, name, sku, case_size")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
