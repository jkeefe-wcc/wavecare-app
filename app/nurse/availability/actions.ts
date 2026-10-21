"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  TABS, getRowsIndexed, updateByHeaders, appendByHeaders, clearRow, nurseIdOf,
} from "@/lib/sheets";
import { DAYS, validateOverride, weekValues, nextAvailId } from "@/lib/availability";

const PAGE = "/nurse/availability";

// Nurses can only ever act on their own NurseID (taken from the session, never from the form).
// Admins may act on any existing nurse's availability (to fix mistakes on their behalf).
async function actor(formNurse: FormDataEntryValue | null) {
  const session = await auth();
  if (!session?.role) redirect("/login");

  let nurseId = "";
  if (session.role === "nurse") {
    nurseId = session.nurseId ?? "";
  } else if (session.role === "admin") {
    nurseId = typeof formNurse === "string" ? formNurse : "";
  }
  if (!nurseId) redirect("/login");

  const nurses = await getRowsIndexed(TABS.NURSES);
  const nurse = nurses.find((n) => nurseIdOf(n.data) === nurseId);
  if (!nurse) redirect("/login");

  return { nurseId, nurseRow: nurse.row, isAdmin: session.role === "admin" };
}

function back(nurseId: string, isAdmin: boolean, params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params);
  if (isAdmin) q.set("nurse", nurseId);
  revalidatePath(PAGE);
  redirect(`${PAGE}${q.size ? `?${q}` : ""}`);
}

export async function saveWeek(formData: FormData) {
  const a = await actor(formData.get("nurse"));
  const modes: Record<string, string> = {};
  for (const d of DAYS) modes[d] = String(formData.get(`day_${d}`) ?? "No");
  let failed = false;
  try {
    await updateByHeaders(TABS.NURSES, a.nurseRow, weekValues(modes));
  } catch (err) {
    console.error("saveWeek failed", err);
    failed = true;
  }
  back(a.nurseId, a.isAdmin, failed ? { error: "Couldn't save. Please try again." } : { saved: "week" });
}

export async function addOverride(formData: FormData) {
  const a = await actor(formData.get("nurse"));
  const result = validateOverride({
    type: String(formData.get("type") ?? ""),
    dateFrom: String(formData.get("dateFrom") ?? ""),
    dateTo: String(formData.get("dateTo") ?? ""),
    shiftType: String(formData.get("shiftType") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!result.ok) back(a.nurseId, a.isAdmin, { error: result.error });

  let failed = false;
  try {
    const existing = await getRowsIndexed(TABS.NURSE_AVAILABILITY);
    const id = nextAvailId(existing.map((r) => r.data.Avail_ID).filter(Boolean));
    await appendByHeaders(TABS.NURSE_AVAILABILITY, { Avail_ID: id, NurseID: a.nurseId, ...result.value! });
  } catch (err) {
    console.error("addOverride failed", err);
    failed = true;
  }
  back(a.nurseId, a.isAdmin, failed ? { error: "Couldn't save. Please try again." } : { saved: "override" });
}

export async function removeOverride(formData: FormData) {
  const a = await actor(formData.get("nurse"));
  const availId = String(formData.get("availId") ?? "");
  let failed = false;
  try {
    const rows = await getRowsIndexed(TABS.NURSE_AVAILABILITY);
    // Ownership check: the row must belong to the acting nurse.
    const target = rows.find((r) => r.data.Avail_ID === availId && nurseIdOf(r.data) === a.nurseId);
    if (!target) back(a.nurseId, a.isAdmin, { error: "That entry wasn't found." });
    await clearRow(TABS.NURSE_AVAILABILITY, target!.row);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // let redirect() through
    console.error("removeOverride failed", err);
    failed = true;
  }
  back(a.nurseId, a.isAdmin, failed ? { error: "Couldn't remove it. Please try again." } : { saved: "removed" });
}
