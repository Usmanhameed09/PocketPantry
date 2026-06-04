/**
 * Exception Queue — single place to find and fix data-quality issues
 * surfacing across the app.
 *
 * Types:
 *   missing_cost      — product with unit_cost = 0 or null, recently sold
 *   missing_price     — product with default_vend_price = 0/null, in a machine
 *   suspicious_cost   — unit_cost > 1.2 × avg revenue/unit (case price stored as unit)
 *   negative_stock    — machine_inventory.estimated_remaining < 0
 *   unmapped_product  — product auto-created from sync with no vendor / category
 *                       (operator hasn't completed its metadata)
 *   stale_machine     — machine hasn't synced in 7+ days
 *
 * Each exception has a fixAction string that the UI uses to render the right
 * control (input, button, etc.) and the /api/exceptions/resolve endpoint
 * uses to apply the change.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

export type ExceptionType =
  | "missing_cost"
  | "missing_price"
  | "suspicious_cost"
  | "negative_stock"
  | "unmapped_product"
  | "stale_machine";

export type Exception = {
  id: string;                  // stable client-side key
  type: ExceptionType;
  severity: "low" | "medium" | "high";
  productId?: string;
  productName?: string;
  machineId?: string;
  machineName?: string;
  // Human-readable explanation of what's wrong
  message: string;
  // Short label for the action button (e.g. "Enter cost", "Reset to 0")
  fixAction: string;
  // Current value (when applicable) so the UI can pre-fill the form
  currentValue?: number | string | null;
  // When this issue first became detectable (best-effort — we don't store
  // exception history yet, just inspect current state).
  detectedAt: string;
};

export async function detectExceptions(): Promise<Exception[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const out: Exception[] = [];

  // ─── 1. Products with missing cost ─────────────────────────────────
  // Only flag Active products to avoid noise from phased-out items.
  // Paginate past Supabase 1000-row cap.
  type ProductRow = {
    id: string; name: string; sku: string; category: string;
    unit_cost: number | null; default_vend_price: number | null;
    vendor: string | null; case_size: number | null; barcode: string | null;
    status: string;
  };
  const products: ProductRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, category, unit_cost, default_vend_price, vendor, case_size, barcode, status")
      .eq("company_id", companyId)
      .eq("status", "Active")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    products.push(...(data as unknown as ProductRow[]));
    if (data.length < PAGE) break;
  }

  // Pull machine_inventory rows so we can tell which products are actually
  // in a machine (so missing data on a never-stocked product isn't an issue
  // worth flagging).
  const { data: machineInvRows } = await supabase
    .from("machine_inventory")
    .select("product_id, machine_id, estimated_remaining, machines(name)");
  const productInMachine = new Set<string>();
  for (const m of (machineInvRows || []) as Array<{ product_id: string }>) {
    productInMachine.add(m.product_id);
  }

  // 30-day sales per product for the suspicious-cost detector
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: salesRows } = await supabase
    .from("daily_sales")
    .select("product_id, units_sold, revenue")
    .gte("sale_date", since.toISOString().slice(0, 10))
    .range(0, 49999);

  const sales = new Map<string, { units: number; revenue: number }>();
  for (const r of (salesRows || []) as Array<{ product_id: string; units_sold: number; revenue: number }>) {
    const e = sales.get(r.product_id) || { units: 0, revenue: 0 };
    e.units += r.units_sold || 0;
    e.revenue += r.revenue || 0;
    sales.set(r.product_id, e);
  }

  for (const p of products) {
    const recent = sales.get(p.id);
    const inMachine = productInMachine.has(p.id);
    const cost = p.unit_cost;
    const price = p.default_vend_price;

    // missing_cost — flag if product is in a machine OR sold recently and
    // cost is empty. Phased-out products are already excluded by the query.
    if ((cost === null || cost === 0) && (inMachine || (recent && recent.units > 0))) {
      out.push({
        id: `missing_cost:${p.id}`,
        type: "missing_cost",
        severity: "high",
        productId: p.id,
        productName: p.name,
        message: `Unit cost not set${recent ? ` (sold ${recent.units} units in last 30d)` : ""}.`,
        fixAction: "Enter cost ($/unit)",
        currentValue: cost,
        detectedAt: now,
      });
      continue; // Don't double-flag the same product for suspicious_cost
    }

    // missing_price — only flag if cost is set (otherwise missing_cost
    // already covered it) AND product is in a machine.
    if ((price === null || price === 0) && inMachine && cost !== null && cost > 0) {
      out.push({
        id: `missing_price:${p.id}`,
        type: "missing_price",
        severity: "medium",
        productId: p.id,
        productName: p.name,
        message: "Vending price not set — pricing engine has nothing to suggest from.",
        fixAction: "Enter vending price ($)",
        currentValue: price,
        detectedAt: now,
      });
    }

    // suspicious_cost — cost > 1.2× avg revenue/unit means the stored cost
    // is probably a case price misfiled as unit price.
    if (cost !== null && cost > 0 && recent && recent.units > 0) {
      const avgRev = recent.revenue / recent.units;
      if (avgRev > 0 && cost > avgRev * 1.2) {
        out.push({
          id: `suspicious_cost:${p.id}`,
          type: "suspicious_cost",
          severity: "high",
          productId: p.id,
          productName: p.name,
          message:
            `Cost ($${cost.toFixed(2)}) is higher than the avg selling price ` +
            `($${avgRev.toFixed(2)}). Likely a case price stored as unit price.`,
          fixAction: "Enter correct unit cost ($)",
          currentValue: cost,
          detectedAt: now,
        });
      }
    }

    // unmapped_product — product was auto-created from sync but still has
    // default-ish metadata (no vendor, no case_size, generic category).
    // Only flag if product is in a machine (it's actively used).
    const isUnmapped =
      inMachine &&
      (!p.vendor || p.vendor.trim() === "") &&
      (!p.case_size || p.case_size <= 1) &&
      !p.barcode;
    if (isUnmapped) {
      out.push({
        id: `unmapped_product:${p.id}`,
        type: "unmapped_product",
        severity: "low",
        productId: p.id,
        productName: p.name,
        message: "Auto-created from sales sync. Vendor, case size, and barcode not yet filled in.",
        fixAction: "Open product to fill in",
        detectedAt: now,
      });
    }
  }

  // ─── 2. Negative stock estimates ──────────────────────────────────
  type MIRow = {
    id: string; product_id: string; machine_id: string;
    estimated_remaining: number;
    products?: { name?: string };
    machines?: { name?: string };
  };
  const { data: negStock } = await supabase
    .from("machine_inventory")
    .select("id, product_id, machine_id, estimated_remaining, products(name), machines(name)")
    .lt("estimated_remaining", 0)
    .range(0, 999);
  for (const r of (negStock || []) as MIRow[]) {
    out.push({
      id: `negative_stock:${r.id}`,
      type: "negative_stock",
      severity: "medium",
      productId: r.product_id,
      productName: r.products?.name || r.product_id,
      machineId: r.machine_id,
      machineName: r.machines?.name || r.machine_id,
      message:
        `Stock estimate is ${r.estimated_remaining}. Either the machine sold ` +
        `more than we knew was loaded, or a refill wasn't logged.`,
      fixAction: "Reset to 0 + log adjustment",
      currentValue: r.estimated_remaining,
      detectedAt: now,
    });
  }

  // ─── 3. Stale machines ────────────────────────────────────────────
  // Bug: I was using machines.updated_at (when the row was last edited in
  // our DB — basically never, after the machine was first added). Result:
  // every machine that hadn't been edited in a week was flagged stale,
  // even though sales were syncing fresh.
  //
  // Correct field: machines.last_sync_at = when the cron last successfully
  // pulled from Nayax/HAHA for this machine. Threshold tightened from 7d
  // to 3d to match the Nayax-side offline detector.
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 3);
  const { data: stale } = await supabase
    .from("machines")
    .select("id, name, status, last_sync_at")
    .eq("company_id", companyId)
    .neq("status", "offline")
    .or(`last_sync_at.is.null,last_sync_at.lt.${staleCutoff.toISOString()}`)
    .range(0, 999);
  for (const m of (stale || []) as Array<{ id: string; name: string; last_sync_at: string | null }>) {
    if (!m.last_sync_at) {
      out.push({
        id: `stale_machine:${m.id}`,
        type: "stale_machine",
        severity: "medium",
        machineId: m.id,
        machineName: m.name,
        message: "Machine has never reported a sync. It may have been added without an API token / device ID.",
        fixAction: "Mark offline",
        detectedAt: now,
      });
      continue;
    }
    const days = Math.floor(
      (Date.now() - new Date(m.last_sync_at).getTime()) / (24 * 60 * 60 * 1000),
    );
    out.push({
      id: `stale_machine:${m.id}`,
      type: "stale_machine",
      severity: "medium",
      machineId: m.id,
      machineName: m.name,
      message: `No sync from Nayax/HAHA in ${days} days, but status is Healthy.`,
      fixAction: "Mark offline",
      currentValue: days,
      detectedAt: now,
    });
  }

  // Sort: high severity first, then medium, then low
  const sevRank = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  return out;
}
