import { NextResponse } from "next/server";
import { createServerSupabase, createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Soft-delete the current user's own account.
 * - Sets is_discarded=true on the profile (trigger fills discarded_at).
 * - Marks self_deleted=true so the recovery flow can show a tailored message.
 * - Signs out the session.
 * If the user logs in again later, the recovery prompt offers to undelete.
 *
 * Autentica por cookies (web) o por Authorization Bearer (app movil). El borrado
 * lo ejecuta el service role: la RLS de profiles (migracion 101) fija
 * is_discarded en su WITH CHECK, asi que una update con la sesion del propio
 * usuario seria rechazada. Por eso verificamos identidad y luego escribimos con
 * privilegios (mismo patron que set-role y create-propietario).
 */
export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "account-delete", limit: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const hasBearer = !!req.headers.get("authorization");
  const authClient = hasBearer ? await createRequestSupabase(req) : await createServerSupabase();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  const { data: changed, error } = await admin
    .from("profiles")
    .update({ is_discarded: true, self_deleted: true })
    .eq("id", user.id)
    .or("is_discarded.is.null,is_discarded.eq.false")
    .select("id")
    .maybeSingle();

  if (error) {
    if(error.message?.includes('workspace_transfer_before_erasure'))return NextResponse.json({error:'Transfiere primero la propiedad de tus espacios desde Gestión → Equipo.'},{status:409});
    console.error("[account-delete] no se pudo eliminar la cuenta:", error.message);
    return NextResponse.json({ error: "No se pudo eliminar la cuenta" }, { status: 500 });
  }

  if (!changed) {
    const { data: profile, error: readError } = await admin.from("profiles")
      .select("self_deleted, discarded_by").eq("id", user.id).maybeSingle();
    if (readError) return NextResponse.json({ error: "No se pudo comprobar el estado de la cuenta" }, { status: 503 });
    if (!profile?.self_deleted || profile.discarded_by) {
      return NextResponse.json({ error: "Esta cuenta está restringida. Contacta con soporte." }, { status: 403 });
    }
  }

  // Cerrar la sesion del lado servidor (cookies). En movil el cliente hace su
  // propio signOut tras recibir el 2xx.
  if (!hasBearer) await authClient.auth.signOut();

  return NextResponse.json({ ok: true });
}
