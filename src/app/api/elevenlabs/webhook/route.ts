import { NextRequest } from "next/server";
import { handleElevenLabsWebhook } from "@/lib/elevenlabs-webhook";

export async function POST(request: NextRequest) {
  return handleElevenLabsWebhook(request);
}
