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
    "Use ChatGPT to draft emails first, then edit to your own voice — cuts writing time in half",
    "Ask ChatGPT to 'give me 5 options' when you're stuck instead of staring at a blank page",
    "Paste any long document into ChatGPT and say 'summarize this in 3 bullets'",
    "Try telling ChatGPT 'act as a [Marketing expert / Sales coach] and help me with [task]'",
    "Ask ChatGPT to review and improve anything before you send it",
    "Build reusable templates with ChatGPT: 'write a template for [recurring task] I can copy each time'",
    "Brainstorm faster with ChatGPT: 'give me 10 ideas for [topic]' then filter to the best ones",
    "After writing any plan or proposal, ask ChatGPT 'what am I missing?' — it catches gaps",
    "Stuck on a subject line or headline? Ask ChatGPT for 5 versions under 10 words",
    "Paste an email thread into ChatGPT and say 'draft a reply that moves this toward a decision'",
    "Ask ChatGPT to help explain a topic simply: 'help me explain [topic] to someone unfamiliar with it'",
    "Ask ChatGPT to write a job post, meeting agenda, or onboarding checklist from a short description",
  ],
  cla: [
    "Paste long reports or contracts into Claude and ask 'what are the 3 most important points?'",
    "Ask Claude to rewrite something in a specific tone: 'make this more direct' or 'less formal'",
    "Paste a meeting transcript into Claude and ask 'list the action items and who owns each'",
    "Ask Claude 'what are the pros and cons?' before a big decision — it thinks through tradeoffs well",
    "Turn rough notes into polished memos with Claude: paste your bullets and say 'make this a clear summary'",
    "Ask Claude to check your logic: 'is there a flaw in this argument or plan?'",
    "Draft SOPs and policy docs with Claude: describe what needs to happen and ask for a structured document",
    "Paste two proposals into Claude and ask for a side-by-side breakdown",
    "Use Claude to prep for tough conversations: 'what objections might I get and how should I respond?'",
    "Ask Claude to simplify complex documents: 'explain this contract clause in plain English'",
    "Use Claude for performance feedback or sensitive messages where getting the tone exactly right matters",
    "Ask Claude 'what questions should I be asking about [topic]?' to pressure-test your thinking",
  ],
  per: [
    "Use Perplexity instead of Google when you need a synthesized answer, not just a list of links",
    "Before any meeting, ask Perplexity 'what should I know about [company name]?'",
    "Get competitor pricing benchmarks from Perplexity: 'what does [product category] typically cost?'",
    "Ask Perplexity for industry trends before a presentation so your data feels current",
    "Use Perplexity to fact-check numbers or claims quickly before sharing them in a meeting",
    "Ask Perplexity for product specs or technical standards instead of hunting through manufacturer docs",
    "In Perplexity, use follow-up questions to drill deeper — it remembers context from your last message",
    "Ask Perplexity 'what are people saying about [topic] recently?' for a real-time market pulse",
    "Use Perplexity to prep talking points: 'give me 5 things to know about [industry] right now'",
    "Before buying software or tools, ask Perplexity 'what do real users say about [product]?'",
    "Ask Perplexity to summarize a news topic you haven't had time to follow",
    "Use Perplexity for supplier research: 'who are the top providers of [service] and how do they compare?'",
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
