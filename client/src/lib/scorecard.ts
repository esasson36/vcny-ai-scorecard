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

// Tips keyed by tool — shown on the success screen for lower scorers
export const TOOL_TIPS: Record<string, string[]> = {
  cgt: [
    "Draft emails with it first, then edit to your own voice — cuts writing time in half",
    "Use 'give me 5 options' when you're stuck instead of staring at a blank page",
    "Paste any long document and say 'summarize this in 3 bullets'",
    "Try 'act as a [Marketing expert / Sales coach] and help me with [task]' for better results",
    "Ask it to review and improve anything before you send it",
    "Build reusable templates: 'write a template for [recurring task] I can copy each time'",
    "Brainstorm faster: 'give me 10 ideas for [topic]' then filter down to the best ones",
    "Ask 'what am I missing?' after any plan or proposal — it catches gaps",
    "Stuck on a subject line or headline? Ask for 5 versions under 10 words",
    "Paste an email thread and say 'draft a reply that moves this toward a decision'",
    "Use it to prep talking points: 'help me explain [topic] to someone unfamiliar with it'",
    "Ask it to write a job post, meeting agenda, or onboarding checklist from a short description",
  ],
  cla: [
    "Paste long reports or contracts and ask 'what are the 3 most important points?'",
    "Ask it to rewrite something in a specific tone: 'make this more direct' or 'less formal'",
    "Paste a meeting transcript and ask 'list the action items and who owns each'",
    "Ask 'what are the pros and cons?' before a decision to think it through faster",
    "Turn rough notes into polished memos: paste your bullets and say 'turn this into a clear summary'",
    "Ask it to check your logic: 'is there a flaw in this argument or plan?'",
    "Draft SOPs and policy docs: describe what needs to happen and ask for a structured document",
    "Compare two options: paste both proposals and ask for a side-by-side breakdown",
    "Prep for tough conversations: 'what objections might I get and how should I respond?'",
    "Ask it to simplify complex documents: 'explain this contract clause in plain English'",
    "Use it to write performance feedback, review notes, or sensitive messages where tone matters",
    "Ask 'what questions should I be asking about [topic]?' to stress-test your thinking",
  ],
  per: [
    "Use it instead of Google when you need a synthesized answer, not just a list of links",
    "Research a company before any meeting: 'what should I know about [company name]?'",
    "Get competitor pricing benchmarks: 'what does [product category] typically cost?'",
    "Ask for industry trends before a presentation so your data feels current",
    "Fact-check numbers or claims quickly before sharing them in a meeting",
    "Ask for product specs or technical standards instead of hunting through manufacturer docs",
    "Use follow-up questions to drill deeper — it remembers context from your last question",
    "Ask 'what are people saying about [topic] recently?' for a real-time pulse on the market",
    "Use it to prep talking points: 'give me 5 things to know about [industry] right now'",
    "Search for real user opinions before buying software or tools: 'what do users think of [product]?'",
    "Ask it to summarize a news topic you haven't had time to follow",
    "Use it for supplier or vendor research: 'who are the top providers of [service] and how do they compare?'",
  ],
};

// Pick n random tips from the pool of tools the person actually used
export function getToolTips(activeToolKeys: string[], count = 3): string[] {
  const pool: string[] = activeToolKeys.flatMap(k => TOOL_TIPS[k] ?? []);
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
