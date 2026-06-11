# Changelog

All notable changes to the VCNY AI Scorecard.

## 2026-06-11

### Security hardening (`fa161bd`)

**Critical fixes**
- **Removed hardcoded admin password fallback.** The source previously fell back to a
  password that was visible in this public repo. The server now refuses to start in
  production unless the `ADMIN_PASS` environment variable is set.
- **Removed hardcoded session secret fallback.** The previous fallback string was also
  public, which would have allowed anyone to forge an admin session cookie and bypass
  login entirely. If `SESSION_SECRET` is unset, the server now generates a random
  per-boot secret and logs a warning.
- **Scrubbed real credentials from `.env.example`.** The example file contained the
  actual admin username/password as "sample" values. Replaced with placeholders.
  ⚠️ The old values remain in git history — the admin password was rotated as a result.

**Hardening**
- Added **helmet**: Content-Security-Policy (self + Google Fonts only), HSTS,
  `frame-ancestors 'none'` (clickjacking), MIME-sniffing protection, and more.
  CSP is disabled in dev so Vite HMR still works.
- Added **rate limiting** (`express-rate-limit`):
  - Login: 10 attempts / 15 min per IP (blocks password brute-forcing)
  - Public form: 50 submissions / 15 min per IP (blocks spam, roomy for one office NAT)
- **Removed the CORS middleware.** It was configured as `origin: true` +
  `credentials: true`, which reflects any website's origin with cookies allowed.
  The app is fully same-origin, so CORS is unnecessary.
- Session cookie hardened: `secure` flag in production, explicit `httpOnly`,
  `trust proxy = 1` for Render's TLS-terminating proxy.
- **Timing-safe credential comparison** (`crypto.timingSafeEqual` over sha256 digests).
- Error handler no longer leaks internal error messages (DB errors, etc.) on 5xx
  responses in production.
- **Input length caps**: form schema (name ≤ 100, team ≤ 60, free text ≤ 2000) and
  the admin PATCH endpoint (notes ≤ 5000).

**Dependency cleanup**
- Removed unused packages: `better-sqlite3`, `passport`, `passport-local`, `ws`,
  `bufferutil`, `cors` (+ their `@types`). Smaller attack surface — and local
  `npm install` / `npm run build` work on Windows again (`better-sqlite3`'s native
  build was the blocker).
- `npm audit`: 0 known vulnerabilities.
- `.claude/` added to `.gitignore`.

**Required environment variables (Render → Environment)**
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key |
| `ADMIN_PASS` | Admin panel password — **required in production**, server won't boot without it |
| `ADMIN_USER` | Admin username (optional, defaults to `elie`) |
| `SESSION_SECRET` | Signs session cookies; set to a long random string so admin logins survive redeploys |

### UI/UX upgrade, round 3 (`b2b06a0`)

**Submit form**
- Editorial numbered section badges: 01 *Your details* / 02 *Rate your tools* /
  03 *In your own words*
- Staggered fade-up entrance for header and cards on page load
- "Takes about 2 minutes" subtitle under the heading
- Submit button arrow slides right on hover
- Slider rows compact on mobile (narrower columns, smaller text)
- Warning/error banners pop in instead of appearing instantly

**Admin panel**
- Smooth view transitions — content fades up when switching tabs or opening a submission
- Submission cards cascade in with staggered delays (capped at 300 ms)
- Clickable cards (submissions, teams) lift on hover with a soft shadow
- KPI row wraps to 2×2 on mobile instead of cramming 4 across
- Empty states show an inbox icon
- Login page fades in; login error banner pops in

**Bug fixes (caught by type-check)**
- Page heading rendered blank on the Team vs Team tab (`viewTitle` was missing the
  `teamcompare` entry)
- `createSubmission` row now includes the `notes` field

### UI/UX polish, rounds 1–2 (`0805938`, `99605b8`, `0edb3db`)

**Submit form**
- Tool checkboxes replaced with clickable branded cards (color dot + name +
  animated checkmark)
- Slider track fills with the tool's brand color up to the thumb
- Slider value labels color-code red → amber → green by score
- Focus glow ring on all inputs/textareas/selects
- Success screen animates in ("All done!" with pop-in checkmark)

**Admin panel**
- Nav tabs restyled from underline to pill chips (active tab gets solid fill)
- Grade letters render as soft colored badges everywhere (A green, B lime, C amber,
  D orange, F red) — KPI row, submission list, leaderboard, detail view
- Each submission row shows its overall grade badge for at-a-glance scanning
- Leaderboard progress bars animate in from zero
- Response-rate bars animate their fill over 700 ms
- KPI cards lift on hover

### Features (earlier today)

- **Admin notes per submission** — private notes textarea on the detail view,
  saved to a new `notes` column (`ALTER TABLE submissions ADD COLUMN notes`)
- **Edit name/team from the admin detail view**, including custom "Other" team names
- **Team vs Team comparison view** — month filter, two team pickers, per-tool grade
  table, metric breakdown
- **"Not yet submitted" dashboard section** — cross-references the new `employees`
  table (23 people) against the current month's submissions
- **Auto-derived response rate** — team headcounts grow organically from submission
  history; no manual entry
- **Clickable team cards** — drill into all submissions for a team
- **"Other" team text input** on the public form (and in admin edit mode)
- **CSV export respects the selected month** (fixed `useMemo` → `useEffect` bug that
  exported everything)

### Database migrations run (Supabase SQL Editor)

```sql
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
CREATE TABLE IF NOT EXISTS employees (id serial PRIMARY KEY, name text NOT NULL, team text NOT NULL DEFAULT '');
-- + INSERT of 23 employee names (teams to be filled in later)
```

### Still to do

- Fill in each employee's team in the `employees` table (enables accurate per-team
  response rates) — waiting on the team assignments list
