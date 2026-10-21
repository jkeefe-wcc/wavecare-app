import { requireRoleApi } from "@/lib/guard";
import { NextResponse } from "next/server";
import { getNurses, getNurseAvailability, availabilitySummary, isBlackedOut } from "@/lib/sheets";

export async function GET() {
  const denied = await requireRoleApi("admin");
  if (denied) return denied;
  try {
    const [nurses, availability] = await Promise.all([
      getNurses(),
      getNurseAvailability(),
    ]);

    const enriched = nurses.map((nurse) => ({
      ...nurse,
      Availability_Summary: availabilitySummary(nurse),
      Is_Blacked_Out: isBlackedOut(availability, nurse.Nurse_ID),
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch nurses" }, { status: 500 });
  }
}
