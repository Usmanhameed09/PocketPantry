import { NextResponse } from "next/server";
import { getWasteReport, getInventoryTurns } from "@/lib/waste-report";
import { dateNDaysAgoInOperatorTz, todayInOperatorTz } from "@/lib/operator-timezone";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // Default window: last 30 days
    const start = searchParams.get("startDate") || dateNDaysAgoInOperatorTz(30);
    const end = searchParams.get("endDate") || todayInOperatorTz();
    const periodDays = Number(searchParams.get("periodDays")) || 30;
    const turnsLimit = Number(searchParams.get("turnsLimit")) || 100;
    const wasteLimit = Number(searchParams.get("wasteLimit")) || 25;
    const bypass = searchParams.get("fresh") === "1";

    // Only cache the default-shape request (no custom params) — operators
    // with custom date ranges or limits get a live response.
    const isDefaultShape =
      !searchParams.has("startDate") &&
      !searchParams.has("endDate") &&
      !searchParams.has("periodDays") &&
      !searchParams.has("turnsLimit") &&
      !searchParams.has("wasteLimit");

    const compute = async () => {
      const [waste, turns] = await Promise.all([
        getWasteReport(start, end, wasteLimit),
        getInventoryTurns(periodDays, turnsLimit),
      ]);
      return { success: true, waste, turns };
    };

    const payload = bypass || !isDefaultShape
      ? await compute()
      : await withCache(CACHE_KEYS.waste, TTL.waste, compute);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
