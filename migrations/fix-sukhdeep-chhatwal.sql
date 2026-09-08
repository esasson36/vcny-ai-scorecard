-- Sukhdeep's surname is Chhatwal, not Singh.
--
-- The August submission was filed as "Sukhdeep Singh" — confirmed by Elie as a
-- mix-up with Samantha Singh. His address is SChhatwal@vcnyhome.com, which is
-- why the round-1 backfill could not match him. Corrected here in the data, and
-- NAME_ALIASES also maps the old spelling so a repeat mistype still resolves.
--
-- Run in the Supabase SQL Editor. Safe to run twice.

-- ── Roster ───────────────────────────────────────────────────────────────────
-- If the correct entry already exists, drop the wrong one and fill the email in.
DELETE FROM employees
WHERE lower(trim(name)) = 'sukhdeep singh'
  AND EXISTS (SELECT 1 FROM employees e WHERE lower(trim(e.name)) = 'sukhdeep chhatwal');

-- Otherwise rename the wrong entry rather than creating a second person.
UPDATE employees
SET name = 'Sukhdeep Chhatwal', email = 'SChhatwal@vcnyhome.com'
WHERE lower(trim(name)) = 'sukhdeep singh';

UPDATE employees SET email = 'SChhatwal@vcnyhome.com'
WHERE lower(trim(name)) = 'sukhdeep chhatwal'
  AND (email IS NULL OR email = '');

-- If he was on neither, add him. He submitted in August, so he is active.
INSERT INTO employees (name, email, team, active)
SELECT 'Sukhdeep Chhatwal', 'SChhatwal@vcnyhome.com', 'Sales', true
WHERE NOT EXISTS (
  SELECT 1 FROM employees WHERE lower(trim(name)) = 'sukhdeep chhatwal'
);

-- ── His August submission ────────────────────────────────────────────────────
UPDATE submissions
SET name = 'Sukhdeep Chhatwal', email = 'SChhatwal@vcnyhome.com'
WHERE lower(trim(name)) = 'sukhdeep singh';

-- Check: no Singh/Chhatwal confusion left, and Samantha is untouched
--   SELECT name, email, team FROM employees
--   WHERE lower(name) LIKE '%singh%' OR lower(name) LIKE '%chhatwal%';
