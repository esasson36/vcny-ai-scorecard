-- Seats and Roster — the two manual inputs the report model needs.
--
-- Cost was previously modelled off survey respondents, which is not a seat count:
-- people who hold a paid seat but never answered contributed $0 of modelled spend.
-- Headcount was likewise derived by arithmetic on submissions, which produced the
-- "11 OF 22" line in the August report. Both now come from tables you control.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the report-model change.

-- ── Seats: reconciled against the subscription admin console, not the survey ──
CREATE TABLE IF NOT EXISTS seats (
  tool           text PRIMARY KEY,          -- 'cgt' | 'cla' | 'per'
  paid_seats     integer NOT NULL DEFAULT 0,
  cost_per_seat  numeric NOT NULL DEFAULT 0,
  billing_owner  text    NOT NULL DEFAULT '',
  as_of          text    NOT NULL DEFAULT '',
  source         text    NOT NULL DEFAULT ''
);

-- Seed from the per-user costs already entered, so nothing is lost. Paid seats
-- start at 0 on purpose: 0 is visibly unset and trips the validation, whereas a
-- guessed number would quietly ship as if it were reconciled.
INSERT INTO seats (tool, paid_seats, cost_per_seat, billing_owner, as_of, source)
SELECT tool, 0, monthly_cost, '', '', 'seeded from tool_costs'
FROM tool_costs
ON CONFLICT (tool) DO NOTHING;

-- ── Roster: the single source of truth for headcount ─────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email  text NOT NULL DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Optional: after deploying, confirm the roster reconciles.
--   SELECT count(*) FILTER (WHERE active) AS active_headcount FROM employees;
