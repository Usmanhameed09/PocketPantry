/**
 * POST /api/leads/enrich-batch
 *   { ids: ["L-001", ...] }      — enrich a specific batch
 *   { missingOnly: true }         — enrich every lead missing phone OR email AND has website
 *
 * For each lead with a website, calls Apollo/Lusha/Hunter via the existing
 * enrichment chain. Persists everything Apollo returns into the lead row:
 * apollo_mobile, employee_count, vertical, apollo_title, apollo_last_enriched_at.
 *
 * Returns: { ok, processed, enriched, skipped, results }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enrichLeadContact } from "@/lib/lead-enrichment";
import { scoreAndPersist } from "@/lib/lead-scoring";
import { getLead } from "@/lib/leads-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = createServerClient();

    let leads: Array<{ id: string; business: string; website: string | null; email: string | null; phone: string | null }> = [];
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const { data } = await supabase
        .from("leads").select("id, business, website, email, phone").in("id", body.ids);
      leads = (data || []) as typeof leads;
    } else if (body.missingOnly) {
      const { data } = await supabase
        .from("leads").select("id, business, website, email, phone")
        .or("email.is.null,email.eq.,phone.is.null,phone.eq.")
        .range(0, 199);
      // Filter client-side to those with a website (where enrichment can work)
      leads = ((data || []) as typeof leads).filter((l) => (l.website || "").trim().length > 0);
    } else {
      return NextResponse.json({ ok: false, error: "Pass ids[] or missingOnly:true" }, { status: 400 });
    }

    if (leads.length > 50) {
      return NextResponse.json({ ok: false, error: "Max 50 leads per batch" }, { status: 400 });
    }

    let enriched = 0;
    let skipped = 0;
    const results: Array<{ id: string; status: string; provider?: string }> = [];

    for (const lead of leads) {
      const website = (lead.website || "").trim();
      const business = (lead.business || "").trim();
      if (!website && !business) { skipped++; results.push({ id: lead.id, status: "no website/company" }); continue; }

      try {
        const enrich = await enrichLeadContact({ website, company: business });
        if (!enrich.enrichment) {
          skipped++; results.push({ id: lead.id, status: "no match" });
          continue;
        }
        const e = enrich.enrichment;
        const update: Record<string, unknown> = {
          apollo_last_enriched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        // Only fill missing fields — don't overwrite manual data
        if (e.email && !lead.email) update.email = e.email;
        if (e.phone && !lead.phone) update.phone = e.phone;
        if (e.mobile) update.apollo_mobile = e.mobile;
        if (e.contactTitle) update.apollo_title = e.contactTitle;
        if (typeof e.employeeCount === "number") update.employee_count = e.employeeCount;
        if (e.industry) update.vertical = e.industry;

        await supabase.from("leads").update(update).eq("id", lead.id);

        // Re-score with the new data so tiers update immediately
        try {
          const refreshed = await getLead(lead.id);
          if (refreshed) await scoreAndPersist(lead.id, refreshed);
        } catch { /* scoring is best-effort */ }

        enriched++;
        results.push({ id: lead.id, status: "enriched", provider: e.provider });
      } catch (err) {
        skipped++;
        results.push({ id: lead.id, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
      }
    }

    return NextResponse.json({ ok: true, processed: leads.length, enriched, skipped, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
