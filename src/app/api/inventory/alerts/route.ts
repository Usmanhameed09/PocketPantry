import { NextResponse } from "next/server";
import {
  listAlerts,
  acknowledgeAlert,
  dismissAlert,
} from "@/lib/alerts-engine";
import { withCache, CACHE_KEYS, TTL, invalidateKeys } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeResolved = searchParams.get("includeResolved") === "1";
    const bypass = searchParams.get("fresh") === "1";
    // includeResolved=1 returns a bigger list (resolved alerts too) — cache
    // them under different keys so the next reader gets the same shape they
    // asked for.
    const key = includeResolved ? `${CACHE_KEYS.alerts}:incl-resolved` : CACHE_KEYS.alerts;
    const fetcher = () => listAlerts(includeResolved);
    const alerts = bypass ? await fetcher() : await withCache(key, TTL.alerts, fetcher);
    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "acknowledge") await acknowledgeAlert(body.id);
    else if (body.action === "dismiss") await dismissAlert(body.id);
    else return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    await invalidateKeys([
      CACHE_KEYS.alerts,
      `${CACHE_KEYS.alerts}:incl-resolved`,
      CACHE_KEYS.today,
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
