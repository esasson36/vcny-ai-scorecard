import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Submission } from "@shared/schema";
import {
  TOOLS, TOOL_KEYS, LABELS, type ToolKey, type MetricKey,
  calcScore, pctToGrade, gradeAction, gradeClass,
  FEEDBACK_KEYS, FEEDBACK_TOOLS, FEEDBACK_COLOR, CONTINUE_LABELS, type FeedbackKey,
} from "@/lib/scorecard";
import { LogOut, RefreshCw, Trash2, ArrowLeft, Printer, Inbox } from "lucide-react";
import { Line } from "react-chartjs-2";
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { getCoachSuggestions } from "@/lib/scorecard";

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
import { cn } from "@/lib/utils";

interface Props { onLogout: () => void; }
type View = "dashboard" | "detail" | "person" | "compare" | "leaderboard" | "teams" | "teamcompare" | "settings";

function parseTools(s: string): Record<string, any> {
  try { return JSON.parse(s); } catch { return {}; }
}

function parseFeedback(sub: Submission): Record<string, any> {
  try { return JSON.parse((sub as any).feedback || "{}"); } catch { return {}; }
}

function hasFeedback(sub: Submission): boolean {
  const f = parseFeedback(sub);
  return FEEDBACK_KEYS.some(k => f[k]);
}

function hasGradedTools(sub: Submission): boolean {
  return Object.keys(parseTools(sub.tools)).length > 0;
}

function GradeBadge({ grade, className = "" }: { grade: string; className?: string }) {
  return (
    <span className={cn(`grade-badge-${grade}`, "font-medium leading-none inline-block", className)}
      style={{ fontFamily: "'Fraunces', serif" }}>
      {grade}
    </span>
  );
}

