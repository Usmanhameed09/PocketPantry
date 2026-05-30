/**
 * Projection engine (Sprint 3). Computes per-SKU sales velocity and 30-day
 * projection from stock_movements where reason='sale_estimate'. Applies
 * seasonal multipliers + manual overrides.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { todayInOperatorTz, dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export type ProjectionRow = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  cost: number;
  velocityPerDay: number;      // raw, pre-multiplier
  seasonalMultiplier: number;
  projectedUnits30d: number;   // final, after multiplier + override
  projectedCogs30d: number;
  override: number | null;
  explanation: string;
};

export type ProjectionSettings = {
  windowWeeks: number;
  safetyStockDays: number;
  horizonDays: number;
};

export async function getProjectionSettings(): Promise<ProjectionSettings> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("projection_settings")
    .select("window_weeks, safety_stock_days, horizon_days")
    .eq("company_id", companyId)
    .maybeSingle();
  return {
    windowWeeks: (data?.window_weeks as number) ?? 6,
    safetyStockDays: (data?.safety_stock_days as number) ?? 5,
    horizonDays: (data?.horizon_days as number) ?? 7,
  };
}

export async function saveProjectionSettings(input: Partial<ProjectionSettings>) {
  const companyId = await ensureDefaultCompany();
  const current = await getProjectionSettings();
  const merged = { ...current, ...input };
  const supabase = createServerClient();
  const { error } = await supabase.from("projection_settings").upsert(
    {
      company_id: companyId,
      window_weeks: merged.windowWeeks,
      safety_stock_days: merged.safetyStockDays,
      horizon_days: merged.horizonDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) throw new Error(`saveProjectionSettings: ${error.message}`);
  return merged;
}

async function getSeasonalMultipliers(): Promise<Map<string, number>> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("seasonal_multipliers")
    .select("category, month, multiplier")
    .eq("company_id", companyId);
  const map = new Map<string, number>();
  for (const row of data || []) {
    map.set(`${row.category}::${row.month}`, row.multiplier as number);
  }
  return map;
}

async function getOverridesByProduct(): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const today = todayInOperatorTz();
  const { data } = await supabase
    .from("projection_overrides")
    .select("product_id, units_override, valid_from, valid_to")
    .lte("valid_from", today);
  const map = new Map<string, number>();
  for (const row of data || []) {
    const validTo = row.valid_to as string | null;
    if (validTo && validTo < today) continue;
    map.set(row.product_id as string, row.units_override as number);
  }
  return map;
}

export async function getProjections(): Promise<ProjectionRow[]> {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const settings = await getProjectionSettings();
  const seasonal = await getSeasonalMultipliers();
  const overrides = await getOverridesByProduct();
  const month = new Date().getMonth() + 1;

  // Supabase enforces a 1000-row page cap. The catalog is now 6k+ after the
  // supplier UPC import, so we paginate to scan the whole thing — otherwise
  // products beyond row 1000 never get a velocity match.
  type ProductRow = { id: string; name: string; sku: string; category: string; unit_cost: number; status: string };
  const PAGE = 1000;
  const products: ProductRow[] = [];
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, category, unit_cost, status")
      .eq("company_id", companyId)
      .neq("status", "PhaseOut")
      .order("name")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    products.push(...(data as unknown as ProductRow[]));
    if (data.length < PAGE) break;
  }

  if (!products.length) return [];

  // Velocity source: aggregate the last 30 days of daily_sales rows.
  // Previously we used machine_inventory.daily_sales_rate which the scraper
  // computes as total_sold / max(1, days_span) — so a product with 1 sale
  // ever shows as 1/day forever, and summing across N machines gives N×
  // inflated velocity. That's why operators were seeing projections 3-5×
  // larger than the actual Reports numbers for the same window.
  //
  // daily_sales is the real per-day transaction count (one row per product /
  // machine / day). Sum units_sold across the last 30 days, divide by 30,
  // get a real fleet-wide per-day velocity.
  const since = dateNDaysAgoInOperatorTz(30);
  const dailySalesRows: Array<{ product_id: string; machine_id: string; units_sold: number }> = [];
  const DS_PAGE = 1000;
  for (let from = 0; from < 100000; from += DS_PAGE) {
    const { data, error } = await supabase
      .from("daily_sales")
      .select("product_id, machine_id, units_sold")
      .gte("sale_date", since)
      .range(from, from + DS_PAGE - 1);
    if (error) break;
    if (!data || data.length === 0) break;
    dailySalesRows.push(...(data as Array<{ product_id: string; machine_id: string; units_sold: number }>));
    if (data.length < DS_PAGE) break;
  }

  const unitsByProduct = new Map<string, number>();
  const machinesByProduct = new Map<string, Set<string>>();
  for (const r of dailySalesRows) {
    const pid = r.product_id;
    unitsByProduct.set(pid, (unitsByProduct.get(pid) || 0) + (r.units_sold || 0));
    if (!machinesByProduct.has(pid)) machinesByProduct.set(pid, new Set());
    machinesByProduct.get(pid)!.add(r.machine_id);
  }
  const velocityByProduct = new Map<string, number>();
  const machineCountByProduct = new Map<string, number>();
  for (const [pid, units] of unitsByProduct.entries()) {
    // Per-day velocity over the 30d window. Stays per-day (not per-machine)
    // so projectedUnits30d = velocity * 30 matches Reports' "last 30 days"
    // total for the same product when there's no seasonal multiplier.
    velocityByProduct.set(pid, units / 30);
    machineCountByProduct.set(pid, machinesByProduct.get(pid)?.size || 0);
  }

  const rows: ProjectionRow[] = [];
  for (const p of products) {
    const productId = p.id as string;
    const velocity = velocityByProduct.get(productId) || 0;
    const override = overrides.get(productId) ?? null;

    // Skip products with zero projected demand AND no manual override —
    // they have no sales history and don't belong on the projections view.
    // (They're still tracked in the catalog and will appear automatically
    // once they start selling or get an override.)
    if (velocity === 0 && override === null) continue;

    const machineCount = machineCountByProduct.get(productId) || 0;
    const mult = seasonal.get(`${p.category}::${month}`) ?? 1.0;
    const baseProjection = velocity * 30 * mult;
    const projectedUnits = override !== null ? override : Math.round(baseProjection * 10) / 10;
    const cost = (p.unit_cost as number) || 0;

    let explanation: string;
    if (override !== null) {
      explanation = `Manual override: ${override} units/30d`;
    } else {
      const multText = mult !== 1.0 ? ` × ${mult.toFixed(2)} seasonal` : "";
      const machineText = machineCount > 1 ? ` across ${machineCount} machines` : "";
      explanation = `${velocity.toFixed(2)} units/day${machineText}${multText} × 30d`;
    }

    rows.push({
      productId,
      productName: p.name as string,
      sku: p.sku as string,
      category: p.category as string,
      cost,
      velocityPerDay: Math.round(velocity * 100) / 100,
      seasonalMultiplier: mult,
      projectedUnits30d: projectedUnits,
      projectedCogs30d: Math.round(projectedUnits * cost * 100) / 100,
      override,
      explanation,
    });
  }

  return rows;
}

export async function saveSeasonalMultiplier(input: {
  category: string;
  month: number;
  multiplier: number;
}) {
  const companyId = await ensureDefaultCompany();
  const supabase = createServerClient();
  const { error } = await supabase.from("seasonal_multipliers").upsert(
    {
      company_id: companyId,
      category: input.category,
      month: input.month,
      multiplier: input.multiplier,
      location_id: null,
    },
    { onConflict: "company_id,category,month,location_id" }
  );
  if (error) throw new Error(`saveSeasonalMultiplier: ${error.message}`);
}

export async function saveProjectionOverride(input: {
  productId: string;
  unitsOverride: number;
  reason?: string;
  validFrom?: string;
  validTo?: string | null;
}) {
  const supabase = createServerClient();
  const { error } = await supabase.from("projection_overrides").insert({
    product_id: input.productId,
    units_override: input.unitsOverride,
    reason: input.reason ?? null,
    valid_from: input.validFrom ?? new Date().toISOString().slice(0, 10),
    valid_to: input.validTo ?? null,
  });
  if (error) throw new Error(`saveProjectionOverride: ${error.message}`);
}
