import { NextResponse } from "next/server";
import {
  createReplacementPlan,
  listReplacementPlans,
} from "@/lib/product-proposals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await listReplacementPlans();
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
    if (!body.oldProductId || !body.newProductId) {
      return NextResponse.json(
        { success: false, error: "oldProductId and newProductId required" },
        { status: 400 }
      );
    }
    await createReplacementPlan({
      oldProductId: body.oldProductId,
      newProductId: body.newProductId,
      notes: body.notes,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
