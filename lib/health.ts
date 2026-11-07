// Sheet health checks: catch fat-finger damage in the Google Sheet (the production database).
// Pure functions over already-fetched tables so they can be unit-tested without Google access.
import { parseDay, SHIFT_TYPES, OVERRIDE_TYPES, DAYS } from "./availability";
import { CREDENTIALS, validIsoDate, toIso } from "./credentials";
import { STATUSES } from "./status";

export type Table = { headers: string[]; rows: { row: number; data: Record<string, string> }[] } | { error: string };
export type Tables = Record<string, Table>;
export type Issue = { level: "error" | "warn"; tab: string; row?: number; message: string };

// Each entry is a header, or alternatives (legacy spellings) where any one satisfies it.
type Req = string | string[];
const NURSE_ID: Req = ["NurseID", "Nurse_ID"];
const REQUIRED: Record<string, Req[]> = {
  Nurses: [
    NURSE_ID, "First Name", "Last Name", "Email", "Status", ...DAYS.map((d) => `Avail_${d}`),
    ...CREDENTIALS.flatMap((c) => c.fields.filter((f) => f.required).map((f) => f.header)),
  ],
  Patients: ["PatientID"],
  Engagements: ["EngagementID", "PatientID", NURSE_ID],
  Shifts: ["ShiftID", "EngagementID", NURSE_ID],
  "Compliance Docs": ["DocumentID"],
  "Concierge Services": ["ServiceID"],
  Nurse_Availability: [["AvailID", "Avail_ID"], NURSE_ID, "Date_From", "Date_To", "Shift_Type", "Type"],
  Credential_Verification: [["VerifID", "Verif_ID"], NURSE_ID, "Credential", "Value_Verified", "Verified_By", "Verified_On"],
};
// Present-but-optional tracking columns: absence is a warning, not an error.
const RECOMMENDED: Record<string, string[]> = { Nurses: ["Status Changed By", "Status Changed On"] };
const ID_COLUMN: Record<string, Req> = {
  Nurses: NURSE_ID, Patients: "PatientID", Engagements: "EngagementID", Shifts: "ShiftID",
  "Compliance Docs": "DocumentID", "Concierge Services": "ServiceID",
  Nurse_Availability: ["AvailID", "Avail_ID"], Credential_Verification: ["VerifID", "Verif_ID"],
};
const MAX_COLUMNS = 52; // read range is A:AZ

const pick = (data: Record<string, string>, req: Req) =>
  (Array.isArray(req) ? req : [req]).map((h) => data[h]).find((v) => v) ?? "";
const label = (req: Req) => (Array.isArray(req) ? req[0] : req);
const ok = (t: Table | undefined): t is Exclude<Table, { error: string }> => !!t && !("error" in t);

