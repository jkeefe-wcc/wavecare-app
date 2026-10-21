import { connection } from "next/server";
import { Suspense } from "react";
import { signIn } from "@/auth";

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Wave Care Concierge</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with the Google account on file.</p>
        {error && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            That Google account isn&apos;t registered. Contact Wave Care Concierge for access.
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense>
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}
