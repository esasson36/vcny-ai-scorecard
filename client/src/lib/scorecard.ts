export const TOOLS: Record<string, string> = {
  cgt: "ChatGPT",
  cla: "Claude",
  per: "Perplexity",
};

export const TOOL_KEYS = ["cgt", "cla", "per"] as const;
export type ToolKey = typeof TOOL_KEYS[number];

export const TEAMS = ["Marketing", "Merchandising", "Design", "Leadership", "Other"];

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
