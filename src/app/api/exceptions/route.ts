/**
 * GET /api/exceptions   — returns the current list of data-quality issues
 *
 * Each row has a type, severity, the affected entity (product/machine), a
 * human-readable message, and a fixAction label. The UI uses fixAction to
 * decide which control to render (input vs button).
 */

import { NextResponse } from "next/server";
import { detectExceptions } from "@/lib/exceptions";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildExceptions()
      : await withCache(CACHE_KEYS.exceptions, TTL.exceptions, buildExceptions);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}

async function buildExceptions(): Promise<Record<string, unknown>> {
  const exceptions = await detectExceptions();
  const counts = {
    total: exceptions.length,
    byType: {} as Record<string, number>,
    bySeverity: { high: 0, medium: 0, low: 0 },
  };
  for (const e of exceptions) {
    counts.byType[e.type] = (counts.byType[e.type] || 0) + 1;
    counts.bySeverity[e.severity]++;
  }
  return { ok: true, counts, exceptions };
}
