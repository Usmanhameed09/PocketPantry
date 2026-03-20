import { NextRequest, NextResponse } from "next/server";
import { addLead, getAllLeads, getLead, updateLead, deleteLead } from "@/lib/leads-store";

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

    const lead = await addLead({
      business: body.business,
      contact: body.contact,
      phone: body.phone,
      email: body.email || "",
      address: body.address || "",
      distance: body.distance || "—",
      businessType: body.businessType || "",
      source: body.source || "Manual",
      contactMethod: body.contactMethod || "Call",
    });

    if (!lead) {
      return NextResponse.json({ error: "Failed to add lead" }, { status: 500 });
    }

    console.log(`[Leads] New lead added: ${lead.id} — ${lead.business}`);
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("[API /leads POST] Error:", error);
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
