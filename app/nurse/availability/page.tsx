import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { TABS, getRows, nurseIdOf, nurseNameOf } from "@/lib/sheets";
import { DAYS, SHIFT_TYPES, OVERRIDE_TYPES, normalizeWeekValue } from "@/lib/availability";
import { saveWeek, addOverride, removeOverride } from "./actions";

type SP = Promise<{ nurse?: string; error?: string; saved?: string }>;

const SAVED: Record<string, string> = {
  week: "Weekly pattern saved.",
  override: "Entry added.",
  removed: "Entry removed.",
};

async function AvailabilityView({ searchParams }: { searchParams: SP }) {
  await connection();
  const { nurse: nurseParam, error, saved } = await searchParams;

  const session = await auth();
  if (!session?.role || (session.role !== "nurse" && session.role !== "admin")) redirect("/login");
  const isAdmin = session.role === "admin";

  const targetId = isAdmin ? nurseParam : session.nurseId;
  if (!targetId) redirect(isAdmin ? "/admin" : "/login");

  const [nurses, availability] = await Promise.all([getRows(TABS.NURSES), getRows(TABS.NURSE_AVAILABILITY)]);
  const nurse = nurses.find((n) => nurseIdOf(n) === targetId);
  if (!nurse) redirect(isAdmin ? "/admin" : "/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mine = availability
    .filter((a) => nurseIdOf(a) === targetId)
    .sort((a, b) => new Date(a.Date_From).getTime() - new Date(b.Date_From).getTime());

  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  const btn = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My availability</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? `Editing for ${nurseNameOf(nurse)} (admin)` : nurseNameOf(nurse)}
          </p>
        </div>
        {isAdmin ? (
          <a href="/admin" className="text-sm text-slate-600 underline">Back to admin</a>
        ) : (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="text-sm text-slate-600 underline">Sign out</button>
          </form>
        )}
      </header>

      <p className="mt-4 text-sm text-slate-600">
        This is information you share so Wave Care Concierge and families know when you&apos;re open to
        new engagements. It&apos;s always your decision whether to accept one.
      </p>

      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && SAVED[saved] && <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{SAVED[saved]}</p>}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Usual weekly pattern</h2>
        <p className="text-sm text-slate-500">For each day, whether you&apos;re generally open for any shift, days only, or nights only.</p>
        <form action={saveWeek} className="mt-4">
          {isAdmin && <input type="hidden" name="nurse" value={targetId} />}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DAYS.map((d) => (
              <label key={d} className="text-sm text-slate-700">{d}
                <select name={`day_${d}`} className={input} defaultValue={normalizeWeekValue(nurse[`Avail_${d}`])}>
                  <option value="No">Not available</option>
                  <option value="Yes">Any shift</option>
                  <option value="Day">Day only</option>
                  <option value="Night">Night only</option>
                </select>
              </label>
            ))}
          </div>
          <button className={`mt-4 ${btn}`}>Save weekly pattern</button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-medium text-slate-900">Specific dates</h2>
        <p className="text-sm text-slate-500">
          Mark dates you&apos;re unavailable (blackout) or extra dates you&apos;re open, on top of your usual pattern.
        </p>

        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {mine.length === 0 && <li className="py-3 text-slate-500">Nothing added yet.</li>}
          {mine.map((a) => {
            const past = new Date(a.Date_To) < today;
            return (
              <li key={a.Avail_ID} className={`flex items-center justify-between gap-3 py-3 ${past ? "opacity-50" : ""}`}>
                <div>
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${a.Type === "Blackout" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {a.Type}
                  </span>
                  {a.Date_From} – {a.Date_To} · {a.Shift_Type}
                  {a.Notes && <div className="text-slate-500">{a.Notes}</div>}
                </div>
                <form action={removeOverride}>
                  <input type="hidden" name="availId" value={a.Avail_ID} />
                  {isAdmin && <input type="hidden" name="nurse" value={targetId} />}
                  <button className="text-slate-500 underline">Remove</button>
                </form>
              </li>
            );
          })}
        </ul>

        <form action={addOverride} className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
          {isAdmin && <input type="hidden" name="nurse" value={targetId} />}
          <label className="text-sm text-slate-700">Type
            <select name="type" className={input} defaultValue="Blackout">
              {OVERRIDE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-700">Shift
            <select name="shiftType" className={input} defaultValue="Day">
              {SHIFT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-700">From
            <input type="date" name="dateFrom" required className={input} />
          </label>
          <label className="text-sm text-slate-700">To
            <input type="date" name="dateTo" required className={input} />
          </label>
          <label className="col-span-2 text-sm text-slate-700">Note (optional)
            <input type="text" name="notes" maxLength={200} className={input} />
          </label>
          <div className="col-span-2"><button className={btn}>Add</button></div>
        </form>
      </section>
    </main>
  );
}

export default function AvailabilityPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <AvailabilityView searchParams={searchParams} />
    </Suspense>
  );
}
