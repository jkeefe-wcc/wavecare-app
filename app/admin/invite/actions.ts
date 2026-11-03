"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TABS, getRows, getHeaders, appendByHeaders, nurseIdOf } from "@/lib/sheets";
import { statusCells } from "@/lib/status";
import { nextNurseId, validEmail, sanitizeField } from "@/lib/credentials";

// Admin-only: creates a Pending nurse row. Being in the sheet is what lets the nurse sign in.
export async function inviteNurse(formData: FormData) {
  const session = await auth();
  if (session?.role !== "admin") redirect("/login");

  const first = sanitizeField(String(formData.get("first") ?? ""), 60);
  const last = sanitizeField(String(formData.get("last") ?? ""), 60);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fail = (m: string): never => redirect(`/admin/invite?error=${encodeURIComponent(m)}`);

  if (!first || !last) fail("Enter first and last name.");
  if (!validEmail(email)) fail("Enter a valid email address.");

  let id = "";
  try {
    const nurses = await getRows(TABS.NURSES);
    const taken = nurses.some((n) =>
      Object.entries(n).some(([h, v]) => /email/i.test(h) && v.trim().toLowerCase() === email)
    );
    if (taken) fail("A nurse with that email is already in the registry.");
    id = nextNurseId(nurses.map(nurseIdOf).filter(Boolean));
    const headers = await getHeaders(TABS.NURSES);
    const who = `${session.user?.email ?? "admin"} (admin, invite)`;
    await appendByHeaders(TABS.NURSES, {
      NurseID: id, "First Name": first, "Last Name": last, Email: email,
      ...statusCells(headers, "Pending", who),
    });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // let redirect() through
    console.error("inviteNurse failed", err);
    fail("Couldn't create the invite. Please try again.");
  }
  redirect(`/admin/invite?invited=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`);
}
