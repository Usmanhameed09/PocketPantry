import { extractDomainFromWebsite } from "./hunter";

const APOLLO_API_BASE = "https://api.apollo.io/api/v1";

type ApolloPerson = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  headline?: string;
  email?: string;
  personal_emails?: string[];
  phone?: string;
  mobile_phone?: string;
  direct_phone?: string;
  sanitized_phone?: string;
  organization?: {
    name?: string;
    primary_domain?: string;
  };
};

type ApolloSearchResponse = {
  people?: ApolloPerson[];
  contacts?: ApolloPerson[];
};

type ApolloMatchResponse = {
  person?: ApolloPerson | null;
  contact?: ApolloPerson | null;
  matches?: ApolloPerson[];
  people?: ApolloPerson[];
  contacts?: ApolloPerson[];
};

export type ApolloLeadEnrichment = {
  provider: "apollo";
  email?: string;
  phone?: string;
  contactName?: string;
  contactTitle?: string;
  domain?: string;
  warnings?: string[];
};

function getApolloApiKey() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error("APOLLO_API_KEY is not configured.");
  }

  return apiKey;
}

async function apolloFetch<T>(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${APOLLO_API_BASE}${pathname}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": getApolloApiKey(),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Apollo API failed (${response.status}): ${message}`);
  }

  return response.json() as Promise<T>;
}

function buildPersonName(person?: ApolloPerson | null) {
  if (!person) return undefined;
  const full = `${person.name || ""}`.trim();
  if (full) return full;
  const first = `${person.first_name || ""}`.trim();
  const last = `${person.last_name || ""}`.trim();
  return [first, last].filter(Boolean).join(" ").trim() || undefined;
}

function pickBestApolloPhone(person?: ApolloPerson | null) {
  if (!person) return undefined;
  return (
    person.mobile_phone ||
    person.direct_phone ||
    person.sanitized_phone ||
    person.phone ||
    undefined
  );
}

function pickBestApolloEmail(person?: ApolloPerson | null) {
  if (!person) return undefined;
  return (
    person.email ||
    person.personal_emails?.find(Boolean) ||
    undefined
  );
}

function scoreApolloPerson(person: ApolloPerson) {
  let score = 0;
  const text = `${person.title || ""} ${person.headline || ""}`.toLowerCase();
  const keywords = [
    "manager",
    "operations",
    "office",
    "owner",
    "facilities",
    "facility",
    "director",
    "administrator",
    "property",
    "hr",
    "admin",
  ];

  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += 20;
    }
  }

  if (pickBestApolloPhone(person)) score += 10;
  if (pickBestApolloEmail(person)) score += 10;
  if (buildPersonName(person)) score += 5;

  return score;
}

function extractSearchPeople(payload: ApolloSearchResponse) {
  const people = [
    ...(Array.isArray(payload.people) ? payload.people : []),
    ...(Array.isArray(payload.contacts) ? payload.contacts : []),
  ];

  return people;
}

function extractMatchedPerson(payload: ApolloMatchResponse) {
  return (
    payload.person ||
    payload.contact ||
    payload.matches?.[0] ||
    payload.people?.[0] ||
    payload.contacts?.[0] ||
    null
  );
}

export async function findApolloContact(params: { website?: string; company?: string }) {
  const domain = extractDomainFromWebsite(params.website);
  if (!domain && !params.company?.trim()) {
    return null;
  }

  const warnings: string[] = [];
  const searchParams = new URLSearchParams();
  searchParams.set("page", "1");
  searchParams.set("per_page", "5");

  const titles = [
    "manager",
    "operations manager",
    "office manager",
    "facilities manager",
    "property manager",
    "owner",
    "director of operations",
    "administrator",
  ];

  for (const title of titles) {
    searchParams.append("person_titles[]", title);
  }

  if (domain) {
    searchParams.append("q_organization_domains_list[]", domain);
  }

  let searchPayload: ApolloSearchResponse;

  try {
    searchPayload = await apolloFetch<ApolloSearchResponse>(`/mixed_people/search?${searchParams.toString()}`, {
      method: "GET",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apollo search failed.";
    if (message.includes("API_INACCESSIBLE") || message.includes("free plan")) {
      warnings.push("Apollo people search is blocked on the current Apollo plan.");
      return {
        provider: "apollo",
        domain,
        warnings,
      } satisfies ApolloLeadEnrichment;
    }
    throw error;
  }

  const people = extractSearchPeople(searchPayload).sort((a, b) => scoreApolloPerson(b) - scoreApolloPerson(a));
  const best = people[0];

  if (!best) {
    return {
      provider: "apollo",
      domain,
      warnings: warnings.length ? warnings : ["Apollo did not return a matching contact."],
    } satisfies ApolloLeadEnrichment;
  }

  let enrichedPerson = best;

  if (best.id) {
    try {
      const matchPayload = await apolloFetch<ApolloMatchResponse>("/people/match", {
        method: "POST",
        body: JSON.stringify({
          id: best.id,
          reveal_personal_emails: true,
          reveal_phone_number: true,
        }),
      });

      enrichedPerson = extractMatchedPerson(matchPayload) || best;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apollo enrichment failed.";
      warnings.push(message);
    }
  }

  return {
    provider: "apollo",
    email: pickBestApolloEmail(enrichedPerson),
    phone: pickBestApolloPhone(enrichedPerson),
    contactName: buildPersonName(enrichedPerson),
    contactTitle: enrichedPerson.title || undefined,
    domain: enrichedPerson.organization?.primary_domain || domain,
    warnings,
  } satisfies ApolloLeadEnrichment;
}
