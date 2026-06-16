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

// Grade is based only on the four self-reported dimensions (max 20), so every
// person is scored on the same scale. outputVolume (ChatGPT message count) is
// tracked separately as context and is intentionally NOT part of the grade.
export function calcScore(scores: ToolScores): { total: number; max: number; pct: number } {
  const total = scores.freq + scores.time + scores.impact + scores.adopt;
  const max = 20;
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

// Tips keyed by tool → team. Falls back to "Other" for unknown teams.
export const TOOL_TIPS: Record<string, Record<string, string[]>> = {
  cgt: {
    Marketing: [
      "Use ChatGPT to write 3 subject line options for every email — then pick the best one",
      "Ask ChatGPT to draft a campaign brief from a short bullet-point outline",
      "Use ChatGPT to write social captions in bulk: give it the product and ask for 5 variations",
      "Ask ChatGPT to rewrite copy for a different audience: 'make this land for a younger shopper'",
      "Use ChatGPT to brainstorm a content calendar: 'give me 10 post ideas for [product launch]'",
      "Paste a competitor's email into ChatGPT and ask 'what makes this effective and how can I do better?'",
    ],
    Merchandising: [
      "Use ChatGPT to draft vendor emails and follow-ups in seconds — describe the situation and edit from there",
      "Ask ChatGPT to summarize product specs into clean bullet points for internal use",
      "Use ChatGPT to write PO notes and line sheet descriptions faster",
      "Ask ChatGPT 'compare these two vendors based on [criteria]' to speed up decisions",
      "Use ChatGPT to draft negotiation scripts or talking points before a vendor call",
      "Ask ChatGPT to write a product brief from a rough set of notes",
    ],
    Design: [
      "Use ChatGPT to generate naming options for a new product line or collection — ask for 10, pick the best",
      "Ask ChatGPT to write alt text, product descriptions, or design brief copy from a short prompt",
      "Use ChatGPT to explain a design decision in language a non-designer will understand",
      "Ask ChatGPT to write client-ready project summaries from your rough design notes",
      "Use ChatGPT to draft revision feedback professionally when client notes are unclear",
      "Ask ChatGPT to write UI copy — button labels, empty states, tooltips — from a list of scenarios",
    ],
    Executive: [
      "Use ChatGPT to draft board updates and exec memos from bullet points — then refine from there",
      "Ask ChatGPT to sharpen your messaging: 'rewrite this to sound more decisive and clear'",
      "Use ChatGPT to prep talking tracks: 'turn these notes into a tight 3-point message'",
      "Ask ChatGPT to draft a company-wide announcement and give you 3 tone variations to choose from",
      "Use ChatGPT to write speech intros, closing remarks, or team recognition messages",
      "Ask ChatGPT 'what am I missing?' after any strategy document — it often catches gaps",
    ],
    HR: [
      "Use ChatGPT to write or refresh job descriptions from a quick bullet-point list",
      "Ask ChatGPT to draft interview questions tailored to a specific role and seniority level",
      "Use ChatGPT to write onboarding checklists, welcome emails, and first-week schedules",
      "Ask ChatGPT to help write performance review templates or self-evaluation prompts",
      "Use ChatGPT to draft HR policy documents from a plain-language description of the rule",
      "Ask ChatGPT to write an offer letter or promotion announcement from a short brief",
    ],
    Sales: [
      "Use ChatGPT to write personalized outreach emails — give it the prospect's name, company, and what you're offering",
      "Ask ChatGPT to draft follow-up emails that push politely toward a decision",
      "Use ChatGPT to prep talking points: 'help me position [product] for a [industry] buyer'",
      "Ask ChatGPT to generate 5 responses to your most common sales objections",
      "Use ChatGPT to write tight, compelling proposal summaries from a longer deck",
      "Ask ChatGPT to help you open a cold call or email with something relevant to the prospect",
    ],
    Other: [
      "Use ChatGPT to draft emails, documents, and messages faster — describe what you need and edit from there",
      "Ask ChatGPT to 'give me 5 options' whenever you're stuck on wording or approach",
      "Use ChatGPT to summarize anything long: paste it and ask for the 3 key takeaways",
      "Ask ChatGPT to build templates for recurring tasks so you're not starting from scratch each time",
      "After any plan or proposal, ask ChatGPT 'what am I missing?' — it often catches things you overlooked",
      "Use ChatGPT to explain anything complex in plain language: 'explain [topic] like I'm new to this'",
    ],
  },
  cla: {
    Marketing: [
      "Paste a competitor's ad or email into Claude and ask 'what makes this effective?'",
      "Use Claude to write longer-form content — blog posts, product stories — with a consistent brand tone",
      "Ask Claude to review your copy and flag anything that might land wrong or feel off-brand",
      "Use Claude to turn customer reviews into marketing language: paste reviews, ask for recurring themes",
      "Ask Claude to write 3 versions of the same message for email, social, and in-store — all in one go",
      "Use Claude to pressure-test a campaign concept: 'what could go wrong with this message?'",
    ],
    Merchandising: [
      "Paste long vendor contracts into Claude and ask 'what are the key terms and any red flags?'",
      "Use Claude to summarize product performance reports into a concise brief for leadership",
      "Ask Claude to help you build a vendor scorecard or evaluation framework",
      "Use Claude to turn raw sales data notes into a structured recap",
      "Ask Claude to draft supplier communication that's firm but professional",
      "Use Claude to compare two vendor proposals: paste both and ask for a side-by-side breakdown",
    ],
    Design: [
      "Use Claude to turn rough creative direction into a structured brief you can share with the team",
      "Ask Claude to review a creative brief and flag anything vague, missing, or likely to cause revisions",
      "Use Claude to write UX copy — button labels, error messages, empty states — from a list of scenarios",
      "Ask Claude 'does the brand voice feel consistent across these?' and paste your copy samples",
      "Use Claude to summarize client feedback into clear revision priorities before your next round",
      "Ask Claude to explain a design direction in business terms for stakeholder presentations",
    ],
    Executive: [
      "Ask Claude to summarize a lengthy report into a 1-page executive brief",
      "Use Claude to pressure-test a strategic proposal: 'what are the weaknesses in this plan?'",
      "Ask Claude to draft a decision memo with clear pros, cons, and a recommendation",
      "Use Claude to turn meeting notes into a structured follow-up with owners and deadlines",
      "Ask Claude 'what am I not considering?' after any major decision — it's good at edge cases",
      "Use Claude to simplify a complex document before sharing it with the board or a new hire",
    ],
    HR: [
      "Use Claude to write sensitive employee communications where tone needs to be exactly right",
      "Ask Claude to help structure a performance improvement plan fairly and clearly",
      "Use Claude to turn exit interview notes into themes and actionable takeaways",
      "Ask Claude to review HR policies for clarity and flag anything that might be misread",
      "Use Claude to draft offer letters, promotion announcements, or restructuring messages",
      "Ask Claude to write interview debrief summaries from notes across multiple interviewers",
    ],
    Sales: [
      "Paste a prospect's website into Claude and ask 'how should I position our product for them?'",
      "Use Claude to summarize meeting notes into a clear next-steps recap to send after every call",
      "Ask Claude to review a proposal and flag anything that might raise objections",
      "Use Claude to write competitive battlecards: 'compare us to [competitor] from a buyer's perspective'",
      "Ask Claude to turn a long case study into a 3-sentence pitch you can use in conversation",
      "Use Claude to prep for a tough sales call: 'what objections am I likely to face and how should I handle them?'",
    ],
    Other: [
      "Paste anything long into Claude — reports, contracts, notes — and ask for the key points",
      "Use Claude to rewrite anything in a clearer, more professional tone",
      "Ask Claude to help you think through a decision: 'what are the pros, cons, and risks here?'",
      "Use Claude for communications where tone really matters — it's careful with nuance",
      "Ask Claude 'what questions should I be asking about this?' to stress-test any plan",
      "Use Claude to simplify complex documents: 'explain this in plain English'",
    ],
  },
  per: {
    Marketing: [
      "Ask Perplexity for the latest trends in your product category before planning a campaign",
      "Use Perplexity to research what competitors are saying: 'how is [brand] positioning their [product]?'",
      "Ask Perplexity for seasonal buying trends so your timing is on point",
      "Use Perplexity to find consumer sentiment before making it part of your message",
      "Ask Perplexity 'what topics and themes are resonating with [audience] right now?'",
      "Use Perplexity to quickly pull stats and data points to back up campaign claims",
    ],
    Merchandising: [
      "Ask Perplexity for current wholesale pricing benchmarks in your product category",
      "Use Perplexity to research supplier alternatives: 'who are the top manufacturers of [product type]?'",
      "Ask Perplexity about import duties, lead times, or shipping regs for specific regions",
      "Use Perplexity to check market demand: 'is [product category] growing or declining right now?'",
      "Ask Perplexity to compare freight options or logistics providers before committing",
      "Use Perplexity to vet a new vendor: 'what do buyers say about working with [supplier name]?'",
    ],
    Design: [
      "Ask Perplexity 'what are the top design trends in [industry] right now?' before starting a project",
      "Use Perplexity to research competitor visual identities: 'how do brands in [space] typically present themselves?'",
      "Ask Perplexity for color psychology or typography best practices for a specific context or medium",
      "Use Perplexity to find reference points: 'what are examples of great [type of design] in [industry]?'",
      "Ask Perplexity about accessibility standards or technical specs for print or digital formats",
      "Use Perplexity to quickly check if a visual style or concept is feeling dated vs. current",
    ],
    Executive: [
      "Use Perplexity for a quick market intelligence brief before any external meeting or pitch",
      "Ask Perplexity 'what's the latest news on [industry / competitor]?' to stay sharp without reading everything",
      "Use Perplexity for benchmarks: 'what are typical margins / growth rates for companies our size?'",
      "Ask Perplexity to research a potential partner, investor, or hire before a call",
      "Use Perplexity to prep for a strategy session: 'what do analysts say about the future of [trend]?'",
      "Ask Perplexity 'what are the biggest risks facing [industry] in the next 12 months?'",
    ],
    HR: [
      "Ask Perplexity for salary benchmarks by role and level before compensation reviews",
      "Use Perplexity to research current hiring trends for hard-to-fill roles",
      "Ask Perplexity about recent changes to employment law or HR compliance requirements",
      "Use Perplexity to research what benefits comparable companies are offering",
      "Ask Perplexity 'what do employees say they want most from employers right now?'",
      "Use Perplexity to look up best practices for a specific HR challenge before handling it",
    ],
    Sales: [
      "Use Perplexity to research a prospect's company before a call: 'what's happening at [company] lately?'",
      "Ask Perplexity for the latest news in a prospect's industry so you can open with a relevant insight",
      "Use Perplexity to find talking points: 'what challenges are companies in [industry] facing right now?'",
      "Ask Perplexity for competitor pricing or feature comparisons before a demo",
      "Use Perplexity to research decision-makers: 'what do people say about working with [company]?'",
      "Ask Perplexity 'what's the business case for [your product category] in [prospect's industry]?'",
    ],
    Other: [
      "Use Perplexity instead of Google when you need a direct answer, not a list of links to dig through",
      "Ask Perplexity to research any company, product, or topic before a meeting",
      "Use Perplexity to fact-check anything quickly before sharing it with your team or a client",
      "Ask Perplexity to summarize a news topic you haven't had time to follow",
      "Use Perplexity for benchmarks: pricing, industry rates, or what competitors are doing",
      "Ask Perplexity follow-up questions to drill deeper — it remembers what you asked before",
    ],
  },
};

// Pick n random tips for the tools the person used, from their team's pool
export function getToolTips(activeToolKeys: string[], team: string, count = 3): string[] {
  const pool: string[] = activeToolKeys.flatMap(k => {
    const byTeam = TOOL_TIPS[k] ?? {};
    return byTeam[team] ?? byTeam["Other"] ?? [];
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
