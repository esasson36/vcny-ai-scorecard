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
- **Click a tool average to filter submissions.** On the Submissions tab, clicking
  an "Avg ChatGPT / Claude / Perplexity" KPI card filters the submissions list to
  just the people who used that tool; the active filter shows as a removable chip
  next to the "Submissions" heading. Click the card again or the chip to clear.
- **Team vs Team remembers your picks.** The two team selections now persist when
  you switch to another tab and back (state lifted to the panel, like the
  month-comparison picks), instead of resetting to the first two teams.
- **Cost / ROI view** (new "Cost" admin tab). Enter each tool's **per-user
  (per-seat) cost** and see active users, computed monthly spend (cost × active
  users), and average grade for the latest month, with a status flag (Strong /
  Moderate / Low ROI, or "no active users — review"). The footer shows total
  monthly spend and projected yearly spend (× 12). Supports keep/cut decisions.
  - **Migration required:** run `migrations/add-tool-costs.sql` in Supabase
    (creates a `tool_costs` table). Costs aren't editable until it exists.
- **AI executive summary in the Word report.** The "↓ Report" download now opens
  with a 3–4 sentence executive summary written by Claude (`claude-opus-4-8`) —
  overall adoption, standout teams/tools, and who/what needs attention — generated
  from the same aggregates the report already computes. The button shows
  "Generating…" while it runs.
  - **Requires** the `ANTHROPIC_API_KEY` env var in Render. Without it the report
    still downloads, just without the summary paragraph (the rest is unchanged).
  - Implemented as an admin-only `POST /api/report-summary` route so the API key
    stays server-side; the client sends only aggregate stats, never raw data.

## 2026-06-25 — Slimmed the Word report; Teams sorted by activity

- **Teams view is now ordered by submission count** (most submissions first, with
  an alphabetical tiebreak) instead of alphabetically — so the most active teams
  surface at the top.
- **Word report now uses a proper page section** (`@page Section1` + a wrapping
  `div.Section1`) so Word applies even 1-inch margins on all sides. Previously the
  body margin was ignored by Word and the content sat off-center.

### Slimmed the Word report

- **The Word audit report is now a focused one-pager.** It shows only three
  sections: a **Leaderboard** (Top 3 and Bottom 3 by overall score, with their
  actual rank position), **Cost & ROI**, and **Not Yet Submitted**. The previous
  full sections (Overview KPIs, Grade Distribution, full roster, By Team,
  Qualitative Feedback, Best Performers / Needs Improvement lists) were removed
  from the report — that detail still lives in the admin dashboard and the
  multi-sheet Excel export. (If there are 6 or fewer submitters, the report shows
  a single combined leaderboard instead of a top/bottom split.)

## 2026-08-19 — Deletes are now recoverable

Context: an accidental "Clear all" permanently destroyed roughly 20+ submissions.
The button hard-deleted every row behind a single one-click `OK`, with no backup
(Supabase free tier has none) and no undo. These two changes make that
unrepeatable.

- **Soft delete.** Deleting a submission — individually or via "Clear all" — no
  longer removes the row. It stamps a new `archived_at` column; archived rows are
  hidden from every read path (dashboard, exports, reports, duplicate checks) but
  stay in the table.
- **Recently deleted panel** in Settings lists everything archived, with
  **Restore** per submission and **Restore all**. Permanent removal is available
  only one already-archived row at a time, behind its own confirm — there is no
  bulk hard-delete path left in the app.
- **"Clear all" now requires typing `DELETE ALL`.** A stray click or a reflexive
  Enter on a confirm dialog can't trigger it. The server enforces this too:
  `DELETE /api/submissions` rejects the request unless the body carries
  `{ confirm: "DELETE ALL" }`, so the guard can't be bypassed from the client.
- New admin routes: `GET /api/submissions-archived`,
  `POST /api/submissions-archived/:id/restore`,
  `POST /api/submissions-archived/restore-all`,
  `DELETE /api/submissions-archived/:id` (purge one archived row).
- **Migration required:** `migrations/add-archived-at.sql`
  (`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS archived_at timestamptz`).
  Must be run *before* deploying this change, or reads referencing the new column
  will fail. Applied to production on 2026-08-19.

## 2026-08-24 — Backup & restore

