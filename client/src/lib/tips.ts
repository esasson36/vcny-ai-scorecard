// ─────────────────────────────────────────────────────────────────────────────
// Post-submission coaching tips.
//
// Every team has a pool of 30 tool-specific tips (10 each for ChatGPT, Claude,
// Perplexity). After someone submits, the tools they scored below 80% on get
// tips, weighted toward the weakest tool — 5 tips total. Scores are never shown
// or mentioned; the tips read as "ways to get more out of it", not a verdict.
//
// Selection is pseudo-random but seeded on name+month, so resubmitting or
// re-rendering shows the same tips, while different people see different ones.
// ─────────────────────────────────────────────────────────────────────────────
import { TOOLS, type ToolKey } from "./scorecard";

// ── Seeded randomness ────────────────────────────────────────────────────────
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick<T>(arr: readonly T[], n: number, rnd: () => number): T[] {
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// ── Team matching ────────────────────────────────────────────────────────────
// Preset teams get their own pool; anything typed in manually gets the General
// pool of 30 generic tips (10 per tool). No keyword guessing — a wrong guess
// ("accounting" → Sales tips) is worse than a good generic tip.
export function matchTeamPool(teamName: string): string {
  const t = (teamName ?? "").trim();
  if (!t) return "General";
  return Object.keys(TEAM_TIPS).find(k => k.toLowerCase() === t.toLowerCase()) ?? "General";
}

// ── The pools: 10 tips per tool per team ─────────────────────────────────────
type TeamPool = Record<ToolKey, string[]>;

export const TEAM_TIPS: Record<string, TeamPool> = {
  "Design": {
    cgt: [
      "Use ChatGPT to generate quick colorway variations of a print before committing to full artwork",
      "Ask ChatGPT to mock up a product in a lifestyle scene so buyers see it styled, not on white",
      "Describe a trend to ChatGPT and ask for 10 pattern directions to sketch from",
      "Use ChatGPT to turn a rough sketch photo into a cleaned-up concept image",
      "Ask ChatGPT to write the design rationale for a line presentation in two sentences per style",
      "Have ChatGPT rename a whole collection — give it the mood and ask for 15 name options",
      "Use ChatGPT to map one artwork across pillows, quilts, and curtains to check how it scales",
      "Ask ChatGPT to describe your print in buyer-friendly language for the line sheet",
      "Feed ChatGPT a mood board description and ask what's missing from the story",
      "Use ChatGPT to draft polite pushback when a requested revision would hurt the design",
    ],
    cla: [
      "Paste a full tech pack into Claude and ask it to flag inconsistencies before it goes to the factory",
      "Use Claude to compare two seasons' line lists and summarize what actually changed",
      "Ask Claude to turn scattered buyer feedback emails into one prioritized revision list",
      "Have Claude write detailed artwork handoff notes so the factory asks fewer questions",
      "Use Claude to summarize a long trend report into 5 directions relevant to home textiles",
      "Ask Claude to check your care-label wording against the spec sheet for mismatches",
      "Paste competitor product pages into Claude and ask how your assortment gaps compare",
      "Use Claude to draft the seasonal design brief from last season's sell-through notes",
      "Ask Claude to organize your design archive descriptions so old prints are findable",
      "Have Claude proof every SKU name and description in a line sheet in one pass",
    ],
    per: [
      "Use Perplexity to check what prints and palettes are trending at retail right now — it cites sources",
      "Search Perplexity for next season's Pantone and WGSN color directions before palette meetings",
      "Ask Perplexity which textile trade shows are worth watching this year and what showed there",
      "Use Perplexity to research a technique — 'how is chenille jacquard made' — before specifying it",
      "Look up how competitors describe similar products on Perplexity to sharpen your own copy",
      "Ask Perplexity what's selling in bedding on Amazon and Wayfair this quarter",
      "Use Perplexity to research a licensed property's visual guidelines before designing against them",
      "Check fabric performance claims on Perplexity — 'is recycled polyester durable for curtains'",
      "Ask Perplexity for examples of how a trend translated into home decor, with links",
      "Use Perplexity to find reference imagery sources that are safe to use commercially",
    ],
  },

  "Merchandising": {
    cgt: [
      "Use ChatGPT to draft vendor emails and follow-ups — describe the situation and edit from there",
      "Ask ChatGPT to turn messy product specs into clean line-sheet bullet points",
      "Have ChatGPT write PO notes faster: give it the facts, ask for the standard format",
      "Use ChatGPT to build a quick comparison of two vendors against your criteria",
      "Ask ChatGPT for 5 ways to present a price increase to a buyer without losing the order",
      "Use ChatGPT to draft assortment rationale slides from your notes",
      "Have ChatGPT summarize a long email chain with a vendor into next steps",
      "Ask ChatGPT to generate product name and description variants for a new program",
      "Use ChatGPT to prep negotiation talking points before a vendor call",
      "Paste a buyer's requirements into ChatGPT and ask for the gaps in your current lineup",
    ],
    cla: [
      "Paste your sell-through export into Claude and ask which SKUs to cut and why",
      "Use Claude to reconcile a cost sheet against a quote and flag every discrepancy",
      "Ask Claude to compare this season's assortment plan to last season's and summarize shifts",
      "Have Claude read a vendor contract and list the terms that differ from your standard",
      "Use Claude to turn a season of buyer feedback into a one-page assortment brief",
      "Ask Claude to check a line sheet for missing sizes, prices, and inconsistent naming",
      "Paste margin data into Claude and ask which programs are underperforming plan",
      "Use Claude to draft a quarterly business review from your raw numbers",
      "Ask Claude to analyze which price points are working across your categories",
      "Have Claude organize open orders by risk: late, short-shipped, or unconfirmed",
    ],
    per: [
      "Use Perplexity to comp-shop a product — 'queen quilt sets under $60 at Walmart and Target'",
      "Ask Perplexity what's trending in home textiles at mass retail this season, with sources",
      "Check a vendor's background on Perplexity before onboarding them",
      "Use Perplexity to research tariff and duty changes affecting your categories",
      "Ask Perplexity how a competitor is pricing similar programs right now",
      "Look up retailer compliance requirements on Perplexity before committing to a program",
      "Use Perplexity to track cotton and polyester price trends before cost negotiations",
      "Ask Perplexity which materials or constructions are gaining share in bedding",
      "Research a new retail channel on Perplexity — minimums, terms, and how to pitch it",
      "Use Perplexity to find what reviews say about a competitor product you're up against",
    ],
  },

  "Sales": {
    cgt: [
      "Use ChatGPT to draft buyer emails in half the time — give it the ask and the tone",
      "Ask ChatGPT to punch up product copy for an Amazon or Walmart listing",
      "Have ChatGPT write 3 versions of a pitch opener and pick the strongest",
      "Use ChatGPT to prep answers to the objections you expect before a buyer meeting",
      "Paste your rough notes into ChatGPT and ask for a clean recap email to the buyer",
      "Ask ChatGPT to build a one-page sell sheet outline for a new program",
      "Use ChatGPT to write planogram and item-setup notes in the retailer's format",
      "Have ChatGPT translate product specs into benefits a buyer actually cares about",
      "Ask ChatGPT for 10 subject lines for your next outreach and A/B the best two",
      "Use ChatGPT to role-play the negotiation: it plays the buyer, you practice responses",
    ],
    cla: [
      "Paste POS data into Claude and ask for the story: what's selling, what's stalling, and why",
      "Use Claude to prep a quarterly review deck outline straight from your sales numbers",
      "Ask Claude to summarize a retailer's vendor guide into the 10 rules that affect you",
      "Have Claude compare your item setup sheet against the retailer's spec and flag gaps",
      "Use Claude to turn a long RFQ into a checklist of exactly what needs answering",
      "Ask Claude to analyze lost orders for patterns — price, timing, or assortment",
      "Paste an email thread into Claude and ask for the diplomatic reply that saves the deal",
      "Use Claude to draft your line review presentation from bullet-point wins",
      "Ask Claude to reconcile the buyer's forecast against your shipment plan",
      "Have Claude write account-specific versions of one pitch — Walmart, Target, Amazon each read differently",
    ],
    per: [
      "Use Perplexity to comp-shop your item live — 'best selling shower curtains Walmart' — before the buyer does",
      "Ask Perplexity what a retailer's recent strategy announcements mean for your category",
      "Research a new buyer on Perplexity before the first meeting — background, priorities, recent moves",
      "Use Perplexity to track competitor listings and price moves on Amazon",
      "Ask Perplexity what shoppers complain about in competitor reviews — that's your pitch angle",
      "Look up retail calendar timing on Perplexity — resets, line reviews, when to pitch what",
      "Use Perplexity to research a channel you don't sell yet and what it takes to get in",
      "Ask Perplexity for market size and growth data to strengthen a program proposal",
      "Check freight and tariff news on Perplexity before quoting landed costs",
      "Use Perplexity to find which home textile trends retailers are chasing this quarter, with sources",
    ],
  },

  "Marketing": {
    cgt: [
      "Use ChatGPT to write 3 subject line options for every email, then pick the winner",
      "Ask ChatGPT to draft a campaign brief from a short bullet outline",
      "Use ChatGPT to batch social captions: give it the product, ask for 5 angles",
      "Ask ChatGPT to rewrite copy for a different audience — 'make this land for a younger shopper'",
      "Have ChatGPT build a content calendar: 10 post ideas around one launch",
      "Paste a competitor's email into ChatGPT and ask what makes it work and how to beat it",
      "Use ChatGPT to generate lifestyle image concepts for a product shoot brief",
      "Ask ChatGPT to cut any copy to half its length without losing the message",
      "Use ChatGPT to draft influencer outreach that doesn't sound like a template",
      "Have ChatGPT turn one blog post into an email, 3 captions, and a product page blurb",
    ],
    cla: [
      "Paste campaign metrics into Claude and ask what worked, what didn't, and what to test next",
      "Use Claude to keep brand voice consistent: give it your guide and ask it to edit against it",
      "Ask Claude to analyze a quarter of email performance and find the pattern in your winners",
      "Have Claude write the long-form pieces — brand story, about page, press release",
      "Use Claude to audit your product page copy for gaps against best practices",
      "Ask Claude to summarize customer reviews into themes you can market on",
      "Paste your media plan into Claude and ask where the spend doesn't match the goal",
      "Use Claude to build audience personas from real customer feedback, not guesses",
      "Ask Claude to proof an entire campaign's copy in one pass — every asset, one voice",
      "Have Claude draft the marketing section of a line launch plan from the product brief",
    ],
    per: [
      "Use Perplexity to research what home decor content is trending on social right now",
      "Ask Perplexity how competitors are positioning similar products, with links",
      "Check seasonal search trends on Perplexity before planning campaign timing",
      "Use Perplexity to find press and blogs covering home textiles for outreach lists",
      "Ask Perplexity what keywords shoppers use for your category — feed them into copy",
      "Research a platform's latest algorithm changes on Perplexity before shifting spend",
      "Use Perplexity to pull recent statistics for content — it cites the source for you",
      "Ask Perplexity how brands like yours handled a similar launch or crisis",
      "Look up influencer background and audience fit on Perplexity before signing them",
      "Use Perplexity to monitor what's being said about your brand and competitors this month",
    ],
  },

  "Executive": {
    cgt: [
      "Use ChatGPT to draft announcements and all-hands notes from three bullet points",
      "Ask ChatGPT for the three questions you should ask before approving a proposal",
      "Have ChatGPT turn a rambling memo into one page before it hits your desk twice",
      "Use ChatGPT to prep for a hard conversation: give it the situation, ask for approaches",
      "Ask ChatGPT to steelman the opposite of a decision you're leaning toward",
      "Use ChatGPT to draft board update bullets from the month's highlights",
      "Have ChatGPT rewrite an email so it lands as direction, not suggestion",
      "Ask ChatGPT for a 30-second version of any pitch you have to give",
      "Use ChatGPT to sketch an org announcement before HR polishes it",
      "Ask ChatGPT what a skeptical investor would poke at in your plan",
    ],
    cla: [
      "Paste a long report into Claude and get the one-page executive summary with the risks flagged",
      "Use Claude to compare two strategic options with the tradeoffs laid out side by side",
      "Ask Claude to read a contract and list what's unusual before legal takes a week",
      "Have Claude turn meeting transcripts into decisions made and owners assigned",
      "Use Claude to pressure-test a forecast: paste the model's assumptions and ask what breaks",
      "Ask Claude to synthesize three department updates into the actual state of the business",
      "Paste financials into Claude and ask which numbers moved and why it matters",
      "Use Claude to draft the annual plan narrative from the numbers and priorities",
      "Ask Claude for the questions a buyer of the company would ask — then get answers ready",
      "Have Claude summarize what your leadership team agreed to last quarter versus what happened",
    ],
    per: [
      "Use Perplexity for market intel with sources — 'home textiles market outlook 2027'",
      "Ask Perplexity what competitors announced this quarter before your board prep",
      "Check economic indicators affecting retail on Perplexity — freight, cotton, consumer spend",
      "Use Perplexity to research a potential partner or acquisition target's public record",
      "Ask Perplexity how tariff changes are hitting your category, with citations",
      "Research an unfamiliar market on Perplexity before the expansion conversation",
      "Use Perplexity to see how peer companies structured a move you're considering",
      "Ask Perplexity for recent retail bankruptcy and consolidation news in your channels",
      "Look up a new regulation's actual requirements on Perplexity before delegating it",
      "Use Perplexity to fact-check a claim in a pitch before you repeat it to the board",
    ],
  },

  "HR": {
    cgt: [
      "Use ChatGPT to draft job posts that sound like your company, not a template",
      "Ask ChatGPT to generate interview questions that test for the actual skill",
      "Have ChatGPT rewrite a policy in plain language people will actually read",
      "Use ChatGPT to draft the tricky email — layoff logistics, policy change, sensitive feedback",
      "Ask ChatGPT for onboarding checklist items you might be missing for a role",
      "Use ChatGPT to build interview scorecards so every candidate is judged the same way",
      "Have ChatGPT draft recognition messages that don't sound copy-pasted",
      "Ask ChatGPT to turn exit interview notes into themes worth acting on",
      "Use ChatGPT to write the org chart announcement in a professional layout",
      "Ask ChatGPT for 5 ways to phrase constructive feedback for a review",
    ],
    cla: [
      "Paste a handbook section into Claude and ask what's outdated or contradictory",
      "Use Claude to compare two candidates' interview notes against the scorecard",
      "Ask Claude to summarize engagement survey comments into themes and quotes",
      "Have Claude check a job description for biased or exclusionary language",
      "Use Claude to draft a performance improvement plan that's fair and specific",
      "Paste your benefits summary into Claude and ask what questions employees will have",
      "Ask Claude to turn a messy investigation timeline into a clean chronology",
      "Use Claude to draft training materials from a subject expert's rough notes",
      "Ask Claude to review your onboarding docs as if it were a confused new hire",
      "Have Claude build a skills matrix from a stack of team job descriptions",
    ],
    per: [
      "Use Perplexity to check current employment law requirements — it cites the actual rules",
      "Ask Perplexity what competitive salaries look like for a role in your market",
      "Research state-by-state differences on Perplexity before writing a remote policy",
      "Use Perplexity to check what benefits similar-size companies are offering now",
      "Ask Perplexity for current guidance on a compliance question before calling the lawyer",
      "Look up interview question legality on Perplexity — what you can and can't ask",
      "Use Perplexity to research training programs and certifications worth funding",
      "Ask Perplexity how other companies structure hybrid schedules that stick",
      "Check unemployment and labor market trends on Perplexity before planning headcount",
      "Use Perplexity to find recruiting channels for hard-to-fill roles",
    ],
  },

  "IT": {
    cgt: [
      "Use ChatGPT to draft security awareness emails people will actually read",
      "Ask ChatGPT to explain a technical change to non-technical staff in three sentences",
      "Have ChatGPT write PowerShell or batch scripts for repetitive admin tasks",
      "Use ChatGPT to draft ticket responses for the questions you answer weekly",
      "Ask ChatGPT to turn an incident into a plain-language postmortem for leadership",
      "Use ChatGPT to generate test cases before rolling out a system change",
      "Have ChatGPT draft the maintenance window announcement with the right level of detail",
      "Ask ChatGPT to write documentation for the process only you know how to do",
      "Use ChatGPT to build a troubleshooting flowchart for the help desk",
      "Ask ChatGPT to review your backup checklist for the step everyone forgets",
    ],
    cla: [
      "Paste a vendor's security questionnaire into Claude and draft answers from your docs",
      "Use Claude to review a script before it runs against production",
      "Ask Claude to compare two software quotes line by line — licensing, support, hidden costs",
      "Have Claude read release notes and summarize what actually affects your stack",
      "Use Claude to draft an IT policy from your bullet points, in enforceable language",
      "Paste log excerpts into Claude and ask what pattern precedes the failure",
      "Ask Claude to turn your network diagram notes into onboarding documentation",
      "Use Claude to write the migration runbook with rollback steps included",
      "Ask Claude to audit your ticket categories and suggest what to automate first",
      "Have Claude draft the disaster recovery plan skeleton from your current setup",
    ],
    per: [
      "Use Perplexity to check if a CVE affects your versions — it links the advisory",
      "Ask Perplexity to compare tools before a purchase — 'best MDM for a 50-person company'",
      "Research a vendor's breach history on Perplexity before signing",
      "Use Perplexity to find current best practice for a config you're unsure about",
      "Ask Perplexity what an error message means when the docs don't say",
      "Check end-of-life dates for your software versions on Perplexity",
      "Use Perplexity to research licensing changes — vendors love changing terms quietly",
      "Ask Perplexity how other IT teams handle BYOD for a policy you're writing",
      "Look up integration compatibility on Perplexity before promising it works",
      "Use Perplexity to track phishing campaigns currently circulating in your industry",
    ],
  },

  "Operations": {
    cgt: [
      "Use ChatGPT to draft carrier and 3PL emails fast — dispute, follow-up, escalation",
      "Ask ChatGPT to turn a routing guide change into a checklist for the warehouse",
      "Have ChatGPT write the shipping delay notice in customer-appropriate language",
      "Use ChatGPT to draft SOPs from how you'd explain the process out loud",
      "Ask ChatGPT to build a shift handoff template that captures what actually matters",
      "Use ChatGPT to summarize a week of status emails into one update for leadership",
      "Have ChatGPT draft the chargeback dispute letter with the facts organized",
      "Ask ChatGPT for a packing slip and label checklist per retailer",
      "Use ChatGPT to write warehouse safety reminders that don't get ignored",
      "Ask ChatGPT to turn your peak-season plan into a one-page timeline",
    ],
    cla: [
      "Paste shipment data into Claude and ask which lanes and carriers are underperforming",
      "Use Claude to reconcile a freight invoice against the quote and flag every overcharge",
      "Ask Claude to read a retailer's routing guide and list what changed from last version",
      "Have Claude analyze chargebacks for the root cause pattern — labels, timing, or ASN errors",
      "Use Claude to compare 3PL proposals with the cost drivers laid out side by side",
      "Paste inventory exports into Claude and ask what's aging past its plan",
      "Ask Claude to build the receiving discrepancy report from your notes",
      "Use Claude to draft the carrier scorecard from on-time and damage data",
      "Ask Claude to summarize a customs issue thread into what's blocking and who owns it",
      "Have Claude turn your peak-season retrospective into next year's checklist",
    ],
    per: [
      "Use Perplexity to check current ocean and trucking rates before negotiating",
      "Ask Perplexity about port congestion and strikes that could hit your lanes",
      "Research a retailer's compliance requirements on Perplexity before first shipment",
      "Use Perplexity to check customs rules for a new product category",
      "Ask Perplexity what carriers are doing with fuel surcharges this quarter",
      "Look up warehouse automation options on Perplexity before the capex conversation",
      "Use Perplexity to research a 3PL's reputation and client history",
      "Ask Perplexity how tariff changes affect your HTS codes, with sources",
      "Check weather and disruption forecasts on Perplexity during critical ship windows",
      "Use Perplexity to find benchmark fulfillment costs for your order profile",
    ],
  },

  "Packaging": {
    cgt: [
      "Use ChatGPT to draft packaging copy variations — front panel, back panel, insert",
      "Ask ChatGPT to simplify care instructions into icons-plus-text customers understand",
      "Have ChatGPT generate dieline callout notes for the printer from your specs",
      "Use ChatGPT to write the packaging brief from the product and channel requirements",
      "Ask ChatGPT for structural ideas: 'ways to package a queen comforter that show the fabric'",
      "Use ChatGPT to draft vendor emails about print quality issues with photos described",
      "Have ChatGPT translate packaging copy for bilingual requirements, then verify with a native speaker",
      "Ask ChatGPT to critique a package mockup description against shelf-impact basics",
      "Use ChatGPT to draft the unboxing insert that gets a review without begging",
      "Ask ChatGPT for cost-reduction ideas that don't visibly cheapen the package",
    ],
    cla: [
      "Paste retailer packaging specs into Claude and ask for the compliance checklist",
      "Use Claude to compare two packaging quotes with materials and tooling broken out",
      "Ask Claude to check your label copy against the claims the product can actually make",
      "Have Claude summarize a packaging regulation update into what changes for your SKUs",
      "Use Claude to audit your packaging SKUs for inconsistent branding and legal lines",
      "Paste dieline revision emails into Claude and ask for the final agreed spec",
      "Ask Claude to draft the artwork release checklist so nothing ships with old copy",
      "Use Claude to organize your packaging component library by product family",
      "Ask Claude to review a sustainability claim's wording before it goes to print",
      "Have Claude turn printer defect reports into a QC standard for the next run",
    ],
    per: [
      "Use Perplexity to check labeling requirements by state and retailer — it cites the rules",
      "Ask Perplexity what recycled-content claims legally require before printing them",
      "Research packaging material costs and availability on Perplexity before quoting",
      "Use Perplexity to see how competitors package similar products, with images and links",
      "Ask Perplexity about Prop 65 and chemical disclosure requirements for your materials",
      "Look up retailer sustainable packaging mandates on Perplexity — they change yearly",
      "Use Perplexity to research new materials — 'alternatives to PVC bags for bedding'",
      "Ask Perplexity what packaging trends are showing at trade shows this year",
      "Check international labeling rules on Perplexity before an export program",
      "Use Perplexity to find printers and converters with the capability you need",
    ],
  },

  "Production": {
    cgt: [
      "Use ChatGPT to draft factory emails that are unambiguous — deadlines, quantities, consequences",
      "Ask ChatGPT to turn inspection notes into a clean defect report with photos described",
      "Have ChatGPT write the production status update from your tracker in two minutes",
      "Use ChatGPT to draft escalation emails when a factory misses a date — firm but workable",
      "Ask ChatGPT to build a pre-production checklist for a new style",
      "Use ChatGPT to summarize a long WhatsApp thread with a factory into decisions and open items",
      "Have ChatGPT draft the corrective action request from the QC findings",
      "Ask ChatGPT to translate technical comments for an overseas factory into simple English",
      "Use ChatGPT to write the handoff notes when a program moves between factories",
      "Ask ChatGPT for questions to ask a new factory before placing the first order",
    ],
    cla: [
      "Paste your open PO report into Claude and ask what's at risk of missing cancel dates",
      "Use Claude to compare factory quotes with hidden costs surfaced — testing, freight, tooling",
      "Ask Claude to analyze defect rates by factory and style for the real pattern",
      "Have Claude read an inspection report and summarize pass/fail with the critical issues first",
      "Use Claude to build the production calendar from order dates and lead times",
      "Paste a factory's capacity email into Claude and ask if the math actually works",
      "Ask Claude to reconcile shipped quantities against POs and flag shortages",
      "Use Claude to draft the vendor scorecard from delivery and quality data",
      "Ask Claude to turn a season's production issues into a lessons-learned doc",
      "Have Claude check a time-and-action calendar for steps that can't fit the dates",
    ],
    per: [
      "Use Perplexity to research a factory or agent's background before the first order",
      "Ask Perplexity about labor and holiday calendars in your sourcing countries — plan around them",
      "Check fabric and yarn price trends on Perplexity before locking costs",
      "Use Perplexity to research testing standards a retailer requires for your product",
      "Ask Perplexity what's happening with freight rates and transit times this month",
      "Look up alternative sourcing countries on Perplexity when tariffs move",
      "Use Perplexity to check a chemical or treatment's compliance status before approving it",
      "Ask Perplexity how monsoon or energy restrictions are affecting production regions",
      "Research minimum wage and cost changes in sourcing countries on Perplexity",
      "Use Perplexity to find certifications a factory claims and verify what they mean",
    ],
  },

  "Pet Production": {
    cgt: [
      "Use ChatGPT to draft pet product copy that speaks to owners — comfort, durability, washability",
      "Ask ChatGPT to turn testing notes into a clear pet-safety summary for the line sheet",
      "Have ChatGPT write factory emails about pet-specific requirements — zippers, stuffing, seams",
      "Use ChatGPT to brainstorm pet bed styles for a retailer's price point",
      "Ask ChatGPT to draft the QC checklist specific to pet products — chew points, choking hazards",
      "Use ChatGPT to summarize a pet program's status for the buyer update",
      "Have ChatGPT write care instructions for pet items that owners will actually follow",
      "Ask ChatGPT for seasonal pet product ideas retailers haven't seen ten times",
      "Use ChatGPT to draft the packaging insert connecting the pet line to your main brand",
      "Ask ChatGPT to turn competitor pet reviews into a list of what to build better",
    ],
    cla: [
      "Paste pet product specs into Claude and ask for gaps against safety standards",
      "Use Claude to compare your pet assortment against the category leaders' lineups",
      "Ask Claude to analyze pet SKU sell-through and flag what to expand or cut",
      "Have Claude read a retailer's pet product requirements and build the compliance list",
      "Use Claude to draft the pet line launch plan from the assortment and dates",
      "Paste customer reviews of your pet products into Claude and ask for the top fixes",
      "Ask Claude to check pet product labeling claims — 'chew-resistant' has to be defensible",
      "Use Claude to organize fabric and fill choices by durability testing results",
      "Ask Claude to summarize pet category performance for the quarterly review",
      "Have Claude draft factory instructions for a pet style's safety-critical construction",
    ],
    per: [
      "Use Perplexity to research the pet products market size and growth — it cites sources",
      "Ask Perplexity what's trending in pet furniture and bedding at retail right now",
      "Check pet product safety regulations on Perplexity — standards vary by retailer",
      "Use Perplexity to see how Chewy and Amazon rank competing pet beds",
      "Ask Perplexity what materials are considered pet-safe for stuffing and covers",
      "Research pet owner spending trends on Perplexity before pitching a program",
      "Use Perplexity to find what pet product claims trigger regulatory scrutiny",
      "Ask Perplexity which pet retailers are expanding and taking new vendors",
      "Look up flammability and chemical testing requirements for pet items on Perplexity",
      "Use Perplexity to research seasonal pet purchase patterns for buy planning",
    ],
  },

  "Quality Assurance & Compliance": {
    cgt: [
      "Use ChatGPT to draft non-conformance reports with findings organized by severity",
      "Ask ChatGPT to turn a regulation summary into a checklist your team can execute",
      "Have ChatGPT write the corrective action email to a factory — specific, dated, verifiable",
      "Use ChatGPT to draft test request forms for the lab from the product spec",
      "Ask ChatGPT to explain a compliance requirement to sales in language they'll act on",
      "Use ChatGPT to build an audit prep checklist from last year's findings",
      "Have ChatGPT summarize inspection photos and notes into a one-page defect report",
      "Ask ChatGPT for common failure points to check on a product type before spec'ing tests",
      "Use ChatGPT to draft the recall communication you hope you never send",
      "Ask ChatGPT to standardize your report templates so every inspector writes the same way",
    ],
    cla: [
      "Paste lab results into Claude and ask which failures block shipment versus need retest",
      "Use Claude to compare a retailer's testing protocol against what you already test",
      "Ask Claude to read a new regulation and summarize what changes for your products",
      "Have Claude analyze a year of test failures for patterns by factory, fabric, or category",
      "Use Claude to check care label claims against the actual test data",
      "Paste audit findings into Claude and ask for the remediation plan skeleton",
      "Ask Claude to reconcile certificates of compliance against your active SKU list",
      "Use Claude to draft SOPs for your inspection process with decision points explicit",
      "Ask Claude to summarize the differences between two versions of a standard",
      "Have Claude build the compliance calendar — what expires, what's due, what's changing",
    ],
    per: [
      "Use Perplexity to check current CPSC requirements for your product category — it cites the rule",
      "Ask Perplexity what changed in flammability standards this year",
      "Research Prop 65 chemical list updates on Perplexity before they surprise you",
      "Use Perplexity to look up a retailer's latest testing and compliance manual changes",
      "Ask Perplexity about recalls of similar products — learn from someone else's mistake",
      "Check international standards on Perplexity before a product ships to a new market",
      "Use Perplexity to research a lab's accreditation before sending them your testing",
      "Ask Perplexity what a specific test method actually measures before requiring it",
      "Look up formaldehyde and chemical limits by market on Perplexity",
      "Use Perplexity to track pending regulation that will hit your categories next year",
    ],
  },

  "Brands": {
    cgt: [
      "Use ChatGPT to draft licensor pitch emails that lead with what's in it for them",
      "Ask ChatGPT to write brand story copy for a licensed program's sell sheet",
      "Have ChatGPT summarize a brand's style guide into rules the design team will remember",
      "Use ChatGPT to draft the quarterly licensor update from your program notes",
      "Ask ChatGPT for co-branding ideas between a license and your core lines",
      "Use ChatGPT to write product descriptions that stay inside a licensor's voice rules",
      "Have ChatGPT draft the approval submission cover note that gets a faster yes",
      "Ask ChatGPT to compare two license opportunities on audience and retail fit",
      "Use ChatGPT to build the brand onboarding brief for internal teams",
      "Ask ChatGPT to draft polite pushback when a licensor's request breaks retail reality",
    ],
    cla: [
      "Paste a license agreement into Claude and ask for the royalty terms, minimums, and gotchas",
      "Use Claude to compare two licensing contracts clause by clause",
      "Ask Claude to reconcile royalty reports against sales data before submitting them",
      "Have Claude summarize a licensor's approval feedback across a season into patterns",
      "Use Claude to check product submissions against the style guide before sending",
      "Paste a brand's guidelines into Claude and ask what your current line violates",
      "Ask Claude to draft the renewal negotiation brief with your leverage listed",
      "Use Claude to analyze which licensed programs earn out their minimums and which don't",
      "Ask Claude to track approval status across all pending submissions in one summary",
      "Have Claude turn a licensor call's messy notes into confirmed commitments",
    ],
    per: [
      "Use Perplexity to research a property's popularity trend before licensing it — it cites data",
      "Ask Perplexity what licensed home goods are selling at mass retail right now",
      "Check a licensor's recent deals on Perplexity — who else has the category",
      "Use Perplexity to research a brand's audience demographics before the pitch",
      "Ask Perplexity how a franchise's next release schedule might drive product timing",
      "Look up licensing industry royalty benchmarks on Perplexity before negotiating",
      "Use Perplexity to track which entertainment properties are gaining momentum",
      "Ask Perplexity how competitors executed a similar licensed program",
      "Research trademark disputes around a property on Perplexity before committing",
      "Use Perplexity to find licensing trade show dates and which licensors attend",
    ],
  },

  "AI": {
    cgt: [
      "Use ChatGPT's custom instructions so it stops re-learning your context every chat",
      "Build a prompt library in ChatGPT: save your best prompts as reusable templates",
      "Use ChatGPT projects to keep each workstream's context separate and persistent",
      "Ask ChatGPT to critique its own answer — 'what's wrong with this response?' catches errors",
      "Use ChatGPT for first drafts of training materials when rolling tools out to teams",
      "Chain tasks in ChatGPT: outline first, then expand section by section — better than one giant prompt",
      "Use ChatGPT image generation for internal mockups before briefing designers",
      "Ask ChatGPT to convert between formats — JSON to table, notes to slides, email to doc",
      "Test the same ChatGPT prompt at different levels of specificity and keep what works",
      "Use ChatGPT to draft the rollout announcement for the next tool you're deploying",
    ],
    cla: [
      "Use Claude for anything long: it holds an entire contract, codebase, or report in one conversation",
      "Paste whole spreadsheets into Claude — it reasons over rows better than you'd expect",
      "Use Claude Projects to give it standing knowledge of a workflow you manage",
      "Ask Claude to write and critique prompts for other AI tools — it's good at meta-work",
      "Use Claude for evaluation: paste two AI outputs and ask it to judge which is better and why",
      "Have Claude draft documentation for the AI workflows you build, as you build them",
      "Use Claude artifacts to build small internal tools — calculators, checkers, formatters",
      "Ask Claude to find the edge cases in an automation before it runs on real data",
      "Use Claude to summarize AI vendor pitches into what's real versus marketing",
      "Paste your prompt into Claude and ask 'how would this fail?' before shipping it to the team",
    ],
    per: [
      "Use Perplexity to track AI model releases and pricing changes — the landscape moves weekly",
      "Ask Perplexity to compare AI tools before recommending one — it cites current sources",
      "Research AI vendor security practices on Perplexity before an evaluation",
      "Use Perplexity to check current API pricing when budgeting a build",
      "Ask Perplexity how other companies in your industry are deploying AI",
      "Look up AI regulation developments on Perplexity — compliance is coming everywhere",
      "Use Perplexity to find benchmarks comparing models on the tasks you care about",
      "Ask Perplexity what integrations exist between your stack and the tools you're evaluating",
      "Research prompt techniques on Perplexity — the community finds tricks before vendors document them",
      "Use Perplexity to verify an AI capability claim before repeating it to leadership",
    ],
  },

  "General": {
    cgt: [
      "Give ChatGPT context before the ask: who it's for, what tone, what format — the answer doubles in quality",
      "Ask ChatGPT to improve its own answer: 'make this shorter and more specific' works wonders",
      "Use ChatGPT to draft every email that takes more than two minutes to write",
      "Tell ChatGPT the role to play: 'act as a buyer reviewing this pitch' changes everything",
      "Use ChatGPT to turn meeting notes into action items with owners",
      "Ask ChatGPT for 10 options, not 1 — then pick and refine the best",
      "Use ChatGPT to explain anything unfamiliar: 'explain like I work in home textiles'",
      "Have ChatGPT proofread before anything goes external — tone, typos, clarity",
      "Use ChatGPT to prepare for meetings: 'what questions will they ask about this?'",
      "Save your best ChatGPT prompts somewhere — reuse beats rewriting every time",
    ],
    cla: [
      "Use Claude for long documents — it reads entire contracts and reports in one go",
      "Paste data into Claude and ask for the story, not just the summary",
      "Ask Claude to argue against your plan before someone else does",
      "Use Claude to compare two options with a table of the tradeoffs",
      "Have Claude rewrite anything important for a specific audience",
      "Ask Claude follow-up questions — the second answer is usually better than the first",
      "Use Claude to organize a messy folder of notes into something structured",
      "Paste a confusing email thread into Claude and ask what's actually being decided",
      "Ask Claude to make your checklist for any process you repeat monthly",
      "Use Claude to draft, then make it yours — editing beats starting from blank",
    ],
    per: [
      "Use Perplexity instead of Google when you need an answer with sources, not ten links",
      "Ask Perplexity about anything current — prices, news, trends — where other AIs are stale",
      "Verify claims on Perplexity before repeating them in a meeting",
      "Use Perplexity to research a company, person, or vendor before the call",
      "Ask Perplexity to compare products or services — it pulls current reviews",
      "Check regulations and requirements on Perplexity — it cites the actual rule",
      "Use Perplexity for competitive intel: what are they launching, charging, claiming",
      "Ask Perplexity follow-ups to drill down — each answer keeps the citations coming",
      "Use Perplexity to find statistics with sources for presentations",
      "When ChatGPT or Claude might be out of date, ask Perplexity — that's its whole job",
    ],
  },
};

// ── Congratulations variants ────────────────────────────────────────────────
// Shown when every rated tool scored well. Several variants so the screen
// doesn't feel canned; the seed picks one deterministically per person/month.
export const CONGRATS_MESSAGES = [
  "You're clearly getting real value out of these tools — keep doing exactly what you're doing.",
  "Strong month. The way you're using AI is what we hope the whole company gets to.",
  "Nothing to coach here — you've made these tools part of how you actually work.",
  "You're ahead of the curve on this. If a teammate asks how you use AI, show them.",
  "Great usage across the board. The next win is sharing one trick with your team.",
  "This is what good adoption looks like. Thanks for setting the bar.",
] as const;

// ── Selection ────────────────────────────────────────────────────────────────
export interface ScoredTip {
  tool: ToolKey;
  toolName: string;
  text: string;
}

export type TipResult =
  | { kind: "tips"; teamPool: string; items: ScoredTip[] }
  | { kind: "congrats"; message: string };

/** Tools at or above this percentage are doing fine and get no tips. */
export const TIP_THRESHOLD_PCT = 80;

/**
 * How 5 tips split across weak tools, weakest first:
 * one weak tool → all 5; two → 3/2 (the example in the spec); three → 3/1/1.
 */
const TIP_WEIGHTS: Record<number, number[]> = { 1: [5], 2: [3, 2], 3: [3, 1, 1] };

export function getScoredTips(input: {
  /** pct per rated tool, e.g. { cgt: 90, per: 40 } */
  toolPcts: Partial<Record<ToolKey, number>>;
  team: string;
  /** Stable key, e.g. `${name}|${month}` — same person, same month, same tips. */
  seedKey: string;
}): TipResult {
  const { toolPcts, team, seedKey } = input;
  const rnd = mulberry32(hashSeed(seedKey));
  const teamPool = matchTeamPool(team);
  const pools = TEAM_TIPS[teamPool] ?? TEAM_TIPS["General"];

  const weak = (Object.entries(toolPcts) as [ToolKey, number][])
    .filter(([, pct]) => pct < TIP_THRESHOLD_PCT)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));

  if (weak.length === 0) {
    return { kind: "congrats", message: CONGRATS_MESSAGES[Math.floor(rnd() * CONGRATS_MESSAGES.length)] };
  }

  const weights = TIP_WEIGHTS[Math.min(weak.length, 3)];
  const items: ScoredTip[] = [];
  weak.slice(0, 3).forEach(([tool], i) => {
    const pool = pools[tool] ?? TEAM_TIPS["General"][tool] ?? [];
    seededPick(pool, weights[i], rnd).forEach(text =>
      items.push({ tool, toolName: TOOLS[tool], text }));
  });
  return { kind: "tips", teamPool, items };
}
