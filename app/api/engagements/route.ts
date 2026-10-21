import { requireRoleApi } from "@/lib/guard";
import { NextResponse } from "next/server";
import { getEngagements } from "@/lib/sheets";

export async function GET() {
  const denied = await requireRoleApi("admin");
  if (denied) return denied;
  try {
    const engagements = await getEngagements();
    return NextResponse.json(engagements);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch engagements" }, { status: 500 });
  }
}
