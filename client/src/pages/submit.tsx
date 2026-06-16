import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TOOLS, TOOL_KEYS, TEAMS, LABELS, calcScore, getToolTips, type ToolKey, type MetricKey } from "@/lib/scorecard";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolScores {
  freq: number; time: number; impact: number; adopt: number;
}

const DEFAULT_SCORES: ToolScores = { freq: 3, time: 2, impact: 3, adopt: 2 };

export default function SubmitPage() {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [otherTeam, setOtherTeam] = useState("");
  const [selected, setSelected] = useState<Record<ToolKey, boolean>>({ cgt: false, cla: false, per: false });
  const [scores, setScores] = useState<Record<ToolKey, ToolScores>>({
    cgt: { ...DEFAULT_SCORES },
    cla: { ...DEFAULT_SCORES },
    per: { ...DEFAULT_SCORES },
  });
  const [useCases, setUseCases] = useState("");
  const [challenges, setChallenges] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [tips, setTips] = useState<string[]>([]);
  const [dupWarning, setDupWarning] = useState("");
  const [dupChecked, setDupChecked] = useState(""); // "name|team" last checked

  // Resolved team name — if "Other" was chosen, use the typed value instead
  const effectiveTeam = team === "Other" ? otherTeam.trim() : team;

  // Check for duplicate when name + team are both filled
  useEffect(() => {
    const key = `${name.trim()}|${effectiveTeam}`;
    if (!name.trim() || !effectiveTeam || key === dupChecked) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/submissions/check-duplicate?name=${encodeURIComponent(name.trim())}&team=${encodeURIComponent(effectiveTeam)}`);
        const data = await res.json();
        if (data.isDuplicate) {
          const monthLabel = new Date(data.month + "-02").toLocaleString("default", { month: "long", year: "numeric" });
          setDupWarning(`Heads up: ${name.trim()} from ${effectiveTeam} already submitted for ${monthLabel}. You can still submit again if needed.`);
        } else {
          setDupWarning("");
        }
        setDupChecked(key);
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [name, effectiveTeam]);

  const mutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await apiRequest("POST", "/api/submissions", body);
      if (!res.ok) throw new Error("Submission failed");
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: () => setError("Something went wrong. Please try again."),
  });

  function setScore(tool: ToolKey, metric: MetricKey, val: number) {
    setScores(prev => ({ ...prev, [tool]: { ...prev[tool], [metric]: val } }));
  }

  function handleSubmit() {
    setError("");
    if (!name.trim() || !team) { setError("Please add your name and team."); return; }
    if (team === "Other" && !otherTeam.trim()) { setError("Please enter your team name."); return; }
    const activeTools = TOOL_KEYS.filter(t => selected[t]);
    if (activeTools.length === 0) { setError("Please select at least one tool you use."); return; }
    const tools: Record<string, ToolScores> = {};
    activeTools.forEach(t => { tools[t] = scores[t]; });

    // Silently determine if tips are warranted (B+ = no tips, below B = show tips for their tools)
    const avgPct = Math.round(
      activeTools.map(t => calcScore(scores[t]).pct).reduce((a, b) => a + b, 0) / activeTools.length
    );
    setTips(avgPct < 64 ? getToolTips(activeTools, effectiveTeam, 3) : []);

    mutation.mutate({ name: name.trim(), team: effectiveTeam, tools, useCases, challenges });
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className={cn("w-full text-center space-y-5 animate-fade-up", tips.length > 0 ? "max-w-md" : "max-w-sm")}>
          <CheckCircle2 className="w-14 h-14 mx-auto animate-pop-in" style={{ color: "var(--good)" }} />
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "'Fraunces', serif" }}>All done!</h2>
            <p className="text-sm text-muted-foreground mt-2">Your scorecard has been sent to Elie for review. Thanks!</p>
          </div>

          {tips.length > 0 && (
            <div className="text-left bg-card border border-border rounded-sm px-5 py-4 space-y-3 animate-fade-up" style={{ animationDelay: "120ms" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>
                A few ways to get even more from AI
              </p>
              <ul className="space-y-2">
                {tips.map((tip, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-foreground/80">
                    <span className="mt-0.5 shrink-0 text-muted-foreground">→</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => { setSubmitted(false); setTips([]); setName(""); setTeam(""); setOtherTeam(""); setUseCases(""); setChallenges(""); setSelected({ cgt: false, cla: false, per: false }); setScores({ cgt: { ...DEFAULT_SCORES }, cla: { ...DEFAULT_SCORES }, per: { ...DEFAULT_SCORES } }); }}
            className="text-sm border border-input rounded-sm px-5 py-2 hover:border-foreground hover:bg-foreground hover:text-background transition-all"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-5">
      <div className="max-w-[720px] mx-auto">
        {/* Header */}
        <div className="border-b-2 border-foreground pb-5 mb-8 flex justify-between items-end animate-fade-up">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1" style={{ fontFamily: "'Geist Mono', monospace" }}>VCNY · AI Scorecard</p>
            <h1 className="text-3xl font-medium leading-none tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>Your AI tool feedback</h1>
            <p className="text-xs text-muted-foreground mt-2">Takes about 2 minutes · helps us decide which tools to keep</p>
          </div>
          <a href="/#/admin" className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-foreground px-3 py-1.5 rounded-sm hover:bg-foreground hover:text-background transition-colors" style={{ fontFamily: "'Geist Mono', monospace" }}>Admin</a>
        </div>

        {/* Your details */}
        <div className="bg-card border border-border rounded-sm p-6 mb-4 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="section-num">01</span>
            <h2 className="text-xl font-medium" style={{ fontFamily: "'Fraunces', serif" }}>Your details</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Your name</label>
              <input
                data-testid="input-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sarah Chen"
                className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Your team</label>
              <select
                data-testid="select-team"
                value={team}
                onChange={e => { setTeam(e.target.value); setOtherTeam(""); }}
                className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
              >
                <option value="">Choose team...</option>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {team === "Other" && (
                <input
                  data-testid="input-other-team"
                  type="text"
                  value={otherTeam}
                  onChange={e => setOtherTeam(e.target.value)}
                  placeholder="Enter your team name"
                  className="w-full mt-2 px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-3 tracking-[0.04em]">Which paid AI tools do you currently have?</label>
            <div className="flex gap-3 flex-wrap">
              {TOOL_KEYS.map(t => {
                const colorKey = t === "cgt" ? "chatgpt" : t === "cla" ? "claude" : "perplexity";
                return (
                  <button
                    key={t}
                    type="button"
                    data-testid={`check-${t}`}
                    onClick={() => setSelected(prev => ({ ...prev, [t]: !prev[t] }))}
                    className={cn(
                      `tool-card tool-card-${t}`,
                      selected[t] ? "selected" : "opacity-60 hover:opacity-90"
                    )}
                  >
                    {/* brand dot */}
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `var(--${colorKey})` }} />
                    <span className={cn(selected[t] ? `text-[var(--${colorKey}-text)]` : "text-foreground", "text-sm font-semibold")}>
                      {TOOLS[t]}
                    </span>
                    {selected[t] && (
                      <CheckCircle2 className="w-4 h-4 ml-1 animate-pop-in" style={{ color: `var(--${colorKey})` }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tool sections */}
        {TOOL_KEYS.some(t => selected[t]) && (
          <div className="flex items-center gap-3 mb-3 mt-7 animate-fade-up">
            <span className="section-num">02</span>
            <h2 className="text-xl font-medium" style={{ fontFamily: "'Fraunces', serif" }}>Rate your tools</h2>
          </div>
        )}
        {TOOL_KEYS.filter(t => selected[t]).map(t => (
          <ToolSection key={t} toolKey={t} scores={scores[t]} onChange={(m, v) => setScore(t, m, v)} />
        ))}

        {/* Use cases + challenges */}
        <div className="bg-card border border-border rounded-sm p-6 mb-4 mt-7 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="section-num">{TOOL_KEYS.some(t => selected[t]) ? "03" : "02"}</span>
            <h2 className="text-xl font-medium" style={{ fontFamily: "'Fraunces', serif" }}>In your own words</h2>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Top 1–3 use cases (what do you actually use these for?)</label>
            <textarea
              data-testid="input-usecases"
              value={useCases}
              onChange={e => setUseCases(e.target.value)}
              placeholder="e.g. Drafting product descriptions, summarizing reports, brainstorming campaigns..."
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors resize-y min-h-[60px]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Challenges or what would make it more useful?</label>
            <textarea
              data-testid="input-challenges"
              value={challenges}
              onChange={e => setChallenges(e.target.value)}
              placeholder="e.g. Hard to remember good prompts, output too generic..."
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors resize-y min-h-[60px]"
            />
          </div>
        </div>

        {dupWarning && (
          <div className="animate-pop-in flex items-start gap-2 text-sm mb-3 px-3 py-2 rounded-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 text-yellow-800 dark:text-yellow-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {dupWarning}
          </div>
        )}
        {error && (
          <div className="animate-pop-in flex items-center gap-2 text-sm mb-3 px-3 py-2 rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          data-testid="button-submit"
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="group w-full bg-foreground text-background py-3.5 rounded-sm font-semibold text-sm hover:opacity-90 active:scale-[0.99] transition-all duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {mutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</>
            : <>Submit scorecard<span className="inline-block transition-transform duration-200 group-hover:translate-x-1">→</span></>}
        </button>

        <div className="mt-10 pt-5 border-t border-border text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>
          VCNY · AI Scorecard · v2.0
        </div>
      </div>
    </div>
  );
}

function ToolSection({ toolKey, scores, onChange }: {
  toolKey: ToolKey;
  scores: { freq: number; time: number; impact: number; adopt: number };
  onChange: (metric: MetricKey, value: number) => void;
}) {
  const metrics: { key: MetricKey; label: string }[] = [
    { key: "freq", label: "Frequency" },
    { key: "time", label: "Time saved/wk" },
    { key: "impact", label: "Impact on work" },
    { key: "adopt", label: "Adoption depth" },
  ];

  return (
    <div className={cn("border-l-[3px] pl-4 pr-4 py-3.5 mb-4 bg-card rounded-r-sm animate-slide-down tool-section-" + toolKey)}>
      <span className={cn("pill-" + toolKey, "inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3")}>{TOOLS[toolKey]}</span>
      <div className="space-y-2.5">
        {metrics.map(({ key, label }) => (
          <SliderRow
            key={key}
            toolKey={toolKey}
            metricKey={key}
            label={label}
            value={scores[key as keyof typeof scores] as number}
            onChange={v => onChange(key, v)}
          />
        ))}
      </div>
    </div>
  );
}

const TOOL_TRACK_COLOR: Record<string, string> = {
  cgt: "var(--chatgpt)",
  cla: "var(--claude)",
  per: "var(--perplexity)",
};

function SliderRow({ toolKey, metricKey, label, value, onChange }: {
  toolKey: string; metricKey: MetricKey; label: string; value: number; onChange: (v: number) => void;
}) {
  const intensity = value / 5;
  const labelColor = intensity >= 0.6 ? "var(--good)" : intensity >= 0.4 ? "var(--warn)" : "var(--bad)";
  const pct = intensity * 100;
  const trackColor = TOOL_TRACK_COLOR[toolKey] ?? "hsl(var(--foreground))";
  return (
    <div className="grid grid-cols-[96px_1fr_88px] sm:grid-cols-[130px_1fr_110px] gap-2.5 sm:gap-3 items-center">
      <span className="text-[13px] sm:text-sm font-medium text-foreground">{label}</span>
      <input
        data-testid={`slider-${toolKey}-${metricKey}`}
        type="range"
        min={0} max={5} step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full"
        style={{
          background: `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${pct}%, hsl(var(--input)) ${pct}%, hsl(var(--input)) 100%)`,
        }}
      />
      <span className="text-[12px] sm:text-sm font-semibold text-right transition-colors" style={{ color: labelColor }}>
        {LABELS[metricKey][value]}
      </span>
    </div>
  );
}