function subOverallPct(sub: Submission): number {
  const tools = Object.values(parseTools(sub.tools)) as any[];
  if (!tools.length) return 0;
  const total = tools.reduce((s, t) => s + calcScore(t).total, 0);
  const max   = tools.reduce((s, t) => s + calcScore(t).max,   0);
  return max > 0 ? Math.round(total / max * 100) : 0;
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

  const { data: employees = [] } = useQuery<{ name: string; team: string }[]>({
    queryKey: ["/api/employees"],
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; team?: string; notes?: string } }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${id}`, data);
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
  useEffect(() => {
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
      "Frequency", "Time Saved", "Impact", "Adoption",
      "Score", "Max", "Percent", "Grade", "Recommendation", "Use Cases", "Challenges"]];
    filteredSubs.forEach(sub => {
      const tools = parseTools(sub.tools);
      Object.keys(tools).forEach(t => {
        const ts = tools[t];
        const sc = calcScore(ts);
        const g = pctToGrade(sc.pct);
        rows.push([fmtMonth(getMonth(sub)), sub.name, sub.team,
          new Date(sub.timestamp).toLocaleDateString(),
          TOOLS_MAP[t] ?? t,
          LABELS.freq[ts.freq], LABELS.time[ts.time], LABELS.impact[ts.impact], LABELS.adopt[ts.adopt],
          String(sc.total), String(sc.max), sc.pct + "%", g, gradeAction(g),
          sub.useCases ?? "", sub.challenges ?? ""]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    // Prepend a UTF-8 BOM so Excel reads the file as UTF-8 instead of
    // Windows-1252 — otherwise dashes like "1–3 hrs" show up as mojibake.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = selectedMonth === "all" ? "all" : selectedMonth;
    a.download = `vcny-ai-scorecard-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportReport() {
    const esc = (s: string) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const TOOLS_MAP: Record<string, string> = { cgt: "ChatGPT", cla: "Claude", per: "Perplexity" };
    const monthLabel = selectedMonth === "all" ? "All Time" : fmtMonth(selectedMonth);
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const gradeColors: Record<string, string> = { A: "#16a34a", B: "#65a30d", C: "#d97706", D: "#ea580c", F: "#dc2626" };
    const gradeBg: Record<string, string> = { A: "#f0fdf4", B: "#f7fee7", C: "#fffbeb", D: "#fff7ed", F: "#fef2f2" };
    const gradeOrder = ["A","B","C","D","F"];

    const personData = filteredSubs.map(sub => {
      const tools = parseTools(sub.tools);
      const toolRows = Object.keys(tools).map(t => {
        const ts = tools[t];
        const sc = calcScore(ts);
        return { key: t, name: TOOLS_MAP[t] ?? t, sc, grade: pctToGrade(sc.pct) };
      });
      const avgPct = toolRows.length ? Math.round(toolRows.reduce((s, r) => s + r.sc.pct, 0) / toolRows.length) : 0;
      return { sub, toolRows, avgPct, overallGrade: pctToGrade(avgPct) };
    });

    const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    personData.forEach(r => { gradeCounts[r.overallGrade] = (gradeCounts[r.overallGrade] || 0) + 1; });

    const allPcts = personData.map(r => r.avgPct);
    const overallPct = allPcts.length ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length) : 0;
    const overallGrade = pctToGrade(overallPct);

    const byTeam = new Map<string, typeof personData>();
    personData.forEach(r => {
      const t = r.sub.team || "Other";
      if (!byTeam.has(t)) byTeam.set(t, []);
      byTeam.get(t)!.push(r);
    });

    const submittedFirstNames = new Set(filteredSubs.map(s => s.name.toLowerCase().trim().split(/\s+/)[0]));
    const nameSubmitted = (empName: string) => {
      const lower = empName.toLowerCase().trim();
      if (filteredSubs.some(s => s.name.toLowerCase().trim() === lower)) return true;
      const empFirst = lower.split(/\s+/)[0];
      return empFirst.length > 2 && submittedFirstNames.has(empFirst);
    };
    const missing = employees.filter(e => !nameSubmitted(e.name));

    const rosterSorted = [...personData].sort((a, b) => {
      const gi = gradeOrder.indexOf(a.overallGrade) - gradeOrder.indexOf(b.overallGrade);
      return gi !== 0 ? gi : a.sub.name.localeCompare(b.sub.name);
    });

    // Word-safe badge: bold colored text (no inline-block, no border-radius)
    const badge = (g: string, pt = 11) =>
      `<b style="color:${gradeColors[g] || "#111"};font-size:${pt}pt">${g}</b>`;

    const sectionHead = (label: string) =>
      `<p style="font-family:Arial,sans-serif;font-size:8pt;color:#999999;border-bottom:1pt solid #cccccc;padding-bottom:3pt;margin:20pt 0 8pt">${label.toUpperCase()}</p>`;

    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>VCNY AI Scorecard — Audit Report</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #111111; margin: 0; line-height: 1.4; }
  p { margin: 0 0 4pt; }
  table { border-collapse: collapse; width: 100%; }
  td, th { font-family: Arial, sans-serif; font-size: 10pt; vertical-align: top; padding: 5pt 7pt; }
  th { font-size: 8pt; color: #999999; border-bottom: 1pt solid #cccccc; text-align: left; }
  td { border-bottom: 1pt solid #eeeeee; }
</style>
</head>
<body style="margin:1in 1in 1in 1in">

<p style="font-size:8pt;color:#888888;font-family:Arial,sans-serif;margin-bottom:4pt">VCNY &middot; AI SCORECARD</p>
<p style="font-family:Georgia,serif;font-size:26pt;font-weight:normal;color:#111111;margin-bottom:3pt">Audit Report</p>
<p style="font-size:10pt;color:#666666;border-bottom:2pt solid #111111;padding-bottom:12pt;margin-bottom:0">Period: ${esc(monthLabel)} &nbsp;&middot;&nbsp; ${filteredSubs.length} submission${filteredSubs.length !== 1 ? "s" : ""} &nbsp;&middot;&nbsp; Generated ${esc(dateStr)}</p>

${sectionHead("Overview")}
<table style="margin-bottom:14pt">
  <tr>
    <td style="background:#f5f5f5;border:1pt solid #e0e0e0;padding:10pt 12pt;width:25%">
      <p style="font-size:8pt;color:#888888;margin-bottom:3pt">SUBMISSIONS</p>
      <p style="font-size:22pt;font-weight:bold;color:#111111;line-height:1;margin-bottom:2pt">${filteredSubs.length}</p>
      ${employees.length > 0 ? `<p style="font-size:8pt;color:#999999">${employees.length - missing.length} of ${employees.length} employees</p>` : "<p></p>"}
    </td>
    <td style="background:#f5f5f5;border:1pt solid #e0e0e0;padding:10pt 12pt;width:25%">
      <p style="font-size:8pt;color:#888888;margin-bottom:3pt">RESPONSE RATE</p>
      <p style="font-size:22pt;font-weight:bold;color:#111111;line-height:1;margin-bottom:2pt">${employees.length > 0 ? Math.round(((employees.length - missing.length) / employees.length) * 100) + "%" : "&mdash;"}</p>
      ${employees.length > 0 ? `<p style="font-size:8pt;color:#999999">${missing.length} outstanding</p>` : "<p></p>"}
    </td>
    <td style="background:#f5f5f5;border:1pt solid #e0e0e0;padding:10pt 12pt;width:25%">
      <p style="font-size:8pt;color:#888888;margin-bottom:3pt">AVG GRADE</p>
      <p style="font-size:22pt;font-weight:bold;color:${gradeColors[overallGrade] || "#111111"};line-height:1;margin-bottom:2pt">${overallGrade}</p>
      <p style="font-size:8pt;color:#999999">${overallPct}%</p>
    </td>
    <td style="background:#f5f5f5;border:1pt solid #e0e0e0;padding:10pt 12pt;width:25%">
      <p style="font-size:8pt;color:#888888;margin-bottom:3pt">TEAMS</p>
      <p style="font-size:22pt;font-weight:bold;color:#111111;line-height:1;margin-bottom:2pt">${byTeam.size}</p>
      <p style="font-size:8pt;color:#999999">represented</p>
    </td>
  </tr>
</table>

${sectionHead("Grade Distribution")}
<table style="margin-bottom:14pt">
  <tr>
    ${["A","B","C","D","F"].map(g => `
    <td style="background:${gradeBg[g]};border:1pt solid #e0e0e0;padding:10pt;text-align:center;width:20%">
      <p style="font-size:22pt;font-weight:bold;color:${gradeColors[g]};line-height:1;margin-bottom:2pt">${gradeCounts[g] || 0}</p>
      <p style="font-size:13pt;color:${gradeColors[g]};font-weight:bold">${g}</p>
    </td>`).join("")}
  </tr>
</table>

${sectionHead("Full Roster &middot; " + esc(monthLabel))}
<table style="margin-bottom:14pt">
  <thead>
    <tr>
      <th style="width:18%">Name</th>
      <th style="width:14%">Team</th>
      <th style="width:28%">Tools</th>
      <th style="width:10%">Grade</th>
      <th>Recommendation</th>
    </tr>
  </thead>
  <tbody>
    ${rosterSorted.map(r => `
    <tr>
      <td style="font-weight:bold">${esc(r.sub.name)}</td>
      <td style="color:#666666">${esc(r.sub.team)}</td>
      <td style="font-size:9pt;color:#555555">${r.toolRows.map(t => `${esc(t.name)} ${badge(t.grade, 9)}`).join(" &nbsp;&middot;&nbsp; ")}</td>
      <td>${badge(r.overallGrade, 12)} <span style="font-size:9pt;color:#999999">${r.avgPct}%</span></td>
      <td style="font-size:9pt;color:#555555">${esc(gradeAction(r.overallGrade))}</td>
    </tr>`).join("")}
  </tbody>
</table>

${sectionHead("By Team")}
${Array.from(byTeam.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([team, members]) => {
  const tPct = Math.round(members.reduce((s,r) => s + r.avgPct, 0) / members.length);
  const tGrade = pctToGrade(tPct);
  return `<p style="font-size:10pt;font-weight:bold;color:#333333;border-bottom:1pt solid #dddddd;padding-bottom:3pt;margin-bottom:2pt;margin-top:10pt">
    ${esc(team)} &nbsp; ${badge(tGrade, 10)} &nbsp; <span style="font-weight:normal;color:#999999;font-size:9pt">${members.length} submitted &middot; ${tPct}% avg</span>
  </p>
  <table style="margin-bottom:6pt">
    <tbody>
      ${members.sort((a,b) => gradeOrder.indexOf(a.overallGrade)-gradeOrder.indexOf(b.overallGrade)||a.sub.name.localeCompare(b.sub.name)).map(r=>`
      <tr>
        <td style="width:40%;font-size:10pt">${esc(r.sub.name)}</td>
        <td style="font-size:9pt;color:#666666">${r.toolRows.map(t=>esc(t.name)).join(", ")}</td>
        <td style="width:15%">${badge(r.overallGrade, 10)} <span style="font-size:9pt;color:#999999">${r.avgPct}%</span></td>
      </tr>`).join("")}
    </tbody>
  </table>`;}).join("")}

${filteredSubs.some(s => s.useCases || s.challenges) ? `
${sectionHead("Qualitative Feedback")}
${filteredSubs.filter(s=>s.useCases||s.challenges).map(sub=>`
<p style="font-weight:bold;font-size:10pt;margin-top:10pt;margin-bottom:2pt">${esc(sub.name)} <span style="font-weight:normal;color:#888888">&middot; ${esc(sub.team)}</span></p>
${sub.useCases ? `<p style="font-size:8pt;color:#aaaaaa;margin-bottom:2pt">USE CASES</p><p style="font-style:italic;color:#444444;font-size:10pt;margin-bottom:4pt;padding-left:12pt;border-left:2pt solid #dddddd">${esc(sub.useCases)}</p>` : ""}
${sub.challenges ? `<p style="font-size:8pt;color:#aaaaaa;margin-bottom:2pt">CHALLENGES</p><p style="font-style:italic;color:#444444;font-size:10pt;margin-bottom:4pt;padding-left:12pt;border-left:2pt solid #dddddd">${esc(sub.challenges)}</p>` : ""}
`).join("")}` : ""}

${sectionHead("Not Yet Submitted" + (employees.length > 0 ? " &middot; " + missing.length + " of " + employees.length : ""))}
${missing.length > 0
  ? `<p style="font-size:10pt">${missing.map(e=>`<span style="color:#cc2222">${esc(e.name)}</span>${e.team ? ` <span style="color:#aaaaaa">(${esc(e.team)})</span>` : ""}`).join(" &nbsp;&middot;&nbsp; ")}</p>`
  : `<p style="color:#16a34a;font-size:10pt">All employees have submitted${selectedMonth !== "all" ? ` for ${esc(monthLabel)}` : ""}.</p>`}

<p style="margin-top:36pt;padding-top:8pt;border-top:1pt solid #dddddd;font-size:8pt;color:#aaaaaa;text-align:center">VCNY AI Scorecard &nbsp;&middot;&nbsp; ${esc(monthLabel)} &nbsp;&middot;&nbsp; Generated ${esc(dateStr)}</p>
</body>
</html>`;

    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = selectedMonth === "all" ? "all" : selectedMonth;
    a.download = `vcny-ai-report-${suffix}.doc`;
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
    teamcompare: "Team vs Team",
    settings: "Settings",
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
            <button onClick={exportReport} disabled={filteredSubs.length === 0}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors disabled:opacity-40"
              style={{ fontFamily: "'Geist Mono', monospace" }}
              title={`Download audit report for ${selectedMonth === "all" ? "all submissions" : fmtMonth(selectedMonth)}`}>
              ↓ Report · {selectedMonth === "all" ? "All" : fmtMonth(selectedMonth)}
            </button>
            <button onClick={exportCSV} disabled={filteredSubs.length === 0}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors disabled:opacity-40"
              style={{ fontFamily: "'Geist Mono', monospace" }}
              title={`Export ${selectedMonth === "all" ? "all submissions" : fmtMonth(selectedMonth)}`}>
              ↓ CSV · {selectedMonth === "all" ? "All" : fmtMonth(selectedMonth)}
            </button>
            <button data-testid="button-logout" onClick={() => logoutMutation.mutate()}
              className="text-[11px] uppercase tracking-[0.12em] border-[1.5px] border-border px-3 py-1.5 rounded-sm hover:border-foreground transition-colors flex items-center gap-1.5"
              style={{ fontFamily: "'Geist Mono', monospace" }}>
              <LogOut className="w-3 h-3" />Sign out
            </button>
          </div>
        </div>

        {/* Nav tabs */}
        {(["dashboard", "compare", "leaderboard", "teams", "teamcompare", "settings"] as View[]).includes(view) && (
          <div className="flex gap-1.5 mb-6 pb-1 overflow-x-auto flex-wrap">
            {(["dashboard", "leaderboard", "teams", "compare", "teamcompare", "settings"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn("text-[11px] uppercase tracking-[0.1em] px-4 py-1.5 rounded-md transition-all duration-200 whitespace-nowrap",
                  view === v
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )} style={{ fontFamily: "'Geist Mono', monospace" }}>
                {v === "dashboard" ? "Submissions" : v === "leaderboard" ? "Leaderboard" : v === "teams" ? "Teams" : v === "compare" ? "Compare" : v === "teamcompare" ? "Team vs Team" : "Settings"}
              </button>
            ))}
          </div>
        )}

        <div key={view} className="animate-fade-up">
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
            employees={employees}
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
            onOpen={id => { setActiveId(id); setView("detail"); }}
            onOpenPerson={name => { setActivePerson(name); setView("person"); }}
          />
        )}

        {view === "teams" && (
          <TeamsView allSubs={subs} allMonths={allMonths}
            onOpen={id => { setActiveId(id); setView("detail"); }}
            onOpenPerson={name => { setActivePerson(name); setView("person"); }}
          />
        )}

        {view === "teamcompare" && (
          <TeamCompareView allSubs={subs} allMonths={allMonths} />
        )}

        {view === "settings" && (
          <SettingsView />
        )}

        {view === "detail" && activeSub && (
          <DetailView sub={activeSub}
            onBack={() => setView("dashboard")}
            onDelete={id => { if (confirm("Delete this submission permanently?")) deleteMutation.mutate(id); }}
            onUpdate={(id, data) => updateMutation.mutate({ id, data })}
            isUpdating={updateMutation.isPending}
          />
        )}

        {view === "person" && activePerson && (
          <PersonView name={activePerson} subs={personSubs}
            onBack={() => setView("dashboard")}
          />
        )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashView({ subs, allSubs, allMonths, selectedMonth, onMonthChange, onOpen, onOpenPerson, onClearAll, isClearingAll, headcounts, onSetHeadcount, employees }: {
  subs: Submission[]; allSubs: Submission[]; allMonths: string[];
  selectedMonth: string; onMonthChange: (m: string) => void;
  onOpen: (id: string) => void; onOpenPerson: (name: string) => void;
  onClearAll: () => void; isClearingAll: boolean;
  headcounts: Record<string, number>;
  onSetHeadcount: (team: string, count: number) => void;
  employees: { name: string; team: string }[];
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Submissions", value: String(subs.length) },
          { label: "Avg ChatGPT", value: toolAvgGrade("cgt"), isGrade: true },
          { label: "Avg Claude", value: toolAvgGrade("cla"), isGrade: true },
          { label: "Avg Perplexity", value: toolAvgGrade("per"), isGrade: true },
        ].map(k => (
          <div key={k.label} className="kpi-card bg-card border border-border rounded-sm p-3.5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-[0.04em] mb-1">{k.label}</div>
            {k.isGrade && k.value !== "—"
              ? <GradeBadge grade={k.value} className="text-[26px] px-2.5 py-1 mt-0.5" />
              : <div className="text-[26px] leading-none font-medium" style={{ fontFamily: "'Fraunces', serif" }}>{k.value}</div>
            }
          </div>
        ))}
      </div>

      {/* Response rate */}
      <ResponseRate subs={subs} allSubs={allSubs} />

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
        <div className="bg-card border border-border rounded-sm p-10 text-center">
          <Inbox className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {allSubs.length === 0 ? "No submissions yet. Share the form URL with your team." : "No submissions for this month."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map((sub, i) => {
            const tools = parseTools(sub.tools);
            const graded = Object.keys(tools).length > 0;
            const fb = parseFeedback(sub);
            const fbKeys = FEEDBACK_KEYS.filter(k => fb[k]);
            const hasMultiple = allSubs.filter(s => s.name === sub.name).length > 1;
            const prevSub = allSubs
              .filter(s => s.name === sub.name && getMonth(s) < getMonth(sub) && hasGradedTools(s))
              .sort((a, b) => getMonth(b).localeCompare(getMonth(a)))[0];
            const delta = graded && prevSub != null ? subOverallPct(sub) - subOverallPct(prevSub) : null;
            const overallG = pctToGrade(subOverallPct(sub));
            return (
              <div key={sub.id} onClick={() => onOpen(sub.id)}
                className="card-lift animate-fade-up bg-card border border-border rounded-sm px-4 py-3.5 hover:border-foreground/30 cursor-pointer"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[15px]">{sub.name}</span>
                      {delta !== null && (
                        <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded",
                          delta > 0 ? "text-green-500 bg-green-500/10" :
                          delta < 0 ? "text-red-500 bg-red-500/10" :
                          "text-muted-foreground bg-secondary"
                        )}>
                          {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{delta > 0 ? "+" : ""}{delta}%
                        </span>
                      )}
                      {hasMultiple && (
                        <button onClick={e => { e.stopPropagation(); onOpenPerson(sub.name); }}
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
                  <div className="flex items-center gap-2 shrink-0">
                    {graded ? (
                      <GradeBadge grade={overallG} className="text-lg px-2 py-0.5" />
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm bg-secondary text-muted-foreground font-semibold" style={{ fontFamily: "'Geist Mono', monospace" }}>
                        Feedback
                      </span>
                    )}
                    <button onClick={e => { e.stopPropagation(); onOpen(sub.id); }}
                      className="text-xs border border-border rounded-sm px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors">
                      View →
                    </button>
                  </div>
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
                  {fbKeys.map(k => (
                    <span key={k} className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-white" style={{ background: FEEDBACK_COLOR[k] }}>
                      {FEEDBACK_TOOLS[k]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Not yet submitted */}
      {employees.length > 0 && (() => {
        // Exact match OR first-name match (handles "Caitlin" vs "Caitlin Smith")
        const submittedFirstNames = new Set(
          subs.map(s => s.name.toLowerCase().trim().split(/\s+/)[0])
        );
        const nameSubmitted = (empName: string) => {
          const lower = empName.toLowerCase().trim();
          if (subs.some(s => s.name.toLowerCase().trim() === lower)) return true;
          const empFirst = lower.split(/\s+/)[0];
          return empFirst.length > 2 && submittedFirstNames.has(empFirst);
        };
        const missing = employees.filter(e => !nameSubmitted(e.name));
        if (missing.length === 0) return (
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-sm px-4 py-3">
            <span>✓</span>
            <span>Everyone has submitted{selectedMonth !== "all" ? ` for ${fmtMonth(selectedMonth)}` : ""}.</span>
          </div>
        );
        return (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>
                Not yet submitted{selectedMonth !== "all" ? ` · ${fmtMonth(selectedMonth)}` : ""}
              </h2>
              <span className="text-[11px] font-mono text-muted-foreground">{missing.length} of {employees.length}</span>
            </div>
            <div className="bg-card border border-border rounded-sm px-4 py-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {missing.map(e => (
                  <span key={e.name} className="text-sm text-foreground/80">{e.name}</span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Product feedback (Manifast / Plaude) — not graded */}
      {(() => {
        const withFb = subs.filter(hasFeedback);
        if (withFb.length === 0) return null;
        return (
          <div className="mt-8">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2" style={{ fontFamily: "'Geist Mono', monospace" }}>
              Product feedback{selectedMonth !== "all" ? ` · ${fmtMonth(selectedMonth)}` : ""}
            </h2>
            <div className="space-y-2">
              {withFb.map(sub => {
                const fb = parseFeedback(sub);
                return (
                  <div key={sub.id} onClick={() => onOpen(sub.id)}
                    className="card-lift bg-card border border-border rounded-sm px-4 py-3 cursor-pointer hover:border-foreground/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm">{sub.name} <span className="text-muted-foreground font-normal">· {sub.team}</span></span>
                    </div>
                    <div className="space-y-1.5">
                      {FEEDBACK_KEYS.filter(k => fb[k]).map(k => {
                        const d = fb[k];
                        return (
                          <div key={k} className="flex items-start gap-2 text-xs">
                            <span className="shrink-0 font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: FEEDBACK_COLOR[k] }}>{FEEDBACK_TOOLS[k]}</span>
                            <span className="text-foreground/80 pt-0.5">
                              {k === "manifast"
                                ? <>Current <b>{d.current}/10</b> · Potential <b>{d.potential}/10</b>{d.questions ? ` · “${d.questions}”` : ""}</>
                                : <>Rated <b>{d.rating}/10</b> · Saved {LABELS.time[d.timeSaved] ?? "—"} · Keep using: <b>{d.continue ? CONTINUE_LABELS[d.continue] : "—"}</b>{d.recommendFor ? ` · For: ${d.recommendFor}` : ""}</>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
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

const TOOL_COLORS: Record<string, string> = {
  cgt: "#22c55e",
  cla: "#f97316",
  per: "#3b82f6",
};

// ── Per-person trend ──────────────────────────────────────────────────────────
function PersonView({ name, subs, onBack }: { name: string; subs: Submission[]; onBack: () => void; }) {
  const months = [...new Set(subs.map(getMonth))].sort();
  const activeTools = TOOL_KEYS.filter(t => subs.some(s => !!parseTools(s.tools)[t]));

  const chartData = {
    labels: months.map(fmtMonth),
    datasets: activeTools.map(t => ({
      label: TOOLS[t],
      data: months.map(m => {
        const s = subs.find(sub => getMonth(sub) === m);
        if (!s) return null;
        const ts = parseTools(s.tools)[t];
        return ts ? calcScore(ts).pct : null;
      }),
      borderColor: TOOL_COLORS[t],
      backgroundColor: TOOL_COLORS[t] + "33",
      tension: 0.3,
      spanGaps: true,
      pointRadius: 5,
      pointHoverRadius: 7,
    })),
  };

  const chartOptions = {
    responsive: true,
    scales: {
      y: { min: 0, max: 100, ticks: { callback: (v: any) => v + "%" } },
    },
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}%` } },
    },
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 mb-5 hover:border-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="bg-card border border-border rounded-sm p-5 mb-4">
        <h2 className="text-xl font-medium mb-0.5" style={{ fontFamily: "'Fraunces', serif" }}>{name}</h2>
        <p className="text-sm text-muted-foreground">{subs[0]?.team} · {subs.length} submission{subs.length !== 1 ? "s" : ""} across {months.length} month{months.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Score trend chart — only shown when there are 2+ months */}
      {months.length >= 2 && (
        <div className="bg-card border border-border rounded-sm p-5 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4" style={{ fontFamily: "'Geist Mono', monospace" }}>Score trend</p>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}

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
function DetailView({ sub, onBack, onDelete, onUpdate, isUpdating }: {
  sub: Submission; onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: { name?: string; team?: string; notes?: string }) => void;
  isUpdating: boolean;
}) {
  const tools = parseTools(sub.tools);

  // Edit mode for name / team
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(sub.name);
  // If the stored team isn't in the standard list, treat it as a custom "Other" value
  const STANDARD_TEAMS = ["Marketing","Merchandising","Design","Executive","HR","Sales","Other"];
  const [editTeam, setEditTeam] = useState(STANDARD_TEAMS.includes(sub.team) ? sub.team : "Other");
  const [editOtherTeam, setEditOtherTeam] = useState(STANDARD_TEAMS.includes(sub.team) ? "" : sub.team);

  // Notes (always editable inline)
  const [notes, setNotes] = useState(sub.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);

  const effectiveEditTeam = editTeam === "Other" ? editOtherTeam.trim() : editTeam;

  function saveEdit() {
    if (editTeam === "Other" && !editOtherTeam.trim()) return;
    onUpdate(sub.id, { name: editName.trim() || sub.name, team: effectiveEditTeam });
    setEditing(false);
  }

  function saveNotes() {
    onUpdate(sub.id, { notes });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 no-print">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors ml-auto">
          <Printer className="w-3.5 h-3.5" /> Print / Save PDF
        </button>
      </div>
      <div className="bg-card border border-border rounded-sm p-6 print-area">
        {/* Print-only header */}
        <div className="hidden print:flex items-center justify-between mb-4 pb-3 border-b border-gray-300">
          <p className="text-xs uppercase tracking-widest text-gray-500">VCNY · AI Scorecard</p>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
        </div>

        {/* Name / team — view or edit mode */}
        {editing ? (
          <div className="mb-5 no-print space-y-2">
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none font-semibold text-lg"
              placeholder="Name" />
            <select value={editTeam} onChange={e => { setEditTeam(e.target.value); setEditOtherTeam(""); }}
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none">
              {STANDARD_TEAMS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {editTeam === "Other" && (
              <input
                type="text"
                value={editOtherTeam}
                onChange={e => setEditOtherTeam(e.target.value)}
                placeholder="Enter team name"
                className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
              />
            )}
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={isUpdating || (editTeam === "Other" && !editOtherTeam.trim())}
                className="text-sm bg-foreground text-background px-4 py-1.5 rounded-sm font-medium hover:opacity-85 transition-opacity disabled:opacity-50">
                {isUpdating ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditing(false); setEditName(sub.name); setEditTeam(STANDARD_TEAMS.includes(sub.team) ? sub.team : "Other"); setEditOtherTeam(STANDARD_TEAMS.includes(sub.team) ? "" : sub.team); }}
                className="text-sm border border-border px-4 py-1.5 rounded-sm hover:border-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-xl font-medium mb-0.5" style={{ fontFamily: "'Fraunces', serif" }}>{sub.name}</h2>
              <p className="text-sm text-muted-foreground">
                {sub.team} · {fmtMonth(getMonth(sub))} · Submitted {new Date(sub.timestamp).toLocaleString()}
              </p>
            </div>
            <button onClick={() => setEditing(true)}
              className="no-print text-[11px] uppercase tracking-wider border border-border rounded-sm px-3 py-1.5 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors shrink-0 ml-3"
              style={{ fontFamily: "'Geist Mono', monospace" }}>
              Edit
            </button>
          </div>
        )}
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
                  <GradeBadge grade={g} className="text-[28px] px-3 py-1" />
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
            </div>
          );
        })}

        {/* Feedback tools (Manifast / Plaude) — not graded */}
        {(() => {
          const fb = parseFeedback(sub);
          return FEEDBACK_KEYS.filter(k => fb[k]).map(k => {
            const d = fb[k];
            return (
              <div key={k} className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full text-white" style={{ background: FEEDBACK_COLOR[k] }}>{FEEDBACK_TOOLS[k]}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Geist Mono', monospace" }}>Feedback · not graded</span>
                </div>
                {k === "manifast" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Current product</span><span className="font-semibold">{d.current}/10</span></div>
                    <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Potential</span><span className="font-semibold">{d.potential}/10</span></div>
                    {d.questions && (<div className="pt-2"><label className="block text-xs font-medium text-muted-foreground mb-1">Questions / comments</label><p className="text-sm">{d.questions}</p></div>)}
                  </div>
                )}
                {k === "plaude" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Product rating</span><span className="font-semibold">{d.rating}/10</span></div>
                    <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Time saved/week</span><span className="font-semibold">{LABELS.time[d.timeSaved] ?? "—"}</span></div>
                    <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Will keep using it</span><span className="font-semibold">{d.continue ? CONTINUE_LABELS[d.continue] : "—"}</span></div>
                    {d.recommendFor && (<div className="pt-2"><label className="block text-xs font-medium text-muted-foreground mb-1">Would recommend for</label><p className="text-sm">{d.recommendFor}</p></div>)}
                  </div>
                )}
              </div>
            );
          });
        })()}

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
        {/* Admin notes */}
        <div className="mt-6 pt-5 border-t border-border no-print">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2"
            style={{ fontFamily: "'Geist Mono', monospace" }}>Admin notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add private notes about this submission…"
            rows={3}
            className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors resize-y"
          />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={saveNotes} disabled={isUpdating}
              className="text-sm border border-border rounded-sm px-3 py-1.5 hover:border-foreground transition-colors disabled:opacity-50">
              {isUpdating ? "Saving…" : "Save notes"}
            </button>
            {notesSaved && <span className="text-xs text-emerald-600">Saved ✓</span>}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border no-print">
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
function LeaderboardView({ allSubs, allMonths, onOpen, onOpenPerson }: {
  allSubs: Submission[];
  allMonths: string[];
  onOpen: (id: string) => void;
  onOpenPerson: (name: string) => void;
}) {
  const latestMonth = allMonths[0] ?? "";
  const monthScope = allSubs.filter(s => getMonth(s) === latestMonth);

  // Most recent submission id for a person within a given set of submissions
  function latestSubId(name: string, scope: Submission[]) {
    const list = scope.filter(s => s.name === name).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return list[0]?.id;
  }

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

  function RankTable({ rankings, label, scopeSubs }: { rankings: ReturnType<typeof buildRankings>; label: string; scopeSubs: Submission[] }) {
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
                  <button onClick={() => { const id = latestSubId(p.name, scopeSubs); if (id) onOpen(id); }}
                    className="font-semibold text-sm truncate text-left hover:underline underline-offset-2 cursor-pointer block max-w-full">
                    {p.name}
                  </button>
                  <div className="text-xs text-muted-foreground">{p.team}</div>
                </div>
                <div className="w-24 hidden sm:block">
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/70 animate-bar-grow" style={{ width: `${p.avg}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">{p.avg}%</span>
                  <GradeBadge grade={g} className="text-xl px-2 py-0.5" />
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
                    <button onClick={() => { const id = latestSubId(p.name, monthScope); if (id) onOpen(id); }}
                      className="font-semibold text-sm text-left hover:underline underline-offset-2 cursor-pointer block max-w-full">
                      {p.name}
                    </button>
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
        <RankTable rankings={monthRankings} label={latestMonth ? fmtMonth(latestMonth) : "this month"} scopeSubs={monthScope} />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>All time</h2>
        <RankTable rankings={allTimeRankings} label="all submissions" scopeSubs={allSubs} />
      </div>
    </div>
  );
}

