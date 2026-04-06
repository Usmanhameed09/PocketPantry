const HUNTER_API_BASE = "https://api.hunter.io/v2";

type HunterDomainSearchEmail = {
  value?: string;
  type?: string;
  confidence?: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  seniority?: string;
};

type HunterDomainSearchResponse = {
  data?: {
    domain?: string;
    emails?: HunterDomainSearchEmail[];
  };
};

export type HunterLeadEnrichment = {
  email?: string;
  contactName?: string;
  contactTitle?: string;
  confidence?: number;
  domain?: string;
};

function getHunterApiKey() {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY is not configured.");
  }

  return apiKey;
}

export function extractDomainFromWebsite(value?: string) {
  if (!value) return undefined;

  try {
    const normalized = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
    const url = new URL(normalized);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.toLowerCase() || undefined;
  }
}

async function hunterFetch<T>(pathname: string, params: URLSearchParams) {
  params.set("api_key", getHunterApiKey());
  const response = await fetch(`${HUNTER_API_BASE}${pathname}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Hunter API failed (${response.status}): ${message}`);
  }

  return response.json() as Promise<T>;
}

function scoreHunterEmail(email: HunterDomainSearchEmail) {
  let score = Number(email.confidence || 0);
  const title = `${email.position || ""} ${email.seniority || ""}`.toLowerCase();

  const preferredKeywords = [
    "owner",
    "manager",
    "office",
    "operations",
    "operator",
    "property",
    "facilities",
    "facility",
    "director",
    "hr",
    "human resources",
    "admin",
    "administrator",
  ];

  for (const keyword of preferredKeywords) {
    if (title.includes(keyword)) {
      score += 25;
    }
  }

  if ((email.type || "").toLowerCase() === "personal") {
    score += 10;
  }

  return score;
}

function buildContactName(email: HunterDomainSearchEmail) {
  const name = [email.first_name, email.last_name].filter(Boolean).join(" ").trim();
  return name || undefined;
}

export async function findHunterContact(params: { website?: string; company?: string }) {
  const domain = extractDomainFromWebsite(params.website);
  const baseParams = new URLSearchParams();

  if (domain) {
    baseParams.set("domain", domain);
  } else if (params.company?.trim()) {
    baseParams.set("company", params.company.trim());
  } else {
    return null;
  }

  baseParams.set("limit", "10");

  const trySearch = async (type?: string) => {
    const searchParams = new URLSearchParams(baseParams);
    if (type) {
      searchParams.set("type", type);
    }

    const payload = await hunterFetch<HunterDomainSearchResponse>("/domain-search", searchParams);
    return payload;
  };

  let payload = await trySearch("personal");
  let emails = payload.data?.emails || [];

  if (emails.length === 0) {
    payload = await trySearch();
    emails = payload.data?.emails || [];
  }

  if (emails.length === 0) {
    return null;
  }

  const best = [...emails].sort((a, b) => scoreHunterEmail(b) - scoreHunterEmail(a))[0];
  if (!best?.value) {
    return null;
  }

  return {
    email: best.value,
    contactName: buildContactName(best),
    contactTitle: best.position || undefined,
    confidence: best.confidence,
    domain: payload.data?.domain || domain,
  } satisfies HunterLeadEnrichment;
}
