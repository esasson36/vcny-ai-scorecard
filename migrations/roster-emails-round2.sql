-- Roster emails, round 2: the three addresses left unresolved on 2026-09-08.
--
-- Confirmed by Elie, cross-checked against mailbox evidence:
--   * tobycohen@ sends as display name "Toby Cohen" and is the CEO account, so
--     the Pet Production "Toby Joe Cohen" who submitted is tcohen@.
--   * Asasson@ = Albert Sasson (active account; it is the one that authorises
--     AI seat additions, e.g. "Elie can you add Khusboo Kaplesh to Chatgpt").
--   * ehelwani@ = Eddie Halwani. NOTE the address spells it "helwani" while the
--     name is "Halwani"; the address is taken verbatim from the August 19
--     announcement's recipient list, so it is the verified one.
--
-- Run in the Supabase SQL Editor. Safe to run twice.

-- ── Toby Joe Cohen (submitted, Pet Production) ───────────────────────────────
UPDATE employees SET email = 'tcohen@vcnyhome.com'
WHERE lower(trim(name)) = 'toby joe cohen';

UPDATE submissions SET email = 'tcohen@vcnyhome.com'
WHERE lower(trim(name)) = 'toby joe cohen' AND (email IS NULL OR email = '');

-- ── The three roster entries that may not exist yet ──────────────────────────
-- All three were on the August 19 recipient list, so they are active employees
-- who should be counted in headcount and chased for September.
INSERT INTO employees (name, email, team, active)
SELECT v.name, v.email, v.team, true
FROM (VALUES
  ('Toby Cohen',    'tobycohen@vcnyhome.com', 'Executive'),
  ('Eddie Halwani', 'ehelwani@vcnyhome.com',  ''),
  ('Albert Sasson', 'Asasson@vcnyhome.com',   '')
) AS v(name, email, team)
WHERE NOT EXISTS (
  SELECT 1 FROM employees e WHERE lower(trim(e.name)) = lower(v.name)
);

-- If they already existed under these names, just fill the email in.
UPDATE employees SET email = v.email
FROM (VALUES
  ('toby cohen',    'tobycohen@vcnyhome.com'),
  ('eddie halwani', 'ehelwani@vcnyhome.com'),
  ('albert sasson', 'Asasson@vcnyhome.com')
) AS v(name, email)
WHERE lower(trim(employees.name)) = v.name
  AND (employees.email IS NULL OR employees.email = '');

-- Check: everyone still missing an email or a team
--   SELECT name, email, team FROM employees
--   WHERE active AND (email = '' OR email IS NULL OR team = '' OR team IS NULL)
--   ORDER BY name;
