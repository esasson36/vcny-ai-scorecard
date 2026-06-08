import { createClient } from "@supabase/supabase-js";
import type { Submission, InsertSubmission } from "@shared/schema";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables. " +
    "Set them in Render (and your local .env) before starting the server."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Raw DB row (snake_case columns) → app-facing Submission (camelCase)
interface Row {
  id: string;
  name: string;
  team: string;
  tools: string;
  use_cases: string | null;
  challenges: string | null;
  timestamp: string;
  month: string;
}

function toSubmission(r: Row): Submission {
  return {
    id: r.id,
    name: r.name,
    team: r.team,
    tools: r.tools,
    useCases: r.use_cases ?? "",
    challenges: r.challenges ?? "",
    timestamp: r.timestamp,
    month: r.month,
  };
}

export interface IStorage {
  getAllSubmissions(): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | undefined>;
  createSubmission(data: InsertSubmission): Promise<Submission>;
  updateOutputVolume(id: string, tool: string, value: number): Promise<Submission | undefined>;
  deleteSubmission(id: string): Promise<boolean>;
  clearAllSubmissions(): Promise<number>;
  checkDuplicate(name: string, team: string, month: string): Promise<boolean>;
  getHeadcounts(): Promise<Record<string, number>>;
  setHeadcount(team: string, count: number): Promise<void>;
}

export const storage: IStorage = {
  async getAllSubmissions(): Promise<Submission[]> {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("timestamp", { ascending: false });
    if (error) throw error;
    return (data as Row[]).map(toSubmission);
  },

  async getSubmission(id: string): Promise<Submission | undefined> {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toSubmission(data as Row) : undefined;
  },

  async createSubmission(data: InsertSubmission): Promise<Submission> {
    const now = new Date().toISOString();
    const id = "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
    const month = now.slice(0, 7); // "YYYY-MM"
    const row: Row = {
      id,
      name: data.name,
      team: data.team,
      tools: data.tools,
      use_cases: data.useCases ?? "",
      challenges: data.challenges ?? "",
      timestamp: now,
      month,
    };
    const { error } = await supabase.from("submissions").insert(row);
    if (error) throw error;
    return toSubmission(row);
  },

  async updateOutputVolume(id: string, tool: string, value: number): Promise<Submission | undefined> {
    const existing = await this.getSubmission(id);
    if (!existing) return undefined;
    const tools = JSON.parse(existing.tools);
    if (!tools[tool]) return undefined;
    tools[tool].outputVolume = value;
    const { error } = await supabase
      .from("submissions")
      .update({ tools: JSON.stringify(tools) })
      .eq("id", id);
    if (error) throw error;
    return this.getSubmission(id);
  },

  async deleteSubmission(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from("submissions")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  async clearAllSubmissions(): Promise<number> {
    const { error, count } = await supabase
      .from("submissions")
      .delete({ count: "exact" })
      .neq("id", ""); // Supabase requires a filter; this matches every row
    if (error) throw error;
    return count ?? 0;
  },

  async checkDuplicate(name: string, team: string, month: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("submissions")
      .select("id")
      .eq("name", name)
      .eq("team", team)
      .eq("month", month)
      .limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },

  async getHeadcounts(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from("headcounts").select("*");
    if (error) throw error;
    const result: Record<string, number> = {};
    (data as { team: string; count: number }[] ?? []).forEach(r => { result[r.team] = r.count; });
    return result;
  },

  async setHeadcount(team: string, count: number): Promise<void> {
    const { error } = await supabase
      .from("headcounts")
      .upsert({ team, count }, { onConflict: "team" });
    if (error) throw error;
  },
};
