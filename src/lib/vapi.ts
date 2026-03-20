/**
 * VAPI API Client Helper
 * Handles outbound call triggering and assistant management
 */

const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID!;
const VAPI_BASE_URL = "https://api.vapi.ai";

interface TriggerCallParams {
  phoneNumber: string;           // Lead's phone number (E.164 format)
  assistantOverrides?: {
    variableValues?: Record<string, string>;  // e.g., { contactName: "Mike" }
  };
  phoneNumberId?: string;        // VAPI phone number ID to call from
  leadId?: string;               // Internal lead ID for tracking
}

interface VapiCallResponse {
  id: string;
  status: string;
  assistantId: string;
  phoneNumberId: string;
  createdAt: string;
  [key: string]: unknown;
}

/**
 * Trigger an outbound call to a lead via VAPI
 */
export async function triggerOutboundCall(params: TriggerCallParams): Promise<VapiCallResponse> {
  const phoneNumberId = params.phoneNumberId || process.env.VAPI_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    throw new Error("No VAPI phone number configured. Buy a number at dashboard.vapi.ai → Phone Numbers");
  }

  const body: Record<string, unknown> = {
    assistantId: VAPI_ASSISTANT_ID,
    phoneNumberId: phoneNumberId,
    customer: {
      number: params.phoneNumber,
    },
  };

  // Pass lead-specific variables to personalize the call
  if (params.assistantOverrides) {
    body.assistantOverrides = params.assistantOverrides;
  }

  // Attach lead ID as metadata for webhook tracking
  if (params.leadId) {
    body.metadata = { leadId: params.leadId };
  }

  const response = await fetch(`${VAPI_BASE_URL}/call/phone`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`VAPI call failed (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Get call details/status from VAPI
 */
export async function getCallDetails(callId: string): Promise<VapiCallResponse> {
  const response = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get call details: ${response.status}`);
  }

  return response.json();
}

/**
 * List recent calls from VAPI
 */
export async function listCalls(limit = 20): Promise<VapiCallResponse[]> {
  const response = await fetch(`${VAPI_BASE_URL}/call?limit=${limit}`, {
    headers: {
      "Authorization": `Bearer ${VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list calls: ${response.status}`);
  }

  return response.json();
}

/**
 * Format phone number to E.164 format for VAPI
 * e.g., "(713) 555-0142" → "+17135550142"
 */
export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}
