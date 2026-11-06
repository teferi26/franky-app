import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/origin-checkout";
import { createAdminSupabase } from "@/lib/supabase-admin";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function GET(req: Request) {
  if (
    !secretMatches(
      req.headers.get("authorization"),
      process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined,
    )
  )
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers },
    );
  try {
    const admin = createAdminSupabase();
    // Never take a cohort from the request. This scheduled worker only processes real operations.
    const expired = await admin.rpc("service_professional_expire_waitlist", {
      p_limit: 50,
      p_demo_cohort_id: null,
    });
    if (expired.error || !expired.data)
      return NextResponse.json(
        { error: "professional_expiry_unavailable" },
        { status: 503, headers },
      );
    const delivered = await admin.rpc("service_professional_deliver_notices", {
      p_limit: 100,
      p_demo_cohort_id: null,
    });
    if (delivered.error || !delivered.data)
      return NextResponse.json(
        {
          error: "professional_notices_unavailable",
          offersExpired: expired.data.offers_expired,
        },
        { status: 503, headers },
      );
    return NextResponse.json(
      {
        offersExpired: expired.data.offers_expired,
        sessionsProcessed: expired.data.sessions_processed,
        noticesDelivered: delivered.data.delivered,
        noticesCancelled: delivered.data.cancelled,
        channel: "in_app",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "professional_maintenance_unavailable" },
      { status: 503, headers },
    );
  }
}
