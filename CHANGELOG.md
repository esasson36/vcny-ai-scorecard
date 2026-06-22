# Changelog

Complete history of the VCNY AI Scorecard, oldest first, so you can trace when each
change happened. Commit hashes are included for cross-referencing with `git log`.

---

## 2026-06-08 — Repo created, Supabase migration, first fixes

The app itself (v2.0) was built before this repo existed; the first commit imports it
whole: public scorecard form (ChatGPT / Claude / Perplexity, rated on frequency, time
saved, impact, and adoption), admin dashboard with A–F grades, leaderboard,
month-vs-month comparison, teams view with trend chart, per-person trend pages, CSV
export, printable scorecards, and a settings page.

- **`2eec5c3` (09:02)** — Initial import + fix: prepend a UTF-8 BOM to CSV exports so
  Excel renders dashes correctly instead of mojibake (e.g. "1–3 hrs" → "1â€"3 hrs").
- **`b7ba76e` (10:28)** — **Migrated storage from SQLite to Supabase (Postgres).**
  Render's disk is ephemeral, so the SQLite database was wiped on every deploy —
  submissions now persist. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` env vars.
- **`4a17588` (11:27)** — Renamed the "Leadership" team to "Executive"; fixed the
  print view producing a blank page.
- **`673f877` (11:30)** — UX: made the entire submission card clickable in the admin
  list, not just the "View" button.
- **`44b61d8` (11:45)** — Added README and `.env.example`; removed dead
  `drizzle.config.ts`.

## 2026-06-09 — Feature day: teams, tracking, comparisons, notes

### Morning–afternoon: features and fixes

- **`bb408cf` (14:03)** — Added **HR and Sales** to the team options on the form.
- **`7f8aef0` (14:09)** — Moved admin credentials to env vars (`ADMIN_USER` /
  `ADMIN_PASS`); **CSV export now respects the selected month filter**; added ↑/↓
  trend indicators next to names in the submission list.
- **`b78009c` (14:20)** — Fixed the month filter never actually defaulting (a
  `useMemo` was calling `setState`, which React doesn't reliably run — switched to
  `useEffect`). This was why CSV exports included everything.
- **`c1a5cef` (14:26)** — Choosing team "Other" on the form now requires typing a
  team name (text input appears below the dropdown).
- **`085524f` (14:43)** — Three features in one:
  - **Edit name/team** from the admin detail view
  - **Admin notes per submission** (private textarea, saved to a new `notes` column)
  - **Team vs Team comparison view** (month filter, two team pickers, per-tool grade
    table, metric breakdown)
- **`684baa9` (14:46)** — **Employee list + "Not yet submitted" tracker**: new
  `employees` table (23 people) cross-referenced against the current month's
  submissions on the dashboard.
- **`e455dfc` (14:48)** — **Response rate is now fully automatic** — team headcounts
  derive from submission history (every unique person who ever submitted for a team
  counts toward that team's total). No manual headcount entry.
- **`fe753f2` (15:04)** — Team cards are clickable — drill down to all of a team's
  submissions, preserving the month filter.
- **`3038e83` (15:25)** — Fixed the "Other" team text input not appearing in the
  admin edit mode.

**Database migrations run in the Supabase SQL Editor this day:**

```sql
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
CREATE TABLE IF NOT EXISTS employees (id serial PRIMARY KEY, name text NOT NULL, team text NOT NULL DEFAULT '');
-- + INSERT of the 23 employee names (team assignments still pending)
-- + merged one employee's three per-tool submissions into a single submission
```

### Afternoon–evening: UI/UX overhaul (3 rounds)

- **`0805938` (15:49) — Round 1**
  - Tool checkboxes on the form replaced with clickable branded cards (color dot,
    name, animated checkmark)
  - Slide-down animation when a tool's rating section appears
  - Success screen animates in ("All done!" with pop-in checkmark)
  - Slider value labels color-coded by score; KPI cards lift on hover;
    response-rate bars animate their fill; submit button press feedback
- **`99605b8` (16:04) — Round 2**
  - Grade letters render as soft colored pill badges everywhere (A green, B lime,
    C amber, D orange, F red) — KPI row, submission list, leaderboard, detail view
  - Each submission row shows its overall grade badge for at-a-glance scanning
  - Nav tabs restyled from underline to pill chips with solid active fill
  - Slider track fills with the tool's brand color up to the thumb
  - Leaderboard bars animate in from zero; focus glow ring on all form fields
- **`0edb3db` (16:15)** — Slider labels use red (not grey) for low values:
  red → amber → green.
- **`b2b06a0` (16:43) — Round 3**
  - Editorial numbered sections on the form: 01 *Your details* / 02 *Rate your
    tools* / 03 *In your own words*; "Takes about 2 minutes" subtitle
  - Staggered fade-up entrance on page load; submit button arrow slides on hover
  - **Admin: smooth view transitions** — content fades up when switching tabs;
    submission cards cascade in; clickable cards lift with soft shadow
  - KPI row wraps 2×2 on mobile; slider rows compact on phones; inbox icon on
    empty states; login page polish
  - **Bug fixes caught by type-check**: page heading rendered blank on the Team vs
    Team tab (`viewTitle` missing the entry); `createSubmission` missing the
    `notes` field

## 2026-06-11 — Security hardening

- **`fa161bd` (08:48)** — Full security pass:

  **Critical**
  - **Removed the hardcoded admin password fallback** (was publicly visible in this
    repo). Production now refuses to boot without the `ADMIN_PASS` env var.
  - **Removed the hardcoded session secret fallback** (also public — would have let
    anyone forge an admin session cookie and bypass login entirely). Unset
    `SESSION_SECRET` now falls back to a random per-boot secret with a warning.
  - **Scrubbed real admin credentials out of `.env.example`** — they were committed
    as "example" values. ⚠️ Old values live forever in git history, so the admin
    password was rotated in Render the same day.

  **Hardening**
  - **helmet**: CSP (self + Google Fonts only), HSTS, `frame-ancestors 'none'`
    (clickjacking), MIME-sniff protection. CSP off in dev for Vite HMR.
  - **Rate limiting**: login 10 attempts / 15 min per IP; public form 50
    submissions / 15 min per IP.
  - **Removed the CORS middleware** — it reflected any origin with credentials
    allowed; the app is same-origin so CORS was pure attack surface.
  - Session cookie: `secure` in production, explicit `httpOnly`,
    `trust proxy = 1` for Render's TLS proxy.
  - Timing-safe credential comparison (`crypto.timingSafeEqual`).
  - 5xx responses no longer leak internal error details in production.
  - Input length caps: form (name ≤ 100, team ≤ 60, free text ≤ 2000), admin
    PATCH (notes ≤ 5000).

  **Cleanup**
  - Removed unused deps: `better-sqlite3`, `passport`, `passport-local`, `ws`,
    `bufferutil`, `cors` (+ `@types`). Also fixes `npm install` / `npm run build`
    on Windows (better-sqlite3's native build was the blocker).
  - `npm audit`: 0 known vulnerabilities. `.claude/` gitignored.

  **Render environment updated the same morning**: new `ADMIN_PASS` (old one
  rotated — it was burned in git history) and a strong random `SESSION_SECRET`.

- **`3947d44` (08:58)** — Added this changelog.
- **`b3a03b9`** — Rewrote the changelog chronologically with the full project
  history and dates.

## 2026-06-12 — Repo made public, duplicate-employees fix

- **Pre-publication security sweep** — audited the entire git history before
  flipping the repo to public: no Supabase keys, JWTs, `.env` files, or database
  files ever committed; only the already-rotated admin password / session secret
  exist in old commits (dead credentials). Removed an employee's name from the
  changelog (`6d60036`).
- **Repository made public** on GitHub.
- **`0589ece`** — Fixed the "Not yet submitted" list showing each person multiple
  times. Root cause: the employees INSERT script had been run several times and the
  table had no unique constraint, so every run added all 23 names again. Fix was
  two-part:
  - Supabase SQL: deleted duplicate rows and added a `UNIQUE (name)` constraint so
    re-running an insert errors instead of silently duplicating
  - Server: `getEmployees()` now de-duplicates by name as a safety net, so doubles
    can never render regardless of table state

## 2026-06-16 — Submission matching fix, audit report, coaching tips

- **`b304d5a`** — Fixed the "Not yet submitted" list missing people who submitted
  with only their first name (e.g. "Caitlin" not matching "Caitlin Smith"). Added
  a first-name fallback: if the first word of the employee name matches the first
  word of any submission name (and is longer than 2 characters to avoid false
  positives), they count as submitted.

- **`3062735` → `a904a70`** — **Audit Report button** added to the admin header
  next to "↓ CSV". Clicking "↓ Report" downloads a Word-compatible `.doc` file
  containing:
  - Overview KPIs (submissions, response rate, avg grade, teams)
  - Grade distribution (A/B/C/D/F counts)
  - Full roster table sorted A → F with per-tool grades and recommendations
  - Per-team breakdowns with member lists
  - Qualitative feedback (use cases and challenges) for anyone who filled them in
  - Not-yet-submitted list
  
  The file opens in Word and prints cleanly. HTML tables are used throughout
  (not CSS grid/flex) for Word compatibility.

- **`9deee76` → `baefc34`** — **Coaching tips on the success screen** for lower
  scorers. After submitting, the app silently calculates the average score. If it
  falls below a B (64%), a tip card appears on the "All done!" screen with 3
  randomly selected, actionable tips. Tips are:
  - **Tool-specific** — only tips for tools the person actually rated
  - **Team-specific** — each of the 7 teams has its own tip bank per tool
  - **126 tips total** (6 per tool × team combination, 3 shown at random)
  - Tips for unknown/custom teams fall back to the generic "Other" bucket
  - No score or grade is shown — tips are framed as "ways to get even more from AI"
  - A/B scorers see the standard success screen with no tip card

### Later that day — scoring scale fix

- **Grades now use a consistent /20 scale for everyone.** Previously a grade was
  scored out of 25 when an admin had entered a "message volume" value (from
  ChatGPT usage exports) and out of 20 when they hadn't — so people were graded on
  different scales depending on whether that optional field was filled. Grades are
  now always computed from the four self-reported dimensions (Frequency, Time
  saved, Impact, Adoption), normalized to a percentage.
- **Message volume removed from the UI.** It was first made reference-only and
  ChatGPT-only, then pulled from the interface entirely while we reconsider what
  objective metric (if any) is worth tracking — raw message count (~10 to 400+)
  isn't a measure of *quality* of use. The admin input and the CSV "Output Volume"
  column are gone. The underlying data, the `outputVolume` schema field, and the
  `/api/submissions/:id/ov` route are intentionally left intact, so existing
  values are preserved and re-enabling it later is a frontend-only change.

## 2026-06-18 — Manifast & Plaude feedback tools

- **Added two new AI options to the form: Manifast and Plaude.** Unlike
  ChatGPT/Claude/Perplexity (which share the four-slider → A–F grade model),
  these are **product-evaluation surveys** with their own questions and 1–10
  scales. They are deliberately **not graded** and stay out of the A–F grades,
  KPIs, leaderboard, and team averages.
  - **Manifast:** "Rate the current product" (1–10), "Rate its potential" (1–10),
    and an open questions/comments box.
  - **Plaude:** "Rate this product" (1–10), "Time saved/week" (None → 10+ hrs
    scale), "Will you keep using it?" (Yes / Maybe / No), and "Who would you
    recommend this for?" (text).
- **Stored separately.** A new `feedback` column on `submissions` holds this data
  as JSON, completely separate from the graded `tools` blob, so the entire
  grading pipeline is untouched. A submission is now valid with *either* graded
  tools *or* feedback (someone can submit Plaude feedback without rating any of
  the three core tools).
- **Admin surfacing.** Feedback-only submissions show a "Feedback" tag instead of
  a grade in the submissions list; each submission's detail view shows the full
  Manifast/Plaude responses; and a new **Product feedback** section on the
  dashboard collects every Manifast/Plaude response for the selected month in one
  place.
- **Migration required:** run `migrations/add-feedback-column.sql` in the Supabase
  SQL Editor (`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS feedback text
  DEFAULT ''`). Until the column exists, submissions that include feedback will
  fail to save.

## 2026-06-22 — Leaderboard polish, team-name fix & insight features

- **`2bfdaf4` → `2cce83a`** — **Clickable leaderboard rows.** Clicking anywhere on
  a person's row (This month, All time, or Most improved) now opens their most
  recent submission in scope. Rows highlight on hover; the "Trend" button still
  jumps to the multi-month trend view independently.
- **`2e87beb`** — **Team-name casing is normalized on submit** to prevent
  capitalization-only duplicate teams (e.g. "AI" vs "Ai" vs "ai"). When a
  submitted team matches an existing team — or a standard dropdown team —
  case-insensitively, it snaps to that canonical casing (standard teams take
  priority, so free-text "hr" becomes "HR"). Existing rows are untouched and
  admin edits remain authoritative.
- **Submission streaks.** A 🔥 badge shows how many consecutive months a person
  has submitted (e.g. "🔥 3"), on both the dashboard submission cards and the
  leaderboard. A missed month resets the streak.
- **"Needs attention" section** on the dashboard automatically flags people who
  scored a D/F this period or dropped 10%+ from their previous submission, with
  the reason and a click-through to their submission — so coaching candidates
  surface without hunting.
- **Tool adoption trend chart** on the dashboard (shown once there are 2+ months):
  a line chart of how many people used each of ChatGPT / Claude / Perplexity per
  month, for tracking adoption over time.
- **Cost / ROI view** (new "Cost" admin tab). Enter each tool's monthly license
  cost and see active users, cost-per-active-user, and average grade for the
  latest month, with a status flag (Strong / Moderate / Low ROI, or "no active
  users — review") plus total monthly spend. Supports keep/cut decisions directly.
  - **Migration required:** run `migrations/add-tool-costs.sql` in Supabase
    (creates a `tool_costs` table). Costs aren't editable until it exists.

### Required environment variables (Render → Environment)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key |
| `ADMIN_PASS` | Admin password — **required in production**, server won't boot without it |
| `ADMIN_USER` | Admin username (optional, defaults to `elie`) |
| `SESSION_SECRET` | Signs session cookies; keeps admin logins valid across redeploys |

### Still to do

- Fill in each employee's team in the `employees` table (enables exact per-team
  response rates) — waiting on the team assignments list
