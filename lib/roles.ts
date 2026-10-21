import { getNurses, getPatients, getEngagements, nurseIdOf } from "@/lib/sheets";

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

export type Identity = { role: Role | null; nurseId?: string };

// Resolve a verified Google email to a role (and, for nurses, their NurseID).
// Unknown emails get role null (no access).
export async function resolveIdentity(email?: string | null): Promise<Identity> {
  if (!email) return { role: null };
  const e = email.toLowerCase();
  if (ADMIN_EMAILS.includes(e)) return { role: "admin" };
  const [nurses, patients, engagements] = await Promise.all([
    getNurses(),
    getPatients(),
    getEngagements(),
  ]);
  const nurse = nurses.find((n) => rowEmails(n).includes(e));
  if (nurse) {
    const nurseId = nurseIdOf(nurse);
    return nurseId ? { role: "nurse", nurseId } : { role: null };
  }
  if ([...patients, ...engagements].some((r) => rowEmails(r).includes(e))) return { role: "family" };
  return { role: null };
}

export async function resolveRole(email?: string | null): Promise<Role | null> {
  return (await resolveIdentity(email)).role;
}
