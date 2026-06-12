-- ─────────────────────────────────────────────────────────────────
-- Outreach config — single-row JSON config so the operator can change
-- routing (callers/closers), call attempt limits, retry cadence, and
-- the Apollo decision-maker title list WITHOUT a code deploy (US6.3).
--
-- The app reads the most-recent row; if the table is empty or missing,
-- it falls back to hardcoded defaults, so this migration is optional for
-- the app to run (but required for the Scoring/Config panel to persist).
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed one row if none exists so the GET endpoint always returns something.
INSERT INTO outreach_config (config)
SELECT '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM outreach_config);
