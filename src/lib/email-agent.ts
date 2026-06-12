/**
 * Email Agent — IMAP inbox reader + OpenAI reply classifier + auto-reply.
 *
 * DEDUP ARCHITECTURE:
 *  1. Only processes emails received in the last 24 hours (IMAP SINCE)
 *  2. Every processed messageId is saved to outreach_log in Supabase
 *  3. Before processing, ALL known messageIds are loaded from Supabase
 *  4. Global mutex — only one scan at a time
 *  5. Per-lead 24h auto-reply cooldown (DB-backed)
 *  6. Global daily cap — max 10 auto-replies per day
 *  7. Skips bounce notifications, delivery receipts, mailer-daemon
 */

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createServerClient } from "./supabase";
import { bookLeadInCalendly, getCalendlyAvailabilityDecision } from "./calendly-booking";
import { getOutreachTemplates } from "./outreach-template-store";
import { buildSignatureHtml, buildSignatureText } from "./outreach-email";
import { getEmailAgentSettings } from "./email-agent-settings";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export type ReplyIntent =
  | "interested"
  | "not_interested"
  | "needs_info"
  | "booked"
  | "unsubscribe"
  | "out_of_office"
  | "other";

export interface ClassifiedReply {
  intent: ReplyIntent;
  confidence: number;
  summary: string;
  suggestedReply: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  date: string;
  messageId: string;
  inReplyTo: string | null;
  autoReplySent?: boolean;
  // If autoReplySent is false, this explains why (e.g. "lifetime cap reached",
  // "daily cap reached", "intent=not_interested"). Empty string means N/A.
  skipReason?: string;
}

export interface InboxCheckResult {
  processed: number;
  matched: number;
  classified: ClassifiedReply[];
  errors: string[];
  autoRepliesSent: number;
  skippedDuplicate: number;
}

// ----------------------------------------------------------------
// GLOBAL MUTEX
// ----------------------------------------------------------------

let _scanRunning = false;

// ----------------------------------------------------------------
// IMAP config
// ----------------------------------------------------------------

function getImapConfig() {
  return {
    host: process.env.EMAIL_IMAP_HOST || "pvpantry.com",
    port: parseInt(process.env.EMAIL_IMAP_PORT || "993"),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASSWORD || "",
    },
    logger: false as const,
  };
}

function getSmtpTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || "pvpantry.com",
    port: parseInt(process.env.EMAIL_SMTP_PORT || "465"),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASSWORD || "",
    },
  });
}

// ----------------------------------------------------------------
// Sender blocklist — never process these
// ----------------------------------------------------------------

const BLOCKED_SENDERS = [
  "mailer-daemon@",
  "postmaster@",
  "noreply@",
  "no-reply@",
  "notifications@",
  "bounce",
  "auto-notify",
];

function isBlockedSender(email: string): boolean {
  const lower = email.toLowerCase();
  return BLOCKED_SENDERS.some(b => lower.includes(b));
}

function isBounceLike(subject: string): boolean {
  const lower = subject.toLowerCase();
  return /^(undeliverable|delivery status|failure notice|returned mail|mail delivery|auto:)/i.test(lower);
}

// ----------------------------------------------------------------
// OpenAI classifier
// ----------------------------------------------------------------

