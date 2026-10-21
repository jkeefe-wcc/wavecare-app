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

// Fetch with absolute sheet row numbers (needed for targeted edits). Blank rows are skipped.
export async function getRowsIndexed(
  tab: string
): Promise<{ row: number; data: Record<string, string> }[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${HEADER_ROW}:AZ`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const headers = rows[0] as string[];
  return rows
    .slice(1)
    .map((row, i) => {
      const data: Record<string, string> = {};
      headers.forEach((h, c) => {
        data[h] = (row[c] as string) ?? "";
      });
      return { row: DATA_ROW + i, data };
    })
    .filter((r) => Object.values(r.data).some((v) => v !== ""));
}

// Generic fetch: returns array of objects keyed by header row
export async function getRows(tab: string): Promise<Record<string, string>[]> {
  return (await getRowsIndexed(tab)).map((r) => r.data);
}

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function getHeaders(tab: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${HEADER_ROW}:AZ${HEADER_ROW}`,
  });
  return ((res.data.values?.[0] ?? []) as string[]).map((h) => h ?? "");
}

// Update specific cells of one row, addressed by header name. Other cells are untouched.
export async function updateByHeaders(
  tab: string,
  sheetRow: number,
  values: Record<string, string>
): Promise<void> {
  if (sheetRow < DATA_ROW) throw new Error("Refusing to write above the data rows");
  const headers = await getHeaders(tab);
  const data = Object.entries(values).map(([h, v]) => {
    const i = headers.indexOf(h);
    if (i < 0) throw new Error(`Column "${h}" not found on ${tab}`);
    return { range: `${tab}!${colLetter(i)}${sheetRow}`, values: [[v]] };
  });
  await getSheetsClient().spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// Append a row after the last used row, placing each value under its header.
export async function appendByHeaders(
  tab: string,
  values: Record<string, string>
): Promise<number> {
  const sheets = getSheetsClient();
  const headers = await getHeaders(tab);
  const used = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${DATA_ROW}:A`,
  });
  const nextRow = DATA_ROW + (used.data.values?.length ?? 0);
  const lastCol = colLetter(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${nextRow}:${lastCol}${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers.map((h) => values[h] ?? "")] },
  });
  return nextRow;
}

// Clear the cells of one row (within the header columns). Leaves the row blank.
export async function clearRow(tab: string, sheetRow: number): Promise<void> {
  if (sheetRow < DATA_ROW) throw new Error("Refusing to clear above the data rows");
  const headers = await getHeaders(tab);
  await getSheetsClient().spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${sheetRow}:${colLetter(headers.length - 1)}${sheetRow}`,
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
