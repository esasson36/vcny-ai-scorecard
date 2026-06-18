import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Each tool's scores within a submission, stored as JSON text
export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  // JSON: { cgt?: ToolScores, cla?: ToolScores, per?: ToolScores }
  tools: text("tools").notNull(),
  useCases: text("use_cases").default(""),
  challenges: text("challenges").default(""),
  timestamp: text("timestamp").notNull(),
  // "YYYY-MM" e.g. "2026-06" — set at submission time
  month: text("month").notNull().default(""),
  // Admin-only notes on this submission
  notes: text("notes").default(""),
  // JSON: feedback for non-graded evaluation tools (Manifast, Plaude). Stored
  // separately from `tools` so it never touches the A–F grading pipeline.
  feedback: text("feedback").default(""),
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  timestamp: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissions.$inferSelect;

// Shape of per-tool scores (validated in routes)
export const toolScoreSchema = z.object({
  freq: z.number().int().min(0).max(5),
  time: z.number().int().min(0).max(5),
  impact: z.number().int().min(0).max(5),
  adopt: z.number().int().min(0).max(5),
  outputVolume: z.number().int().min(0).max(5).optional(),
});

// Non-graded evaluation tools — different question sets, 1–10 scales, free text.
// These are never scored A–F; they're collected as product feedback only.
export const manifastFeedbackSchema = z.object({
  current: z.number().int().min(1).max(10),    // "Rate the current product"
  potential: z.number().int().min(1).max(10),  // "Rate its potential"
  questions: z.string().max(2000).optional(),  // open questions / comments
});

export const plaudeFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(10),          // "Rate this product"
  timeSaved: z.number().int().min(0).max(5),        // index into the time-saved scale
  continue: z.enum(["yes", "maybe", "no"]).optional(), // "Will you continue using it"
  recommendFor: z.string().max(2000).optional(),    // "Who would you recommend this for"
});

export const feedbackSchema = z.object({
  manifast: manifastFeedbackSchema.optional(),
  plaude: plaudeFeedbackSchema.optional(),
});

export const submitBodySchema = z.object({
  name: z.string().min(1).max(100),
  team: z.string().min(1).max(60),
  tools: z.record(z.enum(["cgt", "cla", "per"]), toolScoreSchema),
  useCases: z.string().max(2000).optional(),
  challenges: z.string().max(2000).optional(),
  feedback: feedbackSchema.optional(),
});

export type SubmitBody = z.infer<typeof submitBodySchema>;
