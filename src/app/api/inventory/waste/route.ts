import { NextResponse } from "next/server";
import { getWasteReport, getInventoryTurns } from "@/lib/waste-report";
import { dateNDaysAgoInOperatorTz, todayInOperatorTz } from "@/lib/operator-timezone";

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

    const [waste, turns] = await Promise.all([
      getWasteReport(start, end, wasteLimit),
      getInventoryTurns(periodDays, turnsLimit),
    ]);

    return NextResponse.json({ success: true, waste, turns });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
