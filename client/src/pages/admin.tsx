import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Submission } from "@shared/schema";
import {
  TOOLS, TOOL_KEYS, LABELS, type ToolKey, type MetricKey,
  calcScore, pctToGrade, gradeAction, gradeClass,
} from "@/lib/scorecard";
import { LogOut, RefreshCw, Trash2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { onLogout: () => void; }

type View = "dashboard" | "detail";

function parseTools(s: string): Record<string, any> {
  try { return JSON.parse(s); } catch { return {}; }
}

export default function AdminPanel({ onLogout }: Props) {
  const [view, setView] = useState<View>("dashboard");
  const [activeId, setActiveId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: subs = [], isFetching, refetch } = useQuery<Submission[]>({
    queryKey: ["/api/submissions"],
    refetchInterval: 30000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/admin/logout", {}); },
    onSuccess: onLogout,
  });

  function exportCSV() {
    const TOOLS_MAP: Record<string, string> = { cgt: "ChatGPT", cla: "Claude", per: "Perplexity" };
    const rows: string[][] = [[
      "Name", "Team", "Date", "Tool",
      "Frequency", "Time Saved", "Impact", "Adoption",
      "Output Volume", "Score", "Max", "Percent", "Grade", "Recommendation",
      "Use Cases", "Challenges"
    ]];
    subs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => {
        const ts = tools[t];
        const sc = calcScore(ts);
        const g = pctToGrade(sc.pct);
        rows.push([
          sub.name, sub.team, new Date(sub.timestamp).toLocaleDateString(),
          TOOLS_MAP[t] ?? t,
          LABELS.freq[ts.freq], LABELS.time[ts.time], LABELS.impact[ts.impact], LABELS.adopt[ts.adopt],
          ts.outputVolume !== undefined ? String(ts.outputVolume) : "",
          String(sc.total), String(sc.max), sc.pct + "%", g, gradeAction(g),
          sub.useCases ?? "", sub.challenges ?? ""
        ]);
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/submissions/${id}`, {}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/submissions"] }); setView("dashboard"); },
  });

  const ovMutation = useMutation({
    mutationFn: async ({ id, tool, value }: { id: string; tool: string; value: number }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${id}/ov`, { tool, value });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/submissions"] }),
  });

  // Stats
  const statsByTool = useMemo(() => {
    const acc: Record<string, number[]> = { cgt: [], cla: [], per: [] };
    subs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => {
        if (acc[t]) acc[t].push(calcScore(tools[t]).pct);
      });
    });
    return acc;
  }, [subs]);

  const activeSub = subs.find(s => s.id === activeId);

  // Sort newest first
  const sorted = [...subs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="min-h-screen bg-background py-8 px-5">
      <div className="max-w-[720px] mx-auto">
        {/* Header */}
        <div className="border-b-2 border-foreground pb-5 mb-8 flex justify-between items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1" style={{ fontFamily: "'Geist Mono', monospace" }}>VCNY · AI Scorecard</p>
            <h1 className="text-3xl font-medium leading-none tracking-tight" style={{ fontFamily: "'Fraunces', serif" }}>
              {view === "dashboard" ? "Admin dashboard" : (activeSub?.name ?? "Submission")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
              Refresh
            </button>
            <button
              data-testid="button-export-csv"
              onClick={exportCSV}
              disabled={subs.length === 0}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5 disabled:opacity-40"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              ↓ CSV
            </button>
            <button
              data-testid="button-logout"
              onClick={() => logoutMutation.mutate()}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          </div>
        </div>

        {view === "dashboard" && (
          <DashView
            subs={sorted}
            statsByTool={statsByTool}
            onOpen={id => { setActiveId(id); setView("detail"); }}
          />
        )}

        {view === "detail" && activeSub && (
          <DetailView
            sub={activeSub}
            onBack={() => setView("dashboard")}
            onDelete={id => { if (confirm("Delete this submission permanently?")) deleteMutation.mutate(id); }}
            onSaveOV={(tool, value) => ovMutation.mutate({ id: activeSub.id, tool, value })}
            isSavingOV={ovMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashView({ subs, statsByTool, onOpen }: {
  subs: Submission[];
  statsByTool: Record<string, number[]>;
  onOpen: (id: string) => void;
}) {
  function avgGrade(pcts: number[]) {
    if (!pcts.length) return "—";
    const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    return pctToGrade(avg);
  }

  return (
    <div>
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Submissions", value: String(subs.length) },
          { label: "Avg ChatGPT", value: avgGrade(statsByTool.cgt), isGrade: true, key: "cgt" },
          { label: "Avg Claude", value: avgGrade(statsByTool.cla), isGrade: true, key: "cla" },
          { label: "Avg Perplexity", value: avgGrade(statsByTool.per), isGrade: true, key: "per" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-sm p-3.5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.04em] mb-1">{k.label}</div>
            <div className={cn(
              "text-[26px] leading-none font-medium",
              k.isGrade && k.value !== "—" ? gradeClass(k.value) : "",
            )} style={{ fontFamily: "'Fraunces', serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Submission list */}
      {subs.length === 0 ? (
        <div className="bg-card border border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
          No submissions yet. Share the form URL with your team.
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map(sub => {
            const tools = parseTools(sub.tools);
            return (
              <button
                key={sub.id}
                data-testid={`card-sub-${sub.id}`}
                onClick={() => onOpen(sub.id)}
                className="w-full text-left bg-card border border-border rounded-sm px-4 py-3.5 hover:border-foreground/40 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-[15px]">{sub.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {sub.team} · {new Date(sub.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-sm">→</span>
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Detail / Scorecard ───────────────────────────────────────────────────────
function DetailView({ sub, onBack, onDelete, onSaveOV, isSavingOV }: {
  sub: Submission;
  onBack: () => void;
  onDelete: (id: string) => void;
  onSaveOV: (tool: string, value: number) => void;
  isSavingOV: boolean;
}) {
  const tools = parseTools(sub.tools);
  const [ovValues, setOvValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    Object.keys(tools).forEach(t => {
      init[t] = tools[t].outputVolume !== undefined ? String(tools[t].outputVolume) : "";
    });
    return init;
  });

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 mb-5 hover:border-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="bg-card border border-border rounded-sm p-6">
        <h2 className="text-xl font-medium mb-0.5" style={{ fontFamily: "'Fraunces', serif" }}>{sub.name}</h2>
        <p className="text-sm text-muted-foreground mb-5">
          {sub.team} · Submitted {new Date(sub.timestamp).toLocaleString()}
        </p>

        {/* Tool scorecards */}
        {Object.keys(tools).map((t, i) => {
          const ts = tools[t];
          const sc = calcScore(ts);
          const g = pctToGrade(sc.pct);
          return (
            <div key={t} className={cn("pt-5 mt-5", i > 0 && "border-t border-border")}>
              {/* Tool header */}
              <div className="flex justify-between items-center mb-3">
                <span className={cn("pill-" + t, "text-xs font-semibold px-3 py-1 rounded-full")}>{TOOLS[t]}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{sc.total}/{sc.max} · {sc.pct}%</span>
                  <span className={cn("text-[28px] font-medium leading-none", gradeClass(g))} style={{ fontFamily: "'Fraunces', serif" }}>{g}</span>
                </div>
              </div>

              {/* Recommendation */}
              <div className="border-l-[3px] border-foreground pl-3 py-2 bg-[#fbfaf6] text-sm mb-3 rounded-r-sm">
                {gradeAction(g)}
              </div>

              {/* Score rows */}
              {(["freq","time","impact","adopt"] as MetricKey[]).map(m => (
                <div key={m} className="flex justify-between py-1 text-sm">
                  <span className="text-muted-foreground capitalize">{
                    { freq: "Frequency", time: "Time saved/week", impact: "Impact", adopt: "Adoption depth" }[m]
                  }</span>
                  <span>{LABELS[m][ts[m]]}</span>
                </div>
              ))}

              {/* Output volume */}
              <div className="mt-3 pt-3 border-t border-border">
                <label className="block text-xs text-muted-foreground mb-1.5">Output volume from usage exports (0–5)</label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid={`input-ov-${t}`}
                    type="number"
                    min={0} max={5}
                    value={ovValues[t] ?? ""}
                    onChange={e => setOvValues(prev => ({ ...prev, [t]: e.target.value }))}
                    className="w-20 px-2 py-1.5 border-[1.5px] border-input rounded-sm text-sm bg-white focus:border-foreground focus:outline-none"
                  />
                  <button
                    data-testid={`button-save-ov-${t}`}
                    onClick={() => {
                      const v = parseInt(ovValues[t]);
                      if (!isNaN(v) && v >= 0 && v <= 5) onSaveOV(t, v);
                    }}
                    disabled={isSavingOV}
                    className="text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors disabled:opacity-50"
                  >
                    {isSavingOV ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Use cases & challenges */}
        {sub.useCases && (
          <div className="mt-5 pt-5 border-t border-border">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Top use cases</label>
            <p className="text-sm">{sub.useCases}</p>
          </div>
        )}
        {sub.challenges && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Challenges</label>
            <p className="text-sm">{sub.challenges}</p>
          </div>
        )}

        {/* Delete */}
        <div className="mt-6 pt-5 border-t border-border">
          <button
            data-testid="button-delete"
            onClick={() => onDelete(sub.id)}
            className="text-sm border border-red-200 text-red-700 rounded-sm px-3 py-1.5 hover:border-red-500 hover:bg-red-50 transition-colors"
          >
            Delete submission
          </button>
        </div>
      </div>
    </div>
  );
}
