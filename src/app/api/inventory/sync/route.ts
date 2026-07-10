import { NextResponse } from "next/server";
import {
  ensureMachine,
  ensureProductsBatch,
  batchUpsertMachineInventory,
} from "@/lib/inventory-store";
import { createServerClient } from "@/lib/supabase";
import { dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "https://arbersaas.duckdns.org/api2";

/**
 * Bulk-upsert daily_sales rows from Nayax's per-day breakdown. Each row is
 * (product, machine, date) → units sold that day. Upsert on conflict so
 * re-syncing the same day overwrites with the latest count rather than
 * duplicating.
 */
async function bulkUpsertDailySales(
  rows: Array<{ productId: string; machineId: string; date: string; units: number; revenue: number }>
) {
  if (rows.length === 0) return 0;
  const supabase = createServerClient();
  const insertRows = rows
    .filter((r) => r.units > 0)
    .map((r) => ({
      product_id: r.productId,
      machine_id: r.machineId,
      sale_date: r.date,
      units_sold: r.units,
      revenue: r.revenue,
      updated_at: new Date().toISOString(),
    }));
  let written = 0;
  for (let i = 0; i < insertRows.length; i += 500) {
    const chunk = insertRows.slice(i, i + 500);
    const { error } = await supabase
      .from("daily_sales")
      .upsert(chunk, { onConflict: "product_id,machine_id,sale_date" });
    if (error) {
      // Table might not exist yet — log and continue (sync still useful)
      if (error.code === "PGRST205" || error.code === "42P01") {
        console.warn("[sync] daily_sales table missing — run migration 003_daily_sales.sql");
        return 0;
      }
      throw error;
    }
    written += chunk.length;
  }
  return written;
}

/**
 * Bulk-write sale_estimate ledger rows for the projection engine.
 * Skips (product, machine) pairs that already have a row in the last 23h
 * so re-running the sync the same day doesn't double-count.
 */
async function bulkRecordSaleEstimates(
  rows: Array<{ productId: string; machineId: string; dailySalesRate: number }>
) {
  if (rows.length === 0) return;
  const supabase = createServerClient();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 23);

  // Single query for ALL recently-recorded estimates
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const { data: recent } = await supabase
    .from("stock_movements")
    .select("product_id, machine_id")
    .in("product_id", productIds)
    .eq("reason", "sale_estimate")
    .gte("created_at", cutoff.toISOString());

  const seen = new Set<string>();
  for (const r of recent || []) {
    seen.add(`${r.product_id}|${r.machine_id}`);
  }

  const toInsert = rows
    .filter((r) => r.dailySalesRate > 0)
    .filter((r) => !seen.has(`${r.productId}|${r.machineId}`))
    .map((r) => ({
      product_id: r.productId,
      location: r.machineId,
      machine_id: r.machineId,
      qty: -Math.round(r.dailySalesRate * 100) / 100,
      reason: "sale_estimate",
      notes: `Nayax sync (${r.dailySalesRate.toFixed(2)}/day)`,
    }));

  if (toInsert.length === 0) return;
  // Insert in chunks of 200 to stay under Supabase request limits
  for (let i = 0; i < toInsert.length; i += 200) {
    await supabase.from("stock_movements").insert(toInsert.slice(i, i + 200));
  }
}

interface NayaxProduct {
  name: string;
  total_sold: number;
  sold_since_refill: number;
  daily_sales_rate: number;
  sale_count: number;
  daily_breakdown?: Record<string, number>;  // {"YYYY-MM-DD": units}
  daily_revenue?: Record<string, number>;
}

interface NayaxMachineStatus {
  machine_id: string;
  machine_name: string;
  nayax_device_id: string;
  refill_datetime: string | null;
  qty_sold_since_visit: number;
  products: NayaxProduct[];
}

