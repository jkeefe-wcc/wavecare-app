import { requireRoleApi } from "@/lib/guard";
import { NextResponse } from "next/server";
import { getNurseAvailability } from "@/lib/sheets";

export async function GET() {
  const denied = await requireRoleApi("admin");
  if (denied) return denied;
  try {
    return NextResponse.json(await getNurseAvailability());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch nurse availability" }, { status: 500 });
  }
}
