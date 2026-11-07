import { Suspense } from "react";
import { connection } from "next/server";
import { requireRolePage } from "@/lib/guard";
import { TABS, getTableSafe } from "@/lib/sheets";
import { checkHealth, type Tables } from "@/lib/health";

async function HealthView() {
  await connection();
  await requireRolePage("admin");
  const tabs = Object.values(TABS);
  const results = await Promise.all(tabs.map((t) => getTableSafe(t)));
  const tables: Tables = Object.fromEntries(tabs.map((t, i) => [t, results[i]]));
  const issues = checkHealth(tables);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sheet health</h1>
          <p className="text-sm text-slate-500">Checks the Google Sheet for broken headers, duplicate IDs and orphaned rows.</p>
        </div>
        <a href="/admin" className="text-sm text-slate-600 underline">Back to admin</a>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        {issues.length === 0 ? (
          <p className="text-green-700">All checks passed across {tabs.length} tabs.</p>
        ) : (
          <p className="text-slate-800">
            <span className="font-medium text-red-700">{errors.length} problem{errors.length === 1 ? "" : "s"}</span>
            {" · "}
            <span className="font-medium text-amber-700">{warns.length} warning{warns.length === 1 ? "" : "s"}</span>
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Row numbers are the row in the sheet itself. This page only reads; it never changes data.
        </p>
      </section>

      {issues.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
          {issues.map((i, k) => (
            <li key={k} className="flex gap-3 p-3">
              <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${i.level === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                {i.level === "error" ? "Problem" : "Warning"}
              </span>
              <span>
                <span className="font-medium text-slate-900">{i.tab}{i.row ? `, row ${i.row}` : ""}</span>
                <span className="text-slate-600"> — {i.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function HealthPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Checking…</p>}>
      <HealthView />
    </Suspense>
  );
}
