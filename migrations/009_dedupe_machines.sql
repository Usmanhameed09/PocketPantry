-- ============================================================================
-- 009 — Merge duplicate machines + make nayax_device_id unique
--
-- WHY: a second "NEC" row (same nayax_device_id 916676417) got created on
-- 2026-09-12. ensureMachine() then picked either row on each sync, and each
-- sync rewrites the last 30 days, so BOTH rows ended up holding the same
-- sales — Reports, buy-list velocity and the AI all double-counted NEC.
--
-- What this does, per duplicated nayax_device_id:
--   keeper = the OLDEST row (has the full history; ensureMachine now always
--            picks the oldest too)
--   1. daily_sales: where both rows have the same (product, date), copy the
--      fresher values onto the keeper, then drop the duplicate's copy; any
--      remaining duplicate rows move to the keeper.
--   2. every other table with an FK to machines(id) is re-pointed at the
--      keeper (rows that would collide with a keeper row are dropped — they
--      are copies of the same machine's data).
--   3. the duplicate machine rows are deleted.
--   4. a partial UNIQUE index stops it from ever happening again.
--
-- Idempotent — safe to re-run (no-op when there are no duplicates).
-- ============================================================================

DO $$
DECLARE
  dup record;
  fk record;
BEGIN
  FOR dup IN
    SELECT m.id AS dup_id, k.id AS keep_id
    FROM machines m
    JOIN LATERAL (
      SELECT id FROM machines k
      WHERE k.nayax_device_id = m.nayax_device_id
      ORDER BY k.created_at ASC, k.id ASC
      LIMIT 1
    ) k ON true
    WHERE m.nayax_device_id IS NOT NULL AND m.id <> k.id
  LOOP
    -- 1. daily_sales — keep the freshest numbers for overlapping days.
    UPDATE daily_sales keep
       SET units_sold = d.units_sold, revenue = d.revenue, updated_at = d.updated_at
      FROM daily_sales d
     WHERE d.machine_id = dup.dup_id
       AND keep.machine_id = dup.keep_id
       AND keep.product_id = d.product_id
       AND keep.sale_date = d.sale_date
       AND d.updated_at > keep.updated_at;
    DELETE FROM daily_sales d
     WHERE d.machine_id = dup.dup_id
       AND EXISTS (SELECT 1 FROM daily_sales k
                    WHERE k.machine_id = dup.keep_id
                      AND k.product_id = d.product_id
                      AND k.sale_date = d.sale_date);
    UPDATE daily_sales SET machine_id = dup.keep_id WHERE machine_id = dup.dup_id;

    -- 2. every other FK column pointing at machines(id).
    FOR fk IN
      SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'machines'::regclass
        AND c.conrelid <> 'daily_sales'::regclass
    LOOP
      BEGIN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tbl, fk.col, fk.col)
          USING dup.keep_id, dup.dup_id;
      EXCEPTION WHEN unique_violation THEN
        -- Row-by-row: move what can move, drop what collides with the keeper.
        EXECUTE format(
          'DO $i$ DECLARE r record; BEGIN
             FOR r IN SELECT ctid FROM %1$s WHERE %2$I = %3$L LOOP
               BEGIN
                 UPDATE %1$s SET %2$I = %4$L WHERE ctid = r.ctid;
               EXCEPTION WHEN unique_violation THEN
                 DELETE FROM %1$s WHERE ctid = r.ctid;
               END;
             END LOOP;
           END $i$;', fk.tbl, fk.col, dup.dup_id, dup.keep_id);
      END;
    END LOOP;

    -- 3. drop the duplicate machine.
    DELETE FROM machines WHERE id = dup.dup_id;
  END LOOP;
END $$;

-- 4. never again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_machines_nayax_device_id
  ON machines (nayax_device_id)
  WHERE nayax_device_id IS NOT NULL;
