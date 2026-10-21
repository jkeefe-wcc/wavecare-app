import { Suspense } from "react";
import { connection } from "next/server";
import { requireRolePage } from "@/lib/guard";
import {
  TABS, getRows, nurseIdOf, nurseNameOf, nurseCredentialExpiries,
} from "@/lib/sheets";
import { SHIFT_TYPES, parseDay, checkRange, type OverrideRow } from "@/lib/availability";

type SP = Promise<{ from?: string; to?: string; shift?: string }>;
const MAX_DAYS = 90;

async function MatchView({ searchParams }: { searchParams: SP }) {
  await connection();
  await requireRolePage("admin");
  const { from = "", to = "", shift = "Day" } = await searchParams;

  const fromDay = parseDay(from);
  const toDay = parseDay(to);
  const shiftOk = (SHIFT_TYPES as readonly string[]).includes(shift);
  const searched = Boolean(from || to);
  let problem = "";
  if (searched) {
    if (fromDay === null || toDay === null) problem = "Enter a valid start and end date.";
    else if (toDay < fromDay) problem = "The end date can't be before the start date.";
    else if (toDay - fromDay + 1 > MAX_DAYS) problem = `Please search ${MAX_DAYS} days or fewer at a time.`;
    else if (!shiftOk) problem = "Choose a shift type.";
  }
  const ready = searched && !problem && fromDay !== null && toDay !== null;

  let full: { name: string; status: string; specialties: string; expired: string[]; id: string }[] = [];
  let partial: typeof full = [];
  const detail = new Map<string, { open: number; total: number; gaps: string[] }>();

  if (ready) {
    const [nurses, availability] = await Promise.all([getRows(TABS.NURSES), getRows(TABS.NURSE_AVAILABILITY)]);
    const expiredBy = new Map<string, string[]>();
    for (const c of nurseCredentialExpiries(nurses)) {
      if (c.days < 0) expiredBy.set(c.nurseId, [...(expiredBy.get(c.nurseId) ?? []), c.document]);
    }
    for (const n of nurses) {
      const id = nurseIdOf(n);
      const mine = availability.filter((a) => nurseIdOf(a) === id) as unknown as OverrideRow[];
      const r = checkRange(n, mine, fromDay!, toDay!, shift);
      if (r.openDays === 0) continue;
      const row = { id, name: nurseNameOf(n), status: n.Status, specialties: n.Specialties, expired: expiredBy.get(id) ?? [] };
      const gapDates = [...new Set(r.unavailable.map((u) => u.date))];
      detail.set(id, { open: r.openDays, total: r.daysChecked, gaps: gapDates });
      (r.openDays === r.daysChecked ? full : partial).push(row);
    }
    partial.sort((a, b) => detail.get(b.id)!.open - detail.get(a.id)!.open);
  }

  const input = "mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm";
  const Card = ({ n }: { n: (typeof full)[number] }) => {
    const d = detail.get(n.id)!;
    return (
      <li className="p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-900">{n.name}</span>
          <span className="text-slate-500">{n.status}</span>
        </div>
        {n.specialties && <div className="text-slate-500">{n.specialties}</div>}
        {d.open < d.total && (
          <div className="text-slate-600">
            Open {d.open} of {d.total} days. Not open: {d.gaps.slice(0, 6).join(", ")}{d.gaps.length > 6 ? ` +${d.gaps.length - 6} more` : ""}
          </div>
        )}
        {n.expired.length > 0 && (
          <div className="mt-1 text-red-700">Expired credential: {n.expired.join(", ")}</div>
        )}
      </li>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Find open nurses</h1>
        <a href="/admin" className="text-sm text-slate-600 underline">Back to dashboard</a>
      </header>
      <p className="mt-2 text-sm text-slate-600">
        Shows who has said they&apos;re open for a period, to help build a shortlist to present to a family.
        The family chooses and confirms; this is information only.
      </p>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">From<br /><input type="date" name="from" defaultValue={from} required className={input} /></label>
        <label className="text-sm text-slate-700">To<br /><input type="date" name="to" defaultValue={to} required className={input} /></label>
        <label className="text-sm text-slate-700">Shift<br />
          <select name="shift" defaultValue={shiftOk ? shift : "Day"} className={input}>
            {SHIFT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Search</button>
      </form>

      {problem && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}

      {ready && (
        <>
          <h2 className="mt-8 text-lg font-medium text-slate-900">Open for the whole period ({full.length})</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {full.length === 0 && <li className="p-3 text-sm text-slate-500">No one is open for every day.</li>}
            {full.map((n) => <Card key={n.id} n={n} />)}
          </ul>
          <h2 className="mt-8 text-lg font-medium text-slate-900">Partly open ({partial.length})</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {partial.length === 0 && <li className="p-3 text-sm text-slate-500">No one is partly open.</li>}
            {partial.map((n) => <Card key={n.id} n={n} />)}
          </ul>
        </>
      )}
    </main>
  );
}

export default function MatchPage({ searchParams }: { searchParams: SP }) {
  return <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}><MatchView searchParams={searchParams} /></Suspense>;
}
