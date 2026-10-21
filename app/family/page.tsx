import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

async function FamilyView() {
  await connection();
  const session = await auth();
  if (session?.role !== "family") redirect("/login");
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Wave Care Concierge</h1>
      <p className="mt-3 text-slate-600">Your care team view is coming soon.</p>
      <form className="mt-6" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
        <button className="text-sm text-slate-600 underline">Sign out</button>
      </form>
    </main>
  );
}

export default function FamilyPage() {
  return <Suspense><FamilyView /></Suspense>;
}
