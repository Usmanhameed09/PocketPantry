-- ============================================================================
-- 008 — AI Canonical Layer (Phase 0 of the RAG plan)
--
-- WHY: the AI assistant and the dashboard pages computed the same numbers in
-- two different ways, so they could disagree (Machines tile said $692 while
-- the true July total was $500; Warehouse showed 24 units while the AI said 0
-- because duplicate catalog variants split the stock). This migration creates
-- ONE canonical place where those numbers are defined. Both the UI and the AI
-- read these views, so they can never diverge again.
--
-- Contents:
--   1. admin_exec_sql()  — service-role-only SQL runner so future phases
--                          (pgvector, entity index) apply WITHOUT manual pastes
--   2. product_groups    — duplicate catalog variants grouped into one entity
--   3. Canonical views   — v_product_stock / v_product_sales /
--                          v_machine_revenue / v_leads_by_stage
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── 1. admin_exec_sql — future migrations run programmatically ─────────────
-- SECURITY: revoked from anon/authenticated; only the service_role key (which
-- already has full data access, server-side only) can call it. This is what
-- lets the remaining RAG phases deploy without another SQL-editor paste.
CREATE OR REPLACE FUNCTION admin_exec_sql(sql text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE sql;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION admin_exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION admin_exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_exec_sql(text) TO service_role;

-- ── 2. Product groups — duplicate variants become ONE entity ───────────────
-- The bulk UPC import created twins like "Takis Snack Takis Pix Fuego" and
-- "Takis Fuego Pix" — same physical product, two rows, stock on one and sales
-- on the other. Groups unify them. Singleton products keep group_id = NULL
-- (the views treat a NULL group as its own group of one).
CREATE TABLE IF NOT EXISTS product_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL,
  canonical_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- how the group was formed: 'barcode' | 'name-equal' | 'token-set' |
  -- 'token-subset' | 'manual' — kept for auditability of auto-grouping
  match_method text
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES product_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_group ON products(group_id);

-- ── 3. Canonical views ──────────────────────────────────────────────────────

-- Warehouse stock per product GROUP (variants summed). "How many Arizona Tea
-- Sweet do I have?" reads THIS — the same number the Warehouse page shows,
-- regardless of which duplicate variant the stock row sits on.
CREATE OR REPLACE VIEW v_product_stock AS
SELECT
  COALESCE(p.group_id, p.id)                            AS group_key,
  COALESCE(pg.canonical_name, MIN(p.name))              AS product_name,
  COUNT(*)                                              AS variant_count,
  ARRAY_AGG(p.id)                                       AS product_ids,
  ARRAY_AGG(DISTINCT p.name)                            AS variant_names,
  SUM(COALESCE(w.on_hand, 0))::int                      AS on_hand_units,
  ROUND(SUM(COALESCE(w.on_hand, 0) * COALESCE(p.unit_cost, 0))::numeric, 2) AS stock_value,
  MAX(p.company_id::text)::uuid                         AS company_id
FROM products p
LEFT JOIN product_groups pg ON pg.id = p.group_id
LEFT JOIN warehouse_inventory w ON w.product_id = p.id
GROUP BY COALESCE(p.group_id, p.id), pg.canonical_name;

-- Sales per product GROUP per machine per day (variants summed).
CREATE OR REPLACE VIEW v_product_sales AS
SELECT
  COALESCE(p.group_id, p.id)                 AS group_key,
  COALESCE(pg.canonical_name, p.name)        AS product_name,
  ds.machine_id,
  m.name                                     AS machine_name,
  ds.sale_date,
  SUM(ds.units_sold)::int                    AS units,
  ROUND(SUM(ds.revenue)::numeric, 2)         AS revenue
FROM daily_sales ds
JOIN products p ON p.id = ds.product_id
LEFT JOIN product_groups pg ON pg.id = p.group_id
JOIN machines m ON m.id = ds.machine_id
GROUP BY COALESCE(p.group_id, p.id), COALESCE(pg.canonical_name, p.name),
         ds.machine_id, m.name, ds.sale_date;

-- Revenue per machine per day — THE definition of machine revenue. The
-- Machines page tile, Reports, and the AI all read this.
CREATE OR REPLACE VIEW v_machine_revenue AS
SELECT
  ds.machine_id,
  m.name             AS machine_name,
  m.nayax_device_id,
  ds.sale_date,
  SUM(ds.units_sold)::int            AS units,
  ROUND(SUM(ds.revenue)::numeric, 2) AS revenue
FROM daily_sales ds
JOIN machines m ON m.id = ds.machine_id
GROUP BY ds.machine_id, m.name, m.nayax_device_id, ds.sale_date;

-- Lead counts per pipeline stage.
CREATE OR REPLACE VIEW v_leads_by_stage AS
SELECT stage, COUNT(*)::int AS lead_count
FROM leads
GROUP BY stage;
