-- Remove the duplicate employee rows for good.
--
-- The employees table has each person ~4 times, from how it was first populated.
-- June's fix deduplicated in getEmployees() at read time, which hid the problem
-- instead of solving it — the new Roster screen read the table directly and
-- showed every name four times. This cleans the table and locks it so
-- duplicates can never come back.
--
-- Run this in the Supabase SQL Editor. Safe to run twice.

-- 1. Normalise whitespace so "Elie  Sasson" and "Elie Sasson" collapse together
UPDATE employees SET name = regexp_replace(trim(name), '\s+', ' ', 'g');

-- 2. Delete duplicates, keeping one row per name (case-insensitive).
--    ctid is Postgres's physical row id — it breaks ties when rows are identical.
DELETE FROM employees a
USING employees b
WHERE lower(a.name) = lower(b.name)
  AND a.ctid > b.ctid;

-- 3. Never again: reject any future insert that differs only by case/spacing
CREATE UNIQUE INDEX IF NOT EXISTS employees_name_unique
  ON employees (lower(name));

-- Check: this should return zero rows
--   SELECT lower(name), count(*) FROM employees GROUP BY 1 HAVING count(*) > 1;
