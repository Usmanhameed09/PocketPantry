import { NextRequest, NextResponse } from "next/server";
import { getStoredMachineOrderSnapshot, saveMachineOrderSnapshot, type StoredMachineOrder } from "@/lib/machine-order-store";

const scraperUrl = () => process.env.SCRAPER_API_URL || "http://localhost:8000";
const apiKey = () => process.env.SCRAPER_BACKEND_KEY || "";

async function fetchMachineOrders(machineId: string, limit = 100) {
  const response = await fetch(
    `${scraperUrl()}/api/machines/${encodeURIComponent(machineId)}/orders?page=1&limit=${limit}`,
    {
      headers: { ...(apiKey() ? { "x-api-key": apiKey() } : {}) },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch machine orders (${response.status})`);
  }

  return response.json() as Promise<{
    success: boolean;
    orders?: StoredMachineOrder[];
    total?: number;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const machineId = decodeURIComponent(id);
  const machineName = request.nextUrl.searchParams.get("name") || machineId;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "100");

  try {
    const live = await fetchMachineOrders(machineId, Number.isFinite(limit) ? limit : 100);
    const orders = Array.isArray(live.orders) ? live.orders : [];
    const snapshot = {
      machineId,
      machineName,
      platform: "HAHA",
      total: typeof live.total === "number" ? live.total : orders.length,
      orders,
      syncedAt: new Date().toISOString(),
    };
    await saveMachineOrderSnapshot(snapshot);

    return NextResponse.json({
      success: true,
      source: "live",
      ...snapshot,
    });
  } catch (error) {
    try {
      const stored = await getStoredMachineOrderSnapshot(machineId);
      if (stored) {
        return NextResponse.json({
          success: true,
          source: "stored",
          ...stored,
          warning: error instanceof Error ? error.message : "Failed to fetch live machine orders.",
        });
      }
    } catch (storedError) {
      console.error("[API /machines/[id]/orders GET] Stored fallback failed:", storedError);
    }

    console.error("[API /machines/[id]/orders GET] Error:", error);
    return NextResponse.json(
      {
        success: false,
        orders: [],
        total: 0,
        error: error instanceof Error ? error.message : "Failed to fetch machine orders.",
      },
      { status: 502 }
    );
  }
}
