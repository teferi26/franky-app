import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/origin-checkout";
import { createAdminSupabase } from "@/lib/supabase-admin";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (
    !secretMatches(
      req.headers.get("authorization"),
      process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : undefined,
    )
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("service_cleanup_franky_card", {
    p_limit: 100,
  });
  if (error || !data)
    return NextResponse.json(
      { error: "card_maintenance_unavailable" },
      { status: 503 },
    );
  let removed = 0,
    failed = 0;
  for (const file of data.storage_candidates ?? []) {
    if (
      !["card-media", "card-wallet"].includes(file.bucket) ||
      typeof file.path !== "string" ||
      !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pkpass)$/i.test(file.path)
    ) {
      failed++;
      continue;
    }
    // The claim shares a database lock with profile saves and tombstones the path.
    // A profile cannot attach a photo between this check and Storage removal.
    const { data: claimed, error: claimError } = await admin.rpc(
      "service_claim_franky_card_storage",
      { p_bucket: file.bucket, p_path: file.path },
    );
    if (claimError) {
      failed++;
      continue;
    }
    if (claimed?.claimed !== true) continue;
    if (
      typeof claimed.claim_id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(claimed.claim_id)
    ) {
      failed++;
      continue;
    }
    const { error: removeError } = await admin.storage
      .from(file.bucket)
      .remove([file.path]);
    if (removeError) failed++;
    else removed++;
  }
  return NextResponse.json(
    {
      expiredRequests: data.expired_requests_deleted,
      expiredCredentials: data.expired_credentials_deleted,
      expiredQuotes: data.expired_quotes_deleted,
      filesRemoved: removed,
      failures: failed,
    },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
