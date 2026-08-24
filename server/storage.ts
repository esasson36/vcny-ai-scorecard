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
export interface Row {
  id: string;
  name: string;
  team: string;
  tools: string;
  use_cases: string | null;
  challenges: string | null;
  timestamp: string;
  month: string;
  notes: string | null;
  feedback: string | null;
  archived_at?: string | null;
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
    notes: r.notes ?? "",
    feedback: r.feedback ?? "",
  };
}

export interface SeatRow {
  tool: string;
  paidSeats: number;
  costPerSeat: number;
  billingOwner: string;
  asOf: string;
  source: string;
}

export interface IStorage {
  getAllSubmissions(): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | undefined>;
  createSubmission(data: InsertSubmission): Promise<Submission>;
  updateOutputVolume(id: string, tool: string, value: number): Promise<Submission | undefined>;
  updateSubmission(id: string, data: { name?: string; team?: string; notes?: string }): Promise<Submission | undefined>;
  deleteSubmission(id: string): Promise<boolean>;
  clearAllSubmissions(): Promise<number>;
  getArchivedSubmissions(): Promise<Submission[]>;
  restoreSubmission(id: string): Promise<boolean>;
  restoreAllArchived(): Promise<number>;
  purgeSubmission(id: string): Promise<boolean>;
  getRawSubmissions(): Promise<Row[]>;
  insertMissingSubmissions(rows: Row[]): Promise<{ inserted: number; skipped: number }>;
  checkDuplicate(name: string, team: string, month: string): Promise<boolean>;
  getHeadcounts(): Promise<Record<string, number>>;
  setHeadcount(team: string, count: number): Promise<void>;
  getEmployees(): Promise<{ name: string; team: string }[]>;
  getRoster(): Promise<{ fullName: string; email: string; team: string; active: boolean }[]>;
  upsertRosterEntry(e: { fullName: string; email: string; team: string; active: boolean }): Promise<void>;
  deleteRosterEntry(fullName: string): Promise<boolean>;
  getSeats(): Promise<SeatRow[]>;
  setSeat(s: SeatRow): Promise<void>;
  getDistinctTeams(): Promise<string[]>;
  getToolCosts(): Promise<Record<string, number>>;
  setToolCost(tool: string, monthlyCost: number): Promise<void>;
}

