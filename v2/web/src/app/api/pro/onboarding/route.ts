import type { NextRequest } from "next/server";
import { organizationBillingFailure } from "@/lib/organization-billing-api";
import { readProOnboarding, startProOnboarding } from "@/lib/pro/onboarding";

export async function POST(req: NextRequest) {
  try { return await startProOnboarding(req); }
  catch (error) { return organizationBillingFailure(error); }
}

export async function GET(req: NextRequest) {
  try { return await readProOnboarding(req); }
  catch (error) { return organizationBillingFailure(error); }
}