Supabase's free tier keeps no backups, so until now the only copy of the data was the
one in the database. Two submissions from 2026-08-19 (including Lisa Brier's, confirmed
by her email reply at 17:05 UTC that day) were lost with no way to get them back. This
adds an off-database copy that can be loaded straight back in.

- **Settings → Backup & restore**, with a live count of what a backup would contain
  (active submissions plus anything sitting in Recently deleted).
  - **Download backup** — one `.xlsx` holding every submission verbatim, archived rows
    included, plus a Reference sheet with headcounts, tool costs, and the employee list.
  - **Restore from file** — accepts a backup `.xlsx` or `.json` and puts back whatever
    is missing.
- **Restore is additive and cannot destroy data.** Rows whose `id` already exists are
  skipped, never overwritten, and nothing is ever deleted. Worst case a restore does
  nothing; it can't make things worse.
- The **↓ Excel** export gained a sixth **Raw Data** sheet. The other five sheets are
  calculated views that can't be loaded back — this one uses the database's own column
  names and is what a restore reads. So an everyday Excel export now doubles as a
  working backup, whichever month filter is selected (the raw sheet always holds
  everything).
- New admin routes: `GET /api/backup` (full snapshot),
  `POST /api/restore` (requires `{ confirm: "RESTORE" }`, same server-side gate pattern
  as Clear all). Restore input is sanitised to known columns and capped at 20,000 rows.
- Raised the JSON body limit to 5 MB — a restore posts every submission at once and the
  Express default of 100 KB was too small.
- No migration needed.

**Verified:** full Excel round-trip (export → re-read → server sanitiser) preserves
embedded quotes, commas, newlines, nested tool JSON, and the archived flag.

## 2026-08-24 — Admin sidebar: challenges + team comparison

New right-hand sidebar in the admin panel, visible on every tab (mockup approved
before building). Main content keeps its layout in a left column; the sidebar
holds two cards:

- **Challenges** — this month's free-text challenge comments, newest first, top 4
  with a "show all" toggle. Each quote carries small colored dots for the tools
  that person rated on the form (ChatGPT green, Claude rust, Perplexity teal).
- **Overall comparison** — the Team vs Team radar chart, with two compact team
  dropdowns right in the card. They read and write the same state as the
  Team vs Team tab, so changing teams in either place changes both.

Minimize with the − button in the sidebar's corner; a + handle at the bottom-right
edge brings it back. The choice is remembered per browser. When minimized the page
returns to its original 760px centered layout; on narrow windows the sidebar drops
below the main content.

## 2026-08-24 — First-name submitters resolved

Samantha, Yara, and yael submitted without surnames, so they could not be
matched to the roster and would have kept the export blocked. Elie identified
them: added `samantha → Samantha Singh`, `yara → Yara Barot`, and
`yael → Yael Chamay` to `NAME_ALIASES` (all three match their vcnyhome.com
addresses). Aliases beat editing the submission rows because they also catch
the same person typing just their first name again in any future month.

## 2026-08-24 — Roster duplicates fixed at the source; consistency sweep

The new Roster screen showed every name four times. Root cause: the employees
table physically holds each person ~4 times (since June), and the June fix
deduplicated at read time in `getEmployees()` — hiding the problem instead of
solving it. The new `getRoster()` read the table directly, so the duplicates
showed straight through.

- **Migration `dedupe-employees.sql`**: normalises whitespace in names, deletes
  the duplicate rows, and adds a case-insensitive unique index so duplicates can
  never come back. Safe to run twice. Applied to production on 2026-08-24;
  confirmed each name now appears once.
- `getRoster()` also dedupes defensively (merging whichever copy has an email or
  team filled in), so the UI is correct even before the migration runs.
- **Roster "Add" was broken on arrival**: `upsert(..., { onConflict: "name" })`
  errors in Postgres unless `name` has a unique constraint — which it could not
  have while duplicates existed. Saving is now delete-then-insert, which needs no
  constraint, treats "jane yang" and "Jane Yang" as the same person, and
  collapses any lingering duplicates of a row whenever it is saved. Deleting a
  roster entry is case-insensitive for the same reason.

Sweep of everything else that no longer made sense:

- **The AI executive summary was still fed the old numbers** — average-based
  grades and the fuzzy employees count — so the summary paragraph could
  contradict the report body it sits on top of (it would still have called Alina
  Soler a D). Its stats now come from the same model as every table below it,
  including the ranking rule, seat gaps, revocations, and unmanaged-account
  candidates (marked as needing human confirmation).
