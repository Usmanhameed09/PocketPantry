import { NextRequest, NextResponse } from "next/server";
import { getLead } from "@/lib/leads-store";
import { getConversationDetails } from "@/lib/elevenlabs";

type DataCollectionEntry = {
  value?: unknown;
};

function asString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const stringValue = String(value).trim();
  return stringValue || undefined;
}

function looksLikeAgentName(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  return ["alex", "arthur", "ryan", "pocket pantry", "pocketpantry"].includes(normalized);
}

function parseCollectionResult(results: Record<string, DataCollectionEntry> | undefined, key: string) {
  return results?.[key]?.value;
}

function formatVendorStatus(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Has current vendor" : "No current vendor";
  }

  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;

  if (["true", "yes", "has current vendor", "current vendor", "existing vendor"].includes(normalized)) {
    return "Has current vendor";
  }

  if (["false", "no", "no current vendor", "no vendor"].includes(normalized)) {
    return "No current vendor";
  }

  return undefined;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const lead = await getLead(id);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const conversationId = lead.vapiCallId || lead.callLogs[lead.callLogs.length - 1]?.vapiCallId;
    if (!conversationId) {
      return NextResponse.json({ conversationId: null, captured: null });
    }

    const conversation = await getConversationDetails(conversationId);
    const analysis = (conversation.analysis || {}) as {
      data_collection_results?: Record<string, DataCollectionEntry>;
    };
    const results = analysis.data_collection_results || {};

    const rawContactName = asString(parseCollectionResult(results, "contact_person_name"));
    const safeContactName = looksLikeAgentName(rawContactName) ? undefined : rawContactName;
    const captured = {
      contactName: safeContactName || lead.contact || undefined,
      contactTitle: asString(parseCollectionResult(results, "contact_title")),
      phone: asString(parseCollectionResult(results, "contact_phone_number")) || lead.phone || undefined,
      email: asString(parseCollectionResult(results, "contact_email")) || lead.email || undefined,
      address: asString(parseCollectionResult(results, "address")) || lead.address || undefined,
      businessName: asString(parseCollectionResult(results, "business_name")) || lead.business || undefined,
      businessType: asString(parseCollectionResult(results, "business_type")) || lead.businessType || undefined,
      employeeCount: asString(parseCollectionResult(results, "employee_count")),
      interestLevel: asString(parseCollectionResult(results, "interest_level")),
      currentVendingStatus: formatVendorStatus(parseCollectionResult(results, "has_current_vendor")) || lead.currentVendingStatus || undefined,
      currentVendorName: asString(parseCollectionResult(results, "current_vendor_name")) || lead.currentVendorName || undefined,
      productPreferences: asString(parseCollectionResult(results, "product_preferences")) || lead.productPreferences || undefined,
      decisionMakerName: asString(parseCollectionResult(results, "decision_maker_name")) || lead.decisionMakerName || undefined,
      decisionMakerPhone: asString(parseCollectionResult(results, "decision_maker_phone")) || lead.decisionMakerPhone || undefined,
      decisionMakerEmail: asString(parseCollectionResult(results, "decision_maker_email")) || lead.decisionMakerEmail || undefined,
      siteVisit:
        asString(parseCollectionResult(results, "site_visit_datetime")) ||
        asString(parseCollectionResult(results, "visit_datetime")) ||
        lead.visitDate ||
        undefined,
      callback:
        asString(parseCollectionResult(results, "follow_up_time")) ||
        asString(parseCollectionResult(results, "callback_datetime")) ||
        lead.callbackDate ||
        undefined,
      notes: asString(parseCollectionResult(results, "notes")) || lead.painPoints?.join(", ") || undefined,
      rawResults: results,
    };

    return NextResponse.json({
      conversationId,
      captured,
    });
  } catch (error) {
    console.error("[API /leads/:id/captured GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch captured lead data" }, { status: 500 });
  }
}
