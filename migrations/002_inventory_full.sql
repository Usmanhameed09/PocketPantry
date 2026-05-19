-- PocketPantry Inventory — Full Sprint 1→6 Schema Additions
-- Run this in Supabase Dashboard > SQL Editor AFTER 001_inventory_tables.sql.

-- ─── SPRINT 1: Stock ledger + product fields ────────────────────────

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('Active', 'Inactive', 'PhaseOut', 'Proposed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE products ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'Active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS case_size int DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_vend_price numeric(10,2);

DO $$ BEGIN
  CREATE TYPE stock_reason AS ENUM (
    'purchase', 'refill', 'spoilage', 'damage', 'count_correction', 'sale_estimate', 'transfer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location text NOT NULL,           -- 'warehouse' or machine_id::text
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  qty int NOT NULL,                 -- positive = in, negative = out
  reason stock_reason NOT NULL,
  reference_id uuid,                -- po_id, refill_id, etc.
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_machine ON stock_movements(machine_id, created_at DESC);

-- ─── SPRINT 2: Refill audit log ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS refill_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  performed_by text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
CREATE INDEX IF NOT EXISTS idx_refill_events_machine ON refill_events(machine_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS refill_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  refill_id uuid NOT NULL REFERENCES refill_events(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty_loaded int NOT NULL
);

-- ─── SPRINT 3: Projections ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seasonal_multipliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  category text NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  multiplier numeric(5,3) NOT NULL DEFAULT 1.0,
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE(company_id, category, month, location_id)
);

CREATE TABLE IF NOT EXISTS projection_overrides (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  units_override numeric(10,2) NOT NULL,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projection_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  window_weeks int NOT NULL DEFAULT 6,
  safety_stock_days int NOT NULL DEFAULT 5,
  horizon_days int NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

INSERT INTO projection_settings (company_id, window_weeks, safety_stock_days, horizon_days)
VALUES ('00000000-0000-0000-0000-000000000001', 6, 5, 7)
ON CONFLICT (company_id) DO NOTHING;

-- ─── SPRINT 4: Purchasing ───────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE po_status AS ENUM ('Draft', 'Approved', 'Purchased', 'Received', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  status po_status NOT NULL DEFAULT 'Draft',
  total_cost numeric(12,2) DEFAULT 0,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  purchased_at timestamptz,
  received_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS po_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty_ordered int NOT NULL,
  qty_received int NOT NULL DEFAULT 0,
  unit_cost numeric(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_lines_po ON po_lines(po_id);

CREATE TABLE IF NOT EXISTS buy_list_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  horizon_days int NOT NULL,
  safety_stock_days int NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by text
);

-- ─── SPRINT 5: Alerts ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS low_stock_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  category text,
  threshold_days int NOT NULL DEFAULT 5,
  scope text NOT NULL DEFAULT 'both' CHECK (scope IN ('warehouse', 'machine', 'both')),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM ('low_stock', 'spike', 'expiry', 'underperformer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'dismissed', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'medium',
  message text NOT NULL,
  days_remaining int,
  recommended_qty int,
  metadata jsonb DEFAULT '{}'::jsonb,
  status alert_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_product ON alerts(product_id);

-- ─── SPRINT 6: Proposals + Trends + Replacements ────────────────────

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('Proposed', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS product_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_name text NOT NULL,
  category text,
  reason text,
  status proposal_status NOT NULL DEFAULT 'Proposed',
  suggested_initial_qty int,
  target_locations jsonb DEFAULT '[]'::jsonb,
  suggested_price_min numeric(10,2),
  suggested_price_max numeric(10,2),
  reasoning_text text,
  comparable_sku_id uuid REFERENCES products(id),
  proposed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text,
  approved_product_id uuid REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_trend_tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag text NOT NULL,
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, tag)
);

DO $$ BEGIN
  CREATE TYPE replacement_status AS ENUM ('Active', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS replacement_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  old_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  new_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status replacement_status NOT NULL DEFAULT 'Active',
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ─── Helper view: current warehouse on-hand from ledger ─────────────
-- The existing warehouse_inventory table is kept for fast reads, but the
-- ledger is the source of truth. Reconcile via this view when needed.

CREATE OR REPLACE VIEW warehouse_ledger_balance AS
  SELECT
    product_id,
    SUM(qty) AS on_hand
  FROM stock_movements
  WHERE location = 'warehouse'
  GROUP BY product_id;
