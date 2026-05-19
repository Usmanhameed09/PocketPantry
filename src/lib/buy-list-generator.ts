/**
 * Buy-list + PO generator (Sprint 4).
 *
 * Buy qty = (projected_demand_for_horizon × seasonal) + (safety_stock_days × velocity)
 *           - (warehouse_on_hand - reserved_in_open_pos)
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { getProjections, getProjectionSettings } from "@/lib/projection-engine";
import { recordStockMovement } from "@/lib/inventory-ledger";

export type BuyListLine = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  vendor: string;
  unitCost: number;
  warehouseOnHand: number;
  reservedInOpenPos: number;
  velocityPerDay: number;
  horizonDemand: number;
  safetyBuffer: number;
  recommendedQty: number;     // clamped at 0
  estimatedCost: number;
  explanation: string;
};

export type BuyListResult = {
  generatedAt: string;
  horizonDays: number;
  safetyStockDays: number;
  lines: BuyListLine[];
  vendorGroups: Array<{ vendor: string; lines: BuyListLine[]; subtotal: number }>;
};

async function getReservedByProduct(): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("po_lines")
    .select("product_id, qty_ordered, qty_received, purchase_orders!inner(status)")
    .in("purchase_orders.status", ["Draft", "Approved", "Purchased"]);
  const map = new Map<string, number>();
  for (const r of (data || []) as Array<{
    product_id: string;
    qty_ordered: number;
    qty_received: number;
  }>) {
    const open = (r.qty_ordered || 0) - (r.qty_received || 0);
    if (open > 0) {
      map.set(r.product_id, (map.get(r.product_id) || 0) + open);
    }
  }
  return map;
}

export async function generateBuyList(): Promise<BuyListResult> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const settings = await getProjectionSettings();
  const projections = await getProjections();
  const reserved = await getReservedByProduct();

  // Pull warehouse on-hand + vendor data
  const productIds = projections.map((p) => p.productId);
  const { data: products } = await supabase
    .from("products")
    .select("id, vendor")
    .in("id", productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"]);
  const vendorById = new Map(
    (products || []).map((p) => [p.id as string, (p.vendor as string) || "Default"])
  );

  const { data: warehouse } = await supabase
    .from("warehouse_inventory")
    .select("product_id, on_hand")
    .eq("company_id", companyId);
  const onHandById = new Map(
    (warehouse || []).map((w) => [w.product_id as string, w.on_hand as number])
  );

  const lines: BuyListLine[] = projections.map((p) => {
    const onHand = onHandById.get(p.productId) || 0;
    const reservedQty = reserved.get(p.productId) || 0;
    const velocity = p.velocityPerDay * (p.seasonalMultiplier || 1);
    const horizonDemand = velocity * settings.horizonDays;
    const safety = velocity * settings.safetyStockDays;
    const needed = horizonDemand + safety - (onHand - reservedQty);
    const recommendedQty = Math.max(0, Math.ceil(needed));

    return {
      productId: p.productId,
      productName: p.productName,
      sku: p.sku,
      category: p.category,
      vendor: vendorById.get(p.productId) || "Default",
      unitCost: p.cost,
      warehouseOnHand: onHand,
      reservedInOpenPos: reservedQty,
      velocityPerDay: velocity,
      horizonDemand: Math.round(horizonDemand * 10) / 10,
      safetyBuffer: Math.round(safety * 10) / 10,
      recommendedQty,
      estimatedCost: Math.round(recommendedQty * p.cost * 100) / 100,
      explanation: `${velocity.toFixed(2)}/day × ${settings.horizonDays}d + ${settings.safetyStockDays}d safety − ${onHand} on hand${reservedQty > 0 ? ` − ${reservedQty} reserved` : ""}`,
    };
  });

  // Group by vendor (skip lines with 0 qty)
  const grouped = new Map<string, BuyListLine[]>();
  for (const line of lines) {
    if (line.recommendedQty <= 0) continue;
    const arr = grouped.get(line.vendor) || [];
    arr.push(line);
    grouped.set(line.vendor, arr);
  }
  const vendorGroups = Array.from(grouped.entries()).map(([vendor, vlines]) => ({
    vendor,
    lines: vlines,
    subtotal: Math.round(vlines.reduce((s, l) => s + l.estimatedCost, 0) * 100) / 100,
  }));

  // Persist the run for audit
  await supabase.from("buy_list_runs").insert({
    company_id: companyId,
    horizon_days: settings.horizonDays,
    safety_stock_days: settings.safetyStockDays,
    snapshot: { lines, vendorGroups },
  });

  return {
    generatedAt: new Date().toISOString(),
    horizonDays: settings.horizonDays,
    safetyStockDays: settings.safetyStockDays,
    lines,
    vendorGroups,
  };
}

export async function createPurchaseOrdersFromBuyList(
  buyList: BuyListResult,
  createdBy?: string
): Promise<string[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const ids: string[] = [];

  for (const group of buyList.vendorGroups) {
    const { data: po, error } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: companyId,
        supplier_name: group.vendor,
        status: "Draft",
        total_cost: group.subtotal,
        created_by: createdBy || null,
      })
      .select("id")
      .single();
    if (error || !po?.id) throw new Error(`createPO: ${error?.message}`);

    const lineRows = group.lines.map((l) => ({
      po_id: po.id,
      product_id: l.productId,
      qty_ordered: l.recommendedQty,
      unit_cost: l.unitCost,
    }));
    const { error: linesError } = await supabase.from("po_lines").insert(lineRows);
    if (linesError) throw new Error(`createPOLines: ${linesError.message}`);

    ids.push(po.id as string);
  }
  return ids;
}

export type POSummary = {
  id: string;
  supplier: string;
  status: string;
  totalCost: number;
  createdAt: string;
  approvedAt: string | null;
  purchasedAt: string | null;
  receivedAt: string | null;
  lineCount: number;
};

export async function listPurchaseOrders(): Promise<POSummary[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, supplier_name, status, total_cost, created_at, approved_at, purchased_at, received_at, po_lines(count)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPurchaseOrders: ${error.message}`);
  return (data || []).map((p) => ({
    id: p.id as string,
    supplier: p.supplier_name as string,
    status: p.status as string,
    totalCost: (p.total_cost as number) || 0,
    createdAt: p.created_at as string,
    approvedAt: (p.approved_at as string | null) ?? null,
    purchasedAt: (p.purchased_at as string | null) ?? null,
    receivedAt: (p.received_at as string | null) ?? null,
    lineCount: ((p.po_lines as unknown) as Array<{ count: number }>)?.[0]?.count ?? 0,
  }));
}

export type POLine = {
  id: string;
  productId: string;
  productName: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

export type PODetail = POSummary & { lines: POLine[]; notes: string | null };

export async function getPurchaseOrder(poId: string): Promise<PODetail | null> {
  const supabase = createServerClient();
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("id, supplier_name, status, total_cost, created_at, approved_at, purchased_at, received_at, notes")
    .eq("id", poId)
    .maybeSingle();
  if (error || !po) return null;

  const { data: lines } = await supabase
    .from("po_lines")
    .select("id, product_id, qty_ordered, qty_received, unit_cost, products(name)")
    .eq("po_id", poId);

  return {
    id: po.id as string,
    supplier: po.supplier_name as string,
    status: po.status as string,
    totalCost: (po.total_cost as number) || 0,
    createdAt: po.created_at as string,
    approvedAt: (po.approved_at as string | null) ?? null,
    purchasedAt: (po.purchased_at as string | null) ?? null,
    receivedAt: (po.received_at as string | null) ?? null,
    notes: (po.notes as string | null) ?? null,
    lineCount: lines?.length || 0,
    lines: (lines || []).map((l) => ({
      id: l.id as string,
      productId: l.product_id as string,
      productName: ((l.products as unknown) as { name: string })?.name || "—",
      qtyOrdered: l.qty_ordered as number,
      qtyReceived: (l.qty_received as number) || 0,
      unitCost: (l.unit_cost as number) || 0,
    })),
  };
}

export async function transitionPO(poId: string, newStatus: "Approved" | "Purchased" | "Cancelled") {
  const supabase = createServerClient();
  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "Approved") update.approved_at = new Date().toISOString();
  if (newStatus === "Purchased") update.purchased_at = new Date().toISOString();
  const { error } = await supabase.from("purchase_orders").update(update).eq("id", poId);
  if (error) throw new Error(`transitionPO: ${error.message}`);
}

export async function receivePOLines(
  poId: string,
  receipts: Array<{ lineId: string; qtyReceivedDelta: number }>,
  createdBy?: string
) {
  const supabase = createServerClient();
  // Fetch current line state
  const { data: lines } = await supabase
    .from("po_lines")
    .select("id, product_id, qty_ordered, qty_received")
    .eq("po_id", poId);
  if (!lines?.length) throw new Error("PO has no lines");

  for (const receipt of receipts) {
    if (receipt.qtyReceivedDelta <= 0) continue;
    const line = lines.find((l) => l.id === receipt.lineId);
    if (!line) continue;
    const newReceived = (line.qty_received || 0) + receipt.qtyReceivedDelta;
    const { error } = await supabase
      .from("po_lines")
      .update({ qty_received: newReceived })
      .eq("id", line.id);
    if (error) throw new Error(`receivePOLines update: ${error.message}`);

    await recordStockMovement({
      productId: line.product_id as string,
      location: "warehouse",
      qty: receipt.qtyReceivedDelta,
      reason: "purchase",
      referenceId: poId,
      notes: `PO ${poId.slice(0, 8)} receipt`,
      createdBy: createdBy ?? null,
    });
  }

  // If every line is fully received, mark PO as Received
  const { data: fresh } = await supabase
    .from("po_lines")
    .select("qty_ordered, qty_received")
    .eq("po_id", poId);
  const allReceived = (fresh || []).every((l) => (l.qty_received || 0) >= (l.qty_ordered || 0));
  if (allReceived) {
    await supabase
      .from("purchase_orders")
      .update({ status: "Received", received_at: new Date().toISOString() })
      .eq("id", poId);
  }
}
