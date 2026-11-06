import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";

/**
 * Puerta de "email verificado" para acciones sensibles.
 *
 * La migracion 141 anadio `profiles.email_verified_at` y la verificacion
 * diferida: la cuenta se activa al instante (no se toca la conversion) pero el
 * correo se confirma aparte. Esto es lo que convierte esa marca en una defensa
 * real: publicar en FOMO, entrar en Crush, escribir por chat o pagar exigen
 * tener el email confirmado.
 *
 * Por que importa: sin verificar, cualquiera crea cuentas ilimitadas con
 * correos inventados. Eso son cuentas basura en el muro de una universidad,
 * que es justo el activo que hay que proteger para que la comunidad valga algo.
 *
 * Fail-open a proposito si la columna todavia no existe (migracion sin
 * aplicar): mejor dejar pasar que tumbar el producto entero por un despliegue
 * a medias.
 */
export type VerifiedCheck =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireVerifiedEmail(): Promise<VerifiedCheck> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", message: "Necesitas iniciar sesión." },
        { status: 401 }
      ),
    };
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("profiles")
    .select("email_verified_at")
    .eq("id", user.id)
    .maybeSingle();

  // La columna no existe todavia (migracion 141 sin aplicar): se deja pasar.
  if (error) return { ok: true, userId: user.id };

  if (!data?.email_verified_at) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "email_not_verified",
          message:
            "Confirma tu email para poder hacer esto. Te hemos enviado un enlace al registrarte; puedes pedir otro desde tu perfil.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id };
}
