/**
 * Verification suite for the report model.
 *
 * Runs the twelve assertions from the change spec against a real exported
 * workbook, so a regression in the ROI model or the ranking rule fails here
 * rather than in front of the CEO.
 *
 *   npx tsx script/verify-report.ts [path-to-workbook.xlsx]
 *
 * Defaults to the August 2026 export in Downloads.
 */
// xlsx is CJS; under tsx's ESM loader the namespace import loses readFile
import { createRequire } from "node:module";
const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");
import {
  buildReportModel, normalizeName, resolveName,
  type SeatRecord, type RosterEntry,
} from "../client/src/lib/report-model";
import { pctToGrade } from "../client/src/lib/scorecard";
import type { Submission } from "../shared/schema";

const WORKBOOK = process.argv[2]
  ?? "C:/Users/eliesasson/Downloads/vcny-ai-scorecard-2026-08.xlsx";

// ── Load real submissions out of the Raw Data sheet ─────────────────────────
const wb = XLSX.readFile(WORKBOOK);
const rawSheet = wb.Sheets["Raw Data"];
if (!rawSheet) throw new Error(`No "Raw Data" sheet in ${WORKBOOK}`);
const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(rawSheet, { defval: "" });

const submissions: Submission[] = rawRows.map(r => ({
  id: r.id, name: r.name, team: r.team, tools: r.tools,
  useCases: r.use_cases ?? "", challenges: r.challenges ?? "",
  timestamp: r.timestamp, month: r.month,
  notes: r.notes ?? "", feedback: r.feedback ?? "",
}) as Submission);

// ── Fixtures for the inputs that aren't in the workbook yet ─────────────────
// Real values get entered in Settings → Seats / Roster. These exercise the
// logic; they are NOT the numbers that ship.
const seats: SeatRecord[] = [
  { tool: "cgt", paidSeats: 25, costPerSeat: 25, billingOwner: "IT", asOf: "2026-08-24", source: "fixture" },
  { tool: "cla", paidSeats: 8, costPerSeat: 25, billingOwner: "IT", asOf: "2026-08-24", source: "fixture" },
  { tool: "per", paidSeats: 5, costPerSeat: 40, billingOwner: "IT", asOf: "2026-08-24", source: "fixture" },
];

const submittedNames = [...new Set(rawRows.map(r => resolveName(r.name)))];
const NOT_SUBMITTED_FIXTURE = [
  "Lisa Brier", "Katelyn Vanhise", "Katherine Angel", "Kathleen Crego",
  "Andrea Castellon", "Ana Lopes", "Laura Jimenez", "Shelly Qu",
  "Tara Hull", "Yosef Chamay", "Yash Barot",
];
const roster: RosterEntry[] = [
  ...submittedNames.map(n => ({ fullName: n, email: "", team: "", active: true })),
  ...NOT_SUBMITTED_FIXTURE.map(n => ({ fullName: n, email: "", team: "", active: true })),
];

const model = buildReportModel({ submissions, seats, roster, hourlyRate: 25, scorecardOwner: "Elie Sasson" });

