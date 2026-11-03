import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { TABS, getRows, nurseIdOf, nurseNameOf } from "@/lib/sheets";
import { CREDENTIALS, credentialStates, activationBlockers, toIso } from "@/lib/credentials";
import { normalizeStatus } from "@/lib/status";
import { saveCredentials, verifyCredential } from "./actions";

type SP = Promise<{ nurse?: string; error?: string; saved?: string }>;

const SAVED: Record<string, string> = {
  creds: "Saved. Anything you changed will be re-checked by Wave Care Concierge.",
  verified: "Marked verified.",
};

async function CredentialsView({ searchParams }: { searchParams: SP }) {
  await connection();
  const { nurse: nurseParam, error, saved } = await searchParams;
  const session = await auth();
  if (!session?.role || (session.role !== "nurse" && session.role !== "admin")) redirect("/login");
  const isAdmin = session.role === "admin";
  const targetId = isAdmin ? nurseParam : session.nurseId;
  if (!targetId) redirect(isAdmin ? "/admin" : "/login");

  const [nurses, verifs] = await Promise.all([
    getRows(TABS.NURSES),
    getRows(TABS.CREDENTIAL_VERIFICATION).catch(() => [] as Record<string, string>[]),
  ]);
  const nurse = nurses.find((n) => nurseIdOf(n) === targetId);
  if (!nurse) redirect(isAdmin ? "/admin" : "/login");

  const states = credentialStates(nurse, verifs, targetId);
  const blockers = activationBlockers(states);
  const status = normalizeStatus(nurse.Status);
  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-600";
  const btn = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Credentials</h1>
          <p className="text-sm text-slate-500">{isAdmin ? `Editing for ${nurseNameOf(nurse)} (admin)` : nurseNameOf(nurse)}</p>
        </div>
        {isAdmin ? (
          <a href="/admin" className="text-sm text-slate-600 underline">Back to admin</a>
        ) : (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-sm text-slate-600 underline">Sign out</button>
          </form>
        )}
      </header>
      <nav className="mt-2 text-sm">
        <a className="text-slate-600 underline" href={`/nurse/availability${isAdmin ? `?nurse=${encodeURIComponent(targetId)}` : ""}`}>Availability</a>
      </nav>

      <p className="mt-4 text-sm text-slate-600">
        Enter your license, insurance and certification details. Wave Care Concierge checks each one against the
        issuing source before your profile is made visible to families. If you change a checked item (for example
        after renewing), it will be re-checked. Please don&apos;t enter Social Security numbers or other ID numbers here.
      </p>

      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && SAVED[saved] && <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{SAVED[saved]}</p>}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          Profile status: <span className="font-medium">{status}</span>
        </p>
        {blockers.length === 0 ? (
          <p className="mt-1 text-sm text-green-700">All required credentials are verified.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">Still needed before activation:</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </>
        )}
      </section>

      <form id="creds" action={saveCredentials}>
        {isAdmin && <input type="hidden" name="nurse" value={targetId} />}
      </form>

      {states.map((s) => {
        const editable = s.def.nurseEditable || isAdmin;
        const badge = !s.present
          ? { t: "Not entered", c: "bg-slate-100 text-slate-600" }
          : s.expired
            ? { t: "Expired", c: "bg-red-50 text-red-700" }
            : s.verified
              ? { t: "Verified", c: "bg-green-50 text-green-700" }
              : { t: "Awaiting verification", c: "bg-amber-50 text-amber-700" };
        return (
          <section key={s.def.key} className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium text-slate-900">{s.def.label}</h2>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${badge.c}`}>{badge.t}</span>
            </div>
            {!s.def.nurseEditable && !isAdmin && (
              <p className="text-sm text-slate-500">Recorded by Wave Care Concierge.</p>
            )}
            {s.verified && (
              <p className="text-xs text-slate-500">Checked by {s.verifiedBy} on {s.verifiedOn}</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {s.def.fields.map((f) => (
                <label key={f.header} className="text-sm text-slate-700">{f.label}
                  <input
                    form="creds"
                    name={f.header}
                    type={f.type === "date" ? "date" : "text"}
                    maxLength={80}
                    disabled={!editable}
                    defaultValue={f.type === "date" ? toIso(nurse[f.header] ?? "") : (nurse[f.header] ?? "")}
                    className={input}
                  />
                </label>
              ))}
            </div>
            {isAdmin && s.present && !s.verified && (
              <form action={verifyCredential} className="mt-3">
                <input type="hidden" name="nurse" value={targetId} />
                <input type="hidden" name="cred" value={s.def.key} />
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                  Mark verified (checked against source)
                </button>
              </form>
            )}
          </section>
        );
      })}

      <div className="mt-6">
        <button form="creds" className={btn}>Save credentials</button>
        {isAdmin && (
          <p className="mt-2 text-xs text-slate-500">
            Verify buttons act on the values currently saved, so save edits first. Recording the agreement
            date or background check here counts as verifying them.
          </p>
        )}
      </div>
    </main>
  );
}

export default function CredentialsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <CredentialsView searchParams={searchParams} />
    </Suspense>
  );
}
