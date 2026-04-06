import { promises as fs } from "fs";
import path from "path";
import { Resend } from "resend";
import { getOutreachTemplates, type OutreachTemplateStage } from "@/lib/outreach-template-store";

type OutreachEmailContext = {
  contactName: string;
  businessName: string;
};

type OutreachEmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

type OutreachAttachment = {
  filename: string;
  content: Buffer;
};

const MATERIALS_DIR = path.resolve(process.cwd(), "..", "Email materials");

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function getSenderName() {
  return process.env.OUTREACH_SENDER_NAME || "Arthur";
}

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "PocketPantry <onboarding@resend.dev>";
}

function getReplyToEmail() {
  return process.env.OUTREACH_REPLY_TO_EMAIL || "info@pvpantry.com";
}

function getContactPhone() {
  return process.env.OUTREACH_CONTACT_PHONE || "(470) 912-3759";
}

function getSafeFirstName(value?: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "there";
  }

  return trimmed.split(/\s+/)[0] || "there";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtmlFromText(text: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #334155; line-height: 1.6;">
      ${escapeHtml(text)
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
        .join("")}
    </div>
  `;
}

function applyTemplateVariables(template: string, context: OutreachEmailContext) {
  const replacements: Record<string, string> = {
    "{{contactFirstName}}": getSafeFirstName(context.contactName),
    "{{contactName}}": context.contactName?.trim() || "there",
    "{{businessName}}": context.businessName?.trim() || "your business",
    "{{senderName}}": getSenderName(),
    "{{contactPhone}}": getContactPhone(),
    "{{replyToEmail}}": getReplyToEmail(),
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }
  return output;
}

async function buildEmailTemplate(stage: OutreachTemplateStage, context: OutreachEmailContext): Promise<OutreachEmailTemplate> {
  const templates = await getOutreachTemplates();
  const template = templates[stage];
  const text = applyTemplateVariables(template.body, context);
  return {
    subject: applyTemplateVariables(template.subject, context),
    text,
    html: buildHtmlFromText(text),
  };
}

async function readAttachment(fileName: string): Promise<OutreachAttachment> {
  const filePath = path.join(MATERIALS_DIR, fileName);
  const content = await fs.readFile(filePath);
  return {
    filename: fileName,
    content,
  };
}

async function getAttachments(stage: OutreachTemplateStage) {
  if (stage !== "primary") {
    return [];
  }

  return Promise.all([
    readAttachment("Pocketpantry Brochure.pdf"),
    readAttachment("Machine#1.png"),
    readAttachment("Machine#2.png"),
  ]);
}

export async function sendOutreachEmail(params: {
  to: string;
  stage: OutreachTemplateStage;
  contactName: string;
  businessName: string;
}) {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const template = await buildEmailTemplate(params.stage, {
    contactName: params.contactName,
    businessName: params.businessName,
  });
  const attachments = await getAttachments(params.stage);

  const response = await resend.emails.send({
    from: getFromEmail(),
    to: [params.to],
    replyTo: getReplyToEmail(),
    subject: template.subject,
    html: template.html,
    text: template.text,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
    })),
  });

  if (response.error) {
    throw new Error(response.error.message || "Failed to send outreach email.");
  }

  return {
    id: response.data?.id,
    subject: template.subject,
  };
}

export function getPrimaryEmail(context: OutreachEmailContext) {
  return buildEmailTemplate("primary", context);
}

export function getFollowUp1Email(context: OutreachEmailContext) {
  return buildEmailTemplate("follow_up_1", context);
}

export function getFollowUp2Email(context: OutreachEmailContext) {
  return buildEmailTemplate("follow_up_2", context);
}
