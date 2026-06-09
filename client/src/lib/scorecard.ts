export const TOOLS: Record<string, string> = {
  cgt: "ChatGPT",
  cla: "Claude",
  per: "Perplexity",
};

export const TOOL_KEYS = ["cgt", "cla", "per"] as const;
export type ToolKey = typeof TOOL_KEYS[number];

export const TEAMS = ["Marketing", "Merchandising", "Design", "Executive", "HR", "Sales", "Other"];

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

export function calcScore(scores: ToolScores): { total: number; max: number; pct: number } {
  const self = scores.freq + scores.time + scores.impact + scores.adopt;
  const hasOV = scores.outputVolume !== undefined && scores.outputVolume !== null;
  const total = hasOV ? self + (scores.outputVolume as number) : self;
  const max = hasOV ? 25 : 20;
  return { total, max, pct: Math.round((total / max) * 100) };
}

export function pctToGrade(p: number): string {
  if (p >= 80) return "A";
  if (p >= 64) return "B";
  if (p >= 48) return "C";
  if (p >= 32) return "D";
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
