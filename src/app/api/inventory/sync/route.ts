import { NextResponse } from "next/server";
import {
  ensureProduct,
  ensureMachine,
  upsertMachineInventory,
} from "@/lib/inventory-store";

export const dynamic = "force-dynamic";

const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "https://arbersaas.duckdns.org/api2";

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
 * POST /api/inventory/sync — Fetch live Nayax data and sync to Supabase.
 */
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
