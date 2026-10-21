import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

async function Redirector() {
  const session = await auth();
  if (session?.role === "admin") redirect("/admin");
  return redirect("/login");
}

export default function Home() {
  return (
    <Suspense>
      <Redirector />
    </Suspense>
  );
}
