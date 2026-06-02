export const CATEGORIES = [
  "Hardware",
  "Software / Application",
  "Network / Wi-Fi",
  "Email / Outlook",
  "Account / Password",
  "Printer / Scanner",
  "Phone / Mobile",
  "AI Tools (ChatGPT/Claude/Perplexity)",
  "Security / Phishing",
  "Access Request",
  "Onboarding / Offboarding",
  "Other",
];

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;

export const STATUSES = [
  "New",
  "Open",
  "In Progress",
  "Waiting on User",
  "Waiting on Vendor",
  "Resolved",
  "Closed",
] as const;

export const TECHS = ["Unassigned", "Elie", "Vendor"] as const;

export const DEPTS = [
  "Marketing",
  "Merchandising",
  "Design",
  "Sales",
  "Operations",
  "Finance",
  "Warehouse",
  "Executive",
  "Other",
];

export const LOCATIONS = [
  "North Bergen NJ - Office",
  "North Bergen NJ - Warehouse",
  "Remote",
  "Showroom",
  "Other",
];

export const SLA_HOURS: Record<string, number> = {
  Urgent: 4,
  High: 24,
  Medium: 72,
  Low: 120,
};

export const OPEN_STATUSES = [
  "New",
  "Open",
  "In Progress",
  "Waiting on User",
  "Waiting on Vendor",
];

export function slaDue(ticket: { created: string; priority: string }): Date | null {
  if (!ticket.created || !ticket.priority) return null;
  const hours = SLA_HOURS[ticket.priority] ?? 72;
  return new Date(new Date(ticket.created).getTime() + hours * 3600 * 1000);
}

export function isOverdue(ticket: {
  created: string;
  priority: string;
  status: string | null;
}): boolean {
  if (!ticket.status) return false;
  if (["Resolved", "Closed"].includes(ticket.status)) return false;
  const d = slaDue(ticket);
  return d ? new Date() > d : false;
}

export function priClass(p: string) {
  return (
    {
      Urgent: "pill-urgent",
      High: "pill-high",
      Medium: "pill-medium",
      Low: "pill-low",
    }[p] ?? "pill-low"
  );
}

export function statClass(s: string) {
  const map: Record<string, string> = {
    New: "pill-new",
    Open: "pill-open",
    "In Progress": "pill-in-progress",
    "Waiting on User": "pill-waiting",
    "Waiting on Vendor": "pill-waiting",
    Resolved: "pill-resolved",
    Closed: "pill-closed",
  };
  return map[s] ?? "pill-closed";
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
