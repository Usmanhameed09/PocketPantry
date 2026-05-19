import { NextResponse } from "next/server";
import {
  listProposals,
  createProposal,
  decideProposal,
} from "@/lib/product-proposals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await listProposals();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.candidateName) {
      return NextResponse.json({ success: false, error: "candidateName required" }, { status: 400 });
    }
    const proposal = await createProposal({
      candidateName: body.candidateName,
      category: body.category || "Snacks",
      reason: body.reason || "",
      proposedBy: body.proposedBy,
    });
    return NextResponse.json({ success: true, data: proposal });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (!["Approved", "Rejected"].includes(body.decision)) {
      return NextResponse.json({ success: false, error: "Invalid decision" }, { status: 400 });
    }
    await decideProposal(body.id, body.decision, body.decidedBy);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
