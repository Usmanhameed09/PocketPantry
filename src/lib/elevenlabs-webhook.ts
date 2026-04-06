import { NextRequest, NextResponse } from "next/server";
import {
  addCallLogAndUpdateStage,
  addEmailLog,
  getAllLeads,
  getLead,
  logOutreachAction,
  updateCallLogByConversationId,
  updateLead,
} from "@/lib/leads-store";
import { sendOutreachEmail } from "@/lib/outreach-email";
import { getConversationDetails, verifyElevenLabsSignature } from "@/lib/elevenlabs";
import { bookLeadInCalendly } from "@/lib/calendly-booking";

type DataCollectionEntry = {
  value?: unknown;
  rationale?: string;
};

type AnalysisPayload = {
  evaluation_criteria_results?: Record<string, { result?: string; rationale?: string }>;
  data_collection_results?: Record<string, DataCollectionEntry>;
  transcript_summary?: string;
};

type ElevenLabsWebhookEvent = {
  type?: string;
  data?: {
    conversation_id?: string;
    analysis?: AnalysisPayload;
    metadata?: Record<string, unknown>;
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
    };
    transcript?: string | null;
  };
  conversation_id?: string;
  analysis?: AnalysisPayload;
  metadata?: Record<string, unknown>;
  conversation_initiation_client_data?: {
    dynamic_variables?: Record<string, unknown>;
  };
  transcript?: string | null;
};

type TranscriptTurn = {
  role?: string;
  message?: string | null;
};

function readCollectedValue(results: Record<string, DataCollectionEntry> | undefined, key: string) {
  return results?.[key]?.value;
}

function readFirstCollectedValue(
  results: Record<string, DataCollectionEntry> | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = readCollectedValue(results, key);
    if (value !== null && value !== undefined && `${value}`.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function asString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  return String(value).trim() || undefined;
}

function getTranscriptFallbackSummary(transcript: unknown) {
  if (typeof transcript === "string") {
    return asString(transcript);
  }

  if (!Array.isArray(transcript)) {
    return undefined;
  }

  const parts = transcript
    .map((entry) => {
      const turn = entry as TranscriptTurn;
      const message = asString(turn.message);
      if (!message) return undefined;
      const role = asString(turn.role);
      return role ? `${role}: ${message}` : message;
    })
    .filter(Boolean) as string[];

  if (parts.length === 0) {
    return undefined;
  }

  const summary = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!summary) {
    return undefined;
  }

  return summary.length > 900 ? `${summary.slice(0, 897)}...` : summary;
}

function readDynamicVariable(
  dynamicVariables: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = asString(dynamicVariables[key]);
    if (value) return value;
  }

  return undefined;
}

