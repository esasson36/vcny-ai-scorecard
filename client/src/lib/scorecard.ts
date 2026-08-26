export const TOOLS: Record<string, string> = {
  cgt: "ChatGPT",
  cla: "Claude",
  per: "Perplexity",
};

export const TOOL_KEYS = ["cgt", "cla", "per"] as const;
export type ToolKey = typeof TOOL_KEYS[number];

// Non-graded evaluation tools — their own question sets, not folded into A–F grades
export const FEEDBACK_KEYS = ["manifast", "plaude"] as const;
export type FeedbackKey = typeof FEEDBACK_KEYS[number];
export const FEEDBACK_TOOLS: Record<FeedbackKey, string> = {
  manifast: "Manifast",
  plaude: "Plaude",
};
export const FEEDBACK_COLOR: Record<FeedbackKey, string> = {
  manifast: "#0d9488", // teal
  plaude: "#7c3aed",   // violet
};
export const CONTINUE_LABELS: Record<string, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

// Every team that has ever appeared in a submission, so nobody has to use
// free-text "Other" for a team we already know about. Alphabetical, Other last.
export const TEAMS = [
  "AI", "Brands", "Design", "Executive", "HR", "IT", "Marketing", "Merchandising",
  "Operations", "Packaging", "Pet Production", "Production",
  "Quality Assurance & Compliance", "Sales", "Other",
];

export const LABELS = {
  freq:   ["Never", "Rarely", "Monthly", "Weekly", "Several/wk", "Daily"],
  time:   ["None", "<1 hr", "1–3 hrs", "3–5 hrs", "5–10 hrs", "10+ hrs"],
  impact: ["None", "Slight", "Some", "Noticeable", "Significant", "Transformative"],
  adopt:  ["None", "Tried once", "Occasional", "Regular", "Multi-flow", "Core daily"],
};

export type MetricKey = keyof typeof LABELS;

export interface ToolScores {
  freq: number;
  time: number;
  impact: number;
  adopt: number;
  outputVolume?: number;
}

// Grade is based only on the four self-reported dimensions (max 20), so every
// person is scored on the same scale. outputVolume (ChatGPT message count) is
// tracked separately as context and is intentionally NOT part of the grade.
export function calcScore(scores: ToolScores): { total: number; max: number; pct: number } {
  const total = scores.freq + scores.time + scores.impact + scores.adopt;
  const max = 20;
  return { total, max, pct: Math.round((total / max) * 100) };
}

/**
 * Grade bands, defined exactly once (CH-08).
 *
 * pctToGrade is the ONLY grading function in the codebase and is applied
 * identically at row, person, and team level, so the same percentage can never
 * grade differently depending on where it is displayed.
 *
 * These thresholds are deliberately unchanged from previous months. Moving them
 * would re-grade historic data and break month-over-month comparability, which
 * is the one thing CH-09 asks us not to do this cycle.
 */
export const GRADE_BANDS = [
  { min: 80, grade: "A" },
  { min: 64, grade: "B" },
  { min: 48, grade: "C" },
  { min: 32, grade: "D" },
  { min: 0,  grade: "F" },
] as const;

/** Human-readable band list, shown on the Leaderboard sheet and in the report. */
export const GRADE_LEGEND = GRADE_BANDS.map((b, i) => {
  const upper = i === 0 ? "" : `–${GRADE_BANDS[i - 1].min - 1}%`;
  return i === 0
    ? `${b.grade} ≥${b.min}%`
    : b.min === 0 ? `${b.grade} <${GRADE_BANDS[i - 1].min}%` : `${b.grade} ${b.min}${upper}`;
}).join(" · ");

export function pctToGrade(p: number): string {
  for (const b of GRADE_BANDS) if (p >= b.min) return b.grade;
  return "F";
}

export function gradeAction(g: string): string {
  return ({
    A: "Keep — power user driving real value",
    B: "Keep — using effectively",
    C: "Keep + coach — opportunity to improve",
    D: "Review — consider trial downgrade",
    F: "Downgrade to free tier",
  } as Record<string, string>)[g] ?? "";
}

export function gradeClass(g: string): string {
  return `grade-${g}`;
}

// Coach suggestions per team for C/D/F scorers
export const COACH_SUGGESTIONS: Record<string, string[]> = {
  Marketing: [
    "Use ChatGPT to draft campaign briefs, social copy, and product descriptions",
    "Try Perplexity for quick competitive research and trend spotting",
    "Use Claude to rewrite or improve existing copy with specific tone guidelines",
  ],
  Merchandising: [
    "Use ChatGPT to draft vendor emails, PO summaries, and product notes",
    "Try Perplexity to research supplier alternatives and market pricing",
    "Use Claude to summarize long vendor contracts or spec sheets",
  ],
  Design: [
    "Use ChatGPT to write alt text, product naming, and design briefs",
    "Try Perplexity to research design trends and competitor aesthetics",
    "Use Claude to turn rough design notes into structured creative briefs",
  ],
  Sales: [
    "Use ChatGPT to draft outreach emails, follow-ups, and pitch decks",
    "Try Perplexity to research accounts and find talking points before calls",
    "Use Claude to summarize meeting notes and generate next-step action items",
  ],
  Operations: [
    "Use ChatGPT to draft SOPs, process documentation, and checklists",
    "Try Perplexity to research logistics providers and shipping solutions",
    "Use Claude to summarize long reports or extract key action items",
  ],
  Finance: [
    "Use ChatGPT to draft financial summaries and budget narratives",
    "Try Perplexity to quickly look up market rates and benchmarks",
    "Use Claude to review and simplify complex contracts or financial docs",
  ],
  Warehouse: [
    "Use ChatGPT to draft shift handoff notes and inventory summaries",
    "Try Perplexity to look up product specs and shipping regulations",
    "Use Claude to turn raw data exports into readable summary reports",
  ],
  Executive: [
    "Use ChatGPT to draft board updates, memos, and executive summaries",
    "Try Perplexity for quick market intelligence and news monitoring",
    "Use Claude to summarize lengthy reports into 1-page executive briefs",
  ],
  Other: [
    "Use ChatGPT to draft emails, summarize documents, and brainstorm ideas",
    "Try Perplexity for research tasks instead of manual Googling",
    "Use Claude for editing, rewriting, and improving existing text",
  ],
};

export function getCoachSuggestions(team: string): string[] {
  return COACH_SUGGESTIONS[team] ?? COACH_SUGGESTIONS.Other;
}

// Tips keyed by tool → team. Falls back to "Other" for unknown teams.
// Team+tool coaching tips moved to client/src/lib/tips.ts (450-tip pools,
// score-weighted selection). See getScoredTips.

