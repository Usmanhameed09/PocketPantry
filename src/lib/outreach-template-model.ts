export type OutreachTemplateStage = string;

export type StoredOutreachTemplate = {
  id: OutreachTemplateStage;
  label: string;
  subject: string;
  body: string;
  delayDays?: number;
};

export type OutreachSignatureSettings = {
  enabled: boolean;
  mode: "structured" | "custom_html";
  fullName: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  photoUrl: string;
  customHtml: string;
  textFallback: string;
};

export type OutreachTemplateMap = {
  stages: StoredOutreachTemplate[];
  signature: OutreachSignatureSettings;
};

type LegacyOutreachTemplateMap = Record<string, { subject?: string; body?: string }>;

const LEGACY_SIGNATURE_RE =
  /\n*Thank you,\s*\n\{\{senderName\}\}\nPocketPantry\n\{\{contactPhone\}\}\n\{\{replyToEmail\}\}\s*$/i;

export const DEFAULT_SIGNATURE: OutreachSignatureSettings = {
  enabled: true,
  mode: "structured",
  fullName: "{{senderName}}",
  title: "Outreach Specialist",
  company: "PocketPantry",
  phone: "{{contactPhone}}",
  email: "{{replyToEmail}}",
  photoUrl: "",
  customHtml: "",
  textFallback: "{{senderName}}\nPocketPantry\n{{contactPhone}}\n{{replyToEmail}}",
};

export const DEFAULT_TEMPLATES: OutreachTemplateMap = {
  stages: [
    {
      id: "primary",
      label: "Primary",
      subject: "Customizable Vending Machines for {{businessName}}",
      body: `Hi {{contactFirstName}},

My name is {{senderName}} and I am emailing you regarding {{businessName}} and its current vending machine solution. If you are looking to fill an empty space within a breakroom or a thoroughfare, our machines are restocked every week and can be filled with any products of your choice, making it a convenient and personalized solution for your employees or customers.

If you are interested I would be happy to jump on a call with you to discuss how we can make this happen.

Thank you,
{{signatureBlock}}`,
      delayDays: 0,
    },
    {
      id: "follow_up_1",
      label: "Follow-up 1",
      subject: "Following up on vending for {{businessName}}",
      body: `Hi {{contactFirstName}},

I wanted to follow up in case my last email was lost in your inbox. Are you currently looking to fill an empty space at your location with a vending machine?

If you currently have a vending services solution for {{businessName}} that you are not happy with, our machines are consistently restocked weekly and can be filled with any products that your customers or employees wish. If you are interested, I would love to jump on a call to discuss the details further.

Thank you,
{{signatureBlock}}`,
      delayDays: 5,
    },
    {
      id: "follow_up_2",
      label: "Follow-up 2",
      subject: "Checking in about vending at {{businessName}}",
      body: `Hi {{contactFirstName}},

I wanted to reach out again just in case you missed my last email. If you are currently interested in having a vending machine placed at {{businessName}} or are unhappy with your current vending services provider, I would love to jump on a call to discuss in detail how we can help if you have the time.

Thank you,
{{signatureBlock}}`,
      delayDays: 3,
    },
  ],
  signature: DEFAULT_SIGNATURE,
};

function cloneDefaultTemplates(): OutreachTemplateMap {
  return {
    stages: DEFAULT_TEMPLATES.stages.map((stage) => ({ ...stage })),
    signature: { ...DEFAULT_SIGNATURE },
  };
}

function normalizeStageId(value: unknown, index: number) {
  if (typeof value === "string" && value.trim() === "primary") {
    return "primary";
  }

  const match = typeof value === "string" ? value.trim().match(/^follow_up_(\d+)$/) : null;
  if (match) {
    return `follow_up_${Math.max(1, Number(match[1]))}`;
  }

  return `follow_up_${index}`;
}

function defaultFollowUpDelay(index: number) {
  return index === 1 ? 5 : 3;
}

function migrateBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("{{signatureBlock}}")) return trimmed;

  if (LEGACY_SIGNATURE_RE.test(trimmed)) {
    return trimmed.replace(LEGACY_SIGNATURE_RE, "\n\nThank you,\n{{signatureBlock}}");
  }

  return trimmed;
}

function sanitizeSignature(value: unknown): OutreachSignatureSettings {
  const input = (value || {}) as Partial<OutreachSignatureSettings>;

  return {
    enabled: input.enabled !== false,
    mode: input.mode === "custom_html" ? "custom_html" : "structured",
    fullName: input.fullName?.trim() || DEFAULT_SIGNATURE.fullName,
    title: input.title?.trim() || DEFAULT_SIGNATURE.title,
    company: input.company?.trim() || DEFAULT_SIGNATURE.company,
    phone: input.phone?.trim() || DEFAULT_SIGNATURE.phone,
    email: input.email?.trim() || DEFAULT_SIGNATURE.email,
    photoUrl: input.photoUrl?.trim() || "",
    customHtml: input.customHtml?.trim() || "",
    textFallback: input.textFallback?.trim() || DEFAULT_SIGNATURE.textFallback,
  };
}

