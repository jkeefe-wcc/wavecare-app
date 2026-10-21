export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const SHIFT_TYPES = ["Day", "Night", "24hr"] as const;
export const OVERRIDE_TYPES = ["Available", "Blackout"] as const;

export type OverrideInput = {
  type: string;
  dateFrom: string;
  dateTo: string;
  shiftType: string;
  notes: string;
};

export type OverrideValue = {
  Type: string;
  Date_From: string;
  Date_To: string;
  Shift_Type: string;
  Notes: string;
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function validIso(s: string): Date | null {
  const m = ISO.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2020 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

// Notes are written with USER_ENTERED, so neutralise anything a spreadsheet would treat as a formula.
export function sanitizeNotes(raw: string): string {
  const t = raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
  return /^[=+\-@]/.test(t) ? `'${t}` : t;
}

export function validateOverride(
  input: OverrideInput
): { ok: true; value: OverrideValue } | { ok: false; error: string } {
  if (!(OVERRIDE_TYPES as readonly string[]).includes(input.type))
    return { ok: false, error: "Choose Available or Blackout." };
  if (!(SHIFT_TYPES as readonly string[]).includes(input.shiftType))
    return { ok: false, error: "Choose a shift type." };
  const from = validIso(input.dateFrom);
  const to = validIso(input.dateTo);
  if (!from || !to) return { ok: false, error: "Enter valid start and end dates." };
  if (to < from) return { ok: false, error: "The end date can't be before the start date." };
  return {
    ok: true,
    value: {
      Type: input.type,
      Date_From: input.dateFrom,
      Date_To: input.dateTo,
      Shift_Type: input.shiftType,
      Notes: sanitizeNotes(input.notes),
    },
  };
}

// Next Avail_ID, continuing whatever prefix/number pattern is already in the sheet.
export function nextAvailId(existing: string[]): string {
  let prefix = "AV-";
  let max = 0;
  for (const id of existing) {
    const m = /^(.*?)(\d+)$/.exec(id.trim());
    if (!m) continue;
    prefix = m[1];
    max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Weekly pattern cells for the Nurses tab: checked days become "Yes", the rest "No".
export function weekValues(checked: string[]): Record<string, string> {
  const set = new Set(checked);
  return Object.fromEntries(DAYS.map((d) => [`Avail_${d}`, set.has(d) ? "Yes" : "No"]));
}
