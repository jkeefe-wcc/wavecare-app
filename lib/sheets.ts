import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID!;
const HEADER_ROW = 3;
const DATA_ROW = 4;

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

// Tab names in the DataScaffold
export const TABS = {
  NURSES: "Nurses",
  PATIENTS: "Patients",
  ENGAGEMENTS: "Engagements",
  SHIFTS: "Shifts",
  COMPLIANCE_DOCS: "Compliance Docs",
  CONCIERGE_SERVICES: "Concierge Services",
  NURSE_AVAILABILITY: "Nurse_Availability",
} as const;

// Generic fetch: returns array of objects keyed by header row
export async function getRows(tab: string): Promise<Record<string, string>[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${HEADER_ROW}:AZ`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const headers = rows[0] as string[];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] as string) ?? "";
    });
    return obj;
  });
}

// Generic append: adds a new row
export async function appendRow(tab: string, values: string[]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${DATA_ROW}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

// Generic update: updates a specific row by row index (1-based from data start)
export async function updateRow(
  tab: string,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const sheets = getSheetsClient();
  const sheetRow = DATA_ROW + rowIndex - 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

// --- Typed fetchers ---

export async function getNurses() {
  return getRows(TABS.NURSES);
}

export async function getPatients() {
  return getRows(TABS.PATIENTS);
}

export async function getEngagements() {
  return getRows(TABS.ENGAGEMENTS);
}

export async function getShifts() {
  return getRows(TABS.SHIFTS);
}

export async function getComplianceDocs() {
  return getRows(TABS.COMPLIANCE_DOCS);
}

export async function getConciergeServices() {
  return getRows(TABS.CONCIERGE_SERVICES);
}

export async function getNurseAvailability() {
  return getRows(TABS.NURSE_AVAILABILITY);
}

// --- Header helpers ---
// The sheet's headers are human-readable ("CT License Expiry", "NurseID"), and the
// Nurse_Availability tab uses "Nurse_ID". These helpers hide that inconsistency.

export const nurseIdOf = (row: Record<string, string>) =>
  row.NurseID || row.Nurse_ID || "";

export const nurseNameOf = (row: Record<string, string>) =>
  [row["First Name"], row["Last Name"]].filter(Boolean).join(" ") || nurseIdOf(row);

// --- Virtual columns ---

export function daysUntilExpiry(expiryDate: string): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Layer 1 (recurring weekly pattern). The Nurses tab has no day columns yet, so this
// looks for Avail_Mon / Availability_Mon style headers and returns "Not set" without them.
export function availabilitySummary(nurse: Record<string, string>): string {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const on = (v?: string) => ["yes", "true", "y", "x", "1"].includes((v ?? "").trim().toLowerCase());
  const available = days.filter((d) => {
    const key = Object.keys(nurse).find((k) => new RegExp(`^avail\\w*[_ ]?${d}$`, "i").test(k));
    return key ? on(nurse[key]) : false;
  });
  return available.length > 0 ? available.join(", ") : "Not set";
}

export function isBlackedOut(
  availability: Record<string, string>[],
  nurseId: string,
  date: Date = new Date()
): boolean {
  if (!nurseId) return false;
  return availability
    .filter((a) => nurseIdOf(a) === nurseId && a.Type === "Blackout")
    .some((a) => {
      const from = new Date(a.Date_From);
      const to = new Date(a.Date_To);
      return date >= from && date <= to;
    });
}

// Credential expiries stored directly on the Nurses tab ("CT License Expiry", etc.).
export function nurseCredentialExpiries(nurses: Record<string, string>[]) {
  const out: { nurseId: string; name: string; document: string; expires: string; days: number }[] = [];
  for (const n of nurses) {
    for (const [header, value] of Object.entries(n)) {
      if (!/expiry$/i.test(header) || !value) continue;
      const days = daysUntilExpiry(value);
      if (days === null) continue;
      out.push({
        nurseId: nurseIdOf(n),
        name: nurseNameOf(n),
        document: header.replace(/\s*expiry$/i, ""),
        expires: value,
        days,
      });
    }
  }
  return out;
}
