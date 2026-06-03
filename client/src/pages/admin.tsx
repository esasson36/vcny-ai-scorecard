import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Submission } from "@shared/schema";
import {
  TOOLS, TOOL_KEYS, LABELS, type ToolKey, type MetricKey,
  calcScore, pctToGrade, gradeAction, gradeClass,
} from "@/lib/scorecard";
import { LogOut, RefreshCw, Trash2, ArrowLeft, Sun, Moon, Printer } from "lucide-react";
import { Line } from "react-chartjs-2";
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { useTheme } from "@/lib/theme";
import { getCoachSuggestions } from "@/lib/scorecard";

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
import { cn } from "@/lib/utils";

interface Props { onLogout: () => void; }
type View = "dashboard" | "detail" | "person" | "compare" | "leaderboard" | "teams";

function parseTools(s: string): Record<string, any> {
  try { return JSON.parse(s); } catch { return {}; }
}

function fmtMonth(m: string) {
  if (!m) return "Unknown";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function getMonth(sub: Submission) {
  return sub.month || sub.timestamp.slice(0, 7);
}

export default function AdminPanel({ onLogout }: Props) {
  const { theme, toggle: toggleTheme } = useTheme();
  const [view, setView] = useState<View>("dashboard");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePerson, setActivePerson] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const qc = useQueryClient();

  const { data: subs = [], isFetching, refetch } = useQuery<Submission[]>({
    queryKey: ["/api/submissions"],
    refetchInterval: 30000,
  });

  const { data: headcounts = {}, refetch: refetchHC } = useQuery<Record<string, number>>({
    queryKey: ["/api/headcounts"],
  });

  const setHeadcountMutation = useMutation({
    mutationFn: async ({ team, count }: { team: string; count: number }) => {
      await apiRequest("POST", "/api/headcounts", { team, count });
    },
    onSuccess: () => refetchHC(),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/admin/logout", {}); },
    onSuccess: onLogout,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/submissions/${id}`, {}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/submissions"] }); setView("dashboard"); },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", "/api/submissions", {}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/submissions"] }); setView("dashboard"); },
  });

  const ovMutation = useMutation({
    mutationFn: async ({ id, tool, value }: { id: string; tool: string; value: number }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${id}/ov`, { tool, value });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/submissions"] }),
  });

  // All unique months sorted newest first
  const allMonths = useMemo(() => {
    const months = [...new Set(subs.map(getMonth))].filter(Boolean);
    return months.sort((a, b) => b.localeCompare(a));
  }, [subs]);

  // Set default selectedMonth to latest when months load
  useMemo(() => {
    if (selectedMonth === "all" && allMonths.length > 0) {
      setSelectedMonth(allMonths[0]);
      if (!compareA) setCompareA(allMonths[0]);
      if (!compareB && allMonths.length > 1) setCompareB(allMonths[1]);
    }
  }, [allMonths]);

  const filteredSubs = useMemo(() =>
    selectedMonth === "all" ? subs : subs.filter(s => getMonth(s) === selectedMonth),
    [subs, selectedMonth]
  );

  const sorted = [...filteredSubs].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Unique people across all submissions
  const allPeople = useMemo(() => {
    const map = new Map<string, string>(); // name -> team
    subs.forEach(s => map.set(s.name, s.team));
    return [...map.entries()].map(([name, team]) => ({ name, team }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subs]);

  const activeSub = subs.find(s => s.id === activeId);
  const personSubs = useMemo(() =>
    subs.filter(s => s.name === activePerson)
      .sort((a, b) => getMonth(a).localeCompare(getMonth(b))),
    [subs, activePerson]
  );

  function exportCSV() {
    const TOOLS_MAP: Record<string, string> = { cgt: "ChatGPT", cla: "Claude", per: "Perplexity" };
    const rows: string[][] = [["Month", "Name", "Team", "Date", "Tool",
      "Frequency", "Time Saved", "Impact", "Adoption", "Output Volume",
      "Score", "Max", "Percent", "Grade", "Recommendation", "Use Cases", "Challenges"]];
    subs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => {
        const ts = tools[t];
        const sc = calcScore(ts);
        const g = pctToGrade(sc.pct);
        rows.push([fmtMonth(getMonth(sub)), sub.name, sub.team,
          new Date(sub.timestamp).toLocaleDateString(),
          TOOLS_MAP[t] ?? t,
          LABELS.freq[ts.freq], LABELS.time[ts.time], LABELS.impact[ts.impact], LABELS.adopt[ts.adopt],
          ts.outputVolume !== undefined ? String(ts.outputVolume) : "",
          String(sc.total), String(sc.max), sc.pct + "%", g, gradeAction(g),
          sub.useCases ?? "", sub.challenges ?? ""]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vcny-ai-scorecard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const viewTitle: Record<View, string> = {
    dashboard: "Admin dashboard",
    detail: activeSub?.name ?? "Submission",
    person: activePerson ?? "Person",
    compare: "Month comparison",
    leaderboard: "Leaderboard",
    teams: "Teams",
  };

  return (
    <div className="min-h-screen bg-background py-8 px-5">
      <div className="max-w-[760px] mx-auto">
        {/* Header */}
        <div className="border-b-2 border-foreground pb-5 mb-8 flex justify-between items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1" style={{ fontFamily: "'Geist Mono', monospace" }}>VCNY · AI Scorecard</p>
            <h1 className="text-3xl font-medium leading-none tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>
              {viewTitle[view]}
            </h1>
            <a href="/#/" className="text-xs text-muted-foreground underline underline-offset-2 mt-1 inline-block hover:text-foreground transition-colors">← Back to form</a>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => refetch()} disabled={isFetching}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5"
              style={{ fontFamily: "'Geist Mono', monospace" }}>
              <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />Refresh
            </button>
            <button onClick={exportCSV} disabled={subs.length === 0}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors disabled:opacity-40"
              style={{ fontFamily: "'Geist Mono', monospace" }}>
              ↓ CSV
            </button>
            <button onClick={toggleTheme}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5"
              style={{ fontFamily: "'Geist Mono', monospace" }}>
              {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            </button>
            <button data-testid="button-logout" onClick={() => logoutMutation.mutate()}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5"
              style={{ fontFamily: "'Geist Mono', monospace" }}>
              <LogOut className="w-3 h-3" />Sign out
            </button>
          </div>
        </div>

        {/* Nav tabs */}
        {(["dashboard", "compare", "leaderboard", "teams"] as View[]).includes(view) && (
          <div className="flex gap-1 mb-6 border-b border-border pb-0 overflow-x-auto">
            {(["dashboard", "leaderboard", "teams", "compare"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn("text-[11px] uppercase tracking-[0.1em] px-4 py-2 border-b-2 -mb-px transition-colors whitespace-nowrap",
                  view === v ? "border-foreground text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
                )} style={{ fontFamily: "'Geist Mono', monospace" }}>
                {v === "dashboard" ? "Submissions" : v === "leaderboard" ? "Leaderboard" : v === "teams" ? "Teams" : "Compare"}
              </button>
            ))}
          </div>
        )}

        {view === "dashboard" && (
          <DashView
            subs={sorted} allSubs={subs} allMonths={allMonths}
            selectedMonth={selectedMonth} onMonthChange={setSelectedMonth}
            onOpen={id => { setActiveId(id); setView("detail"); }}
            onOpenPerson={name => { setActivePerson(name); setView("person"); }}
            onClearAll={() => {
              if (confirm(`Delete all ${subs.length} submission${subs.length !== 1 ? "s" : ""} permanently? This cannot be undone.`))
                clearAllMutation.mutate();
            }}
            isClearingAll={clearAllMutation.isPending}
            headcounts={headcounts}
            onSetHeadcount={(team, count) => setHeadcountMutation.mutate({ team, count })}
          />
        )}

        {view === "compare" && (
          <CompareView
            allSubs={subs} allMonths={allMonths}
            compareA={compareA} compareB={compareB}
            onChangeA={setCompareA} onChangeB={setCompareB}
            onBack={() => setView("dashboard")}
          />
        )}

        {view === "leaderboard" && (
          <LeaderboardView
            allSubs={subs} allMonths={allMonths}
            onOpenPerson={name => { setActivePerson(name); setView("person"); }}
          />
        )}

        {view === "teams" && (
          <TeamsView allSubs={subs} allMonths={allMonths} />
        )}

        {view === "detail" && activeSub && (
          <DetailView sub={activeSub}
            onBack={() => setView("dashboard")}
            onDelete={id => { if (confirm("Delete this submission permanently?")) deleteMutation.mutate(id); }}
            onSaveOV={(tool, value) => ovMutation.mutate({ id: activeSub.id, tool, value })}
            isSavingOV={ovMutation.isPending}
          />
        )}

        {view === "person" && activePerson && (
          <PersonView name={activePerson} subs={personSubs}
            onBack={() => setView("dashboard")}
          />
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashView({ subs, allSubs, allMonths, selectedMonth, onMonthChange, onOpen, onOpenPerson, onClearAll, isClearingAll, headcounts, onSetHeadcount }: {
  subs: Submission[]; allSubs: Submission[]; allMonths: string[];
  selectedMonth: string; onMonthChange: (m: string) => void;
  onOpen: (id: string) => void; onOpenPerson: (name: string) => void;
  onClearAll: () => void; isClearingAll: boolean;
  headcounts: Record<string, number>;
  onSetHeadcount: (team: string, count: number) => void;
}) {
  function avgGradeForMonth(m: string) {
    const msubs = m === "all" ? allSubs : allSubs.filter(s => getMonth(s) === m);
    const pcts: number[] = [];
    msubs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => pcts.push(calcScore(tools[t]).pct));
    });
    if (!pcts.length) return "—";
    return pctToGrade(Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length));
  }

  function toolAvgGrade(tool: string) {
    const pcts: number[] = [];
    subs.forEach(sub => {
      const tools = parseTools(sub.tools);
      if (tools[tool]) pcts.push(calcScore(tools[tool]).pct);
    });
    if (!pcts.length) return "—";
    return pctToGrade(Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length));
  }

  return (
    <div>
      {/* Month selector */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>Month</span>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => onMonthChange("all")}
            className={cn("text-[11px] px-3 py-1 rounded-full border transition-colors",
              selectedMonth === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )} style={{ fontFamily: "'Geist Mono', monospace" }}>All</button>
          {allMonths.map(m => (
            <button key={m} onClick={() => onMonthChange(m)}
              className={cn("text-[11px] px-3 py-1 rounded-full border transition-colors",
                selectedMonth === m ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              )} style={{ fontFamily: "'Geist Mono', monospace" }}>{fmtMonth(m)}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Submissions", value: String(subs.length) },
          { label: "Avg ChatGPT", value: toolAvgGrade("cgt"), isGrade: true },
          { label: "Avg Claude", value: toolAvgGrade("cla"), isGrade: true },
          { label: "Avg Perplexity", value: toolAvgGrade("per"), isGrade: true },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-sm p-3.5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.04em] mb-1">{k.label}</div>
            <div className={cn("text-[26px] leading-none font-medium",
              k.isGrade && k.value !== "—" ? gradeClass(k.value) : ""
            )} style={{ fontFamily: "'Fraunces', serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Response rate */}
      <ResponseRate subs={subs} headcounts={headcounts} onSetHeadcount={onSetHeadcount} />

      {/* Submissions list */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>Submissions</h2>
        {allSubs.length > 0 && (
          <button data-testid="button-clear-all" onClick={onClearAll} disabled={isClearingAll}
            className="text-[11px] uppercase tracking-[0.08em] border border-red-200 text-red-600 rounded-sm px-3 py-1 hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
            style={{ fontFamily: "'Geist Mono', monospace" }}>
            {isClearingAll ? "Clearing..." : "Clear all"}
          </button>
        )}
      </div>

      {subs.length === 0 ? (
        <div className="bg-card border border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
          {allSubs.length === 0 ? "No submissions yet. Share the form URL with your team." : "No submissions for this month."}
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map(sub => {
            const tools = parseTools(sub.tools);
            const hasMultiple = allSubs.filter(s => s.name === sub.name).length > 1;
            return (
              <div key={sub.id} className="bg-card border border-border rounded-sm px-4 py-3.5 hover:border-foreground/30 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[15px]">{sub.name}</span>
                      {hasMultiple && (
                        <button onClick={() => onOpenPerson(sub.name)}
                          className="text-[10px] uppercase tracking-wider border border-border rounded-full px-2 py-0.5 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                          style={{ fontFamily: "'Geist Mono', monospace" }}>
                          Trend →
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sub.team} · {fmtMonth(getMonth(sub))}
                    </div>
                  </div>
                  <button onClick={() => onOpen(sub.id)}
                    className="text-xs border border-border rounded-sm px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors">
                    View →
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {Object.keys(tools).map(t => {
                    const sc = calcScore(tools[t]);
                    const g = pctToGrade(sc.pct);
                    return (
                      <span key={t} className={cn("pill-" + t, "text-xs font-semibold px-2.5 py-0.5 rounded-full")}>
                        {TOOLS[t]} · {g}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Month vs Month Comparison ─────────────────────────────────────────────────
function CompareView({ allSubs, allMonths, compareA, compareB, onChangeA, onChangeB, onBack }: {
  allSubs: Submission[]; allMonths: string[];
  compareA: string; compareB: string;
  onChangeA: (m: string) => void; onChangeB: (m: string) => void;
  onBack: () => void;
}) {
  const subsA = allSubs.filter(s => getMonth(s) === compareA);
  const subsB = allSubs.filter(s => getMonth(s) === compareB);

  function toolStats(subs: Submission[], tool: string) {
    const pcts = subs.flatMap(sub => {
      const tools = parseTools(sub.tools);
      return tools[tool] ? [calcScore(tools[tool]).pct] : [];
    });
    if (!pcts.length) return null;
    const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    return { avg, grade: pctToGrade(avg), count: pcts.length };
  }

  function overallAvg(subs: Submission[]) {
    const pcts: number[] = [];
    subs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => pcts.push(calcScore(tools[t]).pct));
    });
    if (!pcts.length) return null;
    const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    return { avg, grade: pctToGrade(avg) };
  }

  const delta = (a: number | undefined, b: number | undefined) => {
    if (a === undefined || b === undefined) return null;
    const d = a - b;
    if (d === 0) return <span className="text-muted-foreground">—</span>;
    return <span className={d > 0 ? "text-emerald-600" : "text-red-500"}>{d > 0 ? "+" : ""}{d}%</span>;
  };

  if (allMonths.length < 2) {
    return (
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 mb-5 hover:border-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="bg-card border border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
          You need at least 2 months of submissions to compare. Check back next month.
        </div>
      </div>
    );
  }

  const ovA = overallAvg(subsA);
  const ovB = overallAvg(subsB);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 mb-5 hover:border-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* Month pickers */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {([["A", compareA, onChangeA], ["B", compareB, onChangeB]] as const).map(([label, val, onChange]) => (
          <div key={label as string} className="bg-card border border-border rounded-sm p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontFamily: "'Geist Mono', monospace" }}>Month {label as string}</p>
            <select value={val as string} onChange={e => (onChange as (m: string) => void)(e.target.value)}
              className="w-full px-2 py-1.5 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none">
              {allMonths.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              {(val === compareA ? subsA : subsB).length} submissions
              {ovA && val === compareA ? ` · Avg ${ovA.grade}` : ""}
              {ovB && val === compareB ? ` · Avg ${ovB.grade}` : ""}
            </p>
          </div>
        ))}
      </div>

      {/* Per-tool comparison table */}
      <div className="bg-card border border-border rounded-sm overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Tool</th>
              <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">{fmtMonth(compareA)}</th>
              <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">{fmtMonth(compareB)}</th>
              <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {TOOL_KEYS.map(t => {
              const a = toolStats(subsA, t);
              const b = toolStats(subsB, t);
              return (
                <tr key={t} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className={cn("pill-" + t, "text-xs font-semibold px-2.5 py-0.5 rounded-full")}>{TOOLS[t]}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {a ? <span className={cn("text-lg font-medium", gradeClass(a.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{a.grade}</span> : <span className="text-muted-foreground text-xs">No data</span>}
                    {a && <span className="text-xs text-muted-foreground ml-1">({a.avg}%)</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b ? <span className={cn("text-lg font-medium", gradeClass(b.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{b.grade}</span> : <span className="text-muted-foreground text-xs">No data</span>}
                    {b && <span className="text-xs text-muted-foreground ml-1">({b.avg}%)</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-semibold">
                    {delta(a?.avg, b?.avg)}
                  </td>
                </tr>
              );
            })}
            {/* Overall row */}
            <tr className="bg-secondary/30">
              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall</td>
              <td className="px-4 py-3 text-center">
                {ovA ? <span className={cn("text-lg font-medium", gradeClass(ovA.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{ovA.grade}</span> : "—"}
                {ovA && <span className="text-xs text-muted-foreground ml-1">({ovA.avg}%)</span>}
              </td>
              <td className="px-4 py-3 text-center">
                {ovB ? <span className={cn("text-lg font-medium", gradeClass(ovB.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{ovB.grade}</span> : "—"}
                {ovB && <span className="text-xs text-muted-foreground ml-1">({ovB.avg}%)</span>}
              </td>
              <td className="px-4 py-3 text-center text-sm font-semibold">
                {delta(ovA?.avg, ovB?.avg)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Metric breakdown */}
      {TOOL_KEYS.map(t => {
        const a = toolStats(subsA, t);
        const b = toolStats(subsB, t);
        if (!a && !b) return null;
        const metricsA = subsA.flatMap(sub => { const tools = parseTools(sub.tools); return tools[t] ? [tools[t]] : []; });
        const metricsB = subsB.flatMap(sub => { const tools = parseTools(sub.tools); return tools[t] ? [tools[t]] : []; });
        function avgMetric(arr: any[], key: string) {
          if (!arr.length) return null;
          return Math.round(arr.reduce((s: number, x: any) => s + (x[key] ?? 0), 0) / arr.length * 10) / 10;
        }
        return (
          <div key={t} className="bg-card border border-border rounded-sm p-4 mb-3">
            <span className={cn("pill-" + t, "text-xs font-semibold px-2.5 py-0.5 rounded-full mb-3 inline-block")}>{TOOLS[t]}</span>
            <div className="space-y-2">
              {(["freq", "time", "impact", "adopt"] as MetricKey[]).map(m => {
                const av = avgMetric(metricsA, m);
                const bv = avgMetric(metricsB, m);
                const label = { freq: "Frequency", time: "Time saved", impact: "Impact", adopt: "Adoption" }[m];
                return (
                  <div key={m} className="grid grid-cols-[120px_1fr_80px_80px_60px] gap-2 items-center text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <div className="flex gap-2 items-center">
                      {av !== null && <div className="h-1.5 rounded-full bg-foreground/20 flex-1 overflow-hidden"><div className="h-full bg-foreground/60 rounded-full" style={{ width: `${(av / 5) * 100}%` }} /></div>}
                    </div>
                    <span className="text-right font-mono">{av !== null ? av.toFixed(1) : "—"}</span>
                    <span className="text-right font-mono text-muted-foreground">{bv !== null ? bv.toFixed(1) : "—"}</span>
                    <span className="text-right font-semibold">
                      {av !== null && bv !== null ? (
                        av - bv > 0 ? <span className="text-emerald-600">+{(av - bv).toFixed(1)}</span> :
                        av - bv < 0 ? <span className="text-red-500">{(av - bv).toFixed(1)}</span> :
                        <span className="text-muted-foreground">—</span>
                      ) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-person trend ──────────────────────────────────────────────────────────
function PersonView({ name, subs, onBack }: { name: string; subs: Submission[]; onBack: () => void; }) {
  const months = [...new Set(subs.map(getMonth))].sort();

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 mb-5 hover:border-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="bg-card border border-border rounded-sm p-5 mb-4">
        <h2 className="text-xl font-medium mb-0.5" style={{ fontFamily: "'Fraunces', serif" }}>{name}</h2>
        <p className="text-sm text-muted-foreground">{subs[0]?.team} · {subs.length} submission{subs.length !== 1 ? "s" : ""} across {months.length} month{months.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Per-tool trend table */}
      {TOOL_KEYS.map(t => {
        const relevant = subs.filter(s => !!parseTools(s.tools)[t]);
        if (!relevant.length) return null;
        return (
          <div key={t} className="bg-card border border-border rounded-sm p-4 mb-3">
            <span className={cn("pill-" + t, "text-xs font-semibold px-2.5 py-0.5 rounded-full mb-3 inline-block")}>{TOOLS[t]}</span>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">Metric</th>
                    {relevant.map(s => (
                      <th key={s.id} className="text-center py-2 px-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">{fmtMonth(getMonth(s))}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["freq", "time", "impact", "adopt"] as MetricKey[]).map(m => (
                    <tr key={m} className="border-b border-border last:border-0">
                      <td className="py-2 text-xs text-muted-foreground capitalize">{{ freq: "Frequency", time: "Time saved", impact: "Impact", adopt: "Adoption" }[m]}</td>
                      {relevant.map(s => {
                        const ts = parseTools(s.tools)[t];
                        return <td key={s.id} className="py-2 px-3 text-center text-xs">{LABELS[m][ts[m]]}</td>;
                      })}
                    </tr>
                  ))}
                  <tr className="bg-secondary/30">
                    <td className="py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grade</td>
                    {relevant.map(s => {
                      const ts = parseTools(s.tools)[t];
                      const sc = calcScore(ts);
                      const g = pctToGrade(sc.pct);
                      return (
                        <td key={s.id} className="py-2 px-3 text-center">
                          <span className={cn("text-base font-medium", gradeClass(g))} style={{ fontFamily: "'Fraunces', serif" }}>{g}</span>
                          <span className="text-xs text-muted-foreground ml-1">({sc.pct}%)</span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail / Scorecard ────────────────────────────────────────────────────────
function DetailView({ sub, onBack, onDelete, onSaveOV, isSavingOV }: {
  sub: Submission; onBack: () => void;
  onDelete: (id: string) => void;
  onSaveOV: (tool: string, value: number) => void;
  isSavingOV: boolean;
}) {
  const tools = parseTools(sub.tools);
  const [ovValues, setOvValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    Object.keys(tools).forEach(t => { init[t] = tools[t].outputVolume !== undefined ? String(tools[t].outputVolume) : ""; });
    return init;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors ml-auto">
          <Printer className="w-3.5 h-3.5" /> Print / Save PDF
        </button>
      </div>
      <div className="bg-card border border-border rounded-sm p-6">
        <h2 className="text-xl font-medium mb-0.5" style={{ fontFamily: "'Fraunces', serif" }}>{sub.name}</h2>
        <p className="text-sm text-muted-foreground mb-5">
          {sub.team} · {fmtMonth(getMonth(sub))} · Submitted {new Date(sub.timestamp).toLocaleString()}
        </p>
        {Object.keys(tools).map((t, i) => {
          const ts = tools[t];
          const sc = calcScore(ts);
          const g = pctToGrade(sc.pct);
          return (
            <div key={t} className={cn("pt-5 mt-5", i > 0 && "border-t border-border")}>
              <div className="flex justify-between items-center mb-3">
                <span className={cn("pill-" + t, "text-xs font-semibold px-3 py-1 rounded-full")}>{TOOLS[t]}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{sc.total}/{sc.max} · {sc.pct}%</span>
                  <span className={cn("text-[28px] font-medium leading-none", gradeClass(g))} style={{ fontFamily: "'Fraunces', serif" }}>{g}</span>
                </div>
              </div>
              <div className="border-l-[3px] border-foreground pl-3 py-2 bg-[#fbfaf6] dark:bg-secondary/40 text-sm mb-3 rounded-r-sm">{gradeAction(g)}</div>
              {["C","D","F"].includes(g) && (
                <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 rounded-sm">
                  <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-400 mb-2 uppercase tracking-wider">Coaching suggestions for {sub.team}</p>
                  <ul className="space-y-1">
                    {getCoachSuggestions(sub.team).map((s, i) => (
                      <li key={i} className="text-xs text-yellow-900 dark:text-yellow-300 flex gap-2"><span>→</span>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(["freq", "time", "impact", "adopt"] as MetricKey[]).map(m => (
                <div key={m} className="flex justify-between py-1 text-sm">
                  <span className="text-muted-foreground">{{ freq: "Frequency", time: "Time saved/week", impact: "Impact", adopt: "Adoption depth" }[m]}</span>
                  <span>{LABELS[m][ts[m]]}</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-border">
                <label className="block text-xs text-muted-foreground mb-1.5">Output volume from usage exports (0–5)</label>
                <div className="flex items-center gap-2">
                  <input data-testid={`input-ov-${t}`} type="number" min={0} max={5}
                    value={ovValues[t] ?? ""}
                    onChange={e => setOvValues(prev => ({ ...prev, [t]: e.target.value }))}
                    className="w-20 px-2 py-1.5 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none" />
                  <button data-testid={`button-save-ov-${t}`}
                    onClick={() => { const v = parseInt(ovValues[t]); if (!isNaN(v) && v >= 0 && v <= 5) onSaveOV(t, v); }}
                    disabled={isSavingOV}
                    className="text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors disabled:opacity-50">
                    {isSavingOV ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {sub.useCases && (
          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Top use cases</label>
            <p className="text-sm">{sub.useCases}</p>
          </div>
        )}
        {sub.challenges && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Challenges</label>
            <p className="text-sm">{sub.challenges}</p>
          </div>
        )}
        <div className="mt-6 pt-5 border-t border-border">
          <button data-testid="button-delete" onClick={() => onDelete(sub.id)}
            className="text-sm border border-red-200 text-red-700 rounded-sm px-3 py-1.5 hover:border-red-500 hover:bg-red-900/20 dark:hover:bg-red-900/20 transition-colors">
            Delete submission
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function LeaderboardView({ allSubs, allMonths, onOpenPerson }: {
  allSubs: Submission[];
  allMonths: string[];
  onOpenPerson: (name: string) => void;
}) {
  const latestMonth = allMonths[0] ?? "";

  function buildRankings(subs: Submission[]) {
    const map = new Map<string, { name: string; team: string; pcts: number[]; months: Set<string> }>();
    subs.forEach(sub => {
      const tools = parseTools(sub.tools);
      const pcts = Object.keys(tools).map(t => calcScore(tools[t]).pct);
      if (!pcts.length) return;
      const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      const existing = map.get(sub.name);
      if (existing) { existing.pcts.push(avg); existing.months.add(getMonth(sub)); }
      else { map.set(sub.name, { name: sub.name, team: sub.team, pcts: [avg], months: new Set([getMonth(sub)]) }); }
    });
    return [...map.values()]
      .map(p => ({ ...p, avg: Math.round(p.pcts.reduce((a, b) => a + b, 0) / p.pcts.length) }))
      .sort((a, b) => b.avg - a.avg);
  }

  function buildMostImproved() {
    if (allMonths.length < 2) return [];
    const prevMonth = allMonths[1];
    const currMonth = allMonths[0];
    const subsP = allSubs.filter(s => getMonth(s) === prevMonth);
    const subsC = allSubs.filter(s => getMonth(s) === currMonth);
    function personAvg(subs: Submission[], name: string) {
      const sub = subs.find(s => s.name === name);
      if (!sub) return null;
      const tools = parseTools(sub.tools);
      const pcts = Object.keys(tools).map(t => calcScore(tools[t]).pct);
      return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    }
    const names = [...new Set(subsC.map(s => s.name))];
    return names.map(name => {
      const c = personAvg(subsC, name);
      const p = personAvg(subsP, name);
      if (c === null || p === null) return null;
      const sub = subsC.find(s => s.name === name)!;
      return { name, team: sub.team, prev: p, curr: c, delta: c - p };
    }).filter((x): x is NonNullable<typeof x> => x !== null && x.delta > 0)
      .sort((a, b) => b.delta - a.delta).slice(0, 5);
  }

  const allTimeRankings = buildRankings(allSubs);
  const monthRankings = buildRankings(allSubs.filter(s => getMonth(s) === latestMonth));
  const mostImproved = buildMostImproved();
  const MEDALS = ["#F4C542", "#A8A9AD", "#CD7F32"];

  function RankTable({ rankings, label }: { rankings: ReturnType<typeof buildRankings>; label: string }) {
    if (!rankings.length) return (
      <div className="bg-card border border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
        No submissions yet for {label}.
      </div>
    );
    return (
      <div className="bg-card border border-border rounded-sm overflow-hidden">
        <div className="divide-y divide-border">
          {rankings.map((p, i) => {
            const g = pctToGrade(p.avg);
            return (
              <div key={p.name} className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors">
                <div className="w-7 text-center">
                  {i < 3
                    ? <span className="text-base font-bold" style={{ color: MEDALS[i] }}>#{i + 1}</span>
                    : <span className="text-sm text-muted-foreground font-mono">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.team}</div>
                </div>
                <div className="w-24 hidden sm:block">
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: `${p.avg}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">{p.avg}%</span>
                  <span className={cn("text-xl font-medium leading-none", gradeClass(g))} style={{ fontFamily: "'Fraunces', serif" }}>{g}</span>
                </div>
                {p.months.size > 1 && (
                  <button onClick={() => onOpenPerson(p.name)}
                    className="text-[10px] uppercase tracking-wider border border-border rounded-full px-2 py-0.5 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors shrink-0"
                    style={{ fontFamily: "'Geist Mono', monospace" }}>Trend</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mostImproved.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>
            Most improved — {fmtMonth(allMonths[1])} to {fmtMonth(allMonths[0])}
          </h2>
          <div className="bg-card border border-border rounded-sm overflow-hidden">
            <div className="divide-y divide-border">
              {mostImproved.map((p, i) => (
                <div key={p.name} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-7 text-center text-sm text-muted-foreground font-mono">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.team}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm shrink-0">
                    <span className={cn(gradeClass(pctToGrade(p.prev)))} style={{ fontFamily: "'Fraunces', serif" }}>{pctToGrade(p.prev)}</span>
                    <span className="text-muted-foreground">to</span>
                    <span className={cn(gradeClass(pctToGrade(p.curr)))} style={{ fontFamily: "'Fraunces', serif" }}>{pctToGrade(p.curr)}</span>
                    <span className="text-emerald-600 font-semibold text-xs ml-1">+{p.delta}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>
          {latestMonth ? fmtMonth(latestMonth) : "This month"}
        </h2>
        <RankTable rankings={monthRankings} label={latestMonth ? fmtMonth(latestMonth) : "this month"} />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>All time</h2>
        <RankTable rankings={allTimeRankings} label="all submissions" />
      </div>
    </div>
  );
}

// ── Response Rate ─────────────────────────────────────────────────────────────
function ResponseRate({ subs, headcounts, onSetHeadcount }: {
  subs: Submission[];
  headcounts: Record<string, number>;
  onSetHeadcount: (team: string, count: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Count unique respondents per team in this view
  const respondedPerTeam = new Map<string, Set<string>>();
  subs.forEach(sub => {
    if (!respondedPerTeam.has(sub.team)) respondedPerTeam.set(sub.team, new Set());
    respondedPerTeam.get(sub.team)!.add(sub.name);
  });

  const teams = Array.from(new Set([...Object.keys(headcounts), ...Array.from(respondedPerTeam.keys())])).sort();
  if (teams.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-sm p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>Response rate</h3>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>Click count to edit headcount</span>
      </div>
      <div className="space-y-2.5">
        {teams.map(team => {
          const responded = respondedPerTeam.get(team)?.size ?? 0;
          const total = headcounts[team] ?? 0;
          const pct = total > 0 ? Math.round((responded / total) * 100) : null;
          return (
            <div key={team} className="grid grid-cols-[120px_1fr_80px] gap-3 items-center">
              <span className="text-sm truncate">{team}</span>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                {pct !== null && (
                  <div className={cn("h-full rounded-full transition-all",
                    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400"
                  )} style={{ width: `${pct}%` }} />
                )}
              </div>
              <div className="text-right text-xs font-mono flex items-center justify-end gap-1">
                <span className="font-semibold">{responded}</span>
                <span className="text-muted-foreground">/</span>
                {editing === team ? (
                  <input
                    type="number" min={0} value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => { onSetHeadcount(team, parseInt(draft) || 0); setEditing(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { onSetHeadcount(team, parseInt(draft) || 0); setEditing(null); } }}
                    className="w-10 text-center border border-border rounded-sm bg-background text-foreground focus:border-foreground focus:outline-none px-1"
                    autoFocus
                  />
                ) : (
                  <button onClick={() => { setEditing(team); setDraft(String(total)); }}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                    {total > 0 ? total : "?"}
                  </button>
                )}
                {pct !== null && <span className="text-muted-foreground ml-1">({pct}%)</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Teams View ────────────────────────────────────────────────────────────────
function TeamsView({ allSubs, allMonths }: { allSubs: Submission[]; allMonths: string[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>(allMonths[0] ?? "all");

  const subs = selectedMonth === "all" ? allSubs : allSubs.filter(s => getMonth(s) === selectedMonth);

  // Group by team
  const teams = [...new Set(subs.map(s => s.team))].sort();

  function teamStats(team: string) {
    const tsubs = subs.filter(s => s.team === team);
    const pcts: number[] = [];
    const toolPcts: Record<string, number[]> = {};
    const useCases: string[] = [];
    const challenges: string[] = [];
    tsubs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => {
        const p = calcScore(tools[t]).pct;
        pcts.push(p);
        if (!toolPcts[t]) toolPcts[t] = [];
        toolPcts[t].push(p);
      });
      if (sub.useCases) useCases.push(sub.useCases);
      if (sub.challenges) challenges.push(sub.challenges);
    });
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
    const toolGrades: Record<string, string> = {};
    Object.keys(toolPcts).forEach(t => {
      const a = Math.round(toolPcts[t].reduce((a, b) => a + b, 0) / toolPcts[t].length);
      toolGrades[t] = pctToGrade(a);
    });
    return { tsubs, avg, grade: pctToGrade(avg), toolGrades, useCases, challenges };
  }

  if (teams.length === 0) return (
    <div className="bg-card border border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
      No submissions yet.
    </div>
  );

  return (
    <div>
      {/* Month selector */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>Month</span>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setSelectedMonth("all")}
            className={cn("text-[11px] px-3 py-1 rounded-full border transition-colors",
              selectedMonth === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground"
            )} style={{ fontFamily: "'Geist Mono', monospace" }}>All</button>
          {allMonths.map(m => (
            <button key={m} onClick={() => setSelectedMonth(m)}
              className={cn("text-[11px] px-3 py-1 rounded-full border transition-colors",
                selectedMonth === m ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground"
              )} style={{ fontFamily: "'Geist Mono', monospace" }}>{fmtMonth(m)}</button>
          ))}
        </div>
      </div>

      {/* Trend chart */}
      {allMonths.length > 1 && <TrendChart allSubs={allSubs} allMonths={allMonths} />}

      {/* Team cards */}
      <div className="space-y-4 mt-5">
        {teams.map(team => {
          const { tsubs, avg, grade, toolGrades, useCases, challenges } = teamStats(team);
          return (
            <div key={team} className="bg-card border border-border rounded-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold">{team}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{tsubs.length} submission{tsubs.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">{avg}%</span>
                  <span className={cn("text-2xl font-medium leading-none", gradeClass(grade))} style={{ fontFamily: "'Fraunces', serif" }}>{grade}</span>
                </div>
              </div>

              {/* Tool grades */}
              <div className="flex gap-2 flex-wrap mb-3">
                {Object.keys(toolGrades).map(t => (
                  <span key={t} className={cn("pill-" + t, "text-xs font-semibold px-2.5 py-0.5 rounded-full")}>
                    {TOOLS[t]} · {toolGrades[t]}
                  </span>
                ))}
              </div>

              {/* Use cases */}
              {useCases.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1" style={{ fontFamily: "'Geist Mono', monospace" }}>Use cases mentioned</p>
                  <ul className="space-y-0.5">
                    {useCases.slice(0, 3).map((u, i) => <li key={i} className="text-xs text-foreground/80 truncate">→ {u}</li>)}
                    {useCases.length > 3 && <li className="text-xs text-muted-foreground">+{useCases.length - 3} more</li>}
                  </ul>
                </div>
              )}

              {/* Challenges */}
              {challenges.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1" style={{ fontFamily: "'Geist Mono', monospace" }}>Challenges</p>
                  <ul className="space-y-0.5">
                    {challenges.slice(0, 2).map((c, i) => <li key={i} className="text-xs text-foreground/80 truncate">→ {c}</li>)}
                    {challenges.length > 2 && <li className="text-xs text-muted-foreground">+{challenges.length - 2} more</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trend Chart ───────────────────────────────────────────────────────────────
function TrendChart({ allSubs, allMonths }: { allSubs: Submission[]; allMonths: string[] }) {
  const months = [...allMonths].sort();

  function toolAvgByMonth(tool: string, month: string) {
    const msubs = allSubs.filter(s => getMonth(s) === month);
    const pcts: number[] = [];
    msubs.forEach(sub => {
      const tools = parseTools(sub.tools);
      if (tools[tool]) pcts.push(calcScore(tools[tool]).pct);
    });
    return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  }

  const TOOL_COLORS: Record<string, string> = {
    cgt: "#10a37f",
    cla: "#d97757",
    per: "#20808d",
  };

  const datasets = TOOL_KEYS.map(t => ({
    label: TOOLS[t],
    data: months.map(m => toolAvgByMonth(t, m)),
    borderColor: TOOL_COLORS[t],
    backgroundColor: TOOL_COLORS[t] + "22",
    tension: 0.3,
    pointRadius: 4,
    pointHoverRadius: 6,
    spanGaps: true,
  }));

  const data = {
    labels: months.map(fmtMonth),
    datasets,
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "bottom" as const, labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}% (${pctToGrade(ctx.parsed.y)})`,
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { callback: (v: any) => v + "%" },
        grid: { color: "rgba(128,128,128,0.1)" },
      },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="bg-card border border-border rounded-sm p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4" style={{ fontFamily: "'Geist Mono', monospace" }}>
        Company avg score — month over month
      </h3>
      <Line data={data} options={options} />
    </div>
  );
}
