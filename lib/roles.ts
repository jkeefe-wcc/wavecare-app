import { getNurses, getPatients, getEngagements } from "@/lib/sheets";

export type Role = "admin" | "nurse" | "family";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "jkeefe@wavecareconcierge.com,jbkeefe@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Any column whose header contains "email" counts as a login email for that row.
function rowEmails(row: Record<string, string>): string[] {
  return Object.entries(row)
    .filter(([k, v]) => /email/i.test(k) && v)
    .map(([, v]) => v.trim().toLowerCase());
}

// Resolve a verified Google email to a role. Unknown emails get null (no access).
export async function resolveRole(email?: string | null): Promise<Role | null> {
  if (!email) return null;
  const e = email.toLowerCase();
  if (ADMIN_EMAILS.includes(e)) return "admin";
  const [nurses, patients, engagements] = await Promise.all([
    getNurses(),
    getPatients(),
    getEngagements(),
  ]);
  if (nurses.some((n) => rowEmails(n).includes(e))) return "nurse";
  if ([...patients, ...engagements].some((r) => rowEmails(r).includes(e))) return "family";
  return null;
}
