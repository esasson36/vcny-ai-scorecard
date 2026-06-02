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

export const submitBodySchema = z.object({
  name: z.string().min(1),
  team: z.string().min(1),
  tools: z.record(z.enum(["cgt", "cla", "per"]), toolScoreSchema),
  useCases: z.string().optional(),
  challenges: z.string().optional(),
});

export type SubmitBody = z.infer<typeof submitBodySchema>;
