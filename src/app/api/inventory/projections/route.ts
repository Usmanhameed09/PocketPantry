import { NextResponse } from "next/server";
import {
  getProjections,
  getProjectionSettings,
  saveProjectionOverride,
  saveProjectionSettings,
} from "@/lib/projection-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [projections, settings] = await Promise.all([
      getProjections(),
      getProjectionSettings(),
    ]);
    return NextResponse.json({ success: true, data: projections, settings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.kind === "override") {
      await saveProjectionOverride({
        productId: body.productId,
        unitsOverride: Number(body.unitsOverride),
        reason: body.reason,
        validFrom: body.validFrom,
        validTo: body.validTo,
      });
      return NextResponse.json({ success: true });
    }
    if (body.kind === "settings") {
      const out = await saveProjectionSettings({
        windowWeeks: body.windowWeeks,
        safetyStockDays: body.safetyStockDays,
        horizonDays: body.horizonDays,
      });
      return NextResponse.json({ success: true, settings: out });
    }
    return NextResponse.json({ success: false, error: "Unknown kind" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