function sanitizeStages(stages: unknown): StoredOutreachTemplate[] {
  const defaults = cloneDefaultTemplates().stages;
  const input = Array.isArray(stages) ? stages : [];

  const normalized = input
    .map((value, index) => {
      const item = (value || {}) as Partial<StoredOutreachTemplate>;
      const id = normalizeStageId(item.id, index);
      const followUpIndex = id === "primary" ? 0 : Number(id.replace("follow_up_", ""));
      const fallback = defaults.find((stage) => stage.id === id);
      const subject = item.subject?.trim() || fallback?.subject || `Follow-up ${followUpIndex} for {{businessName}}`;
      const body = migrateBody(item.body?.trim() || fallback?.body || `Hi {{contactFirstName}},\n\nThank you,\n{{signatureBlock}}`);
      const delayDays = id === "primary"
        ? 0
        : Math.max(1, Math.min(30, Number(item.delayDays ?? fallback?.delayDays ?? defaultFollowUpDelay(followUpIndex)) || defaultFollowUpDelay(followUpIndex)));

      return {
        id,
        label: id === "primary" ? "Primary" : item.label?.trim() || `Follow-up ${followUpIndex}`,
        subject,
        body,
        delayDays,
      };
    })
    .filter((stage, index, array) => array.findIndex((other) => other.id === stage.id) === index);

  const withPrimary = normalized.some((stage) => stage.id === "primary")
    ? normalized
    : [{ ...defaults[0] }, ...normalized];

  const sorted = withPrimary.sort((a, b) => {
    if (a.id === "primary") return -1;
    if (b.id === "primary") return 1;
    return Number(a.id.replace("follow_up_", "")) - Number(b.id.replace("follow_up_", ""));
  });

  return sorted.map((stage, index) => {
    if (stage.id === "primary") {
      return { ...stage, label: "Primary", delayDays: 0 };
    }

    const followUpIndex = index;
    return {
      ...stage,
      id: `follow_up_${followUpIndex}`,
      label: `Follow-up ${followUpIndex}`,
      delayDays: Math.max(1, stage.delayDays || defaultFollowUpDelay(followUpIndex)),
    };
  });
}

export function sanitizeTemplateMap(value: unknown): OutreachTemplateMap {
  const defaults = cloneDefaultTemplates();
  const input = (value || {}) as Partial<OutreachTemplateMap> & LegacyOutreachTemplateMap;

  if (Array.isArray((input as Partial<OutreachTemplateMap>).stages)) {
    return {
      stages: sanitizeStages((input as Partial<OutreachTemplateMap>).stages),
      signature: sanitizeSignature((input as Partial<OutreachTemplateMap>).signature),
    };
  }

  const legacy = input as LegacyOutreachTemplateMap;
  const stages: StoredOutreachTemplate[] = [
    {
      ...defaults.stages[0],
      subject: legacy.primary?.subject?.trim() || defaults.stages[0].subject,
      body: migrateBody(legacy.primary?.body?.trim() || defaults.stages[0].body),
    },
  ];

  for (let followIndex = 1; followIndex <= 8; followIndex += 1) {
    const key = `follow_up_${followIndex}`;
    const existing = legacy[key];
    const fallback = defaults.stages.find((stage) => stage.id === key);

    if (!existing && !fallback) {
      continue;
    }

    stages.push({
      id: key,
      label: `Follow-up ${followIndex}`,
      subject: existing?.subject?.trim() || fallback?.subject || `Follow-up ${followIndex} for {{businessName}}`,
      body: migrateBody(existing?.body?.trim() || fallback?.body || `Hi {{contactFirstName}},\n\nThank you,\n{{signatureBlock}}`),
      delayDays: fallback?.delayDays || defaultFollowUpDelay(followIndex),
    });
  }

  return {
    stages: sanitizeStages(stages),
    signature: sanitizeSignature(undefined),
  };
}

export function getTemplateStage(templates: OutreachTemplateMap, stageId: OutreachTemplateStage) {
  return templates.stages.find((stage) => stage.id === stageId) || null;
}

export function getFollowUpStages(templates: OutreachTemplateMap) {
  return templates.stages.filter((stage) => stage.id !== "primary");
}

export function createFollowUpTemplate(templates: OutreachTemplateMap): OutreachTemplateMap {
  const followUps = getFollowUpStages(templates);
  const nextIndex = followUps.length + 1;

  return {
    ...templates,
    stages: [
      ...templates.stages,
      {
        id: `follow_up_${nextIndex}`,
        label: `Follow-up ${nextIndex}`,
        subject: `Following up again with {{businessName}}`,
        body: `Hi {{contactFirstName}},

I wanted to follow up again on my previous email about vending at {{businessName}}. If this is still something you are considering, I would be happy to share options that fit your space and team.

Thank you,
{{signatureBlock}}`,
        delayDays: 3,
      },
    ],
  };
}
