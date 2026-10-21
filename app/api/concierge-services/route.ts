import { NextResponse } from "next/server";
import { getConciergeServices } from "@/lib/sheets";

export async function GET() {
  try {
    return NextResponse.json(await getConciergeServices());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch concierge services" }, { status: 500 });
  }
}
