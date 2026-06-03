import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { submitBodySchema } from "@shared/schema";
import { z } from "zod";

const ADMIN_USER = "elie";
const ADMIN_PASS = "VCNYAI";

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

  app.get("/api/admin/me", (req, res) => {
    res.json({ admin: !!(req.session as any).admin });
  });

  function requireAdmin(req: any, res: any, next: any) {
    if ((req.session as any).admin) return next();
    res.status(401).json({ error: "Unauthorized" });
  }

  // ── Submissions (public — employees submit) ─────────────────────────────
  app.post("/api/submissions", (req, res) => {
    const result = submitBodySchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten() });
    }
    const { name, team, tools, useCases, challenges } = result.data;
    const submission = storage.createSubmission({
      name,
      team,
      tools: JSON.stringify(tools),
      useCases: useCases ?? "",
      challenges: challenges ?? "",
    });
    res.status(201).json(submission);
  });

  // ── Submissions (admin only) ────────────────────────────────────────────
  app.get("/api/submissions", requireAdmin, (_req, res) => {
    res.json(storage.getAllSubmissions());
  });

  app.get("/api/submissions/:id", requireAdmin, (req, res) => {
    const sub = storage.getSubmission(req.params.id);
    if (!sub) return res.status(404).json({ error: "Not found" });
    res.json(sub);
  });

  app.patch("/api/submissions/:id/ov", requireAdmin, (req, res) => {
    const { tool, value } = req.body ?? {};
    const v = parseInt(value);
    if (!tool || isNaN(v) || v < 0 || v > 5) {
      return res.status(400).json({ error: "Invalid tool or value" });
    }
    const sub = storage.updateOutputVolume(req.params.id, tool, v);
    if (!sub) return res.status(404).json({ error: "Not found" });
    res.json(sub);
  });

  app.delete("/api/submissions/:id", requireAdmin, (req, res) => {
    const deleted = storage.deleteSubmission(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  app.delete("/api/submissions", requireAdmin, (_req, res) => {
    const count = storage.clearAllSubmissions();
    res.json({ ok: true, deleted: count });
  });
}
