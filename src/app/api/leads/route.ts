import { NextRequest, NextResponse } from "next/server";
import { addLead, getAllLeads, getLead, updateLead, deleteLead } from "@/lib/leads-store";

/**
 * GET /api/leads — List all leads
 * GET /api/leads?id=L-001 — Get a specific lead
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const lead = getLead(id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json(lead);
  }

  const leads = getAllLeads();
  return NextResponse.json(leads);
}

/**
 * POST /api/leads — Add a new lead manually
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.business || !body.contact || !body.phone) {
      return NextResponse.json(
        { error: "Missing required fields: business, contact, phone" },
        { status: 400 }
      );
    }

    const lead = addLead({
      business: body.business,
      contact: body.contact,
      phone: body.phone,
      email: body.email || "",
      address: body.address || "",
      distance: body.distance || "—",
      businessType: body.businessType || "",
      source: body.source || "Manual",
      stage: "New Lead",
      contactMethod: body.contactMethod || "Call",
    });

    console.log(`[Leads] New lead added: ${lead.id} — ${lead.business}`);
    return NextResponse.json(lead, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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

    const lead = updateLead(id, updates);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

/**
 * DELETE /api/leads — Delete a lead
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing lead id" }, { status: 400 });
  }

  const deleted = deleteLead(id);
  if (!deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: id });
}
