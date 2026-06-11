import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { submitBodySchema } from "@shared/schema";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";

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
    const { name, team, tools, useCases, challenges } = result.data;
    const submission = await storage.createSubmission({
      name,
      team,
      tools: JSON.stringify(tools),
      useCases: useCases ?? "",
      challenges: challenges ?? "",
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

  app.delete("/api/submissions", requireAdmin, async (_req, res) => {
    const count = await storage.clearAllSubmissions();
    res.json({ ok: true, deleted: count });
  });

  // ── Employees (admin only) ──────────────────────────────────────────
  app.get("/api/employees", requireAdmin, async (_req, res) => {
    res.json(await storage.getEmployees());
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
