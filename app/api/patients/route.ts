import { requireRoleApi } from "@/lib/guard";
import { NextResponse } from "next/server";
import { getPatients } from "@/lib/sheets";

export async function GET() {
  const denied = await requireRoleApi("admin");
  if (denied) return denied;
  try {
    const patients = await getPatients();
    return NextResponse.json(patients);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 });
  }
}
