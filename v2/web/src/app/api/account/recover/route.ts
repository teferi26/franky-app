import { NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Recover the current user's discarded account.
 * Calls the SECURITY DEFINER RPC `recover_my_account` which only succeeds
 * when the calling user has is_discarded=true.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "account-recover", limit: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const supabase = await createRequestSupabase(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("recover_my_account");
  if (error) {
    return NextResponse.json({ error: "No se pudo recuperar la cuenta. Inténtalo de nuevo." }, { status: 503 });
  }

  if (!data) return NextResponse.json({ error: "Esta cuenta no tiene una baja voluntaria recuperable. Contacta con soporte." }, { status: 403 });

  return NextResponse.json({ ok: true, recovered: Boolean(data) });
}
