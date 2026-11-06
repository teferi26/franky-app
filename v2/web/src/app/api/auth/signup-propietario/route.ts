import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { passwordSchema, isPwnedPassword, PWNED_PASSWORD_MESSAGE } from "@/lib/password-strength";
import { sendVerificationEmail } from "@/lib/email-verification";

/**
 * Alta directa de propietario/inmobiliaria (queja real de los empresarios:
 * tenían que registrarse "como estudiantes" y pasar por el onboarding de uni,
 * carrera y compañeros de piso para poder publicar un piso).
 *
 * Qué hace distinto al signup normal:
 *  - Marca profiles.role = 'propietario' (con service role: el trigger
 *    anti-escalada de la migración 101 solo bloquea al usuario final, no al
 *    backend). Ese rol abre /propietario/dashboard.
 *  - Marca onboarding_completed = true e is_student = false: el middleware
 *    deja de empujarles al wizard de estudiante.
 *  - Guarda nombre del negocio y teléfono de contacto en el perfil.
 *
 * El resto (cuenta ya confirmada + verificación de email diferida + rate
 * limit) calca /api/auth/signup, ver los comentarios de esa ruta.
 */

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe tu nombre o el de tu inmobiliaria")
    .max(120, "El nombre es demasiado largo (máximo 120 caracteres)"),
  email: z
    .string()
    .trim()
    .email("El email no tiene un formato válido")
    .max(200, "El email es demasiado largo"),
  password: passwordSchema,
  phone: z
    .string()
    .trim()
    .max(30, "El teléfono es demasiado largo")
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .trim()
    .max(120, "La ciudad es demasiado larga")
    .optional()
    .or(z.literal("")),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await validateBody(req, schema, {
    fieldLabels: { password: "Contraseña" },
  });
  if (parsed instanceof NextResponse) return parsed;

  // Mismo cubo que el registro de estudiantes: un script no debería poder
  // esquivar el límite cambiando de endpoint.
  const rl = await rateLimit(req, { key: "auth-signup", limit: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  // Contraseñas filtradas, también en servidor: la comprobación del cliente se
  // puede saltar (bundles antiguos, app móvil, scripts). Fail open con tope de
  // tiempo: si HaveIBeenPwned cae o va lento, el alta sigue adelante.
  if (await isPwnedPassword(parsed.password, { timeoutMs: 2500 })) {
    return NextResponse.json(
      { error: "pwned_password", message: PWNED_PASSWORD_MESSAGE },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.name, signup_kind: "propietario" },
  });

  if (error) {
    if (error.code === "email_exists" || /already.*registered/i.test(error.message)) {
      return NextResponse.json(
        { error: "email_exists", message: "Ya existe una cuenta con este email. Inicia sesión." },
        { status: 409 }
      );
    }
    console.error("[auth/signup-propietario] createUser failed:", error.code, error.message);
    return NextResponse.json(
      { error: "signup_failed", message: "No se pudo crear la cuenta. Inténtalo de nuevo." },
      { status: 500 }
    );
  }

  const userId = created?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "signup_failed", message: "No se pudo crear la cuenta. Inténtalo de nuevo." },
      { status: 500 }
    );
  }

  // La fila de profiles la crea el trigger handle_new_user (154) durante el
  // createUser; aquí solo se especializa. Si esta escritura fallara, la cuenta
  // existiría como usuario normal: mejor avisar que fingir que todo fue bien,
  // porque sin el rol no podrán entrar a su panel.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      role: "propietario",
      onboarding_completed: true,
      is_student: false,
      full_name: parsed.name,
      phone: parsed.phone || null,
      city: parsed.city || null,
    })
    .eq("id", userId);

  if (profileErr) {
    console.error("[auth/signup-propietario] profile update failed:", profileErr.message);
    return NextResponse.json(
      {
        error: "profile_failed",
        message:
          "La cuenta se creó pero no se pudo activar el perfil de propietario. Inicia sesión y contacta con soporte.",
      },
      { status: 500 }
    );
  }

  try {
    await sendVerificationEmail({
      userId,
      email: parsed.email,
      name: parsed.name,
    });
  } catch (err) {
    console.warn("[auth/signup-propietario] verification email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
