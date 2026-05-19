import { NextResponse } from "next/server";
import {
  ensureProduct,
  ensureMachine,
  upsertMachineInventory,
} from "@/lib/inventory-store";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "https://arbersaas.duckdns.org/api2";

/**
 * Write one sale_estimate ledger row per (product, machine) per day with
 * qty = -daily_sales_rate. Idempotent — checks for an existing row in the
 * last 23 hours and skips if found. This feeds the projection engine
 * without double-counting on multiple syncs per day.
 */
async function recordDailySaleEstimate(
  productId: string,
  machineId: string,
  dailySalesRate: number
) {
  if (dailySalesRate <= 0) return;
  const supabase = createServerClient();
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 23);

  const { data: existing } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("product_id", productId)
    .eq("machine_id", machineId)
    .eq("reason", "sale_estimate")
    .gte("created_at", cutoff.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabase.from("stock_movements").insert({
    product_id: productId,
    location: machineId,
    machine_id: machineId,
    qty: -Math.round(dailySalesRate * 100) / 100,
    reason: "sale_estimate",
    notes: `Nayax sync daily estimate (${dailySalesRate.toFixed(2)}/day)`,
  });
}

interface NayaxProduct {
  name: string;
  total_sold: number;
  sold_since_refill: number;
  daily_sales_rate: number;
  sale_count: number;
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
 * POST/GET /api/inventory/sync — Fetch live Nayax data and sync to Supabase.
 * GET supported so cron-job.org can hit it without configuring a body.
 */
export async function GET() {
  return POST();
}

export async function POST() {
  try {
    // 1. Fetch inventory status from scraper-api
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
    const machines: NayaxMachineStatus[] = data.machines || [];

    if (machines.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No machines returned from Nayax",
        synced: 0,
      });
    }

    // 2. Sync each machine + its products to Supabase
    let productsCreated = 0;
    let machinesSynced = 0;
    let inventoryRows = 0;
    const errors: string[] = [];

    for (const m of machines) {
      try {
        // Ensure machine exists
        const machineId = await ensureMachine(
          m.nayax_device_id,
          m.machine_name
        );
        machinesSynced++;

        // Sync each product
        for (const p of m.products) {
          try {
            const productId = await ensureProduct(p.name);
            productsCreated++; // counts upserts, not just creates

            await upsertMachineInventory({
              machineId,
              productId,
              estimatedRemaining: 0, // calculated inside based on refill logs
              dailySalesRate: p.daily_sales_rate,
              soldSinceRefill: p.sold_since_refill,
            });
            inventoryRows++;

            // Also write a sale_estimate ledger row so the projection
            // engine has data to compute velocity from.
            await recordDailySaleEstimate(productId, machineId, p.daily_sales_rate);
          } catch (err: any) {
            errors.push(`Product ${p.name}: ${err.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`Machine ${m.machine_name}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      machinesSynced,
      productsProcessed: productsCreated,
      inventoryRows,
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
