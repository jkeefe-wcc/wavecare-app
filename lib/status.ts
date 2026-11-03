// Nurse registry status. New joiners are Pending until an admin activates them.
export const STATUSES = ["Pending", "Active", "Paused", "Inactive"] as const;
export type Status = (typeof STATUSES)[number];

// Nurses may only switch between these two, and only while already in one of them.
const NURSE_SETTABLE: readonly Status[] = ["Active", "Paused"];

// Blank or unrecognised = Pending, so a new row can never be Active by accident.
export function normalizeStatus(v?: string): Status {
  const t = (v ?? "").trim().toLowerCase();
  return STATUSES.find((s) => s.toLowerCase() === t) ?? "Pending";
}

export function canChangeStatus(
  actor: "admin" | "nurse",
  current: Status,
  target: string
): { ok: true; target: Status } | { ok: false; error: string } {
  const t = STATUSES.find((s) => s.toLowerCase() === target.trim().toLowerCase());
  if (!t) return { ok: false, error: "Choose a valid status." };
  if (actor === "admin") return { ok: true, target: t };
  if (!NURSE_SETTABLE.includes(current))
    return { ok: false, error: `Your status is ${current}. Only Wave Care Concierge can change it.` };
  if (!NURSE_SETTABLE.includes(t))
    return { ok: false, error: "You can switch between Active and Paused." };
  return { ok: true, target: t };
}

// Cells to write for a status change. The tracking columns are optional: written only if present.
export function statusCells(
  headers: string[],
  target: Status,
  by: string,
  now: Date = new Date()
): Record<string, string> {
  const cells: Record<string, string> = { Status: target };
  if (headers.includes("Status Changed By") && headers.includes("Status Changed On")) {
    cells["Status Changed By"] = by;
    cells["Status Changed On"] = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/New_York",
      dateStyle: "short",
      timeStyle: "short",
    }).format(now);
  }
  return cells;
}
