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
      return NextResponse.json({ success: false, error: "Product name required" }, { status: 400 });
    }

    // If a product with the same name already exists, just attach the barcode
    // to it (don't create a duplicate). This handles the common case where the
    // operator is registering a barcode for a product already in the catalog.
    const { data: existingByName } = await supabase
      .from("products")
      .select("id, name, sku, case_size, barcode")
      .eq("company_id", companyId)
      .ilike("name", body.name)
      .limit(1)
      .maybeSingle();

    if (existingByName?.id) {
      // Attach barcode + update case_size if missing
      const updates: Record<string, unknown> = { barcode };
      if ((!existingByName.case_size || existingByName.case_size === 1) && body.caseSize) {
        updates.case_size = Math.max(1, Number(body.caseSize));
      }
      const { error: updErr } = await supabase
        .from("products")
        .update(updates)
        .eq("id", existingByName.id);
      if (updErr) throw updErr;
      return NextResponse.json({
        success: true,
        product: {
          ...existingByName,
          barcode,
          case_size: (updates.case_size as number) ?? existingByName.case_size,
        },
        attached: true,
      });
    }

    // Build a unique SKU: name slug + last 4 of barcode (or random) so we
    // never collide with an existing one.
    const baseSku = String(body.name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 22);
    const suffix = (barcode.slice(-4) || Math.random().toString(36).slice(-4)).toUpperCase();
    let sku = `${baseSku}-${suffix}`.slice(0, 28);

    // Belt-and-suspenders: if even THAT collides, retry with a timestamp
    const { data: skuConflict } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .eq("sku", sku)
      .maybeSingle();
    if (skuConflict) {
      sku = `${baseSku}-${Date.now().toString(36).toUpperCase()}`.slice(0, 28);
    }

    const insertRow = {
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
    };

    const { data, error } = await supabase
      .from("products")
      .insert(insertRow)
      .select("id, name, sku, case_size")
      .single();

    if (error) {
      // Surface the real Postgres error so the client knows why
      const e = error as { code?: string; message?: string; details?: string; hint?: string };
      const msg = `${e.code || ""} ${e.message || ""} ${e.details || ""}`.trim();
      console.error("[barcode register] insert failed:", e);
      return NextResponse.json(
        { success: false, error: `Could not save product: ${msg}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
