import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";
import { submissions, type Submission, type InsertSubmission } from "@shared/schema";

const sqlite = new Database("data.db");
export const db = drizzle(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team TEXT NOT NULL,
    tools TEXT NOT NULL,
    use_cases TEXT DEFAULT '',
    challenges TEXT DEFAULT '',
    timestamp TEXT NOT NULL
  )
`);

export interface IStorage {
  getAllSubmissions(): Submission[];
  getSubmission(id: string): Submission | undefined;
  createSubmission(data: InsertSubmission): Submission;
  updateOutputVolume(id: string, tool: string, value: number): Submission | undefined;
  deleteSubmission(id: string): boolean;
  clearAllSubmissions(): number;
}

export const storage: IStorage = {
  getAllSubmissions(): Submission[] {
    return db.select().from(submissions).orderBy(desc(submissions.timestamp)).all();
  },

  getSubmission(id: string): Submission | undefined {
    return db.select().from(submissions).where(eq(submissions.id, id)).get();
  },

  createSubmission(data: InsertSubmission): Submission {
    const now = new Date().toISOString();
    const id = "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    const row: Submission = {
      id,
      name: data.name,
      team: data.team,
      tools: data.tools,
      useCases: data.useCases ?? "",
      challenges: data.challenges ?? "",
      timestamp: now,
    };
    db.insert(submissions).values(row).run();
    return row;
  },

  updateOutputVolume(id: string, tool: string, value: number): Submission | undefined {
    const existing = db.select().from(submissions).where(eq(submissions.id, id)).get();
    if (!existing) return undefined;
    const tools = JSON.parse(existing.tools);
    if (!tools[tool]) return undefined;
    tools[tool].outputVolume = value;
    db.update(submissions).set({ tools: JSON.stringify(tools) }).where(eq(submissions.id, id)).run();
    return db.select().from(submissions).where(eq(submissions.id, id)).get();
  },

  deleteSubmission(id: string): boolean {
    const result = db.delete(submissions).where(eq(submissions.id, id)).run();
    return result.changes > 0;
  },

  clearAllSubmissions(): number {
    const result = db.delete(submissions).run();
    return result.changes;
  },
};
