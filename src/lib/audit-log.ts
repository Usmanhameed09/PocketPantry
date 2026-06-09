/**
 * Audit log for critical actions.
 *
 * Acceptance criteria (client story): "Shows who/what/when/old/new" for every
 * inventory, cost, pricing, and PO change.
 *
 * Pattern: each mutation path (product PATCH, PO transition, cost-fixer apply,
 * spoilage adjustment, etc.) calls recordAuditEvent immediately after writing
 * its change. The audit row is best-effort — if the audit table doesn't exist
 * yet (operator hasn't run migration 006), the call swallows the error so the
 * primary mutation still succeeds.
 *
 * Backed by the audit_log table (see migrations/006_audit_log.sql).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase";

export type AuditActionType =
  | "cost_change"
  | "price_change"
  | "po_status_change"
  | "po_create"
  | "po_delete"
  | "po_receive"
  | "product_create"
  | "product_edit"
  | "spoilage"
  | "damage"
  | "refill"
  | "warehouse_adjust";

export type AuditEntityType =
  | "product"
  | "purchase_order"
  | "machine_inventory"
  | "warehouse"
  | "stock_movement";

export type AuditEvent = {
  id: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  entityName: string | null;
  actor: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
};

function dbToEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: row.id as string,
    actionType: row.action_type as AuditActionType,
    entityType: row.entity_type as AuditEntityType,
    entityId: row.entity_id as string,
    entityName: (row.entity_name as string | null) ?? null,
    actor: (row.actor as string | null) ?? null,
    oldValue: (row.old_value as Record<string, unknown> | null) ?? null,
    newValue: (row.new_value as Record<string, unknown> | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as Partial<{ code: string; message: string }>;
  const code = e.code || "";
  const message = (e.message || "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("audit_log") && message.includes("not found"))
  );
}

/**
 * Record one audit entry. Best-effort — if the table doesn't exist yet
 * (migration 006 not run), the call returns null instead of throwing so
 * the primary mutation still succeeds. The owner can run the migration
 * later and start collecting from that moment forward.
 */
export async function recordAuditEvent(params: {
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  entityName?: string | null;
  actor?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  notes?: string | null;
}): Promise<string | null> {
  const supabase = createServerClient();
  try {
    const { data, error } = await supabase
      .from("audit_log")
      .insert({
        action_type: params.actionType,
        entity_type: params.entityType,
        entity_id: params.entityId,
        entity_name: params.entityName ?? null,
        actor: params.actor ?? null,
        old_value: params.oldValue ?? null,
        new_value: params.newValue ?? null,
        notes: params.notes ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (isMissingTableError(error)) {
        console.warn("[audit-log] table missing — run migrations/006_audit_log.sql to enable auditing");
        return null;
      }
      console.warn("[audit-log] insert failed:", error.message);
      return null;
    }
    return data?.id as string;
  } catch (err) {
    console.warn("[audit-log] threw:", err);
    return null;
  }
}

export type AuditListParams = {
  actionType?: AuditActionType;
  entityType?: AuditEntityType;
  entityId?: string;
  actor?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  limit?: number;
};

export async function listAuditEvents(params: AuditListParams = {}): Promise<AuditEvent[]> {
  const supabase = createServerClient();
  try {
    let q = supabase
      .from("audit_log")
      .select("id, action_type, entity_type, entity_id, entity_name, actor, old_value, new_value, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params.limit ?? 100, 1), 500));

    if (params.actionType) q = q.eq("action_type", params.actionType);
    if (params.entityType) q = q.eq("entity_type", params.entityType);
    if (params.entityId) q = q.eq("entity_id", params.entityId);
    if (params.actor) q = q.eq("actor", params.actor);
    if (params.startDate) q = q.gte("created_at", `${params.startDate}T00:00:00.000Z`);
    if (params.endDate) q = q.lte("created_at", `${params.endDate}T23:59:59.999Z`);

    const { data, error } = await q;
    if (error) {
      if (isMissingTableError(error)) return [];
      console.warn("[audit-log] list failed:", error.message);
      return [];
    }
    return (data || []).map((r) => dbToEvent(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function listAuditEventsForEntity(
  entityType: AuditEntityType,
  entityId: string,
  limit = 50
): Promise<AuditEvent[]> {
  return listAuditEvents({ entityType, entityId, limit });
}

export async function getAuditSummary(days = 30): Promise<{
  totalEvents: number;
  byActionType: Record<string, number>;
  byActor: Array<{ actor: string; count: number }>;
  windowStart: string;
}> {
  const supabase = createServerClient();
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from("audit_log")
      .select("action_type, actor")
      .gte("created_at", windowStart)
      .range(0, 9999);
    if (error) {
      return { totalEvents: 0, byActionType: {}, byActor: [], windowStart };
    }
    const byAction: Record<string, number> = {};
    const byActor = new Map<string, number>();
    for (const r of data || []) {
      const a = r.action_type as string;
      byAction[a] = (byAction[a] || 0) + 1;
      const u = (r.actor as string | null) || "system";
      byActor.set(u, (byActor.get(u) || 0) + 1);
    }
    return {
      totalEvents: (data || []).length,
      byActionType: byAction,
      byActor: Array.from(byActor.entries())
        .map(([actor, count]) => ({ actor, count }))
        .sort((a, b) => b.count - a.count),
      windowStart,
    };
  } catch {
    return { totalEvents: 0, byActionType: {}, byActor: [], windowStart };
  }
}
