import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

async function Redirector() {
  await connection();
  const session = await auth();
  if (session?.role === "admin") redirect("/admin");
  if (session?.role === "nurse") redirect("/nurse/availability");
  if (session?.role === "family") redirect("/family");
  return redirect("/login");
}

export default function Home() {
  return (
    <Suspense>
      <Redirector />
    </Suspense>
  );
}
