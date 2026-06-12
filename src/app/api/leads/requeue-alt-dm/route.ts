/**
 * POST /api/leads/requeue-alt-dm  { ids: string[] }
 *
 * Bulk "Requeue with alternate DM titles" (Pipeline UI #5). For each selected
 * lead, runs an Apollo search for an alternate decision-maker and queues a new
 * call task to them. Same recovery used automatically on a "wrong contact"
 * disposition (US4.3) — exposed here as an operator-triggered batch action.
 */

import { NextResponse } from "next/server";
import { requeueAlternateDM } from "@/lib/lead-routing";
import { invalidateOnLeadWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "No lead ids provided" }, { status: 400 });
    }
    // Cap to keep within the function timeout (each lead is an Apollo lookup).
    const capped = ids.slice(0, 50);

    let requeued = 0;
    const failures: Array<{ id: string; reason?: string }> = [];
    for (const id of capped) {
      const result = await requeueAlternateDM(id);
      if (result.ok) requeued++;
      else failures.push({ id, reason: result.reason });
    }

    if (requeued > 0) await invalidateOnLeadWrite();
    return NextResponse.json({
      ok: true,
      total: capped.length,
      requeued,
      noAlternate: failures.length,
      skipped: ids.length - capped.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
