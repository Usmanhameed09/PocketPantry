import { NextRequest, NextResponse } from "next/server";
import { getAllLeads, getLead, updateLead, deleteLead } from "@/lib/leads-store";
import { createServerClient } from "@/lib/supabase";

type LeadInsertInput = {
  business: string;
  contact: string;
  phone: string;
  email?: string;
  address?: string;
  distance?: string;
  businessType?: string;
  source?: string;
  contactMethod?: string;
  contactTitle?: string;
  decisionMakerName?: string;
  decisionMakerPhone?: string;
  decisionMakerEmail?: string;
  // v2 fields
  owner?: string;
  vertical?: string;
  website?: string;
  employeeCount?: string;
  footTrafficScore?: number;
  apolloMobile?: string;
};

function parseLeadNumber(id: string | undefined) {
  if (!id) return 0;
  const match = id.match(/^L-(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function buildLeadInsertPayload(data: LeadInsertInput, id: string, dateStr: string) {
  const payload: Record<string, unknown> = {
    id,
    business: data.business,
    contact: data.contact,
    phone: data.phone,
    email: data.email || "",
    address: data.address || "",
    distance: data.distance || "--",
    business_type: data.businessType || "",
    source: data.source || "Manual",
    stage: "New Lead",
    contact_method: data.contactMethod || "Call",
    call_attempts: 0,
    added_date: dateStr,
    last_activity: `Added ${dateStr}`,
  };

  if (data.contactTitle?.trim()) payload.contact_title = data.contactTitle.trim();
  if (data.decisionMakerName?.trim()) payload.decision_maker_name = data.decisionMakerName.trim();
  if (data.decisionMakerPhone?.trim()) payload.decision_maker_phone = data.decisionMakerPhone.trim();
  if (data.decisionMakerEmail?.trim()) payload.decision_maker_email = data.decisionMakerEmail.trim();

  // v2 fields — only set when non-empty so we don't write blanks into NOT NULL columns
  if (data.owner?.trim()) payload.owner = data.owner.trim();
  if (data.vertical?.trim()) payload.vertical = data.vertical.trim();
  if (data.website?.trim()) payload.website = data.website.trim();
  if (data.employeeCount?.trim()) payload.employee_count = data.employeeCount.trim();
  if (data.footTrafficScore !== undefined && !isNaN(data.footTrafficScore)) payload.foot_traffic_score = data.footTrafficScore;
  if (data.apolloMobile?.trim()) payload.apollo_mobile = data.apolloMobile.trim();

  return payload;
}

async function insertLeadWithSafeId(data: LeadInsertInput) {
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

  let result = await supabase.from("leads").insert(buildLeadInsertPayload(data, id, dateStr));

  if (result.error) {
    const message = `${result.error.message || ""} ${result.error.details || ""} ${result.error.hint || ""}`.toLowerCase();
    const optionalColumnIssue =
      message.includes("contact_title") ||
      message.includes("decision_maker_name") ||
      message.includes("decision_maker_phone") ||
      message.includes("decision_maker_email") ||
      // v2 columns — added by 004_pipeline_v2.sql. If the migration hasn't
      // run yet, fall back to inserting without them.
      message.includes("owner") ||
      message.includes("vertical") ||
      message.includes("website") ||
      message.includes("employee_count") ||
      message.includes("foot_traffic_score") ||
      message.includes("apollo_mobile");

    if (optionalColumnIssue) {
      result = await supabase.from("leads").insert(
        buildLeadInsertPayload(
          {
            ...data,
            contactTitle: "",
            decisionMakerName: "",
            decisionMakerPhone: "",
            decisionMakerEmail: "",
            owner: "",
            vertical: "",
            website: "",
            employeeCount: "",
            footTrafficScore: undefined,
            apolloMobile: "",
          },
          id,
          dateStr
        )
      );
    }
  }

  if (result.error) {
    throw result.error;
  }

  return getLead(id);
}

/**
 * GET /api/leads — List all leads (with call & email logs)
 * GET /api/leads?id=L-001 — Get a specific lead
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const lead = await getLead(id);
      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      return NextResponse.json(lead);
    }

    const leads = await getAllLeads();
    return NextResponse.json(leads);
  } catch (error) {
    console.error("[API /leads GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

/**
 * POST /api/leads — Add a new lead manually
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.business || !body.contact || !body.phone) {
      return NextResponse.json(
        { error: "Missing required fields: business, contact, phone" },
        { status: 400 }
      );
    }

    const lead = await insertLeadWithSafeId({
      business: body.business,
      contact: body.contact,
      phone: body.phone,
      email: body.email || "",
      address: body.address || "",
      distance: body.distance || "--",
      businessType: body.businessType || "",
      source: body.source || "Manual",
      contactMethod: body.contactMethod || "Call",
      contactTitle: body.contactTitle || "",
      decisionMakerName: body.decisionMakerName || "",
      decisionMakerPhone: body.decisionMakerPhone || "",
      decisionMakerEmail: body.decisionMakerEmail || "",
      // v2 fields — set on the Lead Dashboard / Add Lead form
      owner: body.owner || "",
      vertical: body.vertical || "",
      website: body.website || "",
      employeeCount: typeof body.employeeCount === "string" ? body.employeeCount : "",
      footTrafficScore: typeof body.footTrafficScore === "number" ? body.footTrafficScore : undefined,
      apolloMobile: body.apolloMobile || "",
    });

    if (!lead) {
      return NextResponse.json({ error: "Failed to add lead" }, { status: 500 });
    }

    console.log(`[Leads] New lead added: ${lead.id} - ${lead.business}`);
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("[API /leads POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to create lead.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * PATCH /api/leads — Update a lead
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing lead id" }, { status: 400 });
    }

    const ok = await updateLead(id, updates);
    if (!ok) {
      return NextResponse.json({ error: "Lead not found or update failed" }, { status: 404 });
    }

    const updated = await getLead(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API /leads PATCH] Error:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

/**
 * DELETE /api/leads — Delete a lead
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing lead id" }, { status: 400 });
    }

    const deleted = await deleteLead(id);
    if (!deleted) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: id });
  } catch (error) {
    console.error("[API /leads DELETE] Error:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
