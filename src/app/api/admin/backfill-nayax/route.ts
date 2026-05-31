/**
 * POST /api/admin/backfill-nayax?days=365
 *
 * One-shot historical backfill from Nayax. Calls scraper-api's
 * /api/machines/historical-sales for the requested window, walks the
 * per-machine/per-product daily_breakdown, and upserts every (product,
 * machine, day) tuple into daily_sales.
 *
 * Why this exists: the regular /api/inventory/sync cron only reads Nayax's
 * rolling lastSales window — anything older than ~100-500 transactions per
 * machine is lost. After running this backfill once, the Reports / Machines
 * / Today pages all show true historical figures going back as far as
 * Nayax has data for.
 *
 * Safe to re-run: the upsert uses (product_id, machine_id, sale_date) as
 * the conflict key, so a second pass just overwrites with the latest
 * counts rather than duplicating.
 *
 * Bounded: capped at 365 days to keep the scraper request from running for
 * hours; if you need more, bump the cap or run in chunks.
 *
 * Response: { ok, fromDate, toDate, machinesProcessed, dailySalesWritten,
 *             productsCreated, errors }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureProduct, ensureMachine } from "@/lib/inventory-store";

export const dynamic = "force-dynamic";
// Backfill can take a while — give it as long as Vercel allows.
export const maxDuration = 300;

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "https://arbersaas.duckdns.org/api2";

type HistoricalSalesResponse = {
  success: boolean;
  fromDate: string;
  toDate: string;
  machines: Array<{
    machineId: string;
    machineName: string;
    nayaxDeviceId: string;
    products: Array<{
      name: string;
      daily_breakdown: Record<string, number>;
      daily_revenue: Record<string, number>;
      total_units: number;
      total_revenue: number;
    }>;
  }>;
};

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedDays = Math.max(1, Math.min(365, Number(searchParams.get("days")) || 90));
    // offset = how many days back the END of this chunk sits.
    // offset=0   + days=90 → today-90 to today      (chunk 1)
    // offset=90  + days=90 → today-180 to today-90  (chunk 2)
    // offset=180 + days=90 → today-270 to today-180 (chunk 3)
    // offset=270 + days=90 → today-360 to today-270 (chunk 4)
    // The UI calls this 4 times to cover a full year without hitting
    // Vercel's 300s function timeout (each chunk ~20-90s of scraper work).
    const offset = Math.max(0, Math.min(365, Number(searchParams.get("offset")) || 0));
    const to = new Date();
    to.setDate(to.getDate() - offset);
    const from = new Date();
    from.setDate(from.getDate() - offset - requestedDays);
    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);

    // 1. Pull historical sales from BOTH Nayax + HAHA endpoints in parallel.
    // The "nayax" name on this route is now misleading — it backfills the
    // whole fleet. Renaming the path would break the UI button so we just
    // expand the behavior here. Each chunk gets ~30-90s of scraper work
    // per platform; in parallel they fit inside one Vercel function call.
    const apiKey = process.env.SCRAPER_BACKEND_KEY || process.env.API_KEY || "";
    const [nayaxRes, chineseRes] = await Promise.all([
      fetch(`${SCRAPER_API_URL}/api/machines/historical-sales?from_date=${fromIso}&to_date=${toIso}`,
        { headers: { "x-api-key": apiKey }, cache: "no-store" }),
      fetch(`${SCRAPER_API_URL}/api/machines/chinese-historical-sales?from_date=${fromIso}&to_date=${toIso}`,
        { headers: { "x-api-key": apiKey }, cache: "no-store" })
        // Allow Chinese to fail without killing the whole backfill (older
        // scraper deploys won't have this endpoint).
        .catch((e) => new Response(JSON.stringify({ machines: [], _err: String(e) }), { status: 599 })),
    ]);

    if (!nayaxRes.ok) {
      const text = await nayaxRes.text();
      return NextResponse.json(
        { ok: false, error: `Scraper API ${nayaxRes.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const nayaxData = (await nayaxRes.json()) as HistoricalSalesResponse;
    let chineseData: HistoricalSalesResponse = { success: true, fromDate: fromIso, toDate: toIso, machines: [] };
    if (chineseRes.ok) {
      chineseData = (await chineseRes.json()) as HistoricalSalesResponse;
    }

    // Combine machine lists — same shape from both endpoints, downstream
    // processing is identical (ensureMachine + ensureProduct + upsert rows).
    const data: HistoricalSalesResponse = {
      success: true,
      fromDate: nayaxData.fromDate,
      toDate: nayaxData.toDate,
      machines: [...nayaxData.machines, ...chineseData.machines],
    };

    // 2. For every machine + product, ensure rows exist locally and build
    //    the list of daily_sales tuples to upsert.
    let machinesProcessed = 0;
    let productsCreated = 0;
    const insertRows: Array<{
      product_id: string; machine_id: string; sale_date: string;
      units_sold: number; revenue: number; updated_at: string;
    }> = [];
    const errors: string[] = [];

    const nowIso = new Date().toISOString();

    for (const m of data.machines) {
      try {
        const localMachineId = await ensureMachine(m.nayaxDeviceId, m.machineName);
        machinesProcessed++;

        for (const p of m.products) {
          let localProductId: string;
          try {
            localProductId = await ensureProduct(p.name);
            productsCreated++;
          } catch (err) {
            errors.push(`product ${p.name}: ${err instanceof Error ? err.message : "unknown"}`);
            continue;
          }

          // Walk every day in the breakdown
          for (const [date, units] of Object.entries(p.daily_breakdown)) {
            const rev = p.daily_revenue[date] ?? 0;
            if (units <= 0 && rev <= 0) continue;
            insertRows.push({
              product_id: localProductId,
              machine_id: localMachineId,
              sale_date: date,
              units_sold: units,
              revenue: rev,
              updated_at: nowIso,
            });
          }
        }
      } catch (err) {
        errors.push(`machine ${m.machineName}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // 3. Bulk upsert in chunks. (product_id, machine_id, sale_date) is the
    //    natural key so re-running the backfill just overwrites.
    const supabase = createServerClient();
    let written = 0;
    for (let i = 0; i < insertRows.length; i += 500) {
      const chunk = insertRows.slice(i, i + 500);
      const { error } = await supabase
        .from("daily_sales")
        .upsert(chunk, { onConflict: "product_id,machine_id,sale_date" });
      if (error) {
        errors.push(`upsert chunk ${i}: ${error.message}`);
        // Don't abort the whole job — keep trying remaining chunks so a single
        // bad row doesn't lose hours of work.
        continue;
      }
      written += chunk.length;
    }

    return NextResponse.json({
      ok: true,
      fromDate: data.fromDate,
      toDate: data.toDate,
      machinesProcessed,
      productsCreated,
      dailySalesWritten: written,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 },
    );
  }
}
