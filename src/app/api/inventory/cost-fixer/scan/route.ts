import { NextResponse } from "next/server";
import { buildCostFixProposals } from "@/lib/cost-fixer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit")) || undefined;
    const { proposals, totalSuspicious } = await buildCostFixProposals(limit);
    return NextResponse.json({ success: true, proposals, totalSuspicious });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
