import { promises as fs } from "fs";
import path from "path";
import { Resend } from "resend";
import {
  getTemplateStage,
} from "@/lib/outreach-template-store";
import { getOutreachTemplates } from "@/lib/outreach-template-store";
import type {
  OutreachSignatureSettings,
  OutreachTemplateMap,
  OutreachTemplateStage,
} from "@/lib/outreach-template-model";

export type OutreachEmailContext = {
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
const SIGNATURE_TOKEN = "{{signatureBlock}}";

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

function applyTemplateVariables(template: string, context: OutreachEmailContext, signature?: OutreachSignatureSettings) {
  const replacements: Record<string, string> = {
    "{{contactFirstName}}": getSafeFirstName(context.contactName),
    "{{contactName}}": context.contactName?.trim() || "there",
    "{{businessName}}": context.businessName?.trim() || "your business",
    "{{senderName}}": getSenderName(),
    "{{contactPhone}}": getContactPhone(),
    "{{replyToEmail}}": getReplyToEmail(),
    "{{signatureName}}": signature?.fullName || getSenderName(),
    "{{signatureTitle}}": signature?.title || "",
    "{{signatureCompany}}": signature?.company || "PocketPantry",
    "{{signaturePhone}}": signature?.phone || getContactPhone(),
    "{{signatureEmail}}": signature?.email || getReplyToEmail(),
    "{{signaturePhotoUrl}}": signature?.photoUrl || "",
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }
  return output;
}

function textToParagraphHtml(text: string) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function buildSignatureText(signature: OutreachSignatureSettings, context: OutreachEmailContext) {
  if (signature.mode === "custom_html" && signature.textFallback.trim()) {
    return applyTemplateVariables(signature.textFallback, context, signature);
  }

  const resolved = {
    fullName: applyTemplateVariables(signature.fullName, context),
    title: applyTemplateVariables(signature.title, context),
    company: applyTemplateVariables(signature.company, context),
    phone: applyTemplateVariables(signature.phone, context),
    email: applyTemplateVariables(signature.email, context),
  };

  return [resolved.fullName, resolved.title, resolved.company, resolved.phone, resolved.email]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export function buildSignatureHtml(signature: OutreachSignatureSettings, context: OutreachEmailContext) {
  if (signature.mode === "custom_html" && signature.customHtml.trim()) {
    return applyTemplateVariables(signature.customHtml, context, signature);
  }

  const resolved = {
    fullName: applyTemplateVariables(signature.fullName, context),
    title: applyTemplateVariables(signature.title, context),
    company: applyTemplateVariables(signature.company, context),
    phone: applyTemplateVariables(signature.phone, context),
    email: applyTemplateVariables(signature.email, context),
    photoUrl: applyTemplateVariables(signature.photoUrl, context),
  };

  return `
    <div style="margin-top:24px;padding-top:18px;border-top:1px solid #dbe4ee;display:flex;gap:16px;align-items:flex-start;">
      ${resolved.photoUrl
        ? `<img src="${escapeHtml(resolved.photoUrl)}" alt="${escapeHtml(resolved.fullName)}" style="width:64px;height:64px;border-radius:999px;object-fit:cover;border:1px solid #dbe4ee;" />`
        : ""
      }
      <div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(resolved.fullName)}</div>
        ${resolved.title ? `<div style="font-size:13px;color:#475569;margin-top:2px;">${escapeHtml(resolved.title)}</div>` : ""}
        ${resolved.company ? `<div style="font-size:13px;color:#0f766e;margin-top:2px;">${escapeHtml(resolved.company)}</div>` : ""}
        ${resolved.phone ? `<div style="font-size:13px;color:#475569;margin-top:8px;">${escapeHtml(resolved.phone)}</div>` : ""}
        ${resolved.email ? `<div style="font-size:13px;color:#475569;margin-top:2px;">${escapeHtml(resolved.email)}</div>` : ""}
      </div>
    </div>
  `;
}

function renderTemplateBody(body: string, templates: OutreachTemplateMap, context: OutreachEmailContext) {
  const signature = templates.signature;
  const resolvedBody = applyTemplateVariables(body, context, signature);
  const signatureText = signature.enabled ? buildSignatureText(signature, context) : "";
  const signatureHtml = signature.enabled ? buildSignatureHtml(signature, context) : "";

  const textBody = resolvedBody.includes(SIGNATURE_TOKEN)
    ? resolvedBody.replace(SIGNATURE_TOKEN, signatureText)
    : signatureText
      ? `${resolvedBody}\n\n${signatureText}`
      : resolvedBody;

  const htmlBody = resolvedBody.includes(SIGNATURE_TOKEN)
    ? resolvedBody.split(SIGNATURE_TOKEN).map((part) => textToParagraphHtml(part)).join(signatureHtml)
    : `${textToParagraphHtml(resolvedBody)}${signatureHtml}`;

  return {
    text: textBody.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #334155; line-height: 1.6;">
        ${htmlBody}
      </div>
    `,
  };
}

export async function buildOutreachEmailTemplate(stage: OutreachTemplateStage, context: OutreachEmailContext): Promise<OutreachEmailTemplate> {
  const templates = await getOutreachTemplates();
  const template = getTemplateStage(templates, stage);

  if (!template) {
    throw new Error(`Template "${stage}" not found.`);
  }

  const rendered = renderTemplateBody(template.body, templates, context);

  return {
    subject: applyTemplateVariables(template.subject, context, templates.signature),
    text: rendered.text,
    html: rendered.html,
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

  const template = await buildOutreachEmailTemplate(params.stage, {
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
  return buildOutreachEmailTemplate("primary", context);
}

export function getFollowUp1Email(context: OutreachEmailContext) {
  return buildOutreachEmailTemplate("follow_up_1", context);
}

export function getFollowUp2Email(context: OutreachEmailContext) {
  return buildOutreachEmailTemplate("follow_up_2", context);
}
