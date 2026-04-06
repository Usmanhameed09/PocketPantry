import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leads-store";
import { triggerOutboundCall, formatPhoneE164, getElevenLabsPhoneNumberId } from "@/lib/elevenlabs";

/**
 * POST /api/calls/trigger — Trigger an outbound ElevenLabs call to a lead
 *
 * Body: { leadId: "L-001" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.callAttempts >= 3) {
      return NextResponse.json(
        { error: "Maximum call attempts (3) reached for this lead" },
        { status: 400 }
      );
    }

    if (!lead.phone) {
      return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
    }

    if (!getElevenLabsPhoneNumberId()) {
      return NextResponse.json(
        { error: "ElevenLabs phone number not configured. Add ELEVENLABS_PHONE_NUMBER_ID to env vars." },
        { status: 500 }
      );
    }

    const formattedPhone = formatPhoneE164(lead.phone);
    const genericContactNames = new Set([
      "front desk",
      "reception",
      "receptionist",
      "office",
      "office manager",
      "manager",
      "admin",
      "administrator",
    ]);
    const normalizedContact = (lead.contact || "").trim().toLowerCase();
    const bestKnownContactName =
      (lead.decisionMakerName || "").trim() ||
      (normalizedContact && !genericContactNames.has(normalizedContact) ? lead.contact.trim() : "");
    const bestKnownContactTitle = (lead.contactTitle || "").trim();
    const bestKnownFirstName = (bestKnownContactName.split(/\s+/)[0] || "").trim();
    const openingTargetName = bestKnownContactName || "the person who handles vending or breakroom services";
    const knownEmail = (lead.decisionMakerEmail || lead.email || "").trim();
    const knownPhoneNumber = (lead.decisionMakerPhone || lead.phone || "").trim();
    const knownAddress = (lead.address || "").trim();
    const knownBusinessName = (lead.business || "").trim();
    const knownEmployeeCount = (lead.employeeCount || "").trim();
    const knownVendingStatus = (lead.currentVendingStatus || "").trim();

    console.log(`[Calls] Triggering ElevenLabs call to ${lead.business} (${formattedPhone}) - Attempt ${lead.callAttempts + 1}`);

    const elevenCall = await triggerOutboundCall({
      phoneNumber: formattedPhone,
      leadId: lead.id,
      dynamicVariables: {
        contactName: bestKnownContactName || lead.contact,
        knownLeadName: bestKnownContactName || lead.contact,
        targetContactName: bestKnownContactName || lead.contact,
        namedContact: bestKnownContactName,
        knownLeadFirstName: bestKnownFirstName,
        hasNamedLead: bestKnownContactName ? "true" : "false",
        openingTargetName,
        contactTitle: bestKnownContactTitle,
        businessName: knownBusinessName,
        knownBusinessName,
        hasKnownBusinessName: knownBusinessName ? "true" : "false",
        phone: lead.phone,
        email: lead.email || "",
        address: lead.address || "",
        knownEmail,
        hasKnownEmail: knownEmail ? "true" : "false",
        knownPhoneNumber,
        hasKnownPhoneNumber: knownPhoneNumber ? "true" : "false",
        currentDialedNumber: knownPhoneNumber || formattedPhone,
        knownAddress,
        hasKnownAddress: knownAddress ? "true" : "false",
        knownEmployeeCount,
        hasKnownEmployeeCount: knownEmployeeCount ? "true" : "false",
        knownVendingStatus,
        hasKnownVendingStatus: knownVendingStatus ? "true" : "false",
        mustKeepConfirmedName: bestKnownContactName ? "true" : "false",
        decisionMakerName: bestKnownContactName || lead.contact || "",
        decisionMakerPhone: lead.decisionMakerPhone || lead.phone,
        decisionMakerEmail: lead.decisionMakerEmail || lead.email || "",
      },
    });

    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

    await updateLead(leadId, {
      vapiCallId: elevenCall.conversation_id || undefined,
      stage: lead.stage === "New Lead" ? "Contacted" : lead.stage,
      lastActivity: `Call initiated — ${dateStr}`,
    });

    console.log(`[Calls] ElevenLabs call created: ${elevenCall.conversation_id}`);

    return NextResponse.json({
      ok: true,
      callId: elevenCall.conversation_id,
      leadId: lead.id,
      status: elevenCall.success ? "initiated" : "queued",
      message: `Call initiated to ${lead.business} (${formattedPhone})`,
    });
  } catch (error) {
    console.error("[Calls] Error triggering call:", error);
    const message = error instanceof Error ? error.message : "Failed to trigger call";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