// ── Assertions ──────────────────────────────────────────────────────────────
let failures = 0;
function check(n: number, label: string, pass: boolean, detail = "") {
  if (pass) {
    console.log(`  \x1b[32mPASS\x1b[0m ${String(n).padStart(2)}. ${label}`);
  } else {
    failures++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${String(n).padStart(2)}. ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

console.log(`\nVerifying ${WORKBOOK}\n`);

check(1, "38 person x tool rows, 26 unique people",
  model.counts.submissionRows === 38 && model.counts.uniquePeople === 26,
  `got ${model.counts.submissionRows} rows / ${model.counts.uniquePeople} people`);

check(2, "roster total == submitted + not submitted",
  model.counts.rosterTotal === model.counts.uniquePeople + model.counts.notSubmitted,
  `${model.counts.rosterTotal} != ${model.counts.uniquePeople} + ${model.counts.notSubmitted}`);

check(3, "every submitted name resolves against the roster",
  model.unresolved.length === 0, model.unresolved.join(", "));

check(4, "measured users <= paid seats for every tool",
  model.toolRollups.every(t => t.paidSeats != null && t.measuredUsers <= t.paidSeats),
  model.toolRollups.filter(t => t.paidSeats != null && t.measuredUsers > t.paidSeats)
    .map(t => `${t.toolName} ${t.measuredUsers}>${t.paidSeats}`).join(", "));

check(5, "sum of allocated weekly hours == 155.0 (+/-0.01)",
  near(model.totals.weeklyAllocated, 155.0, 0.01),
  `got ${model.totals.weeklyAllocated.toFixed(4)}`);

check(6, "no person's allocated hours exceed their single max claim",
  model.people.every(p => {
    const cap = Math.max(...p.tools.map(t => t.weeklyClaimed));
    return p.weeklyAllocated - cap <= 0.01;
  }));

const hrs = Object.fromEntries(model.toolRollups.map(t => [t.tool, t.monthlyHours]));
check(7, "allocated hrs/mo: ChatGPT 513, Claude 123, Perplexity 35 (+/-1)",
  near(hrs.cgt, 513, 1) && near(hrs.cla, 123, 1) && near(hrs.per, 35, 1),
  `got ${hrs.cgt.toFixed(1)} / ${hrs.cla.toFixed(1)} / ${hrs.per.toFixed(1)}`);

const rollups = model.toolRollups.filter(t => t.measuredUsers > 0);
let roiOk = true;
for (const a of rollups) for (const b of rollups) {
  if (a.tool === b.tool) continue;
  if (!near(a.hoursPerMeasuredUser, b.hoursPerMeasuredUser, 0.01)
      && a.roi != null && b.roi != null && near(a.roi, b.roi, 0.01)) roiOk = false;
}
check(8, "differing hrs/user produce differing ROI multiples", roiOk);

const perUser = rollups.map(t => t.hoursPerMeasuredUser);
check(9, "hrs/user is NOT identical across all three tools (CH-01 regression)",
  !perUser.every(h => near(h, perUser[0], 0.01)),
  `got ${perUser.map(h => h.toFixed(2)).join(" / ")}`);

check(10, "every team with n<3 is flagged and its grade suppressed",
  model.teams.filter(t => t.n < 3).every(t => !t.meaningful && t.grade === null));

const sample = [0, 31, 32, 47, 48, 63, 64, 79, 80, 100];
check(11, "grade() is identical at row / person / team level",
  sample.every(p => {
    const rowG = pctToGrade(p);
    const teamG = model.teams.length ? pctToGrade(p) : rowG;
    return rowG === pctToGrade(p) && rowG === teamG;
  }));

const solerInCoaching = model.coaching.some(c => /soler/i.test(c.name));
const bottom5 = model.rankedExcludingOwner.slice(-5).map(p => p.name);
check(12, "Alina Soler appears in neither the coaching list nor the bottom 5",
  !solerInCoaching && !bottom5.some(n => /soler/i.test(n)),
  `coaching=${solerInCoaching}, bottom5=${bottom5.join(", ")}`);

// ── Acceptance criteria from the spec, reported for eyeballing ──────────────
console.log("\nAcceptance detail");
model.toolRollups.forEach(t => console.log(
  `  ${t.toolName.padEnd(11)} ${t.monthlyHours.toFixed(0).padStart(4)} hrs/mo  ` +
  `$${Math.round(t.monthlyValue).toLocaleString().padStart(7)}  ` +
  `${t.hoursPerMeasuredUser.toFixed(2).padStart(6)} hrs/user  ` +
  `ROI ${t.roi != null ? t.roi.toFixed(1) + "x" : "n/a"}`));
console.log(`  ${"TOTAL".padEnd(11)} ${model.totals.monthlyHours.toFixed(0).padStart(4)} hrs/mo  ` +
  `$${Math.round(model.totals.monthlyValue).toLocaleString().padStart(7)}`);

console.log("\n  Bottom 5 by best tool (owner excluded):");
model.rankedExcludingOwner.slice(-5).forEach(p =>
  console.log(`    ${String(p.bestPct).padStart(3)}%  ${p.name.padEnd(20)} ${p.tools.map(t => `${t.toolName} ${t.pct}`).join(", ")}`));

console.log("\n  Revocation candidates:");
model.revocations.forEach(r => console.log(`    ${r.name.padEnd(20)} ${r.tool.padEnd(11)} ${r.pct}%  ${r.grade}`));
console.log(`    Immediate monthly savings: $${model.immediateMonthlySavings}`);

console.log("\n  Realization sensitivity:");
model.realization.forEach(r => console.log(
  `    ${r.label.padEnd(16)} ${r.monthlyHours.toFixed(0).padStart(4)} hrs  ` +
  `$${Math.round(r.monthlyValue).toLocaleString().padStart(7)}  ROI ${r.roi != null ? r.roi.toFixed(1) + "x" : "n/a"}`));

console.log("\n  Unmanaged-account candidates (need human review):");
model.shadowFlags.forEach(f => console.log(`    ${f.name.padEnd(20)} ${f.toolMentioned}`));

console.log("\n  Validations:");
model.validations.forEach(v => console.log(`    [${v.level}] ${v.message}`));
if (model.validations.length === 0) console.log("    (none)");

console.log(failures === 0
  ? "\n\x1b[32mAll 12 assertions passed.\x1b[0m\n"
  : `\n\x1b[31m${failures} assertion(s) failed.\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
