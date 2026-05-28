-- ─────────────────────────────────────────────────────────────────
-- Pipeline v2 — adds: tier scoring, next action, owner, call cadence,
-- not-interested reason codes, vertical, employee count, Apollo mobile.
-- Also inserts the two missing stages (qualified + meeting_booked) so
-- the board matches the workflow the operator actually runs.
-- ─────────────────────────────────────────────────────────────────

-- ─── New stages (idempotent — skipped if pipeline_stages table absent) ──
-- The deployed app stores stage as text on leads directly (see leads-store.ts),
-- so this block is only relevant if the schema.sql pipeline_stages lookup
-- table happens to exist. Wrap in a DO so missing table = no-op, not error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_stages') THEN
    INSERT INTO pipeline_stages (key, label, sort_order) VALUES
      ('qualified',      'Qualified',      3),
      ('meeting_booked', 'Meeting Booked', 6)
    ON CONFLICT (key) DO NOTHING;

    UPDATE pipeline_stages SET label = 'Won' WHERE key = 'signed';

    UPDATE pipeline_stages SET sort_order = CASE key
      WHEN 'prospect'       THEN 1
      WHEN 'contacted'      THEN 2
      WHEN 'qualified'      THEN 3
      WHEN 'follow_up'      THEN 4
      WHEN 'site_visit'     THEN 5
      WHEN 'proposal'       THEN 6
      WHEN 'meeting_booked' THEN 7
      WHEN 'signed'         THEN 8
      WHEN 'installed'      THEN 9
      ELSE sort_order
    END;
  END IF;
END $$;

-- Ensure uuid-ossp is available for uuid_generate_v4() default below.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Lead enrichment fields ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE lead_tier AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tier lead_tier;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tier_reason text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tier_score int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vertical text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS employee_count int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS foot_traffic_score int;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_mobile text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_title text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_last_enriched_at timestamptz;

-- Call cadence + next-action tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_attempts int NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS max_call_attempts int NOT NULL DEFAULT 6;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS not_interested_reason text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_call_ready boolean NOT NULL DEFAULT false;

-- Indexes for the queries the UI needs
CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner);
CREATE INDEX IF NOT EXISTS idx_leads_next_action_at ON leads(next_action_at);
CREATE INDEX IF NOT EXISTS idx_leads_call_ready ON leads(is_call_ready) WHERE is_call_ready = true;

-- ─── Call tasks (queue order for the caller) ─────────────────────
-- A "task" = next call/email/follow-up that needs doing on a lead.
-- Different from call_logs (which is past calls). Tasks are forward-looking.
-- lead_id is TEXT (not uuid) — the deployed leads table uses L-XXX format,
-- and we deliberately skip the FK so the migration is safe to run even if
-- leads ends up changing its id type later. The /api/leads/tasks endpoint
-- joins on lead_id manually anyway.
CREATE TABLE IF NOT EXISTS lead_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id text NOT NULL,
  task_type text NOT NULL,             -- 'call' | 'email' | 'follow_up'
  scheduled_for timestamptz NOT NULL,
  priority int NOT NULL DEFAULT 50,    -- 0..100, higher = sooner
  status text NOT NULL DEFAULT 'open', -- 'open' | 'done' | 'skipped'
  reason text,                          -- "hot reply", "retry after no-answer", etc.
  completed_at timestamptz,
  completed_outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_open ON lead_tasks(status, scheduled_for) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead ON lead_tasks(lead_id, status);

-- ─── Scoring config (so weights can change without redeploying) ──
-- company_id is nullable + no FK so this works even if the companies table
-- doesn't exist (older deployments). The /api/leads/scoring-config endpoint
-- always reads the most-recently-updated row regardless of company_id.
CREATE TABLE IF NOT EXISTS scoring_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '{"A": 70, "B": 40}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default weights — only insert if the table is empty so a re-run
-- of the migration doesn't clobber operator edits.
INSERT INTO scoring_config (company_id, weights)
SELECT NULL, '{
  "verticals": {
    "Auto Dealership":      30,
    "Construction Supply":  28,
    "Manufacturing":        28,
    "Warehousing":          26,
    "Office Park":          24,
    "Gym":                  18,
    "Hospital":             16,
    "School":               12,
    "Hotel":                14,
    "Car Wash":             12,
    "Apartments":           10,
    "Call Center":          22
  },
  "employees": {
    "min_25":   10,
    "min_50":   20,
    "min_100":  30,
    "min_250":  35
  },
  "data": {
    "has_mobile":   15,
    "has_email":    10,
    "has_address":   5,
    "has_dm_title":  8
  }
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM scoring_config);
