import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { saveSeasonalMultiplier } from "@/lib/projection-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("seasonal_multipliers")
      .select("category, month, multiplier")
      .eq("company_id", companyId);
    if (error) throw error;
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
    await saveSeasonalMultiplier({
      category: body.category,
      month: Number(body.month),
      multiplier: Number(body.multiplier),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
