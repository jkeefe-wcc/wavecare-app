import { requireRoleApi } from "@/lib/guard";
import { NextResponse } from "next/server";
import { getComplianceDocs, daysUntilExpiry } from "@/lib/sheets";

export async function GET() {
  const denied = await requireRoleApi("admin");
  if (denied) return denied;
  try {
    const docs = await getComplianceDocs();
    const enriched = docs.map((doc) => ({
      ...doc,
      Days_Until_Expiry: daysUntilExpiry(doc["Expiry Date"]),
    }));
    return NextResponse.json(enriched);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch compliance docs" }, { status: 500 });
  }
}
