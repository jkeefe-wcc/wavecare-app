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

// ---- Weekly pattern (Nurses tab, Avail_Mon..Avail_Sun) ----
// Per-day value: Yes = any shift, Day = day only, Night = night only, No = not available.
export const WEEK_MODES = ["No", "Yes", "Day", "Night"] as const;

export function normalizeWeekValue(v?: string): (typeof WEEK_MODES)[number] {
  const t = (v ?? "").trim().toLowerCase();
  if (["yes", "true", "y", "x", "1", "24hr"].includes(t)) return "Yes";
  if (t === "day") return "Day";
  if (t === "night") return "Night";
  return "No"; // No, Unknown and blank all mean "not open" for matching
}

// modes: { Mon: "Yes", Tue: "Day", ... } -> sheet cells. Anything unrecognised becomes "No".
export function weekValues(modes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    DAYS.map((d) => [`Avail_${d}`, normalizeWeekValue(modes[d])])
  );
}

// ---- Date resolution ----
// A shift is made of halves: Day, Night. 24hr = both. Blank shift on an override = both.
export type Half = "Day" | "Night";

export function halvesOfShift(shift?: string): Half[] {
  const t = (shift ?? "").trim().toLowerCase();
  if (t === "day") return ["Day"];
  if (t === "night") return ["Night"];
  return ["Day", "Night"]; // 24hr, blank, anything else
}

export function coverageOfWeekValue(v?: string): Half[] {
  const m = normalizeWeekValue(v);
  return m === "Yes" ? ["Day", "Night"] : m === "Day" ? ["Day"] : m === "Night" ? ["Night"] : [];
}

// Parse ISO (2026-12-24) or US sheet format (12/24/2026) to a UTC day number; null if invalid.
export function parseDay(s?: string): number | null {
  const t = (s ?? "").trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t))) [y, m, d] = [Number(mt[3]), Number(mt[1]), Number(mt[2])];
  else return null;
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return ms / 86400000;
}

export const dayLabel = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
export const weekdayOf = (n: number) => DAYS[(new Date(n * 86400000).getUTCDay() + 6) % 7]; // Mon-first

export type OverrideRow = { Type: string; Date_From: string; Date_To: string; Shift_Type: string };
export type HalfResult = { available: boolean; reason: string };

function covers(o: OverrideRow, day: number): boolean {
  const from = parseDay(o.Date_From);
  const to = parseDay(o.Date_To) ?? from;
  return from !== null && to !== null && day >= from && day <= to;
}

// Blackout beats Available; an Available entry opens a day outside the usual pattern;
// otherwise the weekly pattern decides.
export function resolveHalf(
  weekly: { [dayKey: string]: string },
  overrides: OverrideRow[],
  day: number,
  half: Half
): HalfResult {
  const hits = overrides.filter((o) => covers(o, day) && halvesOfShift(o.Shift_Type).includes(half));
  const blackout = hits.find((o) => o.Type === "Blackout");
  if (blackout) return { available: false, reason: `Blackout ${blackout.Date_From} – ${blackout.Date_To}` };
  if (hits.some((o) => o.Type === "Available")) return { available: true, reason: "Open on these dates" };
  const wd = weekdayOf(day);
  return coverageOfWeekValue(weekly[`Avail_${wd}`]).includes(half)
    ? { available: true, reason: `Usual ${wd}` }
    : { available: false, reason: `Not in usual ${wd} pattern` };
}

export type RangeCheck = {
  daysChecked: number;
  openDays: number; // days where every requested half is available
  unavailable: { date: string; half: Half; reason: string }[];
};

export function checkRange(
  weekly: { [dayKey: string]: string },
  overrides: OverrideRow[],
  fromDay: number,
  toDay: number,
  shift: string
): RangeCheck {
  const halves = halvesOfShift(shift);
  const unavailable: RangeCheck["unavailable"] = [];
  let openDays = 0;
  for (let day = fromDay; day <= toDay; day++) {
    let dayOpen = true;
    for (const h of halves) {
      const r = resolveHalf(weekly, overrides, day, h);
      if (!r.available) { dayOpen = false; unavailable.push({ date: dayLabel(day), half: h, reason: r.reason }); }
    }
    if (dayOpen) openDays++;
  }
  return { daysChecked: toDay - fromDay + 1, openDays, unavailable };
}
