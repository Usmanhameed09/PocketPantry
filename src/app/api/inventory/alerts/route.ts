import { NextResponse } from "next/server";
import {
  listAlerts,
  acknowledgeAlert,
  dismissAlert,
} from "@/lib/alerts-engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeResolved = searchParams.get("includeResolved") === "1";
    const alerts = await listAlerts(includeResolved);
    return NextResponse.json({ success: true, data: alerts });
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
    if (body.action === "acknowledge") await acknowledgeAlert(body.id);
    else if (body.action === "dismiss") await dismissAlert(body.id);
    else return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