export const storage: IStorage = {
  async getAllSubmissions(): Promise<Submission[]> {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .is("archived_at", null) // archived = deleted; hidden but recoverable
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
      notes: "",
      feedback: data.feedback ?? "",
    };
    const { error } = await supabase.from("submissions").insert(row);
    if (error) throw error;
    return toSubmission(row);
  },

  async updateSubmission(id: string, data: { name?: string; team?: string; notes?: string }): Promise<Submission | undefined> {
    const updates: Record<string, string> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.team !== undefined) updates.team = data.team;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (Object.keys(updates).length === 0) return this.getSubmission(id);
    const { error } = await supabase.from("submissions").update(updates).eq("id", id);
    if (error) throw error;
    return this.getSubmission(id);
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

  // Deletes are soft: the row stays, stamped with archived_at, and is hidden
  // from every read path. Undo lives in Settings → Recently deleted.
  async deleteSubmission(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from("submissions")
      .update({ archived_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
      .is("archived_at", null);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  async clearAllSubmissions(): Promise<number> {
    const { error, count } = await supabase
      .from("submissions")
      .update({ archived_at: new Date().toISOString() }, { count: "exact" })
      .is("archived_at", null); // only archive what's currently live
    if (error) throw error;
    return count ?? 0;
  },

  async getArchivedSubmissions(): Promise<Submission[]> {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (error) throw error;
    return (data as Row[]).map(toSubmission);
  },

  async restoreSubmission(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from("submissions")
      .update({ archived_at: null }, { count: "exact" })
      .eq("id", id);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  async restoreAllArchived(): Promise<number> {
    const { error, count } = await supabase
      .from("submissions")
      .update({ archived_at: null }, { count: "exact" })
      .not("archived_at", "is", null);
    if (error) throw error;
    return count ?? 0;
  },

  // The only true destructive path — one archived row at a time, never in bulk.
  async purgeSubmission(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from("submissions")
      .delete({ count: "exact" })
      .eq("id", id)
      .not("archived_at", "is", null); // refuse to hard-delete a live row
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  // ── Backup & restore ──────────────────────────────────────────────────
  // Every row exactly as stored, archived ones included. This is the snapshot
  // the Excel/JSON backup is built from, so a restore can rebuild the table.
  async getRawSubmissions(): Promise<Row[]> {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("timestamp", { ascending: true });
    if (error) throw error;
    return (data as Row[]) ?? [];
  },

  // Additive only: rows whose id already exists are skipped, never overwritten.
  // A restore can therefore never destroy data that's currently in the table.
  async insertMissingSubmissions(rows: Row[]): Promise<{ inserted: number; skipped: number }> {
    if (rows.length === 0) return { inserted: 0, skipped: 0 };
    const { data: existing, error: readErr } = await supabase.from("submissions").select("id");
    if (readErr) throw readErr;
    const have = new Set(((existing as { id: string }[]) ?? []).map(r => r.id));
    const fresh = rows.filter(r => !have.has(r.id));
    const skipped = rows.length - fresh.length;
    // Chunk so a large restore doesn't hit Supabase's request size ceiling
    for (let i = 0; i < fresh.length; i += 200) {
      const { error } = await supabase.from("submissions").insert(fresh.slice(i, i + 200));
      if (error) throw error;
    }
    return { inserted: fresh.length, skipped };
  },

  async checkDuplicate(name: string, team: string, month: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("submissions")
      .select("id")
      .eq("name", name)
      .eq("team", team)
      .eq("month", month)
      .is("archived_at", null)
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

  async getEmployees(): Promise<{ name: string; team: string }[]> {
    const { data, error } = await supabase
      .from("employees")
      .select("name, team")
      .order("name");
    if (error) throw error;
    // Defensive dedupe by name — the table should be unique, but never show doubles
    const seen = new Set<string>();
    return ((data as { name: string; team: string }[]) ?? []).filter(e => {
      const key = e.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  // ── Roster (CH-05) ────────────────────────────────────────────────────
  // Headcount comes from here and nowhere else. Deriving it by arithmetic on
  // submissions is what produced the "11 OF 22" line in the August report.
  async getRoster(): Promise<{ fullName: string; email: string; team: string; active: boolean }[]> {
    const { data, error } = await supabase
      .from("employees")
      .select("name, email, team, active")
      .order("name");
    // The email/active columns arrive with add-seats-and-roster.sql. Between the
    // deploy and that migration the select fails, so fall back to the columns that
    // have always existed rather than 500-ing every caller (including backups).
    let rows: { fullName: string; email: string; team: string; active: boolean }[];
    if (error) {
      const { data: legacy, error: legacyErr } = await supabase
        .from("employees").select("name, team").order("name");
      if (legacyErr) throw legacyErr;
      rows = ((legacy as { name: string; team: string | null }[]) ?? [])
        .map(r => ({ fullName: r.name, email: "", team: r.team ?? "", active: true }));
    } else {
      rows = ((data as { name: string; email: string | null; team: string | null; active: boolean | null }[]) ?? [])
        .map(r => ({
          fullName: r.name,
          email: r.email ?? "",
          team: r.team ?? "",
          active: r.active !== false,
        }));
    }
    // Defensive dedupe, same reason as getEmployees: the table historically held
    // each person ~4 times. migrations/dedupe-employees.sql fixes the data; this
    // keeps the UI correct even before that runs. Duplicates merge, preferring
    // whichever copy actually has an email/team filled in.
    const byName = new Map<string, { fullName: string; email: string; team: string; active: boolean }>();
    for (const r of rows) {
      const key = r.fullName.toLowerCase().trim();
      const prev = byName.get(key);
      if (!prev) { byName.set(key, r); continue; }
      byName.set(key, {
        fullName: prev.fullName,
        email: prev.email || r.email,
        team: prev.team || r.team,
        active: prev.active && r.active,
      });
    }
    return [...byName.values()];
  },

  async upsertRosterEntry(e: { fullName: string; email: string; team: string; active: boolean }): Promise<void> {
    // Not a Postgres upsert: ON CONFLICT needs a unique constraint on name, which
    // the table historically lacked (it held duplicates). Delete-then-insert works
    // either way, and saving a row collapses any lingering duplicates of it.
    // ilike catches case variants like "jane yang" vs "Jane Yang"; escape the two
    // pattern characters so a name can never act as a wildcard.
    const pattern = e.fullName.replace(/([%_\\])/g, "\\$1");
    const { error: delErr } = await supabase.from("employees").delete().ilike("name", pattern);
    if (delErr) throw delErr;
    const { error } = await supabase
      .from("employees")
      .insert({ name: e.fullName, email: e.email, team: e.team, active: e.active });
    if (error) throw error;
  },

  async deleteRosterEntry(fullName: string): Promise<boolean> {
    // ilike, for the same reason as upsert: remove every case variant of the name
    const pattern = fullName.replace(/([%_\\])/g, "\\$1");
    const { error, count } = await supabase
      .from("employees")
      .delete({ count: "exact" })
      .ilike("name", pattern);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  // ── Seats (CH-02) ─────────────────────────────────────────────────────
  async getSeats(): Promise<SeatRow[]> {
    const { data, error } = await supabase.from("seats").select("*");
    // Table arrives with add-seats-and-roster.sql. Until then report as "no seat
    // data", which the model already surfaces as a blocking validation message.
    if (error) return [];
    return ((data as Record<string, unknown>[]) ?? []).map(r => ({
      tool: String(r.tool),
      paidSeats: Number(r.paid_seats ?? 0),
      costPerSeat: Number(r.cost_per_seat ?? 0),
      billingOwner: String(r.billing_owner ?? ""),
      asOf: String(r.as_of ?? ""),
      source: String(r.source ?? ""),
    }));
  },

  async setSeat(s: SeatRow): Promise<void> {
    const { error } = await supabase.from("seats").upsert({
      tool: s.tool,
      paid_seats: s.paidSeats,
      cost_per_seat: s.costPerSeat,
      billing_owner: s.billingOwner,
      as_of: s.asOf,
      source: s.source,
    }, { onConflict: "tool" });
    if (error) throw error;
  },

  async getDistinctTeams(): Promise<string[]> {
    const { data, error } = await supabase.from("submissions").select("team");
    if (error) throw error;
    const set = new Set<string>();
    ((data as { team: string }[]) ?? []).forEach(r => { if (r.team) set.add(r.team); });
    return [...set];
  },

  async getToolCosts(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from("tool_costs").select("*");
    if (error) throw error;
    const result: Record<string, number> = {};
    ((data as { tool: string; monthly_cost: number }[]) ?? []).forEach(r => { result[r.tool] = Number(r.monthly_cost); });
    return result;
  },

  async setToolCost(tool: string, monthlyCost: number): Promise<void> {
    const { error } = await supabase
      .from("tool_costs")
      .upsert({ tool, monthly_cost: monthlyCost }, { onConflict: "tool" });
    if (error) throw error;
  },
};
