-- September prep: identity by email + the outcome question.
--
-- 1. submissions.email — names are free text ("yael", "Kvelums", "Jane yang"),
--    which works for one month and silently breaks trend tracking in month two.
--    Email is the durable join key. The app now collects it on the form and
--    resolves the person against the roster by email.
-- 2. submissions.deliverable — "Name one deliverable AI produced for you this
--    month." Outcome evidence, not usage self-rating. Deepali's $864 photoshoot
--    saving surfaced by accident in free text; this makes it the ask.
--
-- Run in the Supabase SQL Editor BEFORE (or after — the server tolerates either
-- order) deploying the September form. Safe to run twice.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS deliverable text NOT NULL DEFAULT '';

-- ── Backfill roster emails ───────────────────────────────────────────────────
-- Derived from the August 19 "AI Usage Evaluation" recipient list. Only
-- unambiguous matches are set here; see the flagged names at the bottom.
UPDATE employees SET email = v.email
FROM (VALUES
  -- August submitters
  ('arushi bisht',        'ABisht@vcnyhome.com'),
  ('alina soler',         'ASoler@vcnyhome.com'),
  ('caitlin rutter',      'CRutter@vcnyhome.com'),
  ('cecilia grullon',     'cgrullon@vcnyhome.com'),
  ('cristian gonzalez',   'cristian.gonzalez@vcnyhome.com'),
  ('danielle delavan',    'DDelavan@vcnyhome.com'),
  ('deepali keshari',     'DKeshari@vcnyhome.com'),
  ('donna smith',         'DSmith@vcnyhome.com'),
  ('elie sasson',         'ElieSasson@vcnyhome.com'),
  ('erin glaberson',      'EGlaberson@vcnyhome.com'),
  ('garvi rathod',        'GRathod@vcnyhome.com'),
  ('grace abud',          'GAbud@vcnyhome.com'),
  ('heather kree',        'hkree@vcnyhome.com'),
  ('jackie kvelums',      'jkvelums@vcnyhome.com'),
  ('jane yang',           'JaneYang@vcnyhome.com'),
  ('justine yim',         'JYim@vcnyhome.com'),
  ('khusboo kaplesh',     'khusboo.kaplesh@vcnyhome.com'),
  ('kiki xu',             'Kiki.Xu@vcnyhome.com'),
  ('maria ingles',        'MIngles@vcnyhome.com'),
  ('ozan canan',          'OCanan@vcnyhome.com'),
  ('samantha singh',      'SamanthaSingh@vcnyhome.com'),
  ('thomas lucio',        'TLucio@vcnyhome.com'),
  ('yael chamay',         'ychamay@vcnyhome.com'),
  ('yara barot',          'YBarot@vcnyhome.com'),
  -- Non-respondents
  ('lisa brier',          'lbrier@vcnyhome.com'),
  ('katelyn vanhise',     'KVanhise@vcnyhome.com'),
  ('katherine angel',     'kangel@vcnyhome.com'),
  ('kathleen crego',      'KCrego@vcnyhome.com'),
  ('andrea castellon',    'ACastellon@vcnyhome.com'),
  ('ana lopes',           'ALopes@vcnyhome.com'),
  ('laura jimenez',       'ljimenez@vcnyhome.com'),
  ('shelly qu',           'shelly.qu@vcnyhome.com'),
  ('tara hull',           'THull@vcnyhome.com')
) AS v(name, email)
WHERE lower(trim(employees.name)) = v.name
  AND (employees.email IS NULL OR employees.email = '');

-- Lisa Brier's team is known from her signature (SRVP of Human Resources)
UPDATE employees SET team = 'HR'
WHERE lower(trim(name)) = 'lisa brier' AND (team IS NULL OR team = '');

-- ── Backfill submission emails from the roster ───────────────────────────────
-- Joins on name; the aliased spellings are handled explicitly below.
UPDATE submissions s SET email = e.email
FROM employees e
WHERE s.email = '' AND e.email <> ''
  AND lower(trim(s.name)) = lower(trim(e.name));

UPDATE submissions SET email = v.email
FROM (VALUES
  ('kvelums',   'jkvelums@vcnyhome.com'),
  ('samantha',  'SamanthaSingh@vcnyhome.com'),
  ('yara',      'YBarot@vcnyhome.com'),
  ('yael',      'ychamay@vcnyhome.com')
) AS v(name, email)
WHERE lower(trim(submissions.name)) = v.name AND submissions.email = '';

-- ── NOT backfilled — resolve these by hand ───────────────────────────────────
-- Sukhdeep Singh:  the recipient list has SChhatwal@vcnyhome.com, which may or
--                  may not be him. Confirm before setting.
-- Toby Joe Cohen:  both tcohen@ and tobycohen@ exist; tobycohen@ is presumably
--                  the CEO. Confirm which belongs to the Pet Production Toby.
-- ehelwani@ / Asasson@: recipients with no matching roster name yet.

-- Check: who's still missing an email?
--   SELECT name FROM employees WHERE email = '' AND active;