function normalizeVendorStatus(value: unknown) {
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

function looksLikeAgentName(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  return ["alex", "arthur", "ryan", "pocket pantry", "pocketpantry"].includes(normalized);
}

function inferCallStatus(
  explicitStatus: string | undefined,
  interestLevel: string | undefined,
  visitTime: string | undefined,
  followUpTime: string | undefined
) {
  const normalizedExplicit = explicitStatus?.trim().toLowerCase();
  if (normalizedExplicit && !["success", "failure"].includes(normalizedExplicit)) {
    return explicitStatus;
  }

  if (visitTime) return "Site Visit Requested";

  const normalizedInterest = interestLevel?.trim().toLowerCase();
  if (normalizedInterest === "not interested") return "Not Interested";
  if (normalizedInterest?.includes("interested")) return "Interested";

  if (followUpTime) return "Callback";

  return undefined;
}

function isOwnBusinessName(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "pocket pantry" || normalized === "pocketpantry";
}

function normalizeOutcome(status: string | undefined) {
  const normalized = (status || "").trim().toLowerCase();

  if (normalized === "site visit requested") return "site_visit";
  if (normalized === "proposal requested") return "proposal";
  if (normalized === "interested") return "interested";
  if (normalized === "not interested") return "not_interested";
  if (normalized === "callback" || normalized === "callback requested") return "callback";
  if (normalized === "voicemail") return "voicemail";
  if (normalized === "no answer") return "no_answer";
  if (normalized === "gatekeeper") return "gatekeeper";
  if (normalized === "wrong number") return "wrong_number";
  return "contacted";
}

function isPlaceholderConversationLog(log: { outcome?: string; summary?: string; duration?: string } | undefined) {
  if (!log) return false;
  const normalizedOutcome = (log.outcome || "").trim().toLowerCase();
  const normalizedSummary = (log.summary || "").trim().toLowerCase();
  return (
    normalizedOutcome === "contacted" &&
    (normalizedSummary === "call completed" || normalizedSummary === "")
  );
}

function parseVisitDateTime(raw: string | undefined) {
  if (!raw) return { visitDate: undefined, visitTime: undefined };
  const trimmed = raw.trim();
  const atMatch = trimmed.match(/^(.*?)(?:\s+at\s+)(.+)$/i);
  if (atMatch) {
    return {
      visitDate: atMatch[1].trim() || trimmed,
      visitTime: atMatch[2].trim() || trimmed,
    };
  }
  const trailingTime = trimmed.match(/^(.*?)(\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i);
  if (trailingTime) {
    return {
      visitDate: trailingTime[1].trim() || trimmed,
      visitTime: trailingTime[2].trim(),
    };
  }
  return { visitDate: trimmed, visitTime: undefined };
}

export async function sendPrimaryEmail(
  leadId: string,
  contactName: string,
  businessName: string,
  email: string
) {
  try {
    const response = await sendOutreachEmail({
      to: email,
      stage: "primary",
      contactName,
      businessName,
    });

    await addEmailLog(leadId, response.subject, "Sent");
    await updateLead(leadId, { emailSent: true });
    await logOutreachAction(leadId, "email", {
      stage: "primary",
      subject: response.subject,
      resendId: response.id || null,
    });
    return true;
  } catch (error) {
    console.error("[ElevenLabs Webhook] Email error:", error);
    return false;
  }
}

export async function processElevenLabsEvent(body: ElevenLabsWebhookEvent) {
  const eventType = body.type || "post_call_transcription";

  if (eventType !== "post_call_transcription") {
    return { ok: true };
  }

  let data = body.data || body;
  const conversationId = asString(data.conversation_id);

  if ((!data.analysis || !conversationId) && conversationId) {
    try {
      const conversation = await getConversationDetails(conversationId);
      data = {
        ...data,
        ...conversation,
        analysis: (conversation.analysis as AnalysisPayload | undefined) || data.analysis,
        metadata: (conversation.metadata as Record<string, unknown> | undefined) || data.metadata,
        conversation_initiation_client_data:
          (conversation.conversation_initiation_client_data as { dynamic_variables?: Record<string, unknown> } | undefined) ||
          data.conversation_initiation_client_data,
        transcript: conversation.transcript || data.transcript,
      };
    } catch (error) {
      console.error("[ElevenLabs Webhook] Conversation lookup failed:", error);
    }
  }

  const dynamicVariables = data.conversation_initiation_client_data?.dynamic_variables || {};
  let leadId = asString(dynamicVariables.leadId) || asString(dynamicVariables.lead_id);

  if (!leadId && conversationId) {
    const leads = await getAllLeads();
    const matched = leads.find((lead) => lead.vapiCallId === conversationId);
    leadId = matched?.id;
  }

  if (!leadId) {
    return { ok: true, skipped: "No lead id found" };
  }

  const lead = await getLead(leadId);
  if (!lead) {
    return { ok: true, skipped: "Lead not found" };
  }

  const existingConversationLog = conversationId
    ? lead.callLogs.find((log) => log.vapiCallId === conversationId)
    : undefined;

  if (existingConversationLog && !isPlaceholderConversationLog(existingConversationLog)) {
    return { ok: true, duplicate: true };
  }

  const analysis = data.analysis || {};
  const criteriaResults = analysis.evaluation_criteria_results || {};
  const collectionResults = analysis.data_collection_results || {};
  const interestLevel = asString(readFirstCollectedValue(collectionResults, ["interest_level"]));
  const visitRaw = asString(readFirstCollectedValue(collectionResults, ["site_visit_datetime", "visit_datetime"]));
  const followUpRaw = asString(readFirstCollectedValue(collectionResults, ["follow_up_time", "callback_datetime"]));
  const callStatusResult = inferCallStatus(
    asString(criteriaResults.call_status?.result) ||
      asString((data.metadata || {}).call_status),
    interestLevel,
    visitRaw,
    followUpRaw
  );
  const durationSeconds = Number((data.metadata || {}).call_duration_secs || (data.metadata || {}).duration_seconds || 0);
  const transcriptEntries = Array.isArray(data.transcript)
    ? data.transcript
    : data.transcript
      ? [data.transcript]
      : [];
  const hasTranscript = transcriptEntries.length > 0;

  if (!callStatusResult && !analysis.transcript_summary && !hasTranscript && durationSeconds === 0) {
    return { ok: true, skipped: "Conversation not finalized" };
  }

  const outcome = normalizeOutcome(callStatusResult);
  const summary =
    asString(analysis.transcript_summary) ||
    asString((data.metadata || {}).transcript_summary) ||
    getTranscriptFallbackSummary(data.transcript) ||
    "Call completed";

  const { visitDate, visitTime } = parseVisitDateTime(visitRaw);
  const { visitDate: callbackDate, visitTime: callbackTime } = parseVisitDateTime(followUpRaw);
  const currentVendorStatus = normalizeVendorStatus(
    readFirstCollectedValue(collectionResults, ["has_current_vendor", "current_vendor_status"])
  );
  const notes = asString(readFirstCollectedValue(collectionResults, ["notes"]));
  const currentPainPoints = Array.isArray(lead.painPoints) ? [...lead.painPoints] : [];
  if (notes && !currentPainPoints.includes(notes)) {
    currentPainPoints.push(notes);
  }

  const collectedBusiness = asString(
    readFirstCollectedValue(collectionResults, ["business_name", "company_name", "business"])
  );
  const dynamicBusiness = readDynamicVariable(dynamicVariables, ["businessName", "business_name"]);
  const businessName =
    dynamicBusiness || (collectedBusiness && !isOwnBusinessName(collectedBusiness) ? collectedBusiness : undefined);
  const collectedContact = asString(
    readFirstCollectedValue(collectionResults, ["contact_name", "contact_person_name"])
  );
  const safeCollectedContact = looksLikeAgentName(collectedContact) ? undefined : collectedContact;

  const leadUpdates: Parameters<typeof updateLead>[1] = {
    business: businessName,
    businessType: asString(readFirstCollectedValue(collectionResults, ["business_type"])),
    contact:
      safeCollectedContact ||
      readDynamicVariable(dynamicVariables, ["contactName", "contact_name"]),
    contactTitle: asString(readFirstCollectedValue(collectionResults, ["contact_title"])),
    email:
      asString(readFirstCollectedValue(collectionResults, ["email", "contact_email"])) ||
      readDynamicVariable(dynamicVariables, ["email"]),
    phone:
      asString(readFirstCollectedValue(collectionResults, ["phone", "contact_phone_number"])) ||
      readDynamicVariable(dynamicVariables, ["phone"]),
    address:
      asString(readFirstCollectedValue(collectionResults, ["address"])) ||
      readDynamicVariable(dynamicVariables, ["address"]),
    employeeCount: asString(readFirstCollectedValue(collectionResults, ["employee_count"])),
    currentVendingStatus: currentVendorStatus,
    currentVendorName: asString(readFirstCollectedValue(collectionResults, ["current_vendor_name"])),
    productPreferences: asString(readFirstCollectedValue(collectionResults, ["product_preferences"])),
    decisionMakerName: asString(readFirstCollectedValue(collectionResults, ["decision_maker_name"])),
    decisionMakerPhone: asString(readFirstCollectedValue(collectionResults, ["decision_maker_phone"])),
    decisionMakerEmail: asString(readFirstCollectedValue(collectionResults, ["decision_maker_email"])),
    visitDate,
    visitTime,
    callbackDate,
    callbackTime,
    painPoints: currentPainPoints.length > 0 ? currentPainPoints : undefined,
  };

  Object.keys(leadUpdates).forEach((key) => {
    if ((leadUpdates as Record<string, unknown>)[key] === undefined) {
      delete (leadUpdates as Record<string, unknown>)[key];
    }
  });

  if (Object.keys(leadUpdates).length > 0) {
    await updateLead(leadId, leadUpdates);
  }

  const duration =
    durationSeconds > 0
      ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
      : "-";

  if (conversationId && existingConversationLog && isPlaceholderConversationLog(existingConversationLog)) {
    await updateCallLogByConversationId({
      leadId,
      vapiCallId: conversationId,
      duration,
      outcome,
      summary,
    });
  } else {
    await addCallLogAndUpdateStage(
      leadId,
      {
        attempt: (lead.callAttempts || 0) + 1,
        date: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        duration,
        outcome,
        summary,
        vapiCallId: conversationId,
      },
      outcome
    );
  }

  await updateLead(leadId, {
    vapiCallId: conversationId,
    lastActivity: `Call ${callStatusResult || "completed"} - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  });

  if (outcome === "site_visit") {
    await logOutreachAction(leadId, "site_visit_scheduled", {
      visitDate,
      visitTime,
      summary,
    });
    try {
      const calendlyResult = await bookLeadInCalendly({ leadId, startTime: visitDate });
      if (!calendlyResult.ok) {
        console.warn("[ElevenLabs Webhook] Scheduling slot unavailable:", calendlyResult.requestedStartTime);
      }
    } catch (error) {
      console.error("[ElevenLabs Webhook] Google Calendar auto-booking failed:", error);
    }
  } else if (outcome === "callback") {
    await logOutreachAction(leadId, "callback_scheduled", {
      callbackDate: visitDate,
      callbackTime: visitTime,
      summary,
    });
  } else if (outcome === "voicemail" || outcome === "no_answer" || outcome === "gatekeeper") {
    await logOutreachAction(leadId, "voicemail", { summary });
    if (lead.email && !lead.emailSent) {
      await sendPrimaryEmail(leadId, lead.contact || "there", lead.business, lead.email);
    }
  }

  return {
    ok: true,
    leadId,
    conversationId,
    outcome,
    callStatus: callStatusResult,
  };
}

export async function handleElevenLabsWebhook(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("elevenlabs-signature");
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET || "";

    if (webhookSecret && !verifyElevenLabsSignature(payload, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid ElevenLabs signature" }, { status: 401 });
    }

    const body = JSON.parse(payload) as ElevenLabsWebhookEvent;
    const result = await processElevenLabsEvent(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ElevenLabs Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
