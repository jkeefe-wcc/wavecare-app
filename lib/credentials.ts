// Credential requirements + verification state for nurse onboarding.
// Verification rows live on the Credential_Verification tab and store a snapshot of the value that was
// checked. A credential counts as verified only while the current sheet value still equals that snapshot,
// so any later edit by the nurse automatically makes it unverified again.

export type CredKey = "ct" | "ny" | "malpractice" | "cpr" | "agreement" | "background";

export type CredDef = {
  key: CredKey;
  label: string;
  // Sheet columns on the Nurses tab holding the value; all of `required` must be non-blank to count as present.
  fields: { header: string; label: string; type: "text" | "date"; required: boolean }[];
  expiryHeader?: string; // field that expires (credential unusable once past)
  nurseEditable: boolean; // false = admin records it (agreement, background check)
  alwaysRequired: boolean; // false = required only once the nurse has started filling it in (NY)
};

export const CREDENTIALS: CredDef[] = [
  {
    key: "ct", label: "Connecticut RN/LPN license", nurseEditable: true, alwaysRequired: true,
    expiryHeader: "CT License Expiry",
    fields: [
      { header: "CT License #", label: "License number", type: "text", required: true },
      { header: "CT License Expiry", label: "Expires", type: "date", required: true },
    ],
  },
  {
    key: "ny", label: "New York license (only if you work in NY)", nurseEditable: true, alwaysRequired: false,
    expiryHeader: "NY License Expiry",
    fields: [
      { header: "NY License #", label: "License number", type: "text", required: true },
      { header: "NY License Expiry", label: "Expires", type: "date", required: true },
    ],
  },
  {
    key: "malpractice", label: "Malpractice insurance", nurseEditable: true, alwaysRequired: true,
    expiryHeader: "Malpractice Expiry",
    fields: [
      { header: "Malpractice Carrier", label: "Carrier", type: "text", required: false },
      { header: "Malpractice Policy #", label: "Policy number", type: "text", required: true },
      { header: "Malpractice Expiry", label: "Expires", type: "date", required: true },
    ],
  },
  {
    key: "cpr", label: "CPR/BLS certification", nurseEditable: true, alwaysRequired: true,
    expiryHeader: "CPR/BLS Expiry",
    fields: [{ header: "CPR/BLS Expiry", label: "Expires", type: "date", required: true }],
  },
  {
    key: "agreement", label: "Signed independent-contractor registry agreement", nurseEditable: false, alwaysRequired: true,
    fields: [{ header: "Registry Agreement Signed Date", label: "Date signed", type: "date", required: true }],
  },
  {
    key: "background", label: "Background check cleared", nurseEditable: false, alwaysRequired: true,
    fields: [
      { header: "Background Check Date", label: "Date cleared", type: "date", required: true },
      { header: "Background Check Provider", label: "Provider", type: "text", required: false },
    ],
  },
];

export type VerifRow = Record<string, string>; // Credential_Verification row

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
export function validIsoDate(s: string): boolean {
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return +m[1] >= 2000 && +m[1] <= 2100 && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Sheet cells may hold M/D/YYYY (typed in Sheets) – normalise to ISO for form fields and comparisons.
export function toIso(v: string): string {
  const t = (v ?? "").trim();
  if (ISO.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : t;
}

// Spreadsheet-formula guard for free text written with USER_ENTERED.
export function sanitizeField(raw: string, max = 80): string {
  const t = raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  return /^[=+\-@]/.test(t) ? `'${t}` : t;
}

export function valueOf(def: CredDef, nurse: Record<string, string>): string {
  return def.fields
    .map((f) => (f.type === "date" ? toIso(nurse[f.header] ?? "") : (nurse[f.header] ?? "").trim()))
    .join("|");
}

export function isPresent(def: CredDef, nurse: Record<string, string>): boolean {
  return def.fields.filter((f) => f.required).every((f) => (nurse[f.header] ?? "").trim() !== "");
}

function started(def: CredDef, nurse: Record<string, string>): boolean {
  return def.fields.some((f) => (nurse[f.header] ?? "").trim() !== "");
}

export type CredState = {
  def: CredDef;
  required: boolean;
  present: boolean;
  expired: boolean;
  verified: boolean;
  verifiedBy?: string;
  verifiedOn?: string;
  ok: boolean; // required items: present, verified and not expired
};

export function credentialStates(
  nurse: Record<string, string>,
  verifs: VerifRow[],
  nurseId: string,
  today: Date = new Date()
): CredState[] {
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).getTime();
  return CREDENTIALS.map((def) => {
    const present = isPresent(def, nurse);
    const required = def.alwaysRequired || started(def, nurse);
    const exp = def.expiryHeader ? toIso(nurse[def.expiryHeader] ?? "") : "";
    const expired = !!exp && validIsoDate(exp) && Date.parse(exp) < t;
    const current = valueOf(def, nurse);
    // Latest matching verification row wins (rows are appended chronologically).
    const v = [...verifs]
      .reverse()
      .find((r) => r.NurseID === nurseId && r.Credential === def.key && r.Value_Verified === current);
    const verified = present && !!v;
    return {
      def, required, present, expired, verified,
      verifiedBy: verified ? v!.Verified_By : undefined,
      verifiedOn: verified ? v!.Verified_On : undefined,
      ok: !required || (present && verified && !expired),
    };
  });
}

// Human-readable reasons a nurse cannot be set Active yet. Empty = ready.
export function activationBlockers(states: CredState[]): string[] {
  return states
    .filter((s) => s.required && !s.ok)
    .map((s) =>
      !s.present ? `${s.def.label}: not entered`
      : s.expired ? `${s.def.label}: expired`
      : `${s.def.label}: not verified`
    );
}

// Next NurseID continuing the existing pattern (N-001 → N-002).
export function nextNurseId(existing: string[]): string {
  let prefix = "N-";
  let max = 0;
  for (const id of existing) {
    const m = /^(.*?)(\d+)$/.exec(id.trim());
    if (!m) continue;
    prefix = m[1];
    max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function nextVerifId(existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = /(\d+)$/.exec(id.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CV-${String(max + 1).padStart(3, "0")}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validEmail(s: string): boolean {
  return EMAIL.test(s.trim()) && s.length <= 120;
}
