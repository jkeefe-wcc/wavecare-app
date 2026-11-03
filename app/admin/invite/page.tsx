import { Suspense } from "react";
import { connection } from "next/server";
import { requireRolePage } from "@/lib/guard";
import { inviteNurse } from "./actions";

type SP = Promise<{ error?: string; invited?: string; email?: string }>;

async function InviteView({ searchParams }: { searchParams: SP }) {
  await connection();
  await requireRolePage("admin");
  const { error, invited, email } = await searchParams;
  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Invite a nurse</h1>
        <a href="/admin" className="text-sm text-slate-600 underline">Back to admin</a>
      </header>
      <p className="mt-3 text-sm text-slate-600">
        Adds the nurse as <b>Pending</b>. They can then sign in with that Google email, enter their credentials and
        set availability. They stay hidden from shortlists until you&apos;ve verified their credentials and set them Active.
      </p>
      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {invited && (
        <div className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
          Added {invited} ({email}).{" "}
          <a className="underline" href={`/nurse/credentials?nurse=${encodeURIComponent(invited)}`}>Open credentials</a>.
          Let them know to sign in at the portal with that Google account.
        </div>
      )}
      <form action={inviteNurse} className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <label className="text-sm text-slate-700">First name
          <input name="first" required maxLength={60} className={input} />
        </label>
        <label className="text-sm text-slate-700">Last name
          <input name="last" required maxLength={60} className={input} />
        </label>
        <label className="col-span-2 text-sm text-slate-700">Google email
          <input name="email" type="email" required maxLength={120} className={input} />
        </label>
        <div className="col-span-2">
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Add nurse</button>
        </div>
      </form>
    </main>
  );
}

export default function InvitePage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
      <InviteView searchParams={searchParams} />
    </Suspense>
  );
}
