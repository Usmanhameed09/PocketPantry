-- 006_audit_log.sql
-- Critical-action audit log: every inventory/cost/pricing/PO change is recorded
-- with who/what/when/old/new so the owner can answer "who changed X and when?".
--
-- Used by: src/lib/audit-log.ts (recordAuditEvent, listAuditEvents).
-- Surfaced in: /inventory/audit page + AI tool get_audit_log.
--
-- The table is intentionally schema-loose on old_value/new_value (jsonb) so
-- different action types can capture whatever shape makes sense. The action_type
-- column is the discriminator.

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type  text NOT NULL,           -- 'cost_change' | 'price_change' | 'po_status_change' | 'product_create' | 'product_edit' | 'spoilage' | 'damage' | 'refill' | 'po_delete'
  entity_type  text NOT NULL,           -- 'product' | 'purchase_order' | 'machine_inventory' | 'warehouse'
  entity_id    text NOT NULL,           -- ID of the affected entity (uuid or short id)
  entity_name  text,                    -- denormalized display name (product name, PO short id)
  actor        text,                    -- who made the change (operator email/id; null for system)
  old_value    jsonb,                   -- previous state, e.g. { unit_cost: 24.99 }
  new_value    jsonb,                   -- new state, e.g. { unit_cost: 0.71 }
  notes        text,                    -- optional context (e.g. 'cost-fixer: ai high conf')
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes — common query patterns:
--   1. Recent activity feed         → created_at DESC
--   2. All changes for one entity   → entity_type + entity_id + created_at DESC
--   3. Filter by action type        → action_type + created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type
  ON audit_log (action_type, created_at DESC);
