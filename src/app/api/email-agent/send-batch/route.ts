import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { sendEmailDirect } from "@/lib/email-agent";
import { buildOutreachEmailTemplate } from "@/lib/outreach-email";
import { getOutreachTemplates, getTemplateStage } from "@/lib/outreach-template-store";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getReplyToEmail() {
  return process.env.EMAIL_USER || process.env.OUTREACH_REPLY_TO_EMAIL || "info@pvpantry.com";
}

const MATERIALS_DIR = path.resolve(process.cwd(), "..", "Email materials");
let cachedAttachments: Array<{ filename: string; content: Buffer }> | null = null;

async function getPrimaryAttachments(): Promise<Array<{ filename: string; content: Buffer }>> {
  if (cachedAttachments) return cachedAttachments;

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

  cachedAttachments = attachments;
  return attachments;
}

interface SendBatchPayload {
  leads: {
    id: string;
    email: string;
    contact: string;
    business: string;
  }[];
  templateStage?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: SendBatchPayload = await request.json();
    const { leads, templateStage = "primary" } = payload;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: false, error: "No leads provided" }, { status: 400 });
    }

    const templates = await getOutreachTemplates();
    const template = getTemplateStage(templates, templateStage);
    if (!template) {
      return NextResponse.json({ success: false, error: `Template "${templateStage}" not found` }, { status: 400 });
    }

    const attachments = templateStage === "primary" ? await getPrimaryAttachments() : [];
    const results: { leadId: string; email: string; success: boolean; error?: string }[] = [];

    for (const lead of leads) {
      if (!lead.email) {
        results.push({ leadId: lead.id, email: "", success: false, error: "No email address" });
        continue;
      }

      try {
        const rendered = await buildOutreachEmailTemplate(templateStage, {
          contactName: lead.contact,
          businessName: lead.business,
        });

        await sendEmailDirect({
          to: lead.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          leadId: lead.id,
          replyTo: getReplyToEmail(),
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        const supabase = createServerClient();
        const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        await supabase.from("leads").update({
          stage: "Contacted",
          last_activity: `Outreach email sent (${template.label.toLowerCase()}) - ${dateStr}`,
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

    const sent = results.filter((result) => result.success).length;
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