- Removed the dead `tool_costs` query and mutation, plus leftover helpers that
  only existed to feed the old stats block (`personData`, `gradeCounts`,
  `byTeam`, `rosterSorted`, the fuzzy `nameSubmitted`, `TOOLS_MAP`, `gradeBg`,
  `gradeOrder`).
- Left alone on purpose: the dashboard's "Not yet submitted" first-name matching
  (the June fix for people who submit as just "Caitlin") — it is a display aid.
  The report itself uses exact roster matching and blocks export on mismatches,
  which is the stricter guarantee.

## 2026-08-24 — Report rebuilt around a single model (CH-01 … CH-11)

The August workbook and audit report were patched into shape each month, which
meant every defect regenerated in September. All of the below lands in the
**generator**, not the output files. Every number in both outputs is now read
from one module, `client/src/lib/report-model.ts`, so the workbook and the Word
report cannot disagree and a fix lands in both at once.

### The ROI model was measuring price, not usage (CH-01, CH-02)

`Est. Hrs Saved/Mo ÷ Active Users` came out to **17.32 for all three tools**. The
only thing separating Perplexity's multiple from the others was its $40 price —
the ROI column was an inverted price tag.

- Reported time buckets now map to weekly-hour midpoints and are **deduplicated**:
  nine people claimed the same saved hours against 2–3 tools, inflating the total
  by 35% (890 vs 671 hrs/mo). Each person is capped at their single highest claim,
  split across their tools in proportion to what they claimed.
- Hours per user is now **20.51 / 15.42 / 7.02**, not a flat constant.
- Spend is modelled from **paid seats**, not survey respondents. New columns:
  Paid Seats, Measured Users, Unmeasured Seats, Unmeasured Spend — the last being
  what we pay for seats nobody reported using.
- Hourly rate and weeks-per-month became named inputs, labelled **unloaded wage,
  not fully-loaded cost**. A **realization sensitivity** table shows ROI at 100%,
  70%, and 50% of claimed hours rather than inventing one haircut number.
- Every hours and value figure now carries "self-reported, gross, unvalidated".

### A power user was being reported to the CEO as the worst adopter (CH-03, CH-04)

Averaging a person's score across tools penalised them for holding seats they
never used. **Alina Soler ranked 26th of 26 and appeared in the report's Bottom 3
despite scoring 90% on ChatGPT** — she was last only because she also held unused
Claude (30%) and Perplexity (20%) seats.

- The leaderboard now ranks on **best tool**. Alina moves 26th → 7th. Ties break
  on total allocated hours saved, then alphabetically; the rule is printed on the
  sheet. `Portfolio Avg %` is kept as a labelled reference column, never ranked on.
- New **Seat Actions** sheet keyed off each tool's own score: Keep (≥65%),
  Keep + coach (50–64%), Revoke seat (<50%). Four revocation candidates fall out,
  summed into an "immediate monthly savings" figure. Coaching keys off best-tool
  score only, so nobody lands on both lists for the same reason.

### Counts on page 1 were wrong (CH-05)

The report header read `NOT YET SUBMITTED · 11 OF 22` — 26 people had submitted,
and "22" appeared nowhere in the data.

- New **Roster** (name, email, team, active) is the single source of truth for
  headcount. The header now reads "X submissions from Y of Z people", three
  distinct numbers all sourced from the roster.
- Names are normalised on ingest, and a `NAME_ALIASES` map resolves "Kvelums" to
  "Jackie Kvelums" (previously counted as both a submitter and a non-submitter).
  Normalisation capitalises only all-lowercase words, so "thomas lucio" is fixed
  without turning "Danielle DeLavan" into "Danielle Delavan".
- **Export is blocked** when a submitted name doesn't resolve against the roster,
  with the unmatched names listed. Settings offers one click to add them.

### Unmanaged accounts — the finding that wasn't in the report (CH-06)

Two people described running company work through personal AI accounts, one of
whom didn't know a company account existed. Contract review and royalty-term
extraction are running through these tools.

- New **Unmanaged Accounts** section, placed above Cost & ROI, listing name, team,
  tool, and the verbatim quote, paired with the non-respondent list.
- Matches are **flagged for human review, never auto-classified** — keyword
  matching produced a real false positive in testing (a request for a tool, not
  current use of one).

