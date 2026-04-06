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
};

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

  return existing.some((lead) => {
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

  const { error } = await supabase.from("leads").insert({
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
  });

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
