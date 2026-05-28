/**
 * POST /api/leads/verify-emails
 *   { ids: ["L-001", ...] }
 *
 * Batch email verification using Hunter's /email-verifier endpoint.
 * Updates each lead's last_activity with the verification result; if Hunter
 * returns "undeliverable" the lead is flagged via not_interested_reason
 * ("undeliverable email") so it doesn't get email-sequenced into a black hole.
 *
 * Returns: { ok, verified, deliverable, risky, undeliverable, missing }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HunterVerifyResult = {
  data?: {
    status?: string;       // "valid" | "invalid" | "accept_all" | "webmail" | "disposable" | "unknown"
    result?: string;       // "deliverable" | "undeliverable" | "risky" | "unknown"
    score?: number;
    email?: string;
  };
};

async function verifyOne(email: string, apiKey: string): Promise<HunterVerifyResult["data"] | null> {
  const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as HunterVerifyResult;
    return j.data || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "HUNTER_API_KEY not configured" }, { status: 500 });
  }
  try {
    const body = await req.json();
    const ids = (body.ids || []) as string[];
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Pass ids array" }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ ok: false, error: "Max 100 leads per batch" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data: leads } = await supabase
      .from("leads").select("id, email").in("id", ids);

    let deliverable = 0;
    let risky = 0;
    let undeliverable = 0;
    let missing = 0;
    const results: Array<{ id: string; result: string; score?: number }> = [];

    for (const lead of leads || []) {
      const email = (lead.email as string) || "";
      const id = lead.id as string;
      if (!email) { missing++; results.push({ id, result: "no_email" }); continue; }

      const v = await verifyOne(email, apiKey);
      const result = v?.result || "unknown";
      const score = v?.score;
      results.push({ id, result, score });

      if (result === "deliverable") deliverable++;
      else if (result === "risky") risky++;
      else if (result === "undeliverable") undeliverable++;

      // Flag undeliverable emails so they don't get email-sequenced
      const update: Record<string, unknown> = {
        last_activity: `Email ${result}${score ? ` (${score})` : ""}`,
        updated_at: new Date().toISOString(),
      };
      if (result === "undeliverable") {
        update.not_interested_reason = "undeliverable email";
      }
      await supabase.from("leads").update(update).eq("id", id);
    }

    return NextResponse.json({
      ok: true,
      total: ids.length,
      deliverable, risky, undeliverable, missing,
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