### Credibility cleanup (CH-07, CH-08, CH-10, CH-11)

- **Team grades suppressed where n < 3.** Eleven of fourteen teams have a single
  respondent; "Marketing = D" was one person. Only Design (7), Merchandising (5),
  and Sales (3) now carry a published grade; the rest show `n=1 — not
  statistically meaningful`.
- **Grade bands defined once** in `GRADE_BANDS`, applied identically at row,
  person, and team level, with a visible legend. See the note below on CH-08.
- **Scorecard owner disclosed** and excluded from the ranked list.
- **`&MIDDOT;` / `&AMP;` fixed.** The cause was `sectionHead` calling
  `.toUpperCase()` on the whole label, which uppercased the HTML entities too.
  Uppercasing now skips entities.
- **Methodology & Limitations** block added to both outputs, stating what the
  score does and does not measure (CH-09 — documented, scoring unchanged so
  month-over-month comparability survives).

### Verification suite

`npm run verify` runs all twelve assertions from the spec against a real exported
workbook. Assertion 9 is the regression test for CH-01: if hours-per-user ever
goes flat again, it fails.

### Two deviations from the spec, both deliberate

- **CH-08 grade bands left unchanged.** The spec inferred the bands as
  `A ≥80, B 65–79, C 50–64, D 40–49, F <40` and cited Maria Ingles (48% = C) next
  to Alina Soler (47% = D) as evidence of an inconsistent boundary. The actual
  bands in the code are `A ≥80, B ≥64, C ≥48, D ≥32, F <32` — under which both
  gradings are correct and consistent, so there was no boundary bug. Adopting the
  suggested bands would have changed exactly one person's grade, demoting Maria
  Ingles from C to D, and would have broken the month-over-month comparability
  CH-09 asks us to preserve. The *requirement* of CH-08 — one definition, applied
  everywhere, with a visible legend and a documented tiebreak — is implemented.
  Changing the numbers is now a one-line edit to `GRADE_BANDS`.
- **`normalizeName` is not a blanket title-case**, for the reason given above.

### Cost tab now shares the model, with paid seats entered on-screen

The Cost & ROI tab was still counting respondents and using the old flat-hours
maths, so the screen and the export disagreed. It now reads the same model as
both outputs.

- **Paid seats and cost per seat are entered directly in the Cost tab.** Only 26
  of the roster answered the survey, so counting respondents undercounts what we
  actually pay for — the seat count has to be typed in.
- Each tool shows measured users, **unmeasured seats**, and what those unused
  seats cost per month and per year. A tool with more respondents than seats is
  flagged red, since that means people are on personal accounts.
- Realization sensitivity and the seats-to-revoke list (with monthly savings) are
  shown on screen, not just in the export.
- `tool_costs` is superseded by the `seats` table. The migration copied the
  existing per-user costs across and the table is still backed up; nothing in the
  UI reads it any more.

### Safe to deploy before the migration

`getRoster()` and `getSeats()` fall back to the pre-migration schema rather than
erroring, so the deploy and the SQL can land in either order. Until the migration
runs, seats read as empty and the export stays blocked with a message naming what
is missing — the app keeps working, it just will not publish an unreconciled report.

### Migration required

`migrations/add-seats-and-roster.sql` — creates the `seats` table and adds
`email` / `active` to `employees`. Applied to production on 2026-08-24. Paid seats seed to
0 on purpose: 0 is visibly unset and trips validation, whereas a guessed number
would ship as if it had been reconciled.

### Also

- `tsconfig.json` had no `target`, so `tsc` assumed ES5 and reported 27 spurious
  `downlevelIteration` errors — `npm run check` had never passed. Setting
  `target: ES2020` brings it to **zero errors**.
- Backups now include the roster and seats alongside submissions.

### Required environment variables (Render → Environment)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key |
| `ADMIN_PASS` | Admin password — **required in production**, server won't boot without it |
| `ADMIN_USER` | Admin username (optional, defaults to `elie`) |
| `SESSION_SECRET` | Signs session cookies; keeps admin logins valid across redeploys |
| `ANTHROPIC_API_KEY` | Optional — enables the AI executive summary in the audit report. Without it the report downloads without the summary |

### Still to do

- Fill in each employee's team in the `employees` table (enables exact per-team
  response rates) — waiting on the team assignments list
