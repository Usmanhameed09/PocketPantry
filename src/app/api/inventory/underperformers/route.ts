import { NextResponse } from "next/server";
import { findUnderperformers } from "@/lib/product-proposals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await findUnderperformers();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
