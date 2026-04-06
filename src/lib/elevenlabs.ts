import crypto from "crypto";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID!;
const ELEVENLABS_PHONE_NUMBER_ID = process.env.ELEVENLABS_PHONE_NUMBER_ID!;
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

interface TriggerCallParams {
  phoneNumber: string;
  leadId: string;
  dynamicVariables?: Record<string, string>;
}

interface ElevenLabsOutboundResponse {
  success?: boolean;
  message?: string;
  conversation_id?: string | null;
  callSid?: string | null;
}

interface ElevenLabsConversationResponse {
  conversation_id?: string;
  analysis?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  conversation_initiation_client_data?: Record<string, unknown>;
  transcript?: string | null;
}

export async function triggerOutboundCall(params: TriggerCallParams): Promise<ElevenLabsOutboundResponse> {
  if (!ELEVENLABS_PHONE_NUMBER_ID) {
    throw new Error("No ElevenLabs phone number configured. Add ELEVENLABS_PHONE_NUMBER_ID to env vars.");
  }

  const response = await fetch(`${ELEVENLABS_BASE_URL}/convai/twilio/outbound-call`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: ELEVENLABS_AGENT_ID,
      agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
      to_number: params.phoneNumber,
      conversation_initiation_client_data: {
        dynamic_variables: {
          leadId: params.leadId,
          ...(params.dynamicVariables || {}),
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs call failed (${response.status}): ${error}`);
  }

  return response.json();
}

export async function getConversationDetails(conversationId: string): Promise<ElevenLabsConversationResponse> {
  const response = await fetch(`${ELEVENLABS_BASE_URL}/convai/conversations/${conversationId}`, {
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ElevenLabs conversation: ${response.status}`);
  }

  return response.json();
}

function timingSafeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyElevenLabsSignature(payload: string, signatureHeader: string | null, secret: string) {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    })
  );

  const timestamp = parts.t;
  const signature = parts.v0;

  if (!timestamp || !signature) return false;

  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return timingSafeEqual(signature, expected);
}

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
