import { NextResponse } from "next/server";
import { getShifts } from "@/lib/sheets";

export async function GET() {
  try {
    return NextResponse.json(await getShifts());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch shifts" }, { status: 500 });
  }
}
