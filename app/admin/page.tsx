import { connection } from "next/server";
import { requireRolePage } from "@/lib/guard";
import {
  getNurses, getEngagements, getComplianceDocs, getNurseAvailability,
  daysUntilExpiry, availabilitySummary, isBlackedOut,
  nurseIdOf, nurseNameOf, nurseCredentialExpiries,
} from "@/lib/sheets";
import { signOut } from "@/auth";
import { Suspense } from "react";

// Sheet headers can vary slightly; pick the first column matching a pattern.
const pick = (row: Record<string, string>, re: RegExp) =>
  Object.entries(row).find(([k, v]) => re.test(k) && v)?.[1] ?? "";

function Card({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone || "text-slate-900"}`}>{value}</div>
    </div>
  );
}

async function Dashboard() {
  await connection();
  const session = await requireRolePage("admin");
  const [nurses, engagements, docs, availability] = await Promise.all([
    getNurses(), getEngagements(), getComplianceDocs(), getNurseAvailability(),
  ]);

  const nurseName = new Map(nurses.map((n) => [nurseIdOf(n), nurseNameOf(n)]));

  // Credentials on the Nurses tab plus rows from the Compliance Docs tab.
  const docRows = [
    ...nurseCredentialExpiries(nurses).map((c) => ({
      who: c.name, document: c.document, expires: c.expires, days: c.days,
    })),
    ...docs.flatMap((d) => {
      const days = daysUntilExpiry(d["Expiry Date"]);
      if (days === null) return [];
      return [{
        who: nurseName.get(d["Related ID"]) ?? d["Related Party Name (lookup)"] ?? d["Related ID"],
        document: d["Document Type"], expires: d["Expiry Date"], days,
      }];
    }),
  ].sort((a, b) => a.days - b.days);
  const expired = docRows.filter((d) => d.days < 0);
  const soon = docRows.filter((d) => d.days >= 0 && d.days <= 60);
  const blacked = nurses.filter((n) => isBlackedOut(availability, nurseIdOf(n)));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Admin dashboard</h1>
          <p className="text-sm text-slate-500">{session.user?.email}</p>
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button className="text-sm text-slate-600 underline">Sign out</button>
        </form>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Nurses" value={nurses.length} />
        <Card label="Engagements" value={engagements.length} />
        <Card label="Expired credentials" value={expired.length} tone={expired.length ? "text-red-600" : ""} />
        <Card label="Expiring ≤ 60 days" value={soon.length} tone={soon.length ? "text-amber-600" : ""} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Compliance expiry</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr><th className="p-3">Nurse</th><th className="p-3">Document</th><th className="p-3">Expires</th><th className="p-3">Days left</th></tr>
            </thead>
            <tbody>
              {docRows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={4}>No dated documents yet.</td></tr>}
              {docRows.slice(0, 25).map((d, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-3">{d.who}</td>
                  <td className="p-3">{d.document}</td>
                  <td className="p-3">{d.expires}</td>
                  <td className={`p-3 font-medium ${d.days < 0 ? "text-red-600" : d.days <= 60 ? "text-amber-600" : "text-slate-700"}`}>
                    {d.days < 0 ? `${-d.days} overdue` : d.days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-medium text-slate-900">Nurses</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {nurses.length === 0 && <li className="p-3 text-slate-500">No nurses yet.</li>}
            {nurses.map((n) => (
              <li key={nurseIdOf(n)} className="flex items-center justify-between p-3">
                <span>{nurseNameOf(n)}</span>
                <span className="text-slate-500">
                  {availabilitySummary(n)}
                  {blacked.includes(n) && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-red-700">blacked out</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium text-slate-900">Engagements</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {engagements.length === 0 && <li className="p-3 text-slate-500">No engagements yet.</li>}
            {engagements.map((e, i) => (
              <li key={i} className="flex items-center justify-between p-3">
                <span>{e.EngagementID}</span>
                <span className="text-slate-500">{e["Engagement Status"]}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}
