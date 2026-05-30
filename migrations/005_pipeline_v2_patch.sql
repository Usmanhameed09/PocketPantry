-- ─────────────────────────────────────────────────────────────────
-- Pipeline v2 patch — fixes two issues found during end-to-end
-- testing of the lead pipeline after the Apollo Basic API key
-- was wired up:
--
--   1. last_touch_at column was never added (it was in the migration
--      file but apparently never ran on this DB), so the disposition
--      flow silently failed to stamp the field and next-action info
--      never landed on the lead.
--
--   2. leads_stage_check still whitelists only the old stage values,
--      so the book-meeting endpoint errors with "violates check
--      constraint" trying to set stage = 'Meeting Booked'. Same for
--      'Qualified', 'Won', 'Installed'.
--
-- Both blocks are idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_leads_last_touch_at ON leads(last_touch_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'leads' AND constraint_name = 'leads_stage_check'
  ) THEN
    ALTER TABLE leads DROP CONSTRAINT leads_stage_check;
  END IF;
END $$;

ALTER TABLE leads ADD CONSTRAINT leads_stage_check CHECK (stage IN (
  'New Lead', 'Contacted', 'Qualified', 'Interested', 'Not Interested',
  'Site Visit Requested', 'Proposal Requested', 'Meeting Booked',
  'Won', 'Installed', 'Callback',
  -- Legacy values that might still exist in old rows
  'Emailed', 'Replied', 'Nurturing', 'Opted Out', 'Unsubscribed'
));