// ── Response Rate ─────────────────────────────────────────────────────────────
// Total per team = unique names who have EVER submitted from that team.
// Each new submitter is automatically added to their team's count.
function ResponseRate({ subs, allSubs }: {
  subs: Submission[];   // current month (or all) — who responded
  allSubs: Submission[]; // all time — who is "known" per team
}) {
  // Known members per team: every unique name that has ever submitted as that team
  const knownPerTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allSubs.forEach(sub => {
      if (!map.has(sub.team)) map.set(sub.team, new Set());
      map.get(sub.team)!.add(sub.name);
    });
    return map;
  }, [allSubs]);

  // Who responded in the current view
  const respondedPerTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    subs.forEach(sub => {
      if (!map.has(sub.team)) map.set(sub.team, new Set());
      map.get(sub.team)!.add(sub.name);
    });
    return map;
  }, [subs]);

  const teams = [...new Set([...knownPerTeam.keys(), ...respondedPerTeam.keys()])].sort();
  if (teams.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-sm p-4 mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"
        style={{ fontFamily: "'Geist Mono', monospace" }}>Response rate</h3>
      <div className="space-y-2.5">
        {teams.map(team => {
          const responded = respondedPerTeam.get(team)?.size ?? 0;
          const total = knownPerTeam.get(team)?.size ?? 0;
          const pct = total > 0 ? Math.round((responded / total) * 100) : null;
          return (
            <div key={team} className="grid grid-cols-[120px_1fr_60px] gap-3 items-center">
              <span className="text-sm truncate">{team}</span>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                {pct !== null && (
                  <div className={cn("h-full rounded-full transition-all duration-700 ease-out",
                    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400"
                  )} style={{ width: `${pct}%` }} />
                )}
              </div>
              <div className="text-right text-xs font-mono text-muted-foreground">
                {responded}/{total}{pct !== null ? ` (${pct}%)` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Teams View ────────────────────────────────────────────────────────────────
function TeamsView({ allSubs, allMonths, onOpen, onOpenPerson }: {
  allSubs: Submission[]; allMonths: string[];
  onOpen: (id: string) => void;
  onOpenPerson: (name: string) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(allMonths[0] ?? "all");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const subs = selectedMonth === "all" ? allSubs : allSubs.filter(s => getMonth(s) === selectedMonth);
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

  // ── Team drill-down: show all submissions for selectedTeam ──
  if (selectedTeam) {
    const teamSubs = subs
      .filter(s => s.team === selectedTeam)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
      <div>
        <button onClick={() => setSelectedTeam(null)}
          className="flex items-center gap-1.5 text-sm border border-border rounded-sm px-3 py-1.5 mb-5 hover:border-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> All teams
        </button>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium" style={{ fontFamily: "'Fraunces', serif" }}>{selectedTeam}</h2>
          <span className="text-xs text-muted-foreground font-mono">{teamSubs.length} submission{teamSubs.length !== 1 ? "s" : ""}</span>
        </div>
        {teamSubs.length === 0 ? (
          <div className="bg-card border border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
            No submissions for this month.
          </div>
        ) : (
          <div className="space-y-2">
            {teamSubs.map(sub => {
              const tools = parseTools(sub.tools);
              const hasMultiple = allSubs.filter(s => s.name === sub.name).length > 1;
              return (
                <div key={sub.id} onClick={() => onOpen(sub.id)}
                  className="card-lift bg-card border border-border rounded-sm px-4 py-3.5 hover:border-foreground/30 cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[15px]">{sub.name}</span>
                        {hasMultiple && (
                          <button onClick={e => { e.stopPropagation(); onOpenPerson(sub.name); }}
                            className="text-[10px] uppercase tracking-wider border border-border rounded-full px-2 py-0.5 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                            style={{ fontFamily: "'Geist Mono', monospace" }}>
                            Trend →
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fmtMonth(getMonth(sub))} · Submitted {new Date(sub.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onOpen(sub.id); }}
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

  // ── Default: team summary cards ──
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

      {/* Team cards — clickable */}
      <div className="space-y-4 mt-5">
        {teams.map(team => {
          const { tsubs, avg, grade, toolGrades, useCases, challenges } = teamStats(team);
          return (
            <div key={team} onClick={() => setSelectedTeam(team)}
              className="card-lift bg-card border border-border rounded-sm p-5 hover:border-foreground/40 cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold">{team}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{tsubs.length} submission{tsubs.length !== 1 ? "s" : ""} · click to view</p>
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

// ── Team vs Team Comparison ───────────────────────────────────────────────────
function TeamCompareView({ allSubs, allMonths }: { allSubs: Submission[]; allMonths: string[] }) {
  const allTeams = useMemo(() => [...new Set(allSubs.map(s => s.team))].sort(), [allSubs]);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [teamA, setTeamA] = useState(() => allTeams[0] ?? "");
  const [teamB, setTeamB] = useState(() => allTeams[1] ?? "");

  // Keep team selectors valid as data loads
  useEffect(() => {
    if (!teamA && allTeams[0]) setTeamA(allTeams[0]);
    if (!teamB && allTeams[1]) setTeamB(allTeams[1]);
  }, [allTeams]);

  const filteredSubs = selectedMonth === "all" ? allSubs : allSubs.filter(s => getMonth(s) === selectedMonth);
  const subsA = filteredSubs.filter(s => s.team === teamA);
  const subsB = filteredSubs.filter(s => s.team === teamB);

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

  function avgMetric(subs: Submission[], tool: string, key: string) {
    const vals = subs.flatMap(sub => {
      const tools = parseTools(sub.tools);
      return tools[tool] ? [tools[tool][key] ?? 0] : [];
    });
    if (!vals.length) return null;
    return Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length * 10) / 10;
  }

  const ovA = overallAvg(subsA);
  const ovB = overallAvg(subsB);

  function Winner({ a, b }: { a: number | undefined; b: number | undefined }) {
    if (a === undefined || b === undefined) return <span className="text-muted-foreground">—</span>;
    if (a > b) return <span className="text-emerald-600 font-semibold">+{a - b}%</span>;
    if (b > a) return <span className="text-red-500 font-semibold">-{b - a}%</span>;
    return <span className="text-muted-foreground">Tied</span>;
  }

  if (allTeams.length < 2) {
    return (
      <div className="bg-card border border-border rounded-sm p-8 text-center text-sm text-muted-foreground">
        You need at least 2 teams with submissions to compare.
      </div>
    );
  }

  return (
    <div>
      {/* Month filter */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>Month</span>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setSelectedMonth("all")}
            className={cn("text-[11px] px-3 py-1 rounded-full border transition-colors",
              selectedMonth === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )} style={{ fontFamily: "'Geist Mono', monospace" }}>All</button>
          {allMonths.map(m => (
            <button key={m} onClick={() => setSelectedMonth(m)}
              className={cn("text-[11px] px-3 py-1 rounded-full border transition-colors",
                selectedMonth === m ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              )} style={{ fontFamily: "'Geist Mono', monospace" }}>{fmtMonth(m)}</button>
          ))}
        </div>
      </div>

      {/* Team selectors */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {([["A", teamA, setTeamA], ["B", teamB, setTeamB]] as const).map(([label, val, set]) => {
          const ov = label === "A" ? ovA : ovB;
          const count = label === "A" ? subsA.length : subsB.length;
          return (
            <div key={label as string} className="bg-card border border-border rounded-sm p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontFamily: "'Geist Mono', monospace" }}>Team {label as string}</p>
              <select value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)}
                className="w-full px-2 py-1.5 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none">
                {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                {count} submission{count !== 1 ? "s" : ""}
                {ov ? ` · Avg ${ov.grade} (${ov.avg}%)` : ""}
              </p>
            </div>
          );
        })}
      </div>

      {/* Per-tool comparison table */}
      <div className="bg-card border border-border rounded-sm overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Tool</th>
              <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">{teamA || "Team A"}</th>
              <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">{teamB || "Team B"}</th>
              <th className="text-center px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider font-medium">Diff (A–B)</th>
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
                    {a ? <><span className={cn("text-lg font-medium", gradeClass(a.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{a.grade}</span><span className="text-xs text-muted-foreground ml-1">({a.avg}%)</span></> : <span className="text-xs text-muted-foreground">No data</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b ? <><span className={cn("text-lg font-medium", gradeClass(b.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{b.grade}</span><span className="text-xs text-muted-foreground ml-1">({b.avg}%)</span></> : <span className="text-xs text-muted-foreground">No data</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    <Winner a={a?.avg} b={b?.avg} />
                  </td>
                </tr>
              );
            })}
            <tr className="bg-secondary/30">
              <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overall</td>
              <td className="px-4 py-3 text-center">
                {ovA ? <><span className={cn("text-lg font-medium", gradeClass(ovA.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{ovA.grade}</span><span className="text-xs text-muted-foreground ml-1">({ovA.avg}%)</span></> : "—"}
              </td>
              <td className="px-4 py-3 text-center">
                {ovB ? <><span className={cn("text-lg font-medium", gradeClass(ovB.grade))} style={{ fontFamily: "'Fraunces', serif" }}>{ovB.grade}</span><span className="text-xs text-muted-foreground ml-1">({ovB.avg}%)</span></> : "—"}
              </td>
              <td className="px-4 py-3 text-center text-sm">
                <Winner a={ovA?.avg} b={ovB?.avg} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-tool metric breakdown */}
      {TOOL_KEYS.map(t => {
        const a = toolStats(subsA, t);
        const b = toolStats(subsB, t);
        if (!a && !b) return null;
        return (
          <div key={t} className="bg-card border border-border rounded-sm p-4 mb-3">
            <span className={cn("pill-" + t, "text-xs font-semibold px-2.5 py-0.5 rounded-full mb-3 inline-block")}>{TOOLS[t]}</span>
            <div className="space-y-2">
              {(["freq", "time", "impact", "adopt"] as MetricKey[]).map(m => {
                const av = avgMetric(subsA, t, m);
                const bv = avgMetric(subsB, t, m);
                const label = { freq: "Frequency", time: "Time saved", impact: "Impact", adopt: "Adoption" }[m];
                return (
                  <div key={m} className="grid grid-cols-[120px_80px_80px_60px] gap-2 items-center text-xs">
                    <span className="text-muted-foreground">{label}</span>
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

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsView() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/change-password", {
        currentPassword,
        newUsername: newUsername.trim() || undefined,
        newPassword,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setStatus("success");
      setCurrentPassword("");
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: any) => {
      setStatus("error");
      setErrorMsg(e.message ?? "Something went wrong");
    },
  });

  function handleSave() {
    setStatus("idle");
    setErrorMsg("");
    if (!currentPassword) { setStatus("error"); setErrorMsg("Enter your current password"); return; }
    if (!newPassword) { setStatus("error"); setErrorMsg("Enter a new password"); return; }
    if (newPassword !== confirmPassword) { setStatus("error"); setErrorMsg("New passwords don't match"); return; }
    if (newPassword.length < 4) { setStatus("error"); setErrorMsg("Password must be at least 4 characters"); return; }
    mutation.mutate();
  }

  return (
    <div className="max-w-md">
      <div className="bg-card border border-border rounded-sm p-6">
        <h2 className="text-base font-semibold mb-1">Change password</h2>
        <p className="text-xs text-muted-foreground mb-5">Update your admin login credentials.</p>

        {status === "success" && (
          <div className="mb-4 px-3 py-2 rounded-sm bg-green-50 border border-green-200 text-green-700 text-sm">
            Password updated. Use your new credentials next time you log in.
          </div>
        )}
        {status === "error" && (
          <div className="mb-4 px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-red-700 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">New username <span className="text-muted-foreground/60">(optional — leave blank to keep current)</span></label>
            <input
              type="text"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              placeholder="Leave blank to keep current"
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-background text-foreground focus:border-foreground focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="w-full bg-foreground text-background py-2.5 rounded-sm font-semibold text-sm hover:opacity-85 transition-opacity disabled:opacity-50"
          >
            {mutation.isPending ? "Saving..." : "Update credentials"}
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Note: credentials reset if the server restarts. For permanent credentials, set <span className="font-mono">ADMIN_USER</span> and <span className="font-mono">ADMIN_PASS</span> as environment variables in your Render dashboard.
        </p>
      </div>
    </div>
  );
}
