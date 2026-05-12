import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/email-agent/diagnostics
 *
 * Returns recent email-agent activity to answer "why didn't this email get
 * auto-replied to?". Pulls the last ~50 inbound replies, joins them with
 * their auto-reply outcome (or skipReason), and the current per-lead reply
 * counts.
 */
export async function GET() {
  try {
    const supabase = createServerClient();

    // Last 50 reply_received events (inbound emails the agent matched to leads)
    const { data: replies } = await supabase
      .from("outreach_log")
      .select("lead_id, performed_at, action_data")
      .eq("action_type", "email")
      .contains("action_data", { subtype: "reply_received" })
      .order("performed_at", { ascending: false })
      .limit(50);

    // Last 50 auto_reply events (outbound replies the agent actually sent)
    const { data: autoReplies } = await supabase
      .from("outreach_log")
      .select("lead_id, performed_at, action_data")
      .eq("action_type", "email")
      .contains("action_data", { subtype: "auto_reply" })
      .order("performed_at", { ascending: false })
      .limit(50);

    // Build lookup: for each inbound message, did we reply within 10 min?
    const autoReplyByThread = new Map<string, string>();
    for (const ar of autoReplies || []) {
      const d = (ar.action_data || {}) as { inReplyTo?: string; performed_at?: string };
      if (d.inReplyTo) autoReplyByThread.set(d.inReplyTo, ar.performed_at as string);
    }

    // Per-lead lifetime auto-reply count
    const perLeadCount = new Map<string, number>();
    for (const ar of autoReplies || []) {
      const k = (ar.lead_id as string) || "";
      perLeadCount.set(k, (perLeadCount.get(k) || 0) + 1);
    }

    // Build a per-reply summary
    const inboundSummary = (replies || []).map((row) => {
      const d = (row.action_data || {}) as {
        from?: string;
        subject?: string;
        messageId?: string;
        intent?: string;
        confidence?: number;
        summary?: string;
      };
      const wasRepliedTo = d.messageId ? autoReplyByThread.has(d.messageId) : false;
      return {
        leadId: row.lead_id,
        receivedAt: row.performed_at,
        from: d.from,
        subject: d.subject,
        intent: d.intent,
        confidence: d.confidence,
        gptSummary: d.summary,
        autoReplied: wasRepliedTo,
        leadLifetimeReplies: perLeadCount.get(row.lead_id as string) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      inboundCount: replies?.length || 0,
      autoReplyCount: autoReplies?.length || 0,
      inbound: inboundSummary,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load diagnostics" },
      { status: 500 }
    );
  }
}
