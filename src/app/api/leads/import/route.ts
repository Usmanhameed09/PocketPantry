import { NextRequest, NextResponse } from "next/server";
import { getAllLeads, getLead } from "@/lib/leads-store";
import { createServerClient } from "@/lib/supabase";

type ImportLeadInput = {
  business: string;
  contact: string;
  phone: string;
  email?: string;
  address?: string;
  distance?: string;
  businessType?: string;
  source?: "Excel Import";
  contactMethod?: "Call" | "Email" | "Call + Email";
  // v2 fields
  website?: string;
  vertical?: string;
  employeeCount?: string;
  owner?: string;
  apolloMobile?: string;
};

function extractDomain(value: string | undefined): string {
  if (!value) return "";
  const match = value.toLowerCase().match(/(?:https?:\/\/)?(?:www\.)?([^/?#\s]+)/);
  return match ? match[1].trim() : "";
}

function parseLeadNumber(id: string | undefined) {
  if (!id) return 0;
  const match = id.match(/^L-(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function normalizeText(value?: string) {
  return (value || "").trim().toLowerCase();
}

function normalizePhone(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function isDuplicateLead(input: ImportLeadInput, existing: ImportLeadInput[]) {
  const business = normalizeText(input.business);
  const phone = normalizePhone(input.phone);
  const address = normalizeText(input.address);
  const domain = extractDomain(input.website);
  const email = normalizeText(input.email);

  return existing.some((lead) => {
    // 1. Same domain → duplicate (catches "Joe's Pizza Inc" vs "Joe's Pizza LLC" with same website)
    if (domain && extractDomain(lead.website) === domain) return true;
    // 2. Same phone → duplicate regardless of business name (saves re-imports of same number)
    if (phone && phone.length >= 7 && normalizePhone(lead.phone) === phone) return true;
    // 3. Same email → duplicate
    if (email && normalizeText(lead.email) === email) return true;
    // 4. Same business name + (same address OR same phone) — original rule, kept as fallback
    const sameBusiness = normalizeText(lead.business) === business;
    const samePhone = phone && normalizePhone(lead.phone) === phone;
    const sameAddress = address && normalizeText(lead.address) === address;
    return sameBusiness && (samePhone || sameAddress);
  });
}

async function insertLead(entry: ImportLeadInput) {
  const supabase = createServerClient();
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const { data: idRows, error: latestError } = await supabase
    .from("leads")
    .select("id")
    .like("id", "L-%");

  if (latestError) {
    throw latestError;
  }

  const nextNumber =
    (idRows || []).reduce((max, row) => Math.max(max, parseLeadNumber(row.id as string | undefined)), 0) + 1;
  const id = `L-${String(nextNumber).padStart(3, "0")}`;

  const payload: Record<string, unknown> = {
    id,
    business: entry.business,
    contact: entry.contact,
    phone: entry.phone,
    email: entry.email || "",
    address: entry.address || "",
    distance: entry.distance || "--",
    business_type: entry.businessType || "",
    source: "Excel Import",
    stage: "New Lead",
    contact_method: entry.contactMethod || "Call",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: `Added ${dateStr}`,
  };
  // v2 fields (only set if provided so we don't write empty strings)
  if (entry.website?.trim()) payload.website = entry.website.trim();
  if (entry.vertical?.trim()) payload.vertical = entry.vertical.trim();
  if (entry.employeeCount?.trim()) payload.employee_count = entry.employeeCount.trim();
  if (entry.owner?.trim()) payload.owner = entry.owner.trim();
  if (entry.apolloMobile?.trim()) payload.apollo_mobile = entry.apolloMobile.trim();

  let { error } = await supabase.from("leads").insert(payload);
  if (error) {
    // If the deployed DB hasn't run 004_pipeline_v2.sql yet, the v2 columns
    // don't exist. Retry with only the base columns so import still works.
    const msg = `${error.message || ""} ${(error as { details?: string }).details || ""}`.toLowerCase();
    const v2ColumnMissing = ["website", "vertical", "employee_count", "owner", "apollo_mobile"]
      .some((c) => msg.includes(c));
    if (v2ColumnMissing) {
      const stripped = { ...payload };
      delete stripped.website; delete stripped.vertical; delete stripped.employee_count;
      delete stripped.owner; delete stripped.apollo_mobile;
      const retry = await supabase.from("leads").insert(stripped);
      error = retry.error;
    }
  }

  if (error) {
    throw error;
  }

  return getLead(id);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const incomingLeads = Array.isArray(body.leads) ? (body.leads as ImportLeadInput[]) : [];

    if (incomingLeads.length === 0) {
      return NextResponse.json({ error: "No leads provided for import." }, { status: 400 });
    }

    const currentLeads = await getAllLeads();
    const seenLeads: ImportLeadInput[] = currentLeads.map((lead) => ({
      business: lead.business,
      contact: lead.contact,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      distance: lead.distance,
      businessType: lead.businessType,
      source: "Excel Import",
      contactMethod: "Call",
      website: lead.website,
    }));

    const imported: { id: string; business: string }[] = [];
    const skipped: { business: string; reason: string }[] = [];

    for (const entry of incomingLeads) {
      if (!entry.business || !entry.contact || !entry.phone) {
        skipped.push({ business: entry.business || "Unknown business", reason: "Missing required fields" });
        continue;
      }

      if (isDuplicateLead(entry, seenLeads)) {
        skipped.push({ business: entry.business, reason: "Already exists" });
        continue;
      }

      try {
        const lead = await insertLead(entry);
        if (!lead) {
          skipped.push({ business: entry.business, reason: "Insert failed" });
          continue;
        }

        imported.push({ id: lead.id, business: lead.business });
        seenLeads.push(entry);
      } catch {
        skipped.push({ business: entry.business, reason: "Insert failed" });
      }
    }

    return NextResponse.json({
      ok: true,
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
    });
  } catch (error) {
    console.error("[API /leads/import POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to import Excel leads.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
