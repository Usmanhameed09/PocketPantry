import { NextResponse } from "next/server";
import { rebuildEntityIndex } from "@/lib/entity-embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Refreshes the ai_entities pgvector index so the assistant's semantic name
 * resolution stays current with the catalog. Runs on a schedule (see
 * vercel.json) and can be triggered manually with the CRON_SECRET.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / unset → allow
  const provided = req.headers.get("authorization") || req.headers.get("x-cron-secret");
  return provided === `Bearer ${secret}` || provided === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await rebuildEntityIndex();
    return NextResponse.json({ success: true, ...result, at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
