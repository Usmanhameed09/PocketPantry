import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { sendEmailDirect } from "@/lib/email-agent";
import { getOutreachTemplates } from "@/lib/outreach-template-store";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSafeFirstName(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

function getSenderName() {
  return process.env.OUTREACH_SENDER_NAME || "Arthur";
}

function getContactPhone() {
  return process.env.OUTREACH_CONTACT_PHONE || "(470) 912-3759";
}

function getReplyToEmail() {
  return process.env.EMAIL_USER || process.env.OUTREACH_REPLY_TO_EMAIL || "info@pvpantry.com";
}

function applyVariables(template: string, context: { contactName: string; businessName: string }) {
  return template
    .replace(/\{\{contactFirstName\}\}/g, getSafeFirstName(context.contactName))
    .replace(/\{\{contactName\}\}/g, context.contactName?.trim() || "there")
    .replace(/\{\{businessName\}\}/g, context.businessName?.trim() || "your business")
    .replace(/\{\{senderName\}\}/g, getSenderName())
    .replace(/\{\{contactPhone\}\}/g, getContactPhone())
    .replace(/\{\{replyToEmail\}\}/g, getReplyToEmail());
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#334155;line-height:1.6;">
    ${escapeHtml(text).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br />")}</p>`).join("")}
  </div>`;
}

// Read the 3 attachments for primary emails (brochure + machine photos)
const MATERIALS_DIR = path.resolve(process.cwd(), "..", "Email materials");
let _cachedAttachments: Array<{ filename: string; content: Buffer }> | null = null;

async function getPrimaryAttachments(): Promise<Array<{ filename: string; content: Buffer }>> {
  if (_cachedAttachments) return _cachedAttachments;

  const files = [
    "Pocketpantry Brochure.pdf",
    "Machine#1.png",
    "Machine#2.png",
  ];

  const attachments: Array<{ filename: string; content: Buffer }> = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(MATERIALS_DIR, file));
      attachments.push({ filename: file, content });
    } catch {
      console.warn("[send-batch] Could not read attachment:", file);
    }
  }

  _cachedAttachments = attachments;
  return attachments;
}

interface SendBatchPayload {
  leads: {
    id: string;
    email: string;
    contact: string;
    business: string;
  }[];
  templateStage?: "primary" | "follow_up_1" | "follow_up_2";
}

export async function POST(request: NextRequest) {
  try {
    const payload: SendBatchPayload = await request.json();
    const { leads, templateStage = "primary" } = payload;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: false, error: "No leads provided" }, { status: 400 });
    }

    const templates = await getOutreachTemplates();
    const template = templates[templateStage];
    if (!template) {
      return NextResponse.json({ success: false, error: `Template "${templateStage}" not found` }, { status: 400 });
    }

    // Load attachments for primary emails
    const attachments = templateStage === "primary" ? await getPrimaryAttachments() : [];

    const results: { leadId: string; email: string; success: boolean; error?: string }[] = [];

    for (const lead of leads) {
      if (!lead.email) {
        results.push({ leadId: lead.id, email: "", success: false, error: "No email address" });
        continue;
      }

      try {
        const context = { contactName: lead.contact, businessName: lead.business };
        const subject = applyVariables(template.subject, context);
        const text = applyVariables(template.body, context);
        const html = textToHtml(text);

        await sendEmailDirect({
          to: lead.email,
          subject,
          html,
          text,
          leadId: lead.id,
          replyTo: getReplyToEmail(),
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        // Update lead stage to "Contacted" and set activity summary
        const supabase = createServerClient();
        const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        await supabase.from("leads").update({
          stage: "Contacted",
          last_activity: `Outreach email sent (${templateStage.replace(/_/g, " ")}) — ${dateStr}`,
          updated_at: new Date().toISOString(),
        }).eq("id", lead.id);

        results.push({ leadId: lead.id, email: lead.email, success: true });
      } catch (err) {
        results.push({
          leadId: lead.id,
          email: lead.email,
          success: false,
          error: err instanceof Error ? err.message : "Send failed",
        });
      }
    }

    const sent = results.filter(r => r.success).length;
    return NextResponse.json({
      success: true,
      sent,
      failed: results.length - sent,
      total: results.length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
