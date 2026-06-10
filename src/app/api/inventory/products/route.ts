import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { recordStockMovement } from "@/lib/inventory-ledger";
import { recordAuditEvent } from "@/lib/audit-log";
import { invalidateOnInventoryWrite, invalidateOnPriceWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/products
 *
 * Default: returns only ACTIVE products (the 30-50 the operator actually
 * works with) — those with stock, machine presence, recent sales, OR
 * operator-managed metadata (barcode, vendor, vend price).
 *
 * The bulk Excel/UPC import drops 6000+ products into the catalog but
 * 99% never touch real operations. Without this filter every dropdown
 * and table is dominated by those orphans.
 *
 * ?includeAll=1   — return the full catalog (used when the operator
 *                   ticks "Show inactive" / needs to find an unused SKU).
 * ?onlyActive=0   — alias of includeAll=1 (backwards-compatible).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeAll =
      searchParams.get("includeAll") === "1" ||
      searchParams.get("onlyActive") === "0";

    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    // Supabase enforces a server-side 1000-row cap per query. To return the
    // whole catalog (now 6k+ after bulk import) we paginate in 1000-row chunks.
    const PAGE = 1000;
    const all: Array<Record<string, unknown>> = [];
    let total = 0;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error, count } = await supabase
        .from("products")
        .select("id, name, sku, category, vendor, status, unit_cost, default_vend_price, case_size, unit_size, barcode, lead_time_days", { count: from === 0 ? "exact" : undefined })
        .eq("company_id", companyId)
        .order("name")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (from === 0 && count != null) total = count;
      if (!data || data.length === 0) break;
      all.push(...(data as Array<Record<string, unknown>>));
      if (data.length < PAGE) break;
    }

    if (includeAll) {
      return NextResponse.json({ success: true, data: all, total: total || all.length });
    }

    // Filter to "active" products. The UPC bulk import populated barcodes
    // AND vendor strings on all 6000+ products, so those metadata fields
    // don't separate "operator actually uses this" from "Excel import
    // dump". The only honest signals are real activity:
    //   has warehouse stock
    //   has machine presence
    //   has sales in last 30 days
    //   has operator-set vend price (the import doesn't set price)
    //   has any non-sale stock_movement (purchase, refill, count_correction —
    //     proves an operator handled the product physically)
    const ids = all.map((p) => p.id as string);
    const [warehouseRes, machineInvRes, salesRes, movementsRes] = await Promise.all([
      supabase
        .from("warehouse_inventory")
        .select("product_id, on_hand")
        .eq("company_id", companyId)
        .gt("on_hand", 0),
      supabase
        .from("machine_inventory")
        .select("product_id, estimated_remaining")
        .gt("estimated_remaining", 0),
      supabase
        .from("daily_sales")
        .select("product_id")
        .gte("sale_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .in("product_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("stock_movements")
        .select("product_id")
        .in("reason", ["purchase", "refill", "count_correction", "spoilage", "damage"])
        .limit(20000),
    ]);
    const hasWarehouse = new Set((warehouseRes.data || []).map((r) => r.product_id as string));
    const hasMachine = new Set((machineInvRes.data || []).map((r) => r.product_id as string));
    const hasSales = new Set((salesRes.data || []).map((r) => r.product_id as string));
    const hasMovement = new Set((movementsRes.data || []).map((r) => r.product_id as string));

    const active = all.filter((p) => {
      const id = p.id as string;
      if (hasWarehouse.has(id) || hasMachine.has(id) || hasSales.has(id) || hasMovement.has(id)) return true;
      // Only operator-set price counts as a metadata signal (vendor + barcode
      // both come from the UPC import and would re-include the dump).
      const price = (p.default_vend_price as number | null) || 0;
      return price > 0;
    });

    return NextResponse.json({
      success: true,
      data: active,
      total: active.length,
      catalogTotal: total || all.length,
      hiddenInactive: (total || all.length) - active.length,
    });
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
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();

    const sku = String(body.sku || body.name || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .slice(0, 28);

    const { data, error } = await supabase
      .from("products")
      .insert({
        company_id: companyId,
        name: body.name,
        sku,
        category: body.category || "Snacks",
        vendor: body.vendor || null,
        status: body.status || "Active",
        unit_cost: body.unitCost ?? 0,
        default_vend_price: body.defaultVendPrice ?? null,
        case_size: body.caseSize ?? 1,
        unit_size: body.unitSize ?? null,
        barcode: body.barcode ?? null,
        lead_time_days: body.leadTimeDays ?? 1,
      })
      .select("id")
      .single();
    if (error) throw error;

    await recordAuditEvent({
      actionType: "product_create",
      entityType: "product",
      entityId: data.id as string,
      entityName: body.name,
      actor: body.actor || null,
      newValue: {
        name: body.name,
        sku,
        category: body.category || "Snacks",
        vendor: body.vendor || null,
        unit_cost: body.unitCost ?? 0,
        default_vend_price: body.defaultVendPrice ?? null,
      },
    });

    await invalidateOnInventoryWrite();
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const updates: Record<string, unknown> = {};
    const fields = ["name", "category", "vendor", "status", "unit_size", "barcode"];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.unitCost !== undefined) updates.unit_cost = body.unitCost;
    if (body.defaultVendPrice !== undefined) updates.default_vend_price = body.defaultVendPrice;
    if (body.caseSize !== undefined) updates.case_size = body.caseSize;
    if (body.leadTimeDays !== undefined) updates.lead_time_days = body.leadTimeDays;

    // Read the OLD values BEFORE applying the update so we can diff into
    // the audit log. Critical for the owner's "who changed cost from $X
    // to $Y" question.
    const { data: oldRow } = await supabase
      .from("products")
      .select("name, unit_cost, default_vend_price, case_size, status, vendor, category, lead_time_days, unit_size, barcode")
      .eq("id", body.id)
      .maybeSingle();

    const { error } = await supabase.from("products").update(updates).eq("id", body.id);
    if (error) throw error;

    // Emit one audit row per critical field that actually changed. We
    // split cost/price into their own action_types because the owner
    // most often asks about THESE specific fields ("who changed cost?").
    // Other field edits collapse into a single product_edit row.
    if (oldRow) {
      const otherChanges: Record<string, { old: unknown; new: unknown }> = {};
      if (body.unitCost !== undefined && Number(oldRow.unit_cost) !== Number(body.unitCost)) {
        await recordAuditEvent({
          actionType: "cost_change",
          entityType: "product",
          entityId: body.id,
          entityName: (oldRow.name as string) || body.id,
          actor: body.actor || null,
          oldValue: { unit_cost: oldRow.unit_cost },
          newValue: { unit_cost: body.unitCost },
          notes: body.notes || null,
        });
      }
      if (body.defaultVendPrice !== undefined && Number(oldRow.default_vend_price) !== Number(body.defaultVendPrice)) {
        await recordAuditEvent({
          actionType: "price_change",
          entityType: "product",
          entityId: body.id,
          entityName: (oldRow.name as string) || body.id,
          actor: body.actor || null,
          oldValue: { default_vend_price: oldRow.default_vend_price },
          newValue: { default_vend_price: body.defaultVendPrice },
          notes: body.notes || null,
        });
      }
      for (const f of ["name", "category", "vendor", "status", "unit_size", "barcode"]) {
        if (body[f] !== undefined && (oldRow as Record<string, unknown>)[f] !== body[f]) {
          otherChanges[f] = { old: (oldRow as Record<string, unknown>)[f], new: body[f] };
        }
      }
      if (body.caseSize !== undefined && Number(oldRow.case_size) !== Number(body.caseSize)) {
        otherChanges.case_size = { old: oldRow.case_size, new: body.caseSize };
      }
      if (body.leadTimeDays !== undefined && Number(oldRow.lead_time_days) !== Number(body.leadTimeDays)) {
        otherChanges.lead_time_days = { old: oldRow.lead_time_days, new: body.leadTimeDays };
      }
      if (Object.keys(otherChanges).length > 0) {
        await recordAuditEvent({
          actionType: "product_edit",
          entityType: "product",
          entityId: body.id,
          entityName: (oldRow.name as string) || body.id,
          actor: body.actor || null,
          oldValue: Object.fromEntries(Object.entries(otherChanges).map(([k, v]) => [k, v.old])),
          newValue: Object.fromEntries(Object.entries(otherChanges).map(([k, v]) => [k, v.new])),
          notes: body.notes || null,
        });
      }
    }

    // Any product mutation can shift the inventory overview + buy list;
    // if cost/price changed it also affects pricing analyses.
    if (body.unitCost !== undefined || body.defaultVendPrice !== undefined) {
      await invalidateOnPriceWrite();
    } else {
      await invalidateOnInventoryWrite();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// Stock adjust shortcut — records a ledger movement for the warehouse.
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    await recordStockMovement({
      productId: body.productId,
      location: "warehouse",
      qty: Number(body.qty),
      reason: body.reason || "count_correction",
      notes: body.notes,
      createdBy: body.createdBy,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
