import { NextResponse } from "next/server";
import { getAllLeads, updateLead, updateLastCallDuration } from "@/lib/leads-store";
import { getConversationDetails } from "@/lib/elevenlabs";
import { processElevenLabsEvent, sendPrimaryEmail } from "@/lib/elevenlabs-webhook";
import { processOutreachFollowUps } from "@/lib/outreach-follow-up";

function toWebhookTranscript(transcript: unknown) {
  if (typeof transcript === "string") {
    return transcript;
  }

  if (Array.isArray(transcript)) {
    return transcript
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

function buildNoAnswerFallback(conversation: Record<string, unknown>, fallbackConversationId: string) {
  const metadata = (conversation.metadata as Record<string, unknown> | undefined) || {};
  return {
    type: "post_call_transcription",
    conversation_id: (conversation.conversation_id as string | undefined) || fallbackConversationId,
    analysis: {
      evaluation_criteria_results: {
        call_status: {
          criteria_id: "call_status",
          result: "No answer",
          rationale:
            "Fallback sync marked this call as no answer because ElevenLabs left it in initiated state with zero duration and no transcript.",
        },
      },
      data_collection_results: {},
      transcript_summary: "Call was not answered.",
    },
    metadata: {
      ...metadata,
      call_status: "No answer",
      duration_seconds: Number(metadata.duration_seconds || metadata.call_duration_secs || 0),
    },
    conversation_initiation_client_data:
      (conversation.conversation_initiation_client_data as Record<string, unknown> | undefined) || {},
    transcript: toWebhookTranscript(conversation.transcript),
  };
}

function hasPlaceholderDuration(duration: string | undefined) {
  return duration === "-" || duration === "—" || duration === "â€”";
}

function hasPlaceholderSummary(summary: string | undefined) {
  const normalized = (summary || "").trim().toLowerCase();
  return normalized === "" || normalized === "call completed";
}

export async function POST() {
  try {
    const leads = await getAllLeads();
    const pendingLeads = leads.filter((lead) => {
      if (!lead.vapiCallId || !lead.vapiCallId.startsWith("conv_")) return false;
      if (lead.callLogs.length === 0) return true;

      const matchingCall = [...lead.callLogs].reverse().find((log) => log.vapiCallId === lead.vapiCallId);
      if (!matchingCall) return true;

      return (
        matchingCall.outcome === "contacted" &&
        (hasPlaceholderDuration(matchingCall.duration) || hasPlaceholderSummary(matchingCall.summary))
      );
    });
    const recoveryLeads = leads.filter((lead) => {
      if (!lead.email || lead.emailSent || !lead.vapiCallId || !lead.vapiCallId.startsWith("conv_")) return false;

      const latestConversationLog = [...lead.callLogs].reverse().find((log) => log.vapiCallId === lead.vapiCallId);
      if (!latestConversationLog) return false;

      return ["no_answer", "voicemail", "gatekeeper"].includes(latestConversationLog.outcome);
    });

    let synced = 0;
    let skipped = 0;
    let recoveredEmails = 0;

    for (const lead of pendingLeads) {
      try {
        const conversation = await getConversationDetails(lead.vapiCallId!);
        const metadata = (conversation.metadata as Record<string, unknown> | undefined) || {};
        const durationSeconds = Number(metadata.call_duration_secs || metadata.duration_seconds || 0);
        const startedAt = Number(metadata.start_time_unix_secs || 0);
        const transcript = Array.isArray(conversation.transcript)
          ? conversation.transcript
          : conversation.transcript
            ? [conversation.transcript]
            : [];

        const isStaleNoAnswer =
          conversation.status === "initiated" &&
          !conversation.analysis &&
          transcript.length === 0 &&
          durationSeconds === 0 &&
          startedAt > 0 &&
          Date.now() - startedAt * 1000 > 45 * 1000;

        const existingConversationLog = [...lead.callLogs].reverse().find((log) => log.vapiCallId === lead.vapiCallId);

        if (isStaleNoAnswer && existingConversationLog) {
          if (lead.email && !lead.emailSent) {
            await sendPrimaryEmail(lead.id, lead.contact || "there", lead.business, lead.email);
          }

          await updateLastCallDuration(lead.id, "-", "Call was not answered.");
          await updateLead(lead.id, {
            stage: "Contacted",
            lastActivity: `Call No answer - ${new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`,
          });
          synced += 1;
          continue;
        }

        const result = await processElevenLabsEvent(
          isStaleNoAnswer
            ? buildNoAnswerFallback(conversation as Record<string, unknown>, lead.vapiCallId!)
            : {
                type: "post_call_transcription",
                ...conversation,
                conversation_id: conversation.conversation_id || lead.vapiCallId,
                transcript: toWebhookTranscript(conversation.transcript),
              }
        );

        if (result.ok && !("skipped" in result) && !("duplicate" in result)) {
          synced += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("404")) {
          console.error(`[Sync Calls] Failed for ${lead.id}:`, error);
        }
        skipped += 1;
      }
    }

    for (const lead of recoveryLeads) {
      try {
        const latestConversationLog = [...lead.callLogs].reverse().find((log) => log.vapiCallId === lead.vapiCallId);
        if (!latestConversationLog || !lead.email || lead.emailSent) {
          skipped += 1;
          continue;
        }

        const sent = await sendPrimaryEmail(lead.id, lead.contact || "there", lead.business, lead.email);
        if (sent) {
          recoveredEmails += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        console.error(`[Sync Calls] Email recovery failed for ${lead.id}:`, error);
        skipped += 1;
      }
    }

    const followUpResults = await processOutreachFollowUps(leads);

    return NextResponse.json({
      ok: true,
      synced,
      recoveredEmails,
      skipped,
      pending: pendingLeads.length,
      recoveryPending: recoveryLeads.length,
      followUp1Sent: followUpResults.followUp1Sent,
      followUp2Sent: followUpResults.followUp2Sent,
      closedAsNotInterested: followUpResults.closedAsNotInterested,
      followUpErrors: followUpResults.errors,
    });
  } catch (error) {
    console.error("[Sync Calls] Error:", error);
    return NextResponse.json({ error: "Failed to sync pending calls" }, { status: 500 });
  }
}
