import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/origin-checkout";
import { processHousingActivations } from "@/lib/housing-billing";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (!secretMatches(req.headers.get("authorization"), process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processHousingActivations();
    return NextResponse.json(result, { status: result.failed ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}
