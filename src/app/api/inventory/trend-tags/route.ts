import { NextResponse } from "next/server";
import { setProductTrendTags, getProductTrendTags } from "@/lib/product-proposals";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ success: false, error: "productId required" }, { status: 400 });
    const tags = await getProductTrendTags(productId);
    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    await setProductTrendTags(body.productId, Array.isArray(body.tags) ? body.tags : [], body.addedBy);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
