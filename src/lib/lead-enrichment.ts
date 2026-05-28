import { findApolloContact, type ApolloLeadEnrichment } from "./apollo";
import { findHunterContact, type HunterLeadEnrichment } from "./hunter";
import { findLushaContact, hasLushaConfigured, type LushaLeadEnrichment } from "./lusha";

export type LeadEnrichmentProvider = "apollo" | "lusha" | "hunter";

export type UnifiedLeadEnrichment = {
  provider: LeadEnrichmentProvider;
  email?: string;
  phone?: string;
  mobile?: string;          // Apollo-only — used to populate apollo_mobile for the caller
  contactName?: string;
  contactTitle?: string;
  domain?: string;
  employeeCount?: number;   // Apollo-only — feeds tier scoring
  industry?: string;
  companyName?: string;
  warnings?: string[];
};

function hasUsefulContact(enrichment: {
  email?: string;
  phone?: string;
  contactName?: string;
}) {
  return Boolean(enrichment.contactName || enrichment.email || enrichment.phone);
}

function fromHunter(enrichment: HunterLeadEnrichment): UnifiedLeadEnrichment {
  return {
    provider: "hunter",
    email: enrichment.email,
    contactName: enrichment.contactName,
    contactTitle: enrichment.contactTitle,
    domain: enrichment.domain,
  };
}

function fromApollo(enrichment: ApolloLeadEnrichment): UnifiedLeadEnrichment {
  return {
    provider: "apollo",
    email: enrichment.email,
    phone: enrichment.phone,
    mobile: enrichment.mobile,
    contactName: enrichment.contactName,
    contactTitle: enrichment.contactTitle,
    domain: enrichment.domain,
    employeeCount: enrichment.employeeCount,
    industry: enrichment.industry,
    companyName: enrichment.companyName,
    warnings: enrichment.warnings,
  };
}

function fromLusha(enrichment: LushaLeadEnrichment): UnifiedLeadEnrichment {
  return {
    provider: "lusha",
    email: enrichment.email,
    phone: enrichment.phone,
    contactName: enrichment.contactName,
    contactTitle: enrichment.contactTitle,
    domain: enrichment.domain,
    warnings: enrichment.warnings,
  };
}

export async function enrichLeadContact(params: { website?: string; company?: string }) {
  const warnings: string[] = [];

  try {
    const apollo = await findApolloContact(params);
    if (apollo) {
      const normalized = fromApollo(apollo);
      if (normalized.warnings?.length) {
        warnings.push(...normalized.warnings);
      }
      if (hasUsefulContact(normalized)) {
        return {
          ok: true,
          enrichment: normalized,
          warnings,
        };
      }
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Apollo enrichment failed.");
  }

  if (hasLushaConfigured()) {
    try {
      const lusha = await findLushaContact(params);
      if (lusha) {
        const normalized = fromLusha(lusha);
        if (normalized.warnings?.length) {
          warnings.push(...normalized.warnings);
        }
        if (hasUsefulContact(normalized)) {
          return {
            ok: true,
            enrichment: normalized,
            warnings,
          };
        }
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Lusha enrichment failed.");
    }
  }

  try {
    const hunter = await findHunterContact(params);
    if (hunter) {
      return {
        ok: true,
        enrichment: fromHunter(hunter),
        warnings,
      };
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Hunter enrichment failed.");
  }

  return {
    ok: true,
    enrichment: null,
    warnings,
  };
}
