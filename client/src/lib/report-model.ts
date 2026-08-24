// ─────────────────────────────────────────────────────────────────────────────
// Report model — the single place every scorecard number is calculated.
//
// The Excel workbook and the Word report are both rendered straight from the
// object this module returns. Nothing downstream recalculates anything and
// nothing in a template is hardcoded, so the two outputs can never disagree
// and a fix here lands in both.
// ─────────────────────────────────────────────────────────────────────────────
import { TOOLS, TOOL_KEYS, type ToolKey, pctToGrade, calcScore, type ToolScores } from "./scorecard";
import type { Submission } from "@shared/schema";

// ── Named inputs (CH-01) ────────────────────────────────────────────────────
// These were inline literals scattered through the export code. They are now
// declared once, surfaced in the workbook, and editable in one place.

/** Weekly hours implied by each "time saved" level (0–5). Bucket midpoints. */
export const TIME_HOURS = [0, 0.5, 2, 4, 7.5, 12] as const;

/** Average weeks in a month. Surfaced as a named input cell in the workbook. */
export const WEEKS_PER_MONTH = 4.33;

/** Unloaded wage — NOT fully-loaded cost. Labelled as such wherever it appears. */
export const DEFAULT_HOURLY_RATE = 25;

/**
 * Realization sensitivity (CH-01). Self-reported time saved is gross: it excludes
 * prompting and verification overhead. Two respondents flag exactly that, so we
 * publish a range rather than inventing a single haircut number.
 */
export const REALIZATION_LEVELS = [1.0, 0.7, 0.5] as const;

/** The caveat that must accompany every hours and value figure. */
export const HOURS_CAVEAT = "self-reported, gross, unvalidated";

/**
 * Methodology and limitations, printed in both outputs (CH-09, CH-11).
 * The score measures usage intensity, not output quality or business outcome.
 */
export const METHODOLOGY_NOTES = [
  "Score = frequency + time saved + impact + adoption, each 1-5, summed to a maximum of 20. Percentage = score x 5.",
  "The score measures usage intensity. It does NOT measure output quality or business outcome — treat it as an adoption index, not a value index.",
  "Frequency and Adoption overlap substantially, as do Time Saved and Impact, so the 20-point total double-weights how often a tool is used.",
  "Hours saved are self-reported, gross, and unvalidated. They exclude prompting and verification time; respondents flagged verification overhead explicitly.",
  "Hours are deduplicated: people reporting the same saved hours against several tools are capped at their single highest claim, split across tools in proportion to what they claimed.",
  "Hourly rate is an unloaded wage, not a fully-loaded cost. Value figures are therefore not a budget number.",
  "Spend is modelled from paid seats reconciled to the subscription admin console, not from survey respondents.",
  "People are ranked on their best tool. Averaging across tools penalises holding an unused seat, which is a seat-allocation issue rather than an adoption one.",
  "Team grades are suppressed where fewer than three people responded.",
  "Unmanaged-account findings come from keyword matching over free text and require human confirmation before they are treated as fact.",
  "Open for September: consider replacing one scoring dimension with an outcome question, e.g. name one deliverable this tool produced this month.",
];

// ── Seat actions (CH-04) ────────────────────────────────────────────────────
// Keyed off each tool's own score, never off a person's aggregate. "Cancel this
// seat" and "coach this person" are different questions and need different inputs.
export const SEAT_ACTION_BANDS = { keep: 65, coach: 50 } as const;
export type SeatAction = "Keep" | "Keep + coach" | "Revoke seat";

export function seatAction(toolPct: number): SeatAction {
  if (toolPct >= SEAT_ACTION_BANDS.keep) return "Keep";
  if (toolPct >= SEAT_ACTION_BANDS.coach) return "Keep + coach";
  return "Revoke seat";
}

// ── Names (CH-05) ───────────────────────────────────────────────────────────
/** Submitted name → roster name, for people who typed something unmatchable. */
export const NAME_ALIASES: Record<string, string> = {
  "kvelums": "Jackie Kvelums",
  // First-name-only submitters, identified by Elie 2026-08-24. Bare first names
  // are safe as keys while each is unique in the company; if a second Samantha
  // ever joins, replace the bare key with something the form can distinguish.
  "samantha": "Samantha Singh",
  "yara": "Yara Barot",
  "yael": "Yael Chamay",
};

