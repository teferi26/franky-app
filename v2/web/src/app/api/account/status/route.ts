import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Returns the current account discard status. The login client calls this
 * right after sign-in to decide whether to show the recovery dialog.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_discarded, discarded_at, self_deleted")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    authenticated: true,
    isDiscarded: Boolean(profile?.is_discarded),
    selfDeleted: Boolean(profile?.self_deleted),
    discardedAt: profile?.discarded_at ?? null,
  });
}
