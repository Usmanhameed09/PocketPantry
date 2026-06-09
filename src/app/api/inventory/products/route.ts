import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { recordStockMovement } from "@/lib/inventory-ledger";
import { recordAuditEvent } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    // Supabase enforces a server-side 1000-row cap per query. To return the
    // whole catalog (now 6k+ after bulk import) we paginate in 1000-row chunks.
    const PAGE = 1000;
    const all: unknown[] = [];
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
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return NextResponse.json({ success: true, data: all, total: total || all.length });
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
