/**
 * Bulk import products with barcodes. Accepts an array of rows:
 *
 *   POST { rows: [{ barcode, name, case_size?, category?, vendor?, unit_cost?, default_vend_price? }] }
 *
 * For each row:
 *   1. If a product with that barcode exists → update its name/case_size/etc.
 *   2. If barcode is new but a product with that name exists → attach barcode + update case_size
 *   3. Else → create a new product
 *
 * Idempotent — running the same import twice is safe.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = {
  barcode?: string | number;
  name?: string;
  case_size?: number | string;
  category?: string;
  vendor?: string;
  unit_cost?: number | string;
  default_vend_price?: number | string;
};

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function makeSku(name: string, barcode: string): string {
  // Use last-8 of barcode (more unique than last-4) + a 2-char random nonce.
  // Together that's effectively collision-proof for our catalog size.
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 16);
  const bcSuffix = barcode.slice(-8) || "";
  const nonce = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${base}-${bcSuffix}${nonce}`.slice(0, 32);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = (body.rows || []) as Row[];

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "No rows provided" }, { status: 400 });
    }
    if (rows.length > 2000) {
      return NextResponse.json({ success: false, error: "Max 2000 rows per import" }, { status: 400 });
    }

    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    // Pull existing products once to avoid N+1 lookups
    const { data: existing } = await supabase
      .from("products")
      .select("id, name, sku, barcode, case_size, vendor, unit_cost, default_vend_price")
      .eq("company_id", companyId);
    const byBarcode = new Map<string, { id: string; name: string; case_size: number }>();
    const byName = new Map<string, { id: string; name: string; case_size: number; barcode: string | null }>();
    for (const p of existing || []) {
      if (p.barcode) byBarcode.set(String(p.barcode).trim(), p as never);
      byName.set(normName(p.name as string), p as never);
    }
    const existingSkus = new Set((existing || []).map((p) => p.sku as string));

    let updated = 0;
    let attached = 0;
    let created = 0;
    let skipped = 0;
    const errors: Array<{ row: number; barcode?: string; name?: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const barcode = row.barcode != null ? String(row.barcode).trim() : "";
      const name = (row.name || "").toString().trim();
      const caseSize = row.case_size != null ? Math.max(1, Number(row.case_size) || 1) : undefined;
      const category = row.category ? String(row.category).trim() : undefined;
      const vendor = row.vendor ? String(row.vendor).trim() : undefined;
      const unitCost = row.unit_cost != null ? Number(row.unit_cost) : undefined;
      const vendPrice = row.default_vend_price != null ? Number(row.default_vend_price) : undefined;

      if (!barcode && !name) {
        skipped++;
        continue;
      }
      if (!name) {
        errors.push({ row: i + 1, barcode, error: "Missing name" });
        continue;
      }

      try {
        // 1. Update by barcode
        if (barcode && byBarcode.has(barcode)) {
          const target = byBarcode.get(barcode)!;
          const updates: Record<string, unknown> = { name };
          if (caseSize !== undefined) updates.case_size = caseSize;
          if (category) updates.category = category;
          if (vendor) updates.vendor = vendor;
          if (unitCost !== undefined && Number.isFinite(unitCost)) updates.unit_cost = unitCost;
          if (vendPrice !== undefined && Number.isFinite(vendPrice)) updates.default_vend_price = vendPrice;
          const { error } = await supabase.from("products").update(updates).eq("id", target.id);
          if (error) throw error;
          updated++;
          continue;
        }

        // 2. Attach barcode to product matched by name
        if (byName.has(normName(name))) {
          const target = byName.get(normName(name))!;
          const updates: Record<string, unknown> = {};
          if (barcode && !target.barcode) updates.barcode = barcode;
          if (caseSize !== undefined && (!target.case_size || target.case_size === 1)) {
            updates.case_size = caseSize;
          }
          if (category) updates.category = category;
          if (vendor) updates.vendor = vendor;
          if (unitCost !== undefined && Number.isFinite(unitCost)) updates.unit_cost = unitCost;
          if (vendPrice !== undefined && Number.isFinite(vendPrice)) updates.default_vend_price = vendPrice;

          if (Object.keys(updates).length === 0) {
            skipped++;
            continue;
          }
          const { error } = await supabase.from("products").update(updates).eq("id", target.id);
          if (error) throw error;
          if (barcode) byBarcode.set(barcode, target);
          attached++;
          continue;
        }

        // 3. Create new
        let sku = makeSku(name, barcode || String(i));
        if (existingSkus.has(sku)) {
          sku = `${sku.slice(0, 22)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
        }
        existingSkus.add(sku);

        const insertRow: Record<string, unknown> = {
          company_id: companyId,
          name,
          sku,
          status: "Active",
          category: category || "Snacks",
          case_size: caseSize ?? 1,
        };
        if (barcode) insertRow.barcode = barcode;
        if (vendor) insertRow.vendor = vendor;
        if (unitCost !== undefined && Number.isFinite(unitCost)) insertRow.unit_cost = unitCost;
        if (vendPrice !== undefined && Number.isFinite(vendPrice)) insertRow.default_vend_price = vendPrice;

        const { data: newProd, error } = await supabase
          .from("products")
          .insert(insertRow)
          .select("id, name, case_size")
          .single();
        if (error) throw error;
        if (newProd && barcode) {
          byBarcode.set(barcode, newProd as never);
          byName.set(normName(name), { ...newProd, barcode } as never);
        }
        created++;
      } catch (err) {
        const e = err as { message?: string; code?: string };
        errors.push({
          row: i + 1,
          barcode,
          name,
          error: `${e.code || ""} ${e.message || String(err)}`.trim(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: { total: rows.length, created, updated, attached, skipped, failed: errors.length },
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
