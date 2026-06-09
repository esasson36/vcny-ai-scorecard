import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { submitBodySchema } from "@shared/schema";
import { z } from "zod";

let ADMIN_USER = process.env.ADMIN_USER || "elie";
let ADMIN_PASS = process.env.ADMIN_PASS || "VCNYAI";

export function registerRoutes(httpServer: Server, app: Express) {
  // ── Admin auth ──────────────────────────────────────────────────────────
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (username === ADMIN_USER && password === ADMIN_PASS) {
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
    if (currentPassword !== ADMIN_PASS) {
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
  app.post("/api/submissions", async (req, res) => {
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
