import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/lib/roles";

// For pages: redirects to /login if not allowed.
export async function requireRolePage(...roles: Role[]) {
  const session = await auth();
  if (!session?.role || !roles.includes(session.role)) redirect("/login");
  return session;
}

// For API routes: returns a 401/403 response, or null when allowed.
export async function requireRoleApi(...roles: Role[]) {
  const session = await auth();
  if (!session?.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roles.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
