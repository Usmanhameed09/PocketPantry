/**
 * GET /api/leads/dashboard
 *
 * Conversion dashboard — counts/rates the operator needs to see daily.
 *   - By tier: A/B/C lead counts + conversion rate to "Won"
 *   - By stage: pipeline funnel counts
 *   - By owner: leads-per-owner + their conversion
 *   - SLA: open ops_tasks of type pipeline_sla
 *   - Today: tasks due today, hot leads waiting
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const payload = bypass
      ? await buildDashboard()
      : await withCache(CACHE_KEYS.leadsDashboard, TTL.leadsDashboard, buildDashboard);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

async function buildDashboard(): Promise<Record<string, unknown>> {
  try {
    const supabase = createServerClient();
    const { data: leads } = await supabase
      .from("leads").select("id, stage, tier, owner, last_touch_at, next_action_at, is_call_ready")
      .range(0, 9999);

    const byTier: Record<string, { total: number; won: number }> = { A: { total: 0, won: 0 }, B: { total: 0, won: 0 }, C: { total: 0, won: 0 } };
    const byStage: Record<string, number> = {};
    const byOwner: Record<string, { total: number; won: number }> = {};
    let callReady = 0;
    let noNextAction = 0;

    const WON_STAGES = new Set(["Won", "Installed"]);

    for (const lead of leads || []) {
      const stage = (lead.stage as string) || "Unknown";
      const tier = ((lead.tier as string) || "C").toUpperCase();
      const owner = (lead.owner as string) || "Unassigned";
      const isWon = WON_STAGES.has(stage);

      byStage[stage] = (byStage[stage] || 0) + 1;
      if (byTier[tier]) {
        byTier[tier].total++;
        if (isWon) byTier[tier].won++;
      }
      if (!byOwner[owner]) byOwner[owner] = { total: 0, won: 0 };
      byOwner[owner].total++;
      if (isWon) byOwner[owner].won++;

      if (lead.is_call_ready) callReady++;
      if (!lead.next_action_at && !isWon && stage !== "Not Interested") noNextAction++;
    }

    const conversion = (t: { total: number; won: number }) => t.total === 0 ? 0 : Number((t.won / t.total * 100).toFixed(1));

    // SLA flags pending
    const { data: slaTasks, count: slaCount } = await supabase
      .from("ops_tasks").select("id, title, priority", { count: "exact" })
      .eq("task_type", "pipeline_sla").eq("status", "open").limit(20);

    // Due lead_tasks today
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    let dueToday = 0;
    try {
      const { count } = await supabase
        .from("lead_tasks").select("id", { count: "exact", head: true })
        .eq("status", "open")
        .gte("scheduled_for", startOfDay.toISOString())
        .lte("scheduled_for", endOfDay.toISOString());
      dueToday = count || 0;
    } catch { /* table may not exist */ }

    return {
      ok: true,
      tiers: {
        A: { ...byTier.A, conversionPct: conversion(byTier.A) },
        B: { ...byTier.B, conversionPct: conversion(byTier.B) },
        C: { ...byTier.C, conversionPct: conversion(byTier.C) },
      },
      funnel: byStage,
      owners: Object.fromEntries(
        Object.entries(byOwner).map(([k, v]) => [k, { ...v, conversionPct: conversion(v) }])
      ),
      today: { callReady, dueToday, noNextAction },
      sla: { open: slaCount || 0, sample: slaTasks || [] },
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
