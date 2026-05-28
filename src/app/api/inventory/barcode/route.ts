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
import { lookupExternalUpc } from "@/lib/upc-lookup";
import { canonicalBarcode, barcodeVariants } from "@/lib/barcode-normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = (searchParams.get("barcode") || "").trim();
    const skipExternal = searchParams.get("skipExternal") === "1";
    if (!barcode) {
      return NextResponse.json({ success: false, error: "barcode required" }, { status: 400 });
    }
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    // Look up by every reasonable variant of the scanned code (raw, canonical
    // 12-digit UPC-A, 13-digit EAN-13 with leading 0, ITF-14 case GTIN, etc.).
    // Fixes "re-scan asks to register again" — different decoders return
    // different digit counts for the same physical barcode.
    const variants = barcodeVariants(barcode);
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, category, vendor, unit_cost, default_vend_price, case_size, barcode, status")
      .eq("company_id", companyId)
      .in("barcode", variants)
      .limit(1)
      .maybeSingle();

    if (data) {
      return NextResponse.json({ success: true, source: "local", product: data });
    }

    // Not in our DB — fall back to UPCItemDB (free trial: ~100/day).
    // Try the canonical form (12-digit UPC-A) first since that's what
    // UPCItemDB's index uses. If that misses, retry with the raw scanned
    // digits in case it's an ITF-14 stored as case-level instead of unit.
    if (skipExternal) {
      return NextResponse.json({ success: true, source: "local", product: null });
    }
    const canonical = canonicalBarcode(barcode);
    let external = await lookupExternalUpc(canonical);
    if (!external.found && canonical !== barcode.replace(/\D/g, "")) {
      external = await lookupExternalUpc(barcode);
    }
    if (external.found) {
      return NextResponse.json({
        success: true,
        source: "external",
        product: null,
        external: {
          barcode: external.upc,
          name: external.title || "",
          brand: external.brand,
          category: external.category,
          description: external.description,
          imageUrl: external.imageUrl,
          inferredCaseSize: external.inferredCaseSize,
          suggestedCost: external.cheapestOffer
            ? Math.round((external.cheapestOffer.price / (external.inferredCaseSize || 1)) * 100) / 100
            : null,
        },
      });
    }
    return NextResponse.json({ success: true, source: "external", product: null, external: null });
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
    const rawBarcode = String(body.barcode || "").trim();
    if (!rawBarcode) {
      return NextResponse.json({ success: false, error: "barcode required" }, { status: 400 });
    }
    // Always store the canonical form (12-digit UPC-A where possible) so
    // future lookups hit on every variant the scanner might return.
    const barcode = canonicalBarcode(rawBarcode) || rawBarcode;
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

    // Pre-register dedupe: if ANY product already has a barcode matching
    // any variant of what we just scanned, attach instead of creating.
    // This catches "I scanned the case (ITF-14) the first time and the
    // unit (UPC-A) the second time" — they're the same SKU.
    const variants = barcodeVariants(rawBarcode);
    const { data: existingByBarcode } = await supabase
      .from("products")
      .select("id, name, sku, case_size, barcode")
      .eq("company_id", companyId)
      .in("barcode", variants)
      .limit(1)
      .maybeSingle();
    if (existingByBarcode?.id) {
      return NextResponse.json({
        success: true,
        product: existingByBarcode,
        attached: true,
        message: "Matched existing product by barcode variant",
      });
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
