import { NextResponse } from "next/server";
import { listAuditEvents, getAuditSummary, type AuditActionType, type AuditEntityType } from "@/lib/audit-log";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const actionType = searchParams.get("actionType") as AuditActionType | null;
    const entityType = searchParams.get("entityType") as AuditEntityType | null;
    const entityId = searchParams.get("entityId");
    const actor = searchParams.get("actor");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Number(searchParams.get("limit")) || 100;
    const includeSummary = searchParams.get("includeSummary") === "1";

    const events = await listAuditEvents({
      actionType: actionType || undefined,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      actor: actor || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit,
    });

    const summary = includeSummary ? await getAuditSummary(30) : null;

    return NextResponse.json({ success: true, events, summary });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
