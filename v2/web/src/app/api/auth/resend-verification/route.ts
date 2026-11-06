import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { sendVerificationEmail } from "@/lib/email-verification";

/**
 * Reenvia el correo de verificacion al usuario con sesion.
 *
 * Solo para el propio usuario (nunca se acepta un email por parametro): asi el
 * endpoint no sirve para bombardear buzones ajenos ni para averiguar si una
 * direccion esta registrada.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // createRequestSupabase acepta también el Bearer del móvil (la app no tiene
  // cookies de Next): sin esto, el botón "Reenviar correo" de la app recibía
  // 401 aunque mandara el token bien. Para la web no cambia nada.
  const supabase = await createRequestSupabase(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3 reenvios por hora: suficiente para quien no encuentra el correo, poco
  // para usar Franky como maquina de spam contra su propia direccion.
  // `subject` y no la IP en la clave (hallazgo L2 de la revision): sin el, el
  // contador se reiniciaba cambiando de red.
  const rl = await rateLimit(request, {
    key: "auth-resend-verification",
    subject: user.id,
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return rl.response;

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("email_verified_at, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.email_verified_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const res = await sendVerificationEmail({
    userId: user.id,
    email: user.email,
    name: profile?.full_name ?? null,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "send_failed", message: "No se pudo enviar el correo. Inténtalo en un rato." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