async function classifyReply(subject: string, body: string): Promise<{
  intent: ReplyIntent;
  confidence: number;
  summary: string;
  suggestedReply: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return inferIntentFromKeywords(subject, body);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You classify email replies from business leads for a vending machine company (PocketPantry / PV Pantry).

Classify the reply into one of these intents:
- "interested": wants to proceed, schedule meeting, learn more, positive tone
- "not_interested": hard no, not right now, already has vendor, negative tone
- "needs_info": asking questions before deciding (pricing, terms, details)
- "booked": confirmed a meeting, appointment, or site visit
- "unsubscribe": asks to stop emails, remove from list
- "out_of_office": auto-reply, vacation, OOO
- "other": unrelated, spam, unclear

Return JSON: {"intent":"...","confidence":0.0-1.0,"summary":"one sentence","suggestedReply":"2-3 sentence reply draft"}`,
          },
          {
            role: "user",
            content: `Subject: ${subject}\n\nBody:\n${body.substring(0, 2000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[email-agent] OpenAI error:", response.status);
      return inferIntentFromKeywords(subject, body);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return {
      intent: parsed.intent || "other",
      confidence: parsed.confidence || 0.5,
      summary: parsed.summary || "",
      suggestedReply: parsed.suggestedReply || "",
    };
  } catch (err) {
    console.error("[email-agent] Classification failed:", err);
    return inferIntentFromKeywords(subject, body);
  }
}

function inferIntentFromKeywords(subject: string, body: string): {
  intent: ReplyIntent; confidence: number; summary: string; suggestedReply: string;
} {
  const text = `${subject} ${body}`.toLowerCase();

  if (/out of (the )?office|ooo|vacation|auto.?reply|will be (out|away)/i.test(text)) {
    return { intent: "out_of_office", confidence: 0.9, summary: "Auto-reply / out of office", suggestedReply: "" };
  }
  if (/unsubscribe|stop (emailing|contacting)|remove (me|us)|opt.?out/i.test(text)) {
    return { intent: "unsubscribe", confidence: 0.85, summary: "Wants to unsubscribe", suggestedReply: "" };
  }
  if (/not interested|no thank|no,? thank|pass on this|already have|not looking|don't need/i.test(text)) {
    return { intent: "not_interested", confidence: 0.75, summary: "Not interested", suggestedReply: "" };
  }
  if (/schedule|meet|visit|come by|set up a time|let's talk|sounds good|interested|love to|would like/i.test(text)) {
    return { intent: "interested", confidence: 0.7, summary: "Shows interest", suggestedReply: "" };
  }
  if (/how much|pricing|cost|what (do you|would|are)|more info|details|brochure|tell me more/i.test(text)) {
    return { intent: "needs_info", confidence: 0.7, summary: "Asking for more information", suggestedReply: "" };
  }
  if (/confirmed|booked|see you|appointment|looking forward/i.test(text)) {
    return { intent: "booked", confidence: 0.65, summary: "Meeting confirmed", suggestedReply: "" };
  }

  return { intent: "other", confidence: 0.4, summary: "Unclear intent", suggestedReply: "" };
}

// ----------------------------------------------------------------
// Knowledge base
// ----------------------------------------------------------------

const POCKETPANTRY_KNOWLEDGE = [
  "## PocketPantry / PV Pantry — FAQ",
  "",
  "Q: Is there a cost? A: No, completely free. We provide, install, stock, and maintain at zero cost.",
  "Q: How long to install? A: 7-10 business days.",
  "Q: Payment methods? A: Apple Pay, Google Pay, cards (tap/swipe), cash.",
  "Q: Customize products? A: Yes, tailored to your preferences.",
  "Q: Healthy options? A: Yes — protein bars, low-sugar drinks, sparkling water, etc.",
  "Q: Restock frequency? A: 1-2x/week, real-time inventory monitoring.",
  "Q: Machine breaks? A: 24-hour maintenance, usually same-day fix.",
  "Q: Loyalty program? A: Monyx app — points, discounts, offers.",
  "Q: Advertising? A: Digital screens for ads/internal comms.",
  "Q: Location types? A: Offices, warehouses, gyms, hotels, apartments, dealerships, hospitals, schools.",
  "",
  "## Sales Approach: Introduce > Discover status > Find contact > Find pain points > Explain improvements > Ask for site visit.",
  "## Key: Zero cost, modern cashless machines, custom products, real-time monitoring, 24hr maintenance, Monyx rewards.",
].join("\n");

// ----------------------------------------------------------------
// Auto-reply generator
// ----------------------------------------------------------------

async function generateAutoReply(params: {
  intent: ReplyIntent;
  leadName: string;
  businessName: string;
  incomingSubject: string;
  incomingBody: string;
  confidence: number;
  bookingContext?: string;
}): Promise<{ subject: string; body: string } | null> {
  if (params.intent === "out_of_office" || params.intent === "unsubscribe") {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const senderName = process.env.OUTREACH_SENDER_NAME || "Arthur";
  const contactPhone = process.env.OUTREACH_CONTACT_PHONE || "(470) 912-3759";

  // Force correct threading: exact original subject with "Re:" prefix
  const rawSubject = params.incomingSubject.replace(/^(Re:\s*)+/i, "").trim();
  const replySubject = "Re: " + (rawSubject || "Vending machines for your location");

  const bookingInstruction = params.bookingContext
    ? [
        "",
        "IMPORTANT — SITE VISIT BOOKING CONTEXT:",
        params.bookingContext,
        "Include the booking details naturally in your reply. If the visit was booked, confirm the date/time. If slots are suggested, present 2-3 options and ask which works best.",
        "",
      ].join("\n")
    : "";

  const systemPrompt = [
    "You are " + senderName + ", a friendly salesman at PV Pantry (PocketPantry), a modern vending machine company.",
    "Your goal is to schedule a free, no-obligation site visit.",
    "",
    POCKETPANTRY_KNOWLEDGE,
    "",
    "RULES:",
    "- Warm, concise, professional. 3-6 sentences max.",
    "- Always work toward scheduling a site visit.",
    "- Answer questions from FAQ, then pivot to scheduling.",
    '- If interested: "Would Tuesday or Thursday work for a quick 15-minute walkthrough?"',
    '- If not interested: "No worries at all! If anything changes, we\'re here."',
    "- Never be pushy.",
    "- Do NOT write any sign-off, signature, or contact info — the system appends the configured email signature automatically.",
    "- Plain text only. No markdown or bullet points.",
    bookingInstruction,
    'Return JSON: {"body":"your reply text"}',
  ].join("\n");

  const userPrompt = [
    'Lead "' + params.leadName + '" from "' + params.businessName + '" replied.',
    "Intent: " + params.intent,
    "Subject: " + params.incomingSubject,
    "Reply: " + params.incomingBody.substring(0, 1500),
    "",
    "Write the body of an appropriate reply.",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[email-agent] Auto-reply generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    if (!parsed.body) return null;

    return { subject: replySubject, body: parsed.body };
  } catch (err) {
    console.error("[email-agent] Auto-reply generation error:", err);
    return null;
  }
}

// ----------------------------------------------------------------
// Extract requested meeting time from email body using GPT
// ----------------------------------------------------------------

async function extractRequestedTime(body: string, subject: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Extract the requested meeting date and time from the email. Return a short natural-language string that includes both date and time, like "Friday 11am", "next Tuesday at 2pm", "tomorrow morning", "April 25 at 3pm".

If the email mentions a specific day and time, return it. If only a day is mentioned without time, add "10am" as default.
If no meeting time can be determined, return null.

Return JSON: {"requestedTime": "..." or null}`,
          },
          {
            role: "user",
            content: `Subject: ${subject}\n\nBody:\n${body.substring(0, 1500)}`,
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return parsed.requestedTime || null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------
// Stage mapping
// ----------------------------------------------------------------

// Maps intent → DB stage (must match leads_stage_check constraint)
// Allowed: New Lead, Contacted, Interested, Not Interested, Callback, Site Visit Requested, Proposal Requested
// NOTE: "needs_info" stays at current stage (no change) — "Callback" is a calling concept, not email
function intentToStage(intent: ReplyIntent): string | null {
  switch (intent) {
    case "interested": return "Interested";
    case "not_interested": return "Not Interested";
    case "needs_info": return null;
    case "booked": return "Site Visit Requested";
    case "unsubscribe": return "Not Interested";
    case "out_of_office": return null;
    case "other": return null;
  }
}

// ----------------------------------------------------------------
// Supabase helpers
// ----------------------------------------------------------------

// Build two maps from outreach_log:
//   sentByLead:  leadId → Set<messageId>   (what we sent TO each lead)
//   processedIds: Set<messageId>           (everything we've already seen)
async function loadOutreachData(supabase: ReturnType<typeof createServerClient>): Promise<{
  sentByLead: Map<string, Set<string>>;
  processedIds: Set<string>;
}> {
  const sentByLead = new Map<string, Set<string>>();
  const processedIds = new Set<string>();

  try {
    const { data } = await supabase
      .from("outreach_log")
      .select("lead_id, action_type, action_data")
      .order("performed_at", { ascending: false })
      .limit(10000);
    if (data) {
      for (const row of data) {
        const d = row.action_data as Record<string, unknown> | null;
        const msgId = d?.messageId as string | undefined;
        if (!msgId) continue;

        // Every messageId we've ever touched goes into processedIds
        processedIds.add(msgId);

        // Sent emails and auto-replies go into per-lead sent map
        // subtype "reply_received" means incoming — everything else is outgoing
        const subtype = d?.subtype as string | undefined;
        if (row.action_type === "email" && subtype !== "reply_received") {
          const leadId = row.lead_id as string;
          if (!sentByLead.has(leadId)) sentByLead.set(leadId, new Set());
          sentByLead.get(leadId)!.add(msgId);
        }
      }
    }
  } catch {
    // table might not exist yet
  }
  return { sentByLead, processedIds };
}

// ----------------------------------------------------------------
// Core: check inbox for new replies
// ----------------------------------------------------------------

// Auto-reply caps are loaded from Supabase (email-agent-settings) on each
// scan so they can be changed from the UI without a redeploy. Env vars and
// hard-coded defaults serve as fallbacks.

export async function checkInboxForReplies(): Promise<InboxCheckResult> {
  const result: InboxCheckResult = {
    processed: 0, matched: 0, classified: [], errors: [],
    autoRepliesSent: 0, skippedDuplicate: 0,
  };

  if (_scanRunning) {
    result.errors.push("Scan already in progress — skipped");
    return result;
  }
  _scanRunning = true;

  try {
    return await _doInboxScan(result);
  } finally {
    _scanRunning = false;
  }
}

async function _doInboxScan(result: InboxCheckResult): Promise<InboxCheckResult> {
  const supabase = createServerClient();

  // 0. Load current auto-reply settings (UI-editable, persisted in Supabase)
  const settings = await getEmailAgentSettings();
  const MAX_AUTO_REPLIES_PER_DAY = settings.dailyCap;
  const MAX_AUTO_REPLIES_PER_LEAD = settings.perLeadCap;
  const autoReplyEnabled = settings.enabled;

  // 1. Load leads
  const { data: leads } = await supabase
    .from("leads")
    .select("id, email, contact, business, stage, owner")
    .neq("email", "");

  if (!leads || leads.length === 0) return result;

  const leadsByEmail = new Map<string, Array<typeof leads[0]>>();
  for (const lead of leads) {
    const em = (lead.email as string || "").toLowerCase().trim();
    if (em) {
      if (!leadsByEmail.has(em)) leadsByEmail.set(em, []);
      leadsByEmail.get(em)!.push(lead);
    }
  }

  // 2. Load outreach data — per-lead sent messageIds + global dedup set
  const { sentByLead, processedIds } = await loadOutreachData(supabase);
  console.log("[email-agent] processedIds:", processedIds.size, "| leads with sent emails:", sentByLead.size);

  // 3. Count today's auto-replies (subtype=auto_reply in action_data)
  let todayAutoReplies = 0;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("outreach_log").select("id")
      .eq("action_type", "email").contains("action_data", { subtype: "auto_reply" })
      .gte("performed_at", todayStart.toISOString());
    todayAutoReplies = data?.length ?? 0;
  } catch { todayAutoReplies = 999; }

  const ourEmail = (process.env.EMAIL_USER || "").toLowerCase();
  const ourDomain = ourEmail.split("@")[1] || "";
  const client = new ImapFlow(getImapConfig());
  // autoRepliedThisScan removed — each new reply gets its own auto-reply

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date();
      since.setDate(since.getDate() - 1);

      for await (const msg of client.fetch({ since }, {
        envelope: true, source: true, uid: true,
      })) {
        result.processed++;
        const envelope = msg.envelope;
        if (!envelope) continue;

        const fromAddr = envelope.from?.[0]?.address?.toLowerCase() || "";
        const messageId = envelope.messageId || "";
        const subject = envelope.subject || "";

        // --- SKIP: our own, system, bounce, no messageId ---
        if (!messageId) continue;
        if (fromAddr === ourEmail) continue;
        if (ourDomain && fromAddr.endsWith("@" + ourDomain)) continue;
        if (isBlockedSender(fromAddr)) continue;
        if (isBounceLike(subject)) continue;

        // --- SKIP: already processed (dedup) ---
        if (processedIds.has(messageId)) {
          result.skippedDuplicate++;
          continue;
        }

        // --- Parse headers + body ---
        let rawHeaders = "";
        let bodyText = "";
        if (msg.source) {
          const raw = msg.source.toString("utf-8");
          const hEnd = raw.indexOf("\r\n\r\n");
          if (hEnd > -1) {
            rawHeaders = raw.substring(0, hEnd).toLowerCase();
            bodyText = raw.substring(hEnd + 4, hEnd + 4 + 3000)
              .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          }
        }

        // --- SKIP: auto-responses ---
        if (rawHeaders.includes("auto-submitted:") && !rawHeaders.includes("auto-submitted: no")) continue;
        if (rawHeaders.includes("x-auto-response-suppress:")) continue;
        if (rawHeaders.includes("x-autoreply:")) continue;
        if (rawHeaders.includes("precedence: bulk") || rawHeaders.includes("precedence: junk")) continue;

        // --- Match to lead(s) by FROM address ---
        const candidateLeads = leadsByEmail.get(fromAddr);
        if (!candidateLeads || candidateLeads.length === 0) continue;

        // --- Parse In-Reply-To + References headers ---
        const inReplyTo = envelope.inReplyTo || "";
        const refsMatch = rawHeaders.match(/^references:\s*([\s\S]*?)(?=\r?\n\S|\r?\n\r?\n|$)/im);
        const refsRaw = refsMatch?.[1]?.replace(/\s+/g, " ").trim() || "";
        const allRefs = (inReplyTo + " " + refsRaw).trim();
        const refTokens = allRefs ? (allRefs.match(/<[^>]+>/g) || []) : [];

        // --- CRITICAL: find which specific lead this reply belongs to ---
        // Iterate all leads sharing this email, check whose sent messageIds match
        let lead: typeof leads[0] | null = null;
        let matchedThreadId = "";

        for (const candidate of candidateLeads) {
          const leadSentIds = sentByLead.get(candidate.id);
          if (!leadSentIds || leadSentIds.size === 0) continue;

          for (const tok of refTokens) {
            if (leadSentIds.has(tok)) {
              lead = candidate;
              matchedThreadId = tok;
              break;
            }
          }
          if (lead) break;
        }

        if (!lead || !matchedThreadId) {
          console.log("[email-agent] Skip:", fromAddr, "— reply doesn't reference any outreach for", candidateLeads.length, "lead(s)");
          continue;
        }

        // ===== This is a genuine reply to our outreach on a specific thread =====
        result.matched++;
        // Add to processedIds immediately so we don't process again in this scan
        processedIds.add(messageId);

        const fromName = envelope.from?.[0]?.name || fromAddr;
        const date = envelope.date?.toISOString() || new Date().toISOString();
        const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

        // Classify
        const classification = await classifyReply(subject, bodyText);

        // Log to DB immediately (dedup for next scan)
        await supabase.from("outreach_log").insert({
          lead_id: lead.id,
          action_type: "email",
          action_data: {
            subtype: "reply_received",
            from: fromAddr, subject, messageId,
            intent: classification.intent,
            confidence: classification.confidence,
            summary: classification.summary,
            body: bodyText.substring(0, 500),
            inReplyTo: inReplyTo || null,
            threadId: matchedThreadId,
          },
        });

        await supabase.from("email_logs").insert({
          lead_id: lead.id, email_date: dateStr, status: "Replied", subject,
        });

        // Update lead stage + activity
        // LOCKED: once "Site Visit Requested", don't change stage unless cancel/rebook
        const currentStage = (lead.stage as string) || "";
        const isLocked = currentStage === "Site Visit Requested";
        const combinedText = bodyText + " " + subject;
        const isCancelOrRebook = /\b(cancel|reschedul|rebook|postpone|push back|move (it|the|our)|change.*(date|time|appointment|day)|can we (do|make|have|switch|move)|instead.*(on|at)|different (day|time|date))\b/i.test(combinedText);

        let newStage: string | null = null;
        if (!isLocked) {
          newStage = intentToStage(classification.intent);
        } else if (isCancelOrRebook) {
          // Unlock — lead wants to cancel or reschedule
          newStage = "Interested";
          console.log("[email-agent] Stage unlocked (cancel/rebook) for", lead.id);
        }

        const activityText = classification.summary
          ? classification.summary + " (" + classification.intent + ") — " + dateStr
          : "Email reply (" + classification.intent + ") — " + dateStr;

        await supabase.from("leads").update({
          ...(newStage ? { stage: newStage } : {}),
          last_activity: activityText,
          updated_at: new Date().toISOString(),
        }).eq("id", lead.id);

        // Reply triggers (US3.3): an actionable inbound reply makes the lead
        // HOT — set call-ready + queue a "call within 1 hour" task. Then, if
        // the reply warmed it into a closer stage, hand it to a closer (US5.1).
        const positiveIntent =
          classification.intent === "interested" ||
          classification.intent === "needs_info" ||
          classification.intent === "booked";
        if (positiveIntent) {
          try {
            const { fireHotLeadTrigger } = await import("./lead-tasks");
            await fireHotLeadTrigger(lead.id, `Email reply (${classification.intent}) — call within 1 hour`);
          } catch { /* best-effort */ }
        }
        if (newStage) {
          try {
            const { assignCloserForStage } = await import("./lead-routing");
            await assignCloserForStage(lead.id, newStage, (lead.owner as string) || undefined);
          } catch { /* best-effort */ }
        }

        const classified: ClassifiedReply = {
          ...classification, fromEmail: fromAddr, fromName, subject,
          body: bodyText.substring(0, 500), date, messageId,
          inReplyTo: inReplyTo || null, autoReplySent: false,
        };

        // ===== AUTO-REPLY (safety gates) =====
        // Gate 0: master switch (UI-controllable)
        if (!autoReplyEnabled) {
          classified.skipReason = "auto-reply globally disabled in settings";
          console.log("[email-agent] Skip reply for", lead.id, "— auto-reply disabled");
          result.classified.push(classified);
          continue;
        }

        // Gate 1: only reply to actionable intents
        const wantsAutoReply =
          classification.intent === "interested" ||
          classification.intent === "needs_info" ||
          classification.intent === "booked";

        if (!wantsAutoReply) {
          classified.skipReason = `intent=${classification.intent} (auto-reply only on interested/needs_info/booked)`;
          console.log("[email-agent] Skip reply for", lead.id, "—", classified.skipReason);
          result.classified.push(classified);
          continue;
        }

        // Gate 2: global daily cap (prevent runaway sending)
        if (todayAutoReplies + result.autoRepliesSent >= MAX_AUTO_REPLIES_PER_DAY) {
          classified.skipReason = `daily cap reached (${MAX_AUTO_REPLIES_PER_DAY}/day) — raise EMAIL_AUTO_REPLY_DAILY_CAP`;
          console.log("[email-agent] Skip reply for", lead.id, "—", classified.skipReason);
          result.classified.push(classified);
          continue;
        }

        // Gate 3: lifetime cap per lead (don't endlessly auto-reply to same lead)
        let lifetimeCount = 0;
        try {
          const { data: lc } = await supabase.from("outreach_log").select("id")
            .eq("lead_id", lead.id).eq("action_type", "email")
            .contains("action_data", { subtype: "auto_reply" });
          lifetimeCount = lc?.length ?? 0;
        } catch { lifetimeCount = 999; }
        if (lifetimeCount >= MAX_AUTO_REPLIES_PER_LEAD) {
          classified.skipReason = `per-lead cap reached (${lifetimeCount}/${MAX_AUTO_REPLIES_PER_LEAD}) — raise EMAIL_AUTO_REPLY_PER_LEAD_CAP or reset auto_reply log for this lead`;
          console.log("[email-agent] Skip reply for", lead.id, "—", classified.skipReason);
          result.classified.push(classified);
          continue;
        }

        // NOTE: No per-scan or 24h cooldown — each NEW reply gets its own auto-reply.
        // Dedup (processedIds) already prevents re-processing the same incoming message.

        // Generate + send auto-reply ON THE SAME THREAD
        try {
          // If intent is "booked" — check Google Calendar and try to book/suggest slots
          let bookingContext = "";
          if (classification.intent === "booked") {
            try {
              // Extract requested date/time from the email using GPT
              const extractedTime = await extractRequestedTime(bodyText, subject);
              console.log("[email-agent] Extracted meeting time:", extractedTime);

              const bookResult = await bookLeadInCalendly({
                leadId: lead.id,
                startTime: extractedTime || undefined,
              });

              if (bookResult.ok && "booking" in bookResult) {
                const bookedTime = new Date(bookResult.booking.startTime).toLocaleString("en-US", {
                  timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
                  hour: "numeric", minute: "2-digit", hour12: true,
                });
                bookingContext = "Site visit BOOKED for " + bookedTime + " (Eastern Time). A calendar invite has been sent to the prospect's email."
                  + (bookResult.autoAdjusted ? " Note: the exact requested time wasn't available, so we booked the nearest available slot." : "");
              } else if ("availableSlots" in bookResult && bookResult.availableSlots) {
                // No slot found — suggest options
                const slots = bookResult.availableSlots.slice(0, 5).map((s: { start_time: string }) =>
                  new Date(s.start_time).toLocaleString("en-US", {
                    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
                    hour: "numeric", minute: "2-digit", hour12: true,
                  })
                );
                bookingContext = "The requested time is not available. Here are the next available slots:\n" + slots.map((s: string) => "- " + s).join("\n") + "\nAsk the prospect which of these works best so we can confirm.";
              } else if ("error" in bookResult) {
                // Calendar not connected or no time specified — suggest slots instead
                const availability = await getCalendlyAvailabilityDecision(new Date().toISOString());
                const slots = availability.availableTimes.slice(0, 5).map(s =>
                  new Date(s.start_time).toLocaleString("en-US", {
                    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
                    hour: "numeric", minute: "2-digit", hour12: true,
                  })
                );
                if (slots.length > 0) {
                  bookingContext = "We couldn't auto-book yet. Suggest these available slots:\n" + slots.map(s => "- " + s).join("\n") + "\nAsk the prospect which works best.";
                }
              }
            } catch (bookErr) {
              console.error("[email-agent] Booking attempt failed:", bookErr);
              // Fall through — auto-reply will still be sent without booking context
            }
          }

          const autoReply = await generateAutoReply({
            intent: classification.intent, leadName: fromName,
            businessName: (lead.business as string) || "",
            incomingSubject: subject, incomingBody: bodyText,
            confidence: classification.confidence,
            bookingContext: bookingContext || undefined,
          });

          if (autoReply) {
            // Load the configured outreach signature (Wisestamp / structured /
            // text fallback) so auto-replies match the look of the primary +
            // follow-up emails. Falls back gracefully if templates can't load.
            let signatureHtml = "";
            let signatureText = "";
            try {
              const templates = await getOutreachTemplates();
              if (templates.signature.enabled) {
                const sigContext = {
                  contactName: fromName,
                  businessName: (lead.business as string) || "",
                };
                signatureHtml = buildSignatureHtml(templates.signature, sigContext);
                signatureText = buildSignatureText(templates.signature, sigContext);
              }
            } catch (err) {
              console.warn("[email-agent] Could not load signature for auto-reply:", err);
            }

            const bodyHtml = autoReply.body
              .split("\n\n")
              .map((p: string) => "<p>" + p.replace(/\n/g, "<br />") + "</p>")
              .join("");
            const replyHtml =
              "<div style=\"font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#334155;line-height:1.6;\">" +
              bodyHtml +
              signatureHtml +
              "</div>";
            const replyText = signatureText
              ? `${autoReply.body}\n\n${signatureText}`
              : autoReply.body;

            const refsChain = matchedThreadId === messageId
              ? messageId : matchedThreadId + " " + messageId;

            const sentResult = await sendEmailDirect({
              to: fromAddr, subject: autoReply.subject,
              html: replyHtml, text: replyText, leadId: lead.id,
              replyTo: process.env.EMAIL_USER || "arthur.b@pvpantry.com",
              inReplyTo: messageId, references: refsChain,
            });

            await supabase.from("outreach_log").insert({
              lead_id: lead.id, action_type: "email",
              action_data: {
                subtype: "auto_reply",
                to: fromAddr, subject: autoReply.subject,
                intent: classification.intent,
                body: autoReply.body.substring(0, 500),
                messageId: sentResult.messageId,
                inReplyTo: messageId, threadId: matchedThreadId,
              },
            });

            classified.autoReplySent = true;
            result.autoRepliesSent++;
            console.log("[email-agent] Auto-replied to", fromAddr, "on thread", matchedThreadId);
          } else {
            // generateAutoReply returned null — OpenAI didn't produce a body
            classified.skipReason = "auto-reply body generation failed (OpenAI returned empty or no key)";
            console.warn("[email-agent] Skip reply for", lead.id, "—", classified.skipReason);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          classified.skipReason = `send error: ${msg.substring(0, 200)}`;
          console.error("[email-agent] Auto-reply failed:", err);
          // Surface to the result errors so the caller (cron/UI) can show it
          result.errors.push(`Auto-reply to ${fromAddr}: ${msg.substring(0, 200)}`);
        }

        result.classified.push(classified);
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);
    console.error("[email-agent] IMAP error:", errMsg);
  }

  return result;
}

// ----------------------------------------------------------------
// Send email via SMTP
// ----------------------------------------------------------------

export async function sendEmailDirect(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  leadId: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  inReplyTo?: string;
  references?: string;
}) {
  const transport = getSmtpTransport();
  const fromEmail = process.env.EMAIL_USER || "arthur.b@pvpantry.com";
  const senderName = process.env.OUTREACH_SENDER_NAME || "Arthur";

  const mailOptions: Record<string, unknown> = {
    from: `${senderName} <${fromEmail}>`,
    to: params.to,
    replyTo: params.replyTo || fromEmail,
    subject: params.subject,
    html: params.html,
    text: params.text,
    attachments: params.attachments?.map(a => ({ filename: a.filename, content: a.content })),
  };

  if (params.inReplyTo) {
    mailOptions.inReplyTo = params.inReplyTo;
    mailOptions.references = params.references || params.inReplyTo;
  }

  const info = await transport.sendMail(mailOptions);

  const supabase = createServerClient();
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  await supabase.from("email_logs").insert({
    lead_id: params.leadId,
    email_date: dateStr,
    status: "Sent",
    subject: params.subject,
  });

  await supabase.from("outreach_log").insert({
    lead_id: params.leadId,
    action_type: "email",
    action_data: {
      subject: params.subject,
      to: params.to,
      messageId: info.messageId,
      inReplyTo: params.inReplyTo || null,
      threadId: params.inReplyTo || info.messageId,
      method: "smtp_direct",
    },
  });

  return { messageId: info.messageId, accepted: info.accepted };
}

// ----------------------------------------------------------------
// Test connection
// ----------------------------------------------------------------

export async function testConnection(): Promise<{
  imap: boolean;
  smtp: boolean;
  imapError?: string;
  smtpError?: string;
  totalMessages?: number;
}> {
  let imap = false;
  let smtp = false;
  let imapError: string | undefined;
  let smtpError: string | undefined;
  let totalMessages: number | undefined;

  try {
    const client = new ImapFlow(getImapConfig());
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const mb = client.mailbox;
    totalMessages = mb && typeof mb === "object" && "exists" in mb ? (mb as { exists: number }).exists : 0;
    lock.release();
    await client.logout();
    imap = true;
  } catch (err) {
    imapError = err instanceof Error ? err.message : String(err);
  }

  try {
    const transport = getSmtpTransport();
    await transport.verify();
    smtp = true;
  } catch (err) {
    smtpError = err instanceof Error ? err.message : String(err);
  }

  return { imap, smtp, imapError, smtpError, totalMessages };
}