/**
 * Collapse runs of whitespace and capitalise words that were typed all-lowercase.
 *
 * Deliberately NOT a blanket title-case: that would turn "Danielle DeLavan" into
 * "Danielle Delavan". Only fully-lowercase words are touched, which fixes
 * "thomas lucio" and "Jane yang" without damaging names that capitalise mid-word.
 */
export function normalizeName(raw: string): string {
  const collapsed = String(raw ?? "").replace(/\s+/g, " ").trim();
  return collapsed
    .split(" ")
    .map(w => (w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Resolve a submitted name to its roster spelling: alias table, then as-typed. */
export function resolveName(raw: string): string {
  const n = normalizeName(raw);
  return NAME_ALIASES[n.toLowerCase()] ?? n;
}

// ── Unmanaged accounts (CH-06) ──────────────────────────────────────────────
/** Licensed, company-managed tools. Anything else named in free text is a signal. */
export const LICENSED_TOOLS = ["chatgpt", "claude", "perplexity", "manifast", "plaude"];

const PERSONAL_ACCOUNT_PATTERNS = [
  /\bmy own account\b/i,
  /\bmy own access\b/i,
  /\bpersonal account\b/i,
  /\bdidn.?t know there was a company\b/i,
];

const UNLICENSED_TOOL_PATTERNS: { tool: string; re: RegExp }[] = [
  { tool: "Gemini", re: /\bgemini\b/i },
  { tool: "Copilot", re: /\bcopilot\b/i },
  { tool: "Meshy", re: /\bmeshy\b/i },
];

export interface ShadowFlag {
  name: string;
  team: string;
  toolMentioned: string;
  quote: string;
  /** Always false on generation — a human confirms before this reaches the report. */
  reviewed: boolean;
}

// ── Inputs the model needs beyond submissions ───────────────────────────────
export interface SeatRecord {
  tool: ToolKey;
  paidSeats: number;
  costPerSeat: number;
  billingOwner: string;
  asOf: string;
  source: string;
}

export interface RosterEntry {
  fullName: string;
  email: string;
  team: string;
  active: boolean;
}

export interface ModelInputs {
  submissions: Submission[];
  seats: SeatRecord[];
  roster: RosterEntry[];
  hourlyRate: number;
  /** Excluded from the ranked list and reported separately (CH-10). */
  scorecardOwner?: string;
}

// ── Output shapes ───────────────────────────────────────────────────────────
export interface PersonTool {
  tool: ToolKey;
  toolName: string;
  pct: number;
  grade: string;
  scores: ToolScores;
  weeklyClaimed: number;
  weeklyAllocated: number;
  monthlyAllocated: number;
  action: SeatAction;
}

export interface Person {
  name: string;
  team: string;
  tools: PersonTool[];
  bestTool: string;
  bestPct: number;
  /** Kept for reference only — never ranked on (CH-03). */
  portfolioAvgPct: number;
  grade: string;
  seatsHeld: number;
  unusedSeats: number;
  weeklyAllocated: number;
  isOwner: boolean;
}

export interface ToolRollup {
  tool: ToolKey;
  toolName: string;
  measuredUsers: number;
  paidSeats: number | null;
  unmeasuredSeats: number | null;
  costPerSeat: number | null;
  monthlySpend: number | null;
  unmeasuredSpend: number | null;
  monthlyHours: number;
  monthlyValue: number;
  roi: number | null;
  hoursPerMeasuredUser: number;
}

export interface TeamRollup {
  team: string;
  n: number;
  avgPct: number;
  /** null when n < 3 — too few people to publish a grade (CH-07). */
  grade: string | null;
  meaningful: boolean;
}

export interface Validation {
  id: string;
  level: "error" | "warning";
  message: string;
}

// ── The build ───────────────────────────────────────────────────────────────
export function buildReportModel(input: ModelInputs) {
  const { submissions, seats, roster, hourlyRate } = input;
  const owner = input.scorecardOwner ? resolveName(input.scorecardOwner) : "";

  // 1. Submissions → people, with names normalised on ingest
  const people: Person[] = [];
  for (const sub of submissions) {
    let parsed: Record<string, ToolScores> = {};
    try { parsed = JSON.parse(sub.tools || "{}"); } catch { parsed = {}; }
    const keys = Object.keys(parsed).filter(k => (TOOL_KEYS as readonly string[]).includes(k)) as ToolKey[];
    if (keys.length === 0) continue;

    const name = resolveName(sub.name);
    const tools: PersonTool[] = keys.map(t => {
      const scores = parsed[t];
      const pct = calcScore(scores).pct;
      return {
        tool: t,
        toolName: TOOLS[t],
        pct,
        grade: pctToGrade(pct),
        scores,
        weeklyClaimed: TIME_HOURS[scores.time] ?? 0,
        weeklyAllocated: 0, // filled in immediately below
        monthlyAllocated: 0,
        action: seatAction(pct),
      };
    });

    // CH-01 step 2 — cap each person at their single highest claim, then split
    // that cap across their tools in proportion to what they claimed. Nine people
    // reported the same hours against 2–3 tools; summing inflates the total by 35%.
    const cap = Math.max(...tools.map(t => t.weeklyClaimed));
    const claimSum = tools.reduce((a, t) => a + t.weeklyClaimed, 0);
    tools.forEach(t => {
      t.weeklyAllocated = claimSum > 0 ? (t.weeklyClaimed / claimSum) * cap : 0;
      t.monthlyAllocated = t.weeklyAllocated * WEEKS_PER_MONTH;
    });

    const best = tools.reduce((a, b) => (b.pct > a.pct ? b : a));
    people.push({
      name,
      team: sub.team,
      tools,
      bestTool: best.toolName,
      bestPct: best.pct,
      portfolioAvgPct: Math.round(tools.reduce((a, t) => a + t.pct, 0) / tools.length),
      grade: pctToGrade(best.pct),
      seatsHeld: tools.length,
      unusedSeats: tools.filter(t => t.grade === "D" || t.grade === "F").length,
      weeklyAllocated: tools.reduce((a, t) => a + t.weeklyAllocated, 0),
      isOwner: name === owner,
    });
  }

  // 2. Rank on best tool, never on the cross-tool average (CH-03).
  //    Tiebreak: total allocated hours saved descending, then alphabetical.
  const ranked = [...people].sort((a, b) =>
    b.bestPct - a.bestPct ||
    b.weeklyAllocated - a.weeklyAllocated ||
    a.name.localeCompare(b.name)
  );
  const rankedExcludingOwner = ranked.filter(p => !p.isOwner);

  // 3. Per-tool rollup, costed off paid seats rather than respondents (CH-02)
  const seatByTool = new Map(seats.map(s => [s.tool, s]));
  const toolRollups: ToolRollup[] = TOOL_KEYS.map(t => {
    const users = people.filter(p => p.tools.some(x => x.tool === t));
    const monthlyHours = people.reduce(
      (a, p) => a + (p.tools.find(x => x.tool === t)?.monthlyAllocated ?? 0), 0);
    const seat = seatByTool.get(t);
    const paidSeats = seat ? seat.paidSeats : null;
    const costPerSeat = seat ? seat.costPerSeat : null;
    const monthlySpend = paidSeats != null && costPerSeat != null ? paidSeats * costPerSeat : null;
    const unmeasuredSeats = paidSeats != null ? paidSeats - users.length : null;
    const monthlyValue = monthlyHours * hourlyRate;
    return {
      tool: t,
      toolName: TOOLS[t],
      measuredUsers: users.length,
      paidSeats,
      unmeasuredSeats,
      costPerSeat,
      monthlySpend,
      unmeasuredSpend: unmeasuredSeats != null && costPerSeat != null
        ? unmeasuredSeats * costPerSeat : null,
      monthlyHours,
      monthlyValue,
      roi: monthlySpend && monthlySpend > 0 ? monthlyValue / monthlySpend : null,
      hoursPerMeasuredUser: users.length > 0 ? monthlyHours / users.length : 0,
    };
  });

  // 4. Seat actions, one row per person × tool (CH-04)
  const seatActions = people.flatMap(p =>
    p.tools.map(t => ({
      name: p.name, team: p.team, tool: t.toolName, toolKey: t.tool,
      pct: t.pct, grade: t.grade, action: t.action,
      seatCost: seatByTool.get(t.tool)?.costPerSeat ?? null,
    }))
  ).sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));

  const revocations = seatActions.filter(s => s.action === "Revoke seat");
  const immediateMonthlySavings = revocations.reduce((a, s) => a + (s.seatCost ?? 0), 0);

  // Coaching keys off best-tool score only, so nobody lands on both lists (CH-04)
  const coaching = rankedExcludingOwner
    .filter(p => p.bestPct < SEAT_ACTION_BANDS.keep)
    .map(p => ({ name: p.name, team: p.team, bestTool: p.bestTool, bestPct: p.bestPct }));

  // 5. Teams, with single-respondent grades suppressed (CH-07)
  const teamMap = new Map<string, number[]>();
  people.forEach(p => {
    const arr = teamMap.get(p.team) ?? [];
    arr.push(p.bestPct);
    teamMap.set(p.team, arr);
  });
  const teams: TeamRollup[] = [...teamMap.entries()]
    .map(([team, pcts]) => {
      const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      const meaningful = pcts.length >= 3;
      return { team, n: pcts.length, avgPct: avg, grade: meaningful ? pctToGrade(avg) : null, meaningful };
    })
    .sort((a, b) => b.n - a.n || a.team.localeCompare(b.team));

  // 6. Unmanaged-account candidates (CH-06). Keyword matching over free text is
  //    lossy by nature, so these are candidates for review, never conclusions.
  const shadowFlags: ShadowFlag[] = [];
  for (const sub of submissions) {
    const text = [sub.useCases, sub.challenges].filter(Boolean).join(" || ");
    if (!text.trim()) continue;
    const name = resolveName(sub.name);
    const hits = new Set<string>();
    if (PERSONAL_ACCOUNT_PATTERNS.some(re => re.test(text))) hits.add("Personal account");
    UNLICENSED_TOOL_PATTERNS.forEach(({ tool, re }) => { if (re.test(text)) hits.add(tool); });
    hits.forEach(toolMentioned => {
      shadowFlags.push({
        name, team: sub.team, toolMentioned,
        quote: text.replace(/\s+/g, " ").trim(),
        reviewed: false,
      });
    });
  }

  // 7. Roster reconciliation (CH-05). Three distinct numbers, all from the roster.
  const rosterActive = roster.filter(r => r.active);
  const rosterNames = new Set(rosterActive.map(r => normalizeName(r.fullName)));
  const submittedNames = [...new Set(people.map(p => p.name))];
  const unresolved = submittedNames.filter(n => !rosterNames.has(n));
  const notSubmitted = rosterActive
    .map(r => normalizeName(r.fullName))
    .filter(n => !submittedNames.includes(n))
    .sort();

  const counts = {
    submissionRows: people.reduce((a, p) => a + p.tools.length, 0),
    uniquePeople: submittedNames.length,
    rosterTotal: rosterActive.length,
    notSubmitted: notSubmitted.length,
  };

  // 8. Value totals and the realization band
  const totalWeeklyAllocated = people.reduce((a, p) => a + p.weeklyAllocated, 0);
  const totalMonthlyHours = totalWeeklyAllocated * WEEKS_PER_MONTH;
  const totalMonthlySpend = toolRollups.reduce((a, t) => a + (t.monthlySpend ?? 0), 0);
  const totalUnmeasuredSpend = toolRollups.reduce((a, t) => a + (t.unmeasuredSpend ?? 0), 0);
  const realization = REALIZATION_LEVELS.map(level => {
    const value = totalMonthlyHours * hourlyRate * level;
    return {
      level,
      label: `${Math.round(level * 100)}% of claimed`,
      monthlyHours: totalMonthlyHours * level,
      monthlyValue: value,
      roi: totalMonthlySpend > 0 ? value / totalMonthlySpend : null,
    };
  });

  const model = {
    people, ranked, rankedExcludingOwner, owner,
    toolRollups, seatActions, revocations, immediateMonthlySavings, coaching,
    teams, shadowFlags, roster: rosterActive, notSubmitted, unresolved, counts,
    hourlyRate,
    totals: {
      weeklyAllocated: totalWeeklyAllocated,
      monthlyHours: totalMonthlyHours,
      monthlyValue: totalMonthlyHours * hourlyRate,
      monthlySpend: totalMonthlySpend,
      unmeasuredSpend: totalUnmeasuredSpend,
      yearlySpend: totalMonthlySpend * 12,
    },
    realization,
    validations: [] as Validation[],
  };
  model.validations = validateModel(model);
  return model;
}

export type ReportModel = ReturnType<typeof buildReportModel>;

// ── Validation suite ────────────────────────────────────────────────────────
// Errors block export; warnings are shown but let it through. This is the
// browser equivalent of failing the build before writing output.
export function validateModel(m: Omit<ReportModel, "validations">): Validation[] {
  const v: Validation[] = [];

  if (m.roster.length === 0) {
    v.push({ id: "roster-empty", level: "error",
      message: "Roster is empty. Add people in Settings → Roster — headcount must come from the roster, never from arithmetic on submissions." });
  } else if (m.unresolved.length > 0) {
    v.push({ id: "roster-unmatched", level: "error",
      message: `${m.unresolved.length} submitted name(s) don't match the roster: ${m.unresolved.join(", ")}. Add them to the roster, or map them in NAME_ALIASES.` });
  } else if (m.counts.rosterTotal !== m.counts.uniquePeople + m.counts.notSubmitted) {
    v.push({ id: "roster-arithmetic", level: "error",
      message: `Roster total (${m.counts.rosterTotal}) does not equal submitted (${m.counts.uniquePeople}) plus not submitted (${m.counts.notSubmitted}).` });
  }

  m.toolRollups.forEach(t => {
    if (t.paidSeats == null) {
      v.push({ id: `seats-missing-${t.tool}`, level: "error",
        message: `No paid-seat count for ${t.toolName}. Enter it in Settings → Seats — spend cannot be modelled off survey respondents.` });
    } else if (t.measuredUsers > t.paidSeats) {
      v.push({ id: `seats-oversubscribed-${t.tool}`, level: "error",
        message: `${t.toolName}: ${t.measuredUsers} respondents but only ${t.paidSeats} paid seats. Either the seat count is wrong or people are on personal accounts — see Unmanaged Accounts.` });
    }
  });

  // Regression test for CH-01. If per-user hours ever go flat again, the ROI
  // column has silently reverted to being an inverted price tag.
  const perUser = m.toolRollups.filter(t => t.measuredUsers > 0).map(t => t.hoursPerMeasuredUser);
  if (perUser.length > 1 && perUser.every(h => Math.abs(h - perUser[0]) < 0.01)) {
    v.push({ id: "roi-flat-constant", level: "error",
      message: "Hours per user is identical across all tools — the ROI model has reverted to a flat constant and is measuring price, not usage." });
  }

  m.people.forEach(p => {
    const cap = Math.max(...p.tools.map(t => t.weeklyClaimed));
    const alloc = p.tools.reduce((a, t) => a + t.weeklyAllocated, 0);
    if (alloc - cap > 0.01) {
      v.push({ id: `alloc-exceeds-cap-${p.name}`, level: "error",
        message: `${p.name}: allocated ${alloc.toFixed(2)} hrs/wk exceeds their highest single claim of ${cap}.` });
    }
  });

  const unreviewed = m.shadowFlags.filter(f => !f.reviewed).length;
  if (unreviewed > 0) {
    v.push({ id: "shadow-unreviewed", level: "warning",
      message: `${unreviewed} unmanaged-account candidate(s) found by keyword match. Review each before publishing — false positives are expected.` });
  }

  const suppressed = m.teams.filter(t => !t.meaningful).length;
  if (suppressed > 0) {
    v.push({ id: "teams-suppressed", level: "warning",
      message: `${suppressed} of ${m.teams.length} teams have n<3; their grades are suppressed as not statistically meaningful.` });
  }

  return v;
}
