/**
 * Buy-list + PO generator (Sprint 4).
 *
 * Buy qty (raw units) = (projected_demand × seasonal × horizon)
 *                     + (safety_stock_days × velocity)
 *                     − warehouse_on_hand
 *                     − machine_estimated_remaining
 *                     − reserved_in_open_pos
 *
 * Then rounded UP to the nearest whole case using products.case_size,
 * because vendors sell in cases not loose units.
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
  caseSize: number;             // units per case (1 if not configured)
  caseCost: number;             // unitCost × caseSize
  warehouseOnHand: number;
  inMachines: number;           // estimated remaining across all machines
  reservedInOpenPos: number;
  velocityPerDay: number;
  horizonDemand: number;
  safetyBuffer: number;
  netNeedUnits: number;         // raw units needed before case rounding
  recommendedCases: number;     // whole cases to order
  recommendedQty: number;       // recommendedCases × caseSize (display units)
  estimatedCost: number;
  explanation: string;
  // false = no refill has ever been logged for this product in any machine,
  // so "inMachines" is UNKNOWN (shown as 0), not a real zero.
  machineStockTracked: boolean;
  costKnown: boolean;           // false = no unit cost on file → $0 line
  variants: string[];           // other catalog names folded into this line
};

export type BuyListResult = {
  generatedAt: string;
  horizonDays: number;
  safetyStockDays: number;
  lines: BuyListLine[];
  vendorGroups: Array<{ vendor: string; lines: BuyListLine[]; subtotal: number }>;
  dataQuality: {
    machineStockTracked: boolean;   // any refill baseline anywhere in the fleet
    linesMissingCost: number;       // recommended lines with no unit cost
    linesWithoutCaseSize: number;   // recommended lines with case size 1 (unset)
    staleDraftPOs: number;          // Draft POs older than 14d, ignored as "reserved"
  };
};

// A Draft PO older than this is treated as abandoned: it was never placed, so
// its lines must not keep suppressing the buy list as "incoming" stock.
const STALE_DRAFT_DAYS = 14;

async function getReservedByProduct(): Promise<{ reserved: Map<string, number>; staleDrafts: number }> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("po_lines")
    .select("product_id, qty_ordered, qty_received, po_id, purchase_orders!inner(status, created_at)")
    .in("purchase_orders.status", ["Draft", "Approved", "Purchased"]);
  const cutoff = Date.now() - STALE_DRAFT_DAYS * 864e5;
  const map = new Map<string, number>();
  const stale = new Set<string>();
  for (const r of (data || []) as unknown as Array<{
    product_id: string;
    qty_ordered: number;
    qty_received: number;
    po_id: string;
    purchase_orders: { status: string; created_at: string };
  }>) {
    const po = r.purchase_orders;
    if (po?.status === "Draft" && new Date(po.created_at).getTime() < cutoff) {
      stale.add(r.po_id);
      continue;
    }
    const open = (r.qty_ordered || 0) - (r.qty_received || 0);
    if (open > 0) {
      map.set(r.product_id, (map.get(r.product_id) || 0) + open);
    }
  }
  return { reserved: map, staleDrafts: stale.size };
}

export async function generateBuyList(): Promise<BuyListResult> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const settings = await getProjectionSettings();
  const projections = await getProjections();
  const { reserved, staleDrafts } = await getReservedByProduct();

  // ── Catalog variants ────────────────────────────────────────────────
  // The same physical item often exists as several catalog rows: the Nayax
  // name that SELLS ("Coke 16.9 oz Bottle") and the purchased/receipt name
  // that holds warehouse STOCK, cost and case size. product_groups (migration
  // 008) links them. Aggregate per group so sales on one variant are netted
  // against stock on another, and cost/case size come from the variant that
  // is actually bought. Ungrouped products are a group of one.
  const productIds = projections.map((p) => p.productId);
  const safeIds = productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"];

  type CatalogRow = { id: string; name: string; vendor: string | null; case_size: number | null; unit_cost: number | null; group_id: string | null };
  const catalog = new Map<string, CatalogRow>();
  for (let i = 0; i < safeIds.length; i += 200) {
    const { data } = await supabase
      .from("products")
      .select("id, name, vendor, case_size, unit_cost, group_id")
      .in("id", safeIds.slice(i, i + 200));
    for (const p of (data || []) as CatalogRow[]) catalog.set(p.id, p);
  }
  const groupIds = [...new Set([...catalog.values()].map((p) => p.group_id).filter((g): g is string => !!g))];
  for (let i = 0; i < groupIds.length; i += 200) {
    const { data } = await supabase
      .from("products")
      .select("id, name, vendor, case_size, unit_cost, group_id")
      .in("group_id", groupIds.slice(i, i + 200));
    for (const p of (data || []) as CatalogRow[]) catalog.set(p.id, p);
  }
  const groupKeyOf = (productId: string) => catalog.get(productId)?.group_id || productId;
  const membersByGroup = new Map<string, CatalogRow[]>();
  for (const p of catalog.values()) {
    const k = p.group_id || p.id;
    const arr = membersByGroup.get(k) || [];
    arr.push(p);
    membersByGroup.set(k, arr);
  }

  const { data: warehouse } = await supabase
    .from("warehouse_inventory")
    .select("product_id, on_hand")
    .eq("company_id", companyId);
  const onHandById = new Map(
    (warehouse || []).map((w) => [w.product_id as string, (w.on_hand as number) || 0])
  );

  // Machine stock is only KNOWN once a refill has been logged for that
  // product/machine (last_loaded_qty = the baseline; remaining = baseline −
  // sales since). Without a baseline estimated_remaining is always 0, so we
  // track whether it's a real zero or "not tracked yet".
  const inMachinesById = new Map<string, number>();
  const trackedIds = new Set<string>();
  for (let from = 0; from < 50000; from += 1000) {
    const { data } = await supabase
      .from("machine_inventory")
      .select("product_id, estimated_remaining, last_loaded_qty")
      .range(from, from + 999);
    if (!data?.length) break;
    for (const m of data) {
      const pid = m.product_id as string;
      if (((m.last_loaded_qty as number) || 0) <= 0) continue;
      trackedIds.add(pid);
      inMachinesById.set(pid, (inMachinesById.get(pid) || 0) + ((m.estimated_remaining as number) || 0));
    }
    if (data.length < 1000) break;
  }
  const fleetTracked = trackedIds.size > 0;

  // Collapse projections into one entry per group.
  const byGroup = new Map<string, typeof projections>();
  for (const p of projections) {
    const k = groupKeyOf(p.productId);
    const arr = byGroup.get(k) || [];
    arr.push(p);
    byGroup.set(k, arr);
  }

  const lines: BuyListLine[] = [...byGroup.entries()].map(([groupKey, projs]) => {
    const members = membersByGroup.get(groupKey) || projs.map((p) => ({ id: p.productId } as CatalogRow));
    const memberIds = members.map((m) => m.id);
    // Display = the best-selling variant; order = the variant we actually buy
    // (has a cost, prefer one with a real case size), else the best seller.
    const topSeller = [...projs].sort((a, b) => b.velocityPerDay - a.velocityPerDay)[0];
    const buyVariant =
      members.find((m) => (m.unit_cost || 0) > 0 && (m.case_size || 1) > 1) ||
      members.find((m) => (m.unit_cost || 0) > 0) ||
      catalog.get(topSeller.productId) ||
      ({ id: topSeller.productId } as CatalogRow);
    const unitCost = (buyVariant.unit_cost as number) || topSeller.cost || 0;
    const caseSize = Math.max(1, (buyVariant.case_size as number) || 1);
    const vendor = buyVariant.vendor || catalog.get(topSeller.productId)?.vendor || "Default";

    const sum = (m: Map<string, number>) => memberIds.reduce((s, id) => s + (m.get(id) || 0), 0);
    const onHand = sum(onHandById);
    const inMachines = sum(inMachinesById);
    const reservedQty = sum(reserved);
    const machineTracked = memberIds.some((id) => trackedIds.has(id));

    const velocity = projs.reduce((s, p) => s + p.velocityPerDay * (p.seasonalMultiplier || 1), 0);
    const horizonDemand = velocity * settings.horizonDays;
    const safety = velocity * settings.safetyStockDays;
    // Subtract ALL stock that will help meet demand (warehouse + in-machine + reserved POs)
    const netNeedUnits = horizonDemand + safety - onHand - inMachines - reservedQty;
    // Round UP to whole cases (vendors don't sell loose units)
    const recommendedCases = netNeedUnits > 0 ? Math.ceil(netNeedUnits / caseSize) : 0;
    const recommendedQty = recommendedCases * caseSize;
    const caseCost = Math.round(unitCost * caseSize * 100) / 100;
    const variants = [...new Set(members.map((m) => m.name).filter((n) => n && n !== topSeller.productName))];

    const explanation =
      `${velocity.toFixed(2)}/day × ${settings.horizonDays}d + ${settings.safetyStockDays}d safety = ${(horizonDemand + safety).toFixed(1)} need` +
      `, minus ${onHand} warehouse + ${machineTracked ? `${inMachines} in-machine` : "in-machine not tracked (no refill logged)"}` +
      `${reservedQty > 0 ? ` + ${reservedQty} reserved` : ""}` +
      (recommendedCases > 0
        ? ` = order ${recommendedCases} case${recommendedCases === 1 ? "" : "s"} of ${caseSize}`
        : ` = no order needed`) +
      (variants.length > 0 ? ` · includes ${variants.length} other catalog name${variants.length === 1 ? "" : "s"}` : "");

    return {
      productId: buyVariant.id,
      productName: topSeller.productName,
      sku: projs.find((p) => p.productId === buyVariant.id)?.sku || topSeller.sku,
      category: topSeller.category,
      vendor,
      unitCost,
      caseSize,
      caseCost,
      warehouseOnHand: onHand,
      inMachines,
      reservedInOpenPos: reservedQty,
      velocityPerDay: velocity,
      horizonDemand: Math.round(horizonDemand * 10) / 10,
      safetyBuffer: Math.round(safety * 10) / 10,
      netNeedUnits: Math.round(netNeedUnits * 10) / 10,
      recommendedCases,
      recommendedQty,
      estimatedCost: Math.round(recommendedQty * unitCost * 100) / 100,
      explanation,
      machineStockTracked: machineTracked,
      costKnown: unitCost > 0,
      variants,
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

  const recommended = vendorGroups.flatMap((g) => g.lines);
  return {
    generatedAt: new Date().toISOString(),
    horizonDays: settings.horizonDays,
    safetyStockDays: settings.safetyStockDays,
    lines,
    vendorGroups,
    dataQuality: {
      machineStockTracked: fleetTracked,
      linesMissingCost: recommended.filter((l) => !l.costKnown).length,
      linesWithoutCaseSize: recommended.filter((l) => l.caseSize <= 1).length,
      staleDraftPOs: staleDrafts,
    },
  };
}

export async function createPurchaseOrdersFromBuyList(
  buyList: BuyListResult,
  createdBy?: string
): Promise<string[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();

  // The scraped vendor names are not the operator's actual suppliers — they
  // came from the Nayax product feed and don't reflect who the operator
  // actually buys from. Roll every recommended line into ONE PO so the
  // operator can edit/approve as a single purchase document.
  const allLines = buyList.vendorGroups.flatMap((g) => g.lines);
  if (allLines.length === 0) return [];

  const totalCost = Math.round(
    allLines.reduce((s, l) => s + l.estimatedCost, 0) * 100
  ) / 100;

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: companyId,
      supplier_name: "Purchase Order",
      status: "Draft",
      total_cost: totalCost,
      created_by: createdBy || null,
    })
    .select("id")
    .single();
  if (error || !po?.id) throw new Error(`createPO: ${error?.message}`);

  const lineRows = allLines.map((l) => ({
    po_id: po.id,
    product_id: l.productId,
    qty_ordered: l.recommendedQty,
    unit_cost: l.unitCost,
  }));
  const { error: linesError } = await supabase.from("po_lines").insert(lineRows);
  if (linesError) throw new Error(`createPOLines: ${linesError.message}`);

  return [po.id as string];
}

export async function deletePurchaseOrder(poId: string, actor?: string): Promise<void> {
  const supabase = createServerClient();
  const { data: oldPo } = await supabase
    .from("purchase_orders")
    .select("status, total_cost, supplier_name")
    .eq("id", poId)
    .maybeSingle();
  // Delete lines first (FK), then the PO itself.
  await supabase.from("po_lines").delete().eq("po_id", poId);
  const { error } = await supabase.from("purchase_orders").delete().eq("id", poId);
  if (error) throw new Error(`deletePurchaseOrder: ${error.message}`);

  const { recordAuditEvent } = await import("@/lib/audit-log");
  await recordAuditEvent({
    actionType: "po_delete",
    entityType: "purchase_order",
    entityId: poId,
    entityName: poId.slice(0, 8),
    actor: actor || null,
    oldValue: {
      status: oldPo?.status ?? null,
      total_cost: oldPo?.total_cost ?? null,
      supplier_name: oldPo?.supplier_name ?? null,
    },
  });
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

export async function transitionPO(
  poId: string,
  newStatus: "Approved" | "Purchased" | "Cancelled",
  actor?: string,
) {
  const supabase = createServerClient();
  const { data: oldPo } = await supabase
    .from("purchase_orders")
    .select("status, total_cost")
    .eq("id", poId)
    .maybeSingle();

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "Approved") update.approved_at = new Date().toISOString();
  if (newStatus === "Purchased") update.purchased_at = new Date().toISOString();
  const { error } = await supabase.from("purchase_orders").update(update).eq("id", poId);
  if (error) throw new Error(`transitionPO: ${error.message}`);

  // Per operator request: APPROVING a PO auto-replenishes the warehouse — it
  // receives every line's outstanding quantity (ordered − already received)
  // straight into warehouse stock, so the operator doesn't have to run a
  // separate Receive step. The Receive screen stays editable afterward to
  // correct short/over deliveries. Only fires on the first move to Approved.
  if (newStatus === "Approved" && oldPo?.status !== "Approved") {
    const { data: lines } = await supabase
      .from("po_lines")
      .select("id, qty_ordered, qty_received")
      .eq("po_id", poId);
    const receipts = (lines || [])
      .map((l) => ({
        lineId: l.id as string,
        qtyReceivedDelta: ((l.qty_ordered as number) || 0) - ((l.qty_received as number) || 0),
      }))
      .filter((r) => r.qtyReceivedDelta > 0);
    if (receipts.length > 0) {
      await receivePOLines(poId, receipts, actor);
    }
  }

  // Audit the status transition so the owner can answer "who approved
  // PO 6b9a72cc, and when?".
  const { recordAuditEvent } = await import("@/lib/audit-log");
  await recordAuditEvent({
    actionType: "po_status_change",
    entityType: "purchase_order",
    entityId: poId,
    entityName: poId.slice(0, 8),
    actor: actor || null,
    oldValue: { status: oldPo?.status ?? null },
    newValue: { status: newStatus, total_cost: oldPo?.total_cost ?? null },
  });
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
