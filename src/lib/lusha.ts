import { extractDomainFromWebsite } from "./hunter";

const LUSHA_API_BASE = "https://api.lusha.com";

export type LushaLeadEnrichment = {
  provider: "lusha";
  email?: string;
  phone?: string;
  contactName?: string;
  contactTitle?: string;
  domain?: string;
  warnings?: string[];
};

function getLushaApiKey() {
  return process.env.LUSHA_API_KEY || "";
}

export function hasLushaConfigured() {
  return Boolean(getLushaApiKey());
}

export async function findLushaContact(params: { website?: string; company?: string }) {
  const apiKey = getLushaApiKey();
  const domain = extractDomainFromWebsite(params.website);

  if (!apiKey) {
    return {
      provider: "lusha",
      domain,
      warnings: ["Lusha is not configured yet."],
    } satisfies LushaLeadEnrichment;
  }

  try {
    const response = await fetch(`${LUSHA_API_BASE}/prospecting/contact/search`, {
      method: "POST",
      headers: {
        api_key: apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        company: params.company || undefined,
        domain: domain || undefined,
        jobTitles: [
          "manager",
          "operations manager",
          "office manager",
          "facilities manager",
          "property manager",
          "owner",
        ],
        limit: 5,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        provider: "lusha",
        domain,
        warnings: [`Lusha API failed (${response.status}): ${message}`],
      } satisfies LushaLeadEnrichment;
    }

    const payload = await response.json() as Record<string, unknown>;
    const contacts = Array.isArray(payload.contacts) ? payload.contacts as Array<Record<string, unknown>> : [];
    const best = contacts[0];

    if (!best) {
      return {
        provider: "lusha",
        domain,
        warnings: ["Lusha did not return a matching contact."],
      } satisfies LushaLeadEnrichment;
    }

    const firstName = `${best.firstName || best.first_name || ""}`.trim();
    const lastName = `${best.lastName || best.last_name || ""}`.trim();
    const contactName = [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;

    return {
      provider: "lusha",
      email: `${best.email || ""}`.trim() || undefined,
      phone: `${best.phone || best.mobilePhone || best.mobile_phone || ""}`.trim() || undefined,
      contactName,
      contactTitle: `${best.jobTitle || best.job_title || ""}`.trim() || undefined,
      domain,
    } satisfies LushaLeadEnrichment;
  } catch (error) {
    return {
      provider: "lusha",
      domain,
      warnings: [error instanceof Error ? error.message : "Lusha enrichment failed."],
    } satisfies LushaLeadEnrichment;
  }
}