export function checkHealth(tables: Tables): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], tab: string, message: string, row?: number) =>
    issues.push({ level, tab, row, message });

  // 1. Tabs readable, headers present, no duplicate headers.
  for (const tab of Object.keys(REQUIRED)) {
    const t = tables[tab];
    if (!t) { add("error", tab, "Tab was not checked."); continue; }
    if (!ok(t)) { add("error", tab, `Can't read this tab (${t.error}). Was it renamed or deleted?`); continue; }
    const have = new Set(t.headers);
    for (const req of REQUIRED[tab]) {
      const alts = Array.isArray(req) ? req : [req];
      if (!alts.some((h) => have.has(h))) add("error", tab, `Missing required column "${alts[0]}" (header row 3).`);
    }
    for (const h of RECOMMENDED[tab] ?? []) {
      if (!have.has(h)) add("warn", tab, `Missing column "${h}" — audit info won't be recorded.`);
    }
    const seen = new Set<string>();
    for (const h of t.headers.filter(Boolean)) {
      if (seen.has(h)) add("error", tab, `Duplicate column header "${h}".`);
      seen.add(h);
    }
    if (t.headers.length >= MAX_COLUMNS - 2)
      add("warn", tab, `${t.headers.length} columns — the app reads up to ${MAX_COLUMNS}; columns past that are invisible.`);
  }

  // 2. Blank and duplicate IDs.
  for (const [tab, idReq] of Object.entries(ID_COLUMN)) {
    const t = tables[tab];
    if (!ok(t)) continue;
    const seen = new Map<string, number>();
    for (const r of t.rows) {
      const id = pick(r.data, idReq).trim();
      if (!id) { add("error", tab, `Row has data but no ${label(idReq)}.`, r.row); continue; }
      if (seen.has(id)) add("error", tab, `Duplicate ${label(idReq)} "${id}" (also row ${seen.get(id)}).`, r.row);
      else seen.set(id, r.row);
    }
  }

  const nurses = tables.Nurses;
  const nurseIds = new Set(ok(nurses) ? nurses.rows.map((r) => pick(r.data, NURSE_ID)).filter(Boolean) : []);
  const idsOf = (tab: string, req: Req): Set<string> => {
    const t = tables[tab];
    return new Set<string>(ok(t) ? t.rows.map((r) => pick(r.data, req)).filter(Boolean) : []);
  };
  const patientIds = idsOf("Patients", "PatientID");
  const engagementIds = idsOf("Engagements", "EngagementID");

  // 3. Orphans (links that point at nothing). Only checked when the target tab was readable.
  const orphan = (tab: string, field: Req, targets: Set<string>, targetTab: string, targetOk: boolean) => {
    const t = tables[tab];
    if (!ok(t) || !targetOk) return;
    for (const r of t.rows) {
      const v = pick(r.data, field).trim();
      if (v && !targets.has(v)) add("error", tab, `${label(field)} "${v}" not found on ${targetTab}.`, r.row);
    }
  };
  const nursesOk = ok(nurses), patientsOk = ok(tables.Patients), engOk = ok(tables.Engagements);
  orphan("Engagements", NURSE_ID, nurseIds, "Nurses", nursesOk);
  orphan("Engagements", "PatientID", patientIds, "Patients", patientsOk);
  orphan("Shifts", NURSE_ID, nurseIds, "Nurses", nursesOk);
  orphan("Shifts", "EngagementID", engagementIds, "Engagements", engOk);
  orphan("Nurse_Availability", NURSE_ID, nurseIds, "Nurses", nursesOk);
  orphan("Credential_Verification", NURSE_ID, nurseIds, "Nurses", nursesOk);

  // 4. Nurses: emails, status, weekly values, credential dates.
  if (ok(nurses)) {
    const byEmail = new Map<string, number>();
    for (const r of nurses.rows) {
      const emails = Object.entries(r.data).filter(([k, v]) => /email/i.test(k) && v.trim()).map(([, v]) => v.trim().toLowerCase());
      if (emails.length === 0) add("warn", "Nurses", "No email — this nurse can't sign in.", r.row);
      for (const e of new Set(emails)) {
        if (byEmail.has(e)) add("error", "Nurses", `Email ${e} is also on row ${byEmail.get(e)} — sign-in would be ambiguous.`, r.row);
        else byEmail.set(e, r.row);
      }
      const st = (r.data.Status ?? "").trim();
      if (st && !STATUSES.some((s) => s.toLowerCase() === st.toLowerCase()))
        add("warn", "Nurses", `Unrecognised Status "${st}" — treated as Pending.`, r.row);
      for (const d of DAYS) {
        const v = (r.data[`Avail_${d}`] ?? "").trim().toLowerCase();
        if (v && !["yes", "no", "day", "night", "unknown", "true", "false"].includes(v))
          add("warn", "Nurses", `Avail_${d} has unexpected value "${r.data[`Avail_${d}`]}".`, r.row);
      }
      for (const c of CREDENTIALS) {
        for (const f of c.fields.filter((f) => f.type === "date")) {
          const v = (r.data[f.header] ?? "").trim();
          if (v && !validIsoDate(toIso(v))) add("warn", "Nurses", `${f.header} "${v}" isn't a valid date.`, r.row);
        }
      }
    }
    // Emails that appear on Patients/Engagements too would make a person both nurse and family.
    const family = new Set<string>();
    for (const tab of ["Patients", "Engagements"]) {
      const t = tables[tab];
      if (!ok(t)) continue;
      for (const r of t.rows)
        for (const [k, v] of Object.entries(r.data)) if (/email/i.test(k) && v.trim()) family.add(v.trim().toLowerCase());
    }
    for (const [e, row] of byEmail) if (family.has(e)) add("warn", "Nurses", `Email ${e} is also on a Patients/Engagements row (nurse wins at sign-in).`, row);
  }

  // 5. Availability overrides.
  const av = tables.Nurse_Availability;
  if (ok(av)) {
    for (const r of av.rows) {
      const { Date_From, Date_To, Shift_Type, Type } = r.data;
      const a = parseDay(Date_From), b = parseDay(Date_To);
      if (a === null || b === null) add("error", "Nurse_Availability", `Unreadable dates "${Date_From}" – "${Date_To}".`, r.row);
      else if (b < a) add("error", "Nurse_Availability", "End date is before the start date.", r.row);
      if (!(OVERRIDE_TYPES as readonly string[]).includes(Type)) add("warn", "Nurse_Availability", `Type "${Type}" should be Available or Blackout.`, r.row);
      if (Shift_Type && !(SHIFT_TYPES as readonly string[]).includes(Shift_Type) && Shift_Type.toLowerCase() !== "24hr")
        add("warn", "Nurse_Availability", `Shift_Type "${Shift_Type}" should be Day, Night or 24h.`, r.row);
    }
  }

  // 6. Verification rows.
  const cv = tables.Credential_Verification;
  if (ok(cv)) {
    const keys = new Set<string>(CREDENTIALS.map((c) => c.key));
    for (const r of cv.rows) {
      if (!keys.has(r.data.Credential)) add("warn", "Credential_Verification", `Unknown credential "${r.data.Credential}".`, r.row);
    }
  }

  const rank = { error: 0, warn: 1 } as const;
  return issues.sort((x, y) => rank[x.level] - rank[y.level] || x.tab.localeCompare(y.tab) || (x.row ?? 0) - (y.row ?? 0));
}
