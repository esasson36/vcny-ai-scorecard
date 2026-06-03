import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TOOLS, TOOL_KEYS, TEAMS, LABELS, type ToolKey, type MetricKey } from "@/lib/scorecard";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolScores {
  freq: number; time: number; impact: number; adopt: number;
}

const DEFAULT_SCORES: ToolScores = { freq: 3, time: 2, impact: 3, adopt: 2 };

export default function SubmitPage() {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
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
  const [dupWarning, setDupWarning] = useState("");
  const [dupChecked, setDupChecked] = useState(""); // "name|team" last checked

  // Check for duplicate when name + team are both filled
  useEffect(() => {
    const key = `${name.trim()}|${team}`;
    if (!name.trim() || !team || key === dupChecked) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/submissions/check-duplicate?name=${encodeURIComponent(name.trim())}&team=${encodeURIComponent(team)}`);
        const data = await res.json();
        if (data.isDuplicate) {
          const monthLabel = new Date(data.month + "-02").toLocaleString("default", { month: "long", year: "numeric" });
          setDupWarning(`Heads up: ${name.trim()} from ${team} already submitted for ${monthLabel}. You can still submit again if needed.`);
        } else {
          setDupWarning("");
        }
        setDupChecked(key);
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [name, team]);

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
    const activeTools = TOOL_KEYS.filter(t => selected[t]);
    if (activeTools.length === 0) { setError("Please select at least one tool you use."); return; }
    const tools: Record<string, ToolScores> = {};
    activeTools.forEach(t => { tools[t] = scores[t]; });
    mutation.mutate({ name: name.trim(), team, tools, useCases, challenges });
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-5">
          <CheckCircle2 className="w-12 h-12 mx-auto" style={{ color: "var(--good)" }} />
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "'Fraunces', serif" }}>Submitted</h2>
            <p className="text-sm text-muted-foreground mt-2">Your scorecard has been sent to Elie for review. Thanks!</p>
          </div>
          <button
            onClick={() => { setSubmitted(false); setName(""); setTeam(""); setUseCases(""); setChallenges(""); setSelected({ cgt: false, cla: false, per: false }); setScores({ cgt: { ...DEFAULT_SCORES }, cla: { ...DEFAULT_SCORES }, per: { ...DEFAULT_SCORES } }); }}
            className="text-sm border border-input rounded px-4 py-2 hover:border-foreground transition-colors"
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
        <div className="border-b-2 border-foreground pb-5 mb-8 flex justify-between items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1" style={{ fontFamily: "'Geist Mono', monospace" }}>VCNY · AI Scorecard</p>
            <h1 className="text-3xl font-medium leading-none tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>Your AI tool feedback</h1>
          </div>
          <a href="/#/admin" className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-foreground px-3 py-1.5 rounded-sm hover:bg-foreground hover:text-background transition-colors" style={{ fontFamily: "'Geist Mono', monospace" }}>Admin</a>
        </div>

        {/* Your details */}
        <div className="bg-card border border-border rounded-sm p-6 mb-4">
          <h2 className="text-xl font-medium mb-4" style={{ fontFamily: "'Fraunces', serif" }}>Your details</h2>
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
                onChange={e => setTeam(e.target.value)}
                className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
              >
                <option value="">Choose team...</option>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2 tracking-[0.04em]">Which paid AI tools do you currently have?</label>
            <div className="flex gap-4 flex-wrap">
              {TOOL_KEYS.map(t => (
                <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    data-testid={`check-${t}`}
                    type="checkbox"
                    checked={selected[t]}
                    onChange={e => setSelected(prev => ({ ...prev, [t]: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className={cn("pill-"+t, "text-xs font-semibold px-3 py-1 rounded-full")}>{TOOLS[t]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Tool sections */}
        {TOOL_KEYS.filter(t => selected[t]).map(t => (
          <ToolSection key={t} toolKey={t} scores={scores[t]} onChange={(m, v) => setScore(t, m, v)} />
        ))}

        {/* Use cases + challenges */}
        <div className="bg-card border border-border rounded-sm p-6 mb-4">
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
          <div className="flex items-start gap-2 text-sm mb-3 px-3 py-2 rounded-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 text-yellow-800 dark:text-yellow-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {dupWarning}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm mb-3 px-3 py-2 rounded-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          data-testid="button-submit"
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="w-full bg-foreground text-background py-3 rounded-sm font-semibold text-sm hover:opacity-85 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : "Submit scorecard"}
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
    <div className={cn("border-l-[3px] pl-4 pr-4 py-3.5 mb-4 bg-card rounded-r-sm tool-section-" + toolKey)}>
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

function SliderRow({ toolKey, metricKey, label, value, onChange }: {
  toolKey: string; metricKey: MetricKey; label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[130px_1fr_100px] gap-3 items-center">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        data-testid={`slider-${toolKey}-${metricKey}`}
        type="range"
        min={0} max={5} step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full"
      />
      <span className="text-sm font-semibold text-right">{LABELS[metricKey][value]}</span>
    </div>
  );
}
