"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { TABS, getRowsIndexed, getRows, updateByHeaders, appendByHeaders, nurseIdOf } from "@/lib/sheets";
import {
  CREDENTIALS, valueOf, isPresent, validIsoDate, sanitizeField, nextVerifId, type CredDef,
} from "@/lib/credentials";

const PAGE = "/nurse/credentials";

// Same ownership model as availability: a nurse's id comes from the session, never the form.
async function actor(formNurse: FormDataEntryValue | null) {
  const session = await auth();
  if (!session?.role) redirect("/login");
  let nurseId = "";
  if (session.role === "nurse") nurseId = session.nurseId ?? "";
  else if (session.role === "admin") nurseId = typeof formNurse === "string" ? formNurse : "";
  if (!nurseId) redirect("/login");
  const nurses = await getRowsIndexed(TABS.NURSES);
  const nurse = nurses.find((n) => nurseIdOf(n.data) === nurseId);
  if (!nurse) redirect("/login");
  return {
    nurseId, nurseRow: nurse.row, nurse: nurse.data,
    isAdmin: session.role === "admin",
    who: `${session.user?.email ?? "unknown"} (${session.role})`,
  };
}

function back(nurseId: string, isAdmin: boolean, params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params);
  if (isAdmin) q.set("nurse", nurseId);
  revalidatePath(PAGE);
  redirect(`${PAGE}${q.size ? `?${q}` : ""}`);
}

const etNow = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }).format(new Date());

async function recordVerification(def: CredDef, nurseId: string, value: string, by: string) {
  const rows = await getRows(TABS.CREDENTIAL_VERIFICATION);
  await appendByHeaders(TABS.CREDENTIAL_VERIFICATION, {
    Verif_ID: nextVerifId(rows.map((r) => r.Verif_ID).filter(Boolean)),
    NurseID: nurseId, Credential: def.key, Value_Verified: value, Verified_By: by, Verified_On: etNow(),
  });
}

// Save the values the actor may edit. Nurses: their own claims only. Admins: everything
// (and values an admin records themselves, like the signed agreement, are verified on save).
export async function saveCredentials(formData: FormData) {
  const a = await actor(formData.get("nurse"));
  const cells: Record<string, string> = {};
  const merged = { ...a.nurse };
  for (const def of CREDENTIALS) {
    if (!def.nurseEditable && !a.isAdmin) continue;
    for (const f of def.fields) {
      const raw = formData.get(f.header);
      if (raw === null) continue; // field not on the form
      const v = String(raw).trim();
      if (f.type === "date") {
        if (v && !validIsoDate(v)) back(a.nurseId, a.isAdmin, { error: `${def.label}: enter a valid date.` });
        cells[f.header] = v;
      } else {
        cells[f.header] = v ? sanitizeField(v) : "";
      }
      merged[f.header] = cells[f.header];
    }
  }
  let failed = false;
  try {
    if (Object.keys(cells).length) await updateByHeaders(TABS.NURSES, a.nurseRow, cells);
    if (a.isAdmin) {
      for (const def of CREDENTIALS.filter((d) => !d.nurseEditable)) {
        const changed = def.fields.some((f) => f.header in cells && cells[f.header] !== (a.nurse[f.header] ?? ""));
        if (changed && isPresent(def, merged)) await recordVerification(def, a.nurseId, valueOf(def, merged), a.who);
      }
    }
  } catch (err) {
    console.error("saveCredentials failed", err);
    failed = true;
  }
  back(a.nurseId, a.isAdmin, failed ? { error: "Couldn't save. Please try again." } : { saved: "creds" });
}

// Admin-only: record that this credential's *current* values were checked against the primary source.
export async function verifyCredential(formData: FormData) {
  const a = await actor(formData.get("nurse"));
  if (!a.isAdmin) redirect("/login");
  const def = CREDENTIALS.find((d) => d.key === String(formData.get("cred") ?? ""));
  if (!def) back(a.nurseId, true, { error: "Unknown credential." });
  if (!isPresent(def!, a.nurse)) back(a.nurseId, true, { error: "Nothing entered to verify yet." });
  let failed = false;
  try {
    await recordVerification(def!, a.nurseId, valueOf(def!, a.nurse), a.who);
  } catch (err) {
    console.error("verifyCredential failed", err);
    failed = true;
  }
  back(a.nurseId, true, failed ? { error: "Couldn't record verification. Is the Credential_Verification tab set up?" } : { saved: "verified" });
}