/**
 * POST/GET /api/inventory/sync — Fetch live sales and sync to Supabase.
 *
 * ?scope controls how much runs, so the UI can get the fast, headline-critical
 * part back quickly instead of waiting on the slow 30-day Chinese history:
 *   - scope=fast     → Nayax only (today's revenue lands fast) — the Refresh button
 *   - scope=chinese  → HAHA/Chinese 30-day history only — fired in the background
 *   - (default/full) → both — used by the scheduled cron
 * GET supported so cron-job.org can hit it without configuring a body.
 */
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req?: Request) {
  const scope = req ? (new URL(req.url).searchParams.get("scope") || "full") : "full";
  // scope=today → the LIGHTEST pull: fetch Nayax, write ONLY today's (and
  // yesterday's, for tz safety) daily_sales, skip machine_inventory / ledger /
  // 30-day history / Chinese. This is what the Today page auto-refreshes so the
  // revenue number stays live in ~14s instead of the full ~33s sync.
  const todayOnly = scope === "today";
  const doNayax = scope === "fast" || scope === "nayax" || scope === "today" || scope === "full";
  const doChinese = scope === "chinese" || scope === "full";
  const recentCutoff = dateNDaysAgoInOperatorTz(1); // yesterday (operator tz)
  try {
    // 1. Fetch inventory status from scraper-api (Nayax). Skipped for the
    //    Chinese-only background pass.
    let machines: NayaxMachineStatus[] = [];
    if (doNayax) {
      const resp = await fetch(`${SCRAPER_API_URL}/api/machines/inventory-status`, {
        headers: {
          "x-api-key": process.env.SCRAPER_BACKEND_KEY || process.env.API_KEY || "",
        },
      });
      if (!resp.ok) {
        const text = await resp.text();
        return NextResponse.json(
          { success: false, error: `Scraper API error: ${resp.status} ${text}` },
          { status: 502 }
        );
      }
      const data = await resp.json();
      machines = data.machines || [];
    }

    if (doNayax && machines.length === 0 && scope !== "full") {
      return NextResponse.json({
        success: true,
        message: "No machines returned from Nayax",
        synced: 0,
      });
    }

    // 2. Sync each machine + its products to Supabase.
    // BATCHED: machines are resolved sequentially (only ~10), but all product
    // names are resolved in one bulk pass and machine_inventory is written in
    // one bulk pass — replacing ~4 sequential DB round-trips PER PRODUCT
    // (which made the sync take minutes) with a handful of queries total.
    let productsCreated = 0;
    let machinesSynced = 0;
    let inventoryRows = 0;
    const errors: string[] = [];
    const saleEstimates: Array<{ productId: string; machineId: string; dailySalesRate: number }> = [];
    const dailySales: Array<{ productId: string; machineId: string; date: string; units: number; revenue: number }> = [];
    const miRows: Array<{ machineId: string; productId: string; dailySalesRate: number; soldSinceRefill: number }> = [];

    // Resolve every machine (few) and every product name (bulk) up front.
    const deviceToMachineId = new Map<string, string>();
    for (const m of machines) {
      try {
        deviceToMachineId.set(m.nayax_device_id, await ensureMachine(m.nayax_device_id, m.machine_name));
        machinesSynced++;
      } catch (err: any) {
        errors.push(`Machine ${m.machine_name}: ${err.message}`);
      }
    }
    // On a today-only pull, resolve just the products that actually sold
    // recently (fewer names → faster) instead of the whole fleet catalog.
    const allNames = machines.flatMap((m) => (m.products || [])
      .filter((p) => !todayOnly || (p.daily_breakdown && Object.keys(p.daily_breakdown).some((d) => d >= recentCutoff)))
      .map((p) => p.name));
    const productMap = await ensureProductsBatch(allNames); // lowercase name → id

    for (const m of machines) {
      const machineId = deviceToMachineId.get(m.nayax_device_id);
      if (!machineId) continue;
      for (const p of m.products) {
        // On a today-only pull we only resolved recently-sold products; skip
        // the rest quietly (they contribute no today rows anyway).
        if (todayOnly && !(p.daily_breakdown && Object.keys(p.daily_breakdown).some((d) => d >= recentCutoff))) continue;
        const productId = productMap.get(p.name.trim().toLowerCase());
        if (!productId) { errors.push(`Product ${p.name}: unresolved`); continue; }
        productsCreated++;
        miRows.push({ machineId, productId, dailySalesRate: p.daily_sales_rate, soldSinceRefill: p.sold_since_refill });
        saleEstimates.push({ productId, machineId, dailySalesRate: p.daily_sales_rate });
        if (p.daily_breakdown) {
          for (const [date, units] of Object.entries(p.daily_breakdown)) {
            // today-only pull: keep just today's + yesterday's rows.
            if (todayOnly && date < recentCutoff) continue;
            const rev = (p.daily_revenue && p.daily_revenue[date]) || 0;
            dailySales.push({ productId, machineId, date, units, revenue: rev });
          }
        }
      }
    }

    // machine_inventory + ledger are for refill/projection features, NOT the
    // Today revenue headline — skip them on a today-only pull to save ~20s.
    let ledgerWrites = 0;
    if (!todayOnly) {
      try {
        await batchUpsertMachineInventory([...deviceToMachineId.values()], miRows);
        inventoryRows = miRows.length;
      } catch (err: any) {
        errors.push(`machine_inventory: ${err.message}`);
      }
      try {
        const before = saleEstimates.length;
        await bulkRecordSaleEstimates(saleEstimates);
        ledgerWrites = before;
      } catch (err: any) {
        errors.push(`Ledger write: ${err.message}`);
      }
    }

    // ─── HAHA / Chinese machines ─────────────────────────────────────
    // Pull historical sales from the Chinese platform too — that data path
    // was never wired into the sync, so HAHA machines never appeared in
    // daily_sales (and therefore not on Reports / Machines totals / Today).
    // We fetch the last 30 days each sync; the upsert dedupes by
    // (product_id, machine_id, sale_date) so partial overlap with prior
    // syncs is harmless.
    let chineseMachinesSynced = 0;
    if (doChinese) try {
      const fromIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const toIso = new Date().toISOString().slice(0, 10);
      const chineseResp = await fetch(
        `${SCRAPER_API_URL}/api/machines/chinese-historical-sales?from_date=${fromIso}&to_date=${toIso}`,
        { headers: { "x-api-key": process.env.SCRAPER_BACKEND_KEY || process.env.API_KEY || "" } },
      );
      if (chineseResp.ok) {
        const chineseData = await chineseResp.json() as {
          machines?: Array<{
            machineId: string; machineName: string; nayaxDeviceId: string;
            products?: Array<{
              name: string;
              daily_breakdown?: Record<string, number>;
              daily_revenue?: Record<string, number>;
            }>;
          }>;
        };
        const cMachines = chineseData.machines || [];
        // Resolve Chinese product names in one bulk pass too.
        const cProductMap = await ensureProductsBatch(
          cMachines.flatMap((cm) => (cm.products || []).map((p) => p.name)),
        );
        for (const cm of cMachines) {
          try {
            const machineId = await ensureMachine(cm.nayaxDeviceId, cm.machineName);
            chineseMachinesSynced++;
            for (const p of cm.products || []) {
              const productId = cProductMap.get(p.name.trim().toLowerCase());
              if (!productId) { errors.push(`Chinese product ${p.name}: unresolved`); continue; }
              if (p.daily_breakdown) {
                for (const [date, units] of Object.entries(p.daily_breakdown)) {
                  const rev = (p.daily_revenue && p.daily_revenue[date]) || 0;
                  dailySales.push({ productId, machineId, date, units, revenue: rev });
                }
              }
            }
          } catch (err: any) {
            errors.push(`Chinese machine ${cm.machineName}: ${err.message}`);
          }
        }
      } else {
        // Don't fail the whole sync if the Chinese endpoint is unavailable —
        // older scraper deploys won't have it yet.
        const t = await chineseResp.text();
        errors.push(`Chinese sales (${chineseResp.status}): ${t.slice(0, 200)}`);
      }
    } catch (err: any) {
      errors.push(`Chinese fetch: ${err.message}`);
    }

    // Bulk-upsert daily_sales rows for weekly trends (now includes HAHA rows)
    let dailySalesWritten = 0;
    try {
      dailySalesWritten = await bulkUpsertDailySales(dailySales);
    } catch (err: any) {
      errors.push(`daily_sales: ${err.message}`);
    }

    return NextResponse.json({
      success: true,
      scope,
      machinesSynced,
      chineseMachinesSynced,
      productsProcessed: productsCreated,
      inventoryRows,
      ledgerWrites,
      dailySalesWritten,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[inventory/sync] error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
