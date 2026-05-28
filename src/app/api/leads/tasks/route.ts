/**
 * Lead tasks API.
 *
 * GET  /api/leads/tasks?leadId=L-001   — open tasks for one lead
 * GET  /api/leads/tasks?due=1&type=call — due tasks across all leads (queue)
 * POST /api/leads/tasks                 — create a task manually
 *      body: { leadId, taskType, scheduledFor, priority?, reason? }
 * POST /api/leads/tasks?action=complete — mark a task done
 *      body: { id, outcome }
 */

import { NextRequest, NextResponse } from "next/server";
import { createTask, completeTask, getOpenTasksForLead, getDueTasks, type TaskType } from "@/lib/lead-tasks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  const due = searchParams.get("due");
  const type = (searchParams.get("type") as TaskType | null) || undefined;

  try {
    if (leadId) {
      const tasks = await getOpenTasksForLead(leadId);
      return NextResponse.json({ ok: true, tasks });
    }
    if (due === "1") {
      const tasks = await getDueTasks({ type, limit: 200 });
      return NextResponse.json({ ok: true, tasks });
    }
    return NextResponse.json({ ok: false, error: "Pass ?leadId=… or ?due=1" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  try {
    const body = await req.json();
    if (action === "complete") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
      const ok = await completeTask(body.id, body.outcome || "manual");
      return NextResponse.json({ ok });
    }
    if (!body.leadId || !body.taskType || !body.scheduledFor) {
      return NextResponse.json({ ok: false, error: "Missing leadId / taskType / scheduledFor" }, { status: 400 });
    }
    const task = await createTask({
      leadId: body.leadId,
      taskType: body.taskType,
      scheduledFor: body.scheduledFor,
      priority: body.priority,
      reason: body.reason,
    });
    return NextResponse.json({ ok: !!task, task });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
