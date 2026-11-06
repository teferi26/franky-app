import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cuentas creadas a partir de esta fecha tienen que confirmar el email antes
 * de gastar recursos de pago. Es exactamente el mismo corte que aplica el
 * trigger `enforce_email_verified` de la migración 145: las cuentas anteriores
 * nunca recibieron el correo de verificación (no existía), así que exigírselo
 * ahora sería echar de golpe a toda la base de usuarios activa.
 */
const CUTOFF = Date.parse("2026-07-25T00:00:00+02:00");

/**
 * Puerta para los endpoints cuyo coste lo pagamos nosotros por llamada
 * (Gemini, Resend, render de PDF, subida de vídeo).
 *
 * El rate limit por usuario no basta contra un atacante que crea cuentas en
 * masa: /api/auth/signup solo limita por IP, y con proxies residenciales eso
 * es trivial de esquivar. Exigir un buzón real por cuenta sube el coste del
 * ataque mucho más que cualquier umbral por IP.
 *
 * Devuelve `null` si la cuenta puede seguir, o la respuesta 403 si no.
 */
export async function requireVerifiedEmail(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  let profile: { email_verified_at?: unknown; created_at?: unknown; is_discarded?: unknown } | null;
  try {
    const result = await supabase
    .from("profiles")
    .select("email_verified_at, created_at, is_discarded")
    .eq("id", userId)
    .maybeSingle();
    if (result.error || !result.data) throw new Error('profile unavailable');
    profile = result.data;
  } catch {
    return NextResponse.json({ error: 'No se pudo comprobar tu cuenta. Inténtalo de nuevo.' }, { status: 503 });
  }
  if (profile?.is_discarded === true) {
    return NextResponse.json({ error: 'Esta cuenta no está activa.' }, { status: 403 });
  }

  const verified = profile?.email_verified_at;
  if (typeof verified === 'string' && Number.isFinite(Date.parse(verified))) return null;

  const created = typeof profile?.created_at === 'string' ? Date.parse(profile.created_at) : NaN;
  if (Number.isFinite(created) && created < CUTOFF) return null;

  return NextResponse.json(
    {
      error:
        "Confirma tu email para usar esta función. Te enviamos el enlace al crear la cuenta; puedes reenviarlo desde tu perfil.",
    },
    { status: 403 }
  );
}
