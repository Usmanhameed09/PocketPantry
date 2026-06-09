import { NextResponse } from "next/server";
import { applyCostFix } from "@/lib/cost-fixer";
import { invalidateOnPriceWrite } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type FixInput = { productId: string; newUnitCost: number; caseSize?: number | null };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const fixes = (body.fixes || []) as FixInput[];
    if (!Array.isArray(fixes) || fixes.length === 0) {
      return NextResponse.json({ success: false, error: "fixes[] required" }, { status: 400 });
    }
    let applied = 0;
    const errors: Array<{ productId: string; error: string }> = [];
    const actor = (body.actor as string | undefined) || "cost-fixer";
    for (const f of fixes) {
      try {
        if (!f.productId || !Number.isFinite(f.newUnitCost) || f.newUnitCost <= 0) {
          errors.push({ productId: f.productId, error: "invalid input" });
          continue;
        }
        await applyCostFix(f.productId, f.newUnitCost, f.caseSize ?? null, actor, body.reason as string | undefined);
        applied++;
      } catch (e) {
        errors.push({ productId: f.productId, error: e instanceof Error ? e.message : "failed" });
      }
    }
    // Cost changes ripple through inventory margin display + buy list math.
    if (applied > 0) await invalidateOnPriceWrite();

    return NextResponse.json({ success: true, applied, errors });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
