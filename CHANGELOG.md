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
-- + merged Lisa Brier's three per-tool submissions into one
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
