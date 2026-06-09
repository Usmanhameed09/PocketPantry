import { NextResponse } from "next/server";
import {
  getProjections,
  getProjectionSettings,
  saveProjectionOverride,
  saveProjectionSettings,
} from "@/lib/projection-engine";
import { withCache, CACHE_KEYS, TTL, invalidateKeys, invalidateOnInventoryWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";

async function buildProjections() {
  const [projections, settings] = await Promise.all([
    getProjections(),
    getProjectionSettings(),
  ]);
  return { success: true, data: projections, settings };
}

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildProjections()
      : await withCache(CACHE_KEYS.projections, TTL.projections, buildProjections);
    return NextResponse.json(payload);
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
      // Override changes projections → buy list → today → AI snapshot.
      await invalidateOnInventoryWrite();
      return NextResponse.json({ success: true });
    }
    if (body.kind === "settings") {
      const out = await saveProjectionSettings({
        windowWeeks: body.windowWeeks,
        safetyStockDays: body.safetyStockDays,
        horizonDays: body.horizonDays,
      });
      // Settings change rebuilds projections + buy list.
      await invalidateKeys([CACHE_KEYS.projections, CACHE_KEYS.buyList, CACHE_KEYS.today]);
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
