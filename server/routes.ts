import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { submitBodySchema } from "@shared/schema";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

let ADMIN_USER = process.env.ADMIN_USER || "elie";
let ADMIN_PASS = process.env.ADMIN_PASS || "";

if (!ADMIN_PASS) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASS environment variable must be set in production. Set it in Render before deploying.");
  }
  ADMIN_PASS = "dev-only-password";
  console.warn("[security] ADMIN_PASS not set — using dev-only default. Never deploy without it.");
}

// Constant-time string comparison — prevents timing attacks on credential checks
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Brute-force protection: 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// Spam protection on the public form: 50 submissions per 15 minutes per IP
// (generous enough for the whole office behind one NAT IP)
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions from this network. Try again shortly." },
});

export function registerRoutes(httpServer: Server, app: Express) {
  // ── Admin auth ──────────────────────────────────────────────────────────
  app.post("/api/admin/login", loginLimiter, (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username === "string" && typeof password === "string"
        && safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASS)) {
      (req.session as any).admin = true;
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.post("/api/admin/change-password", requireAdmin, (req, res) => {
    const { currentPassword, newUsername, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || !safeEqual(currentPassword, ADMIN_PASS)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "New password must be at least 4 characters" });
    }
    if (newUsername) ADMIN_USER = newUsername;
    ADMIN_PASS = newPassword;
    res.json({ ok: true });
  });

  app.get("/api/admin/me", (req, res) => {
    res.json({ admin: !!(req.session as any).admin });
  });

  function requireAdmin(req: any, res: any, next: any) {
    if ((req.session as any).admin) return next();
    res.status(401).json({ error: "Unauthorized" });
  }

  // ── Duplicate check (public) ───────────────────────────────────────────
  app.get("/api/submissions/check-duplicate", async (req, res) => {
    const { name, team } = req.query as { name?: string; team?: string };
    if (!name || !team) return res.status(400).json({ error: "name and team required" });
    const month = new Date().toISOString().slice(0, 7);
    const isDuplicate = await storage.checkDuplicate(name, team, month);
    res.json({ isDuplicate, month });
  });

  // ── Submissions (public — employees submit) ─────────────────────────────
  app.post("/api/submissions", submitLimiter, async (req, res) => {
    const result = submitBodySchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten() });
    }
    const { name, team, tools, useCases, challenges, feedback } = result.data;
    const hasFeedback = feedback && (feedback.manifast || feedback.plaude);
    // A submission must have at least one graded tool OR some feedback
    if (Object.keys(tools).length === 0 && !hasFeedback) {
      return res.status(400).json({ error: "Select at least one tool or fill in feedback." });
    }
    // Canonicalize team casing: if a team already exists with the same letters in
    // different case (e.g. "AI" vs "ai"), reuse the existing casing so we never
    // create a duplicate team that differs only by capitalization. The standard
    // dropdown teams take priority so free-text "hr" snaps to "HR".
    const STANDARD_TEAMS = ["Marketing", "Merchandising", "Design", "Executive", "HR", "Sales"];
    const existingTeams = await storage.getDistinctTeams();
    const candidates = [...STANDARD_TEAMS, ...existingTeams];
    const canonicalTeam = candidates.find(t => t.toLowerCase().trim() === team.toLowerCase().trim()) ?? team.trim();
    const submission = await storage.createSubmission({
      name,
      team: canonicalTeam,
      tools: JSON.stringify(tools),
      useCases: useCases ?? "",
      challenges: challenges ?? "",
      feedback: hasFeedback ? JSON.stringify(feedback) : "",
    });
    res.status(201).json(submission);
  });

  // ── Submissions (admin only) ────────────────────────────────────────────
  app.get("/api/submissions", requireAdmin, async (_req, res) => {
    res.json(await storage.getAllSubmissions());
  });

  app.get("/api/submissions/:id", requireAdmin, async (req, res) => {
    const sub = await storage.getSubmission(req.params.id);
    if (!sub) return res.status(404).json({ error: "Not found" });
    res.json(sub);
  });

  app.patch("/api/submissions/:id", requireAdmin, async (req, res) => {
    const { name, team, notes } = req.body ?? {};
    const data: { name?: string; team?: string; notes?: string } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim().slice(0, 100);
    if (typeof team === "string" && team.trim()) data.team = team.trim().slice(0, 60);
    if (typeof notes === "string") data.notes = notes.slice(0, 5000);
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    const sub = await storage.updateSubmission(req.params.id, data);
    if (!sub) return res.status(404).json({ error: "Not found" });
    res.json(sub);
  });

  app.patch("/api/submissions/:id/ov", requireAdmin, async (req, res) => {
    const { tool, value } = req.body ?? {};
    const v = parseInt(value);
    if (!tool || isNaN(v) || v < 0 || v > 5) {
      return res.status(400).json({ error: "Invalid tool or value" });
    }
    const sub = await storage.updateOutputVolume(req.params.id, tool, v);
    if (!sub) return res.status(404).json({ error: "Not found" });
    res.json(sub);
  });

  app.delete("/api/submissions/:id", requireAdmin, async (req, res) => {
    const deleted = await storage.deleteSubmission(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  app.delete("/api/submissions", requireAdmin, async (req, res) => {
    // Bulk delete requires an explicit typed confirmation, so a stray click can't wipe everything
    if (req.body?.confirm !== "DELETE ALL") {
      return res.status(400).json({ error: 'Confirmation required: send { confirm: "DELETE ALL" }.' });
    }
    const count = await storage.clearAllSubmissions();
    res.json({ ok: true, deleted: count });
  });

  // ── Recently deleted (archived) — admin only ─────────────────────────
  app.get("/api/submissions-archived", requireAdmin, async (_req, res) => {
    res.json(await storage.getArchivedSubmissions());
  });

  app.post("/api/submissions-archived/restore-all", requireAdmin, async (_req, res) => {
    const count = await storage.restoreAllArchived();
    res.json({ ok: true, restored: count });
  });

  app.post("/api/submissions-archived/:id/restore", requireAdmin, async (req, res) => {
    const restored = await storage.restoreSubmission(req.params.id);
    if (!restored) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  // Permanent removal — only ever one already-archived row at a time
  app.delete("/api/submissions-archived/:id", requireAdmin, async (req, res) => {
    const purged = await storage.purgeSubmission(req.params.id);
    if (!purged) return res.status(404).json({ error: "Not found or not archived" });
    res.json({ ok: true });
  });

  // ── Backup & restore (admin only) ────────────────────────────────────
  // A full snapshot of everything the app owns. Downloaded as .xlsx or .json
  // so there's always an off-database copy — Supabase's free tier has no backups.
  app.get("/api/backup", requireAdmin, async (_req, res) => {
    const [submissions, headcounts, toolCosts, employees, roster, seats] = await Promise.all([
      storage.getRawSubmissions(),
      storage.getHeadcounts(),
      storage.getToolCosts(),
      storage.getEmployees(),
      storage.getRoster(),
      storage.getSeats(),
    ]);
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        submissions: submissions.length,
        archived: submissions.filter(r => r.archived_at).length,
      },
      submissions,
      headcounts,
      toolCosts,
      employees,
      roster,
      seats,
    });
  });

  // Restore is additive: it only puts back rows that are missing. Existing rows
  // are left untouched, so this can never overwrite or delete current data.
  app.post("/api/restore", requireAdmin, async (req, res) => {
    if (req.body?.confirm !== "RESTORE") {
      return res.status(400).json({ error: 'Confirmation required: send { confirm: "RESTORE" }.' });
    }
    const incoming = req.body?.submissions;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: "No submissions found in that backup file." });
    }
    if (incoming.length > 20000) {
      return res.status(400).json({ error: "That backup is too large to restore in one go." });
    }
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const rows = [];
    for (const r of incoming) {
      if (!r || typeof r !== "object") continue;
      const id = str((r as any).id, 100);
      const name = str((r as any).name, 100);
      const timestamp = str((r as any).timestamp, 40);
      // A row without these can't be rebuilt faithfully, so skip it rather than guess
      if (!id || !name || !timestamp) continue;
      rows.push({
        id,
        name,
        team: str((r as any).team, 60) || "Unassigned",
        tools: str((r as any).tools, 20000) || "{}",
        use_cases: str((r as any).use_cases ?? (r as any).useCases, 5000),
        challenges: str((r as any).challenges, 5000),
        timestamp,
        month: str((r as any).month, 7) || timestamp.slice(0, 7),
        notes: str((r as any).notes, 5000),
        feedback: str((r as any).feedback, 20000),
        archived_at: typeof (r as any).archived_at === "string" && (r as any).archived_at
          ? (r as any).archived_at
          : null,
      });
    }
    if (rows.length === 0) {
      return res.status(400).json({ error: "That file didn't contain any readable submissions." });
    }
    const result = await storage.insertMissingSubmissions(rows as any);
    res.json({ ok: true, ...result, unreadable: incoming.length - rows.length });
  });

  // ── Employees (admin only) ──────────────────────────────────────────
  app.get("/api/employees", requireAdmin, async (_req, res) => {
    res.json(await storage.getEmployees());
  });

  // ── Roster & seats (admin only) ──────────────────────────────────────
  // Both are manual inputs the report model validates against. Headcount comes
  // from the roster; spend comes from paid seats. Neither is derived from the survey.
  app.get("/api/roster", requireAdmin, async (_req, res) => {
    res.json(await storage.getRoster());
  });

  app.post("/api/roster", requireAdmin, async (req, res) => {
    const { fullName, email, team, active } = req.body ?? {};
    if (typeof fullName !== "string" || !fullName.trim()) {
      return res.status(400).json({ error: "fullName is required" });
    }
    await storage.upsertRosterEntry({
      fullName: fullName.replace(/\s+/g, " ").trim().slice(0, 100),
      email: typeof email === "string" ? email.trim().slice(0, 200) : "",
      team: typeof team === "string" ? team.trim().slice(0, 60) : "",
      active: active !== false,
    });
    res.json({ ok: true });
  });

  app.delete("/api/roster/:name", requireAdmin, async (req, res) => {
    const removed = await storage.deleteRosterEntry(req.params.name);
    if (!removed) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  app.get("/api/seats", requireAdmin, async (_req, res) => {
    res.json(await storage.getSeats());
  });

  app.post("/api/seats", requireAdmin, async (req, res) => {
    const { tool, paidSeats, costPerSeat, billingOwner, asOf, source } = req.body ?? {};
    if (!["cgt", "cla", "per"].includes(tool)) {
      return res.status(400).json({ error: "tool must be cgt, cla or per" });
    }
    const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
    await storage.setSeat({
      tool,
      paidSeats: Math.round(n(paidSeats)),
      costPerSeat: n(costPerSeat),
      billingOwner: typeof billingOwner === "string" ? billingOwner.trim().slice(0, 100) : "",
      asOf: typeof asOf === "string" ? asOf.trim().slice(0, 40) : "",
      source: typeof source === "string" ? source.trim().slice(0, 200) : "",
    });
    res.json({ ok: true });
  });

  // ── AI executive summary (admin only) ────────────────────────────────
  app.post("/api/report-summary", requireAdmin, async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI summary not configured. Set ANTHROPIC_API_KEY to enable it." });
    }
    const stats = req.body?.stats;
    if (!stats || typeof stats !== "object") {
      return res.status(400).json({ error: "stats required" });
    }
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 600,
        output_config: { effort: "low" },
        system:
          "You write the executive summary at the top of VCNY's monthly AI-tool adoption scorecard. " +
          "VCNY is a home-textiles company; employees self-rate how they use ChatGPT, Claude, and Perplexity. " +
          "Write 3-4 plain, confident sentences for a leadership audience: overall adoption and response rate, " +
          "which teams or tools stand out (high or low), and who or what needs attention. " +
          "No headings, no bullet points, no markdown, no preamble — just the paragraph. Refer to people by the data given.",
        messages: [
          { role: "user", content: "Here is this period's scorecard data as JSON:\n\n" + JSON.stringify(stats, null, 2) },
        ],
      });
      const summary = msg.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("").trim();
      res.json({ summary });
    } catch (e: any) {
      const status = typeof e?.status === "number" ? e.status : 500;
      res.status(status === 401 ? 503 : 502).json({
        error: status === 401 ? "ANTHROPIC_API_KEY is invalid." : "Could not generate the AI summary right now.",
      });
    }
  });

  // ── Tool costs (admin only) ──────────────────────────────────────────
  app.get("/api/tool-costs", requireAdmin, async (_req, res) => {
    res.json(await storage.getToolCosts());
  });

  app.post("/api/tool-costs", requireAdmin, async (req, res) => {
    const { tool, monthlyCost } = req.body ?? {};
    if (!tool || typeof monthlyCost !== "number" || monthlyCost < 0 || !isFinite(monthlyCost)) {
      return res.status(400).json({ error: "tool and a non-negative monthlyCost are required" });
    }
    await storage.setToolCost(tool, monthlyCost);
    res.json({ ok: true });
  });

  // ── Headcounts (admin only) ──────────────────────────────────────────
  app.get("/api/headcounts", requireAdmin, async (_req, res) => {
    res.json(await storage.getHeadcounts());
  });

  app.post("/api/headcounts", requireAdmin, async (req, res) => {
    const { team, count } = req.body ?? {};
    if (!team || typeof count !== "number" || count < 0) {
      return res.status(400).json({ error: "team and count required" });
    }
    await storage.setHeadcount(team, count);
    res.json({ ok: true });
  });
}
