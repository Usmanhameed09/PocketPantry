import { NextResponse } from "next/server";
import { discoverTrendingProducts } from "@/lib/product-proposals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const added = await discoverTrendingProducts();
    return NextResponse.json({ success: true, added });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
