import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { passwordSchema, isPwnedPassword, PWNED_PASSWORD_MESSAGE } from "@/lib/password-strength";
import { sendVerificationEmail } from "@/lib/email-verification";
import { growthSignupMetadata } from '@/lib/growth-attribution';

/**
 * Registro con email SIN email de confirmación.
 *
 * Por qué existe: el signUp clásico de Supabase exige confirmar por email, y
 * el SMTP integrado de Supabase está limitado (~2 emails/hora). En cuanto se
 * registraba más gente, el signup devolvía 500 "Error sending confirmation
 * email" y el lead se perdía. Además el round-trip de email mataba conversión
 * en el embudo de Instagram/TikTok (pivote "simplificar registro").
 *
 * Aquí el servidor crea el usuario ya confirmado (service role,
 * email_confirm: true) y el cliente inicia sesión con la contraseña acto
 * seguido: el usuario entra directo al onboarding, sin tocar su bandeja.
 *
 * Defensas: rate limit por IP (el captcha se retiró: bloqueaba usuarios
 * reales, sobre todo en webviews), validación dura de contraseña en servidor
 * y metadatos restringidos a una allowlist (nada de claves arbitrarias en
 * raw_user_meta_data).
 */

// Solo atribución de campaña: lo mismo que aceptaba el signUp clásico.
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "signup_referrer",
  "signup_landing_path",
] as const;

// Mensajes en español porque el 400 de validación viaja tal cual al usuario
// (hallazgo A1): la app móvil enseña `message` directamente. La política no
// cambia, solo el texto.
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe tu nombre")
    .max(80, "El nombre es demasiado largo (máximo 80 caracteres)"),
  email: z
    .string()
    .trim()
    .email("El email no tiene un formato válido")
    .max(200, "El email es demasiado largo"),
  password: passwordSchema,
  attribution: z.record(z.string(), z.string().max(500)).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Los mensajes de passwordSchema no mencionan el campo (se escribieron para
  // salir bajo el propio input en la web), así que aquí se antepone la
  // etiqueta: "Contraseña: Mínimo 10 caracteres...".
  const parsed = await validateBody(req, schema, {
    fieldLabels: { password: "Contraseña" },
  });
  if (parsed instanceof NextResponse) return parsed;

  // 10 registros/hora por IP: frena scripts sin castigar a los campus y
  // móviles españoles detrás de CGNAT (muchos usuarios comparten IP).
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

  const user_metadata: Record<string, string> = { full_name: parsed.name };
  Object.assign(user_metadata, growthSignupMetadata(req.headers.get('cookie'), parsed.attribution));
  for (const key of ATTRIBUTION_KEYS) {
    const value = parsed.attribution?.[key];
    if (value) user_metadata[key] = value;
  }

  const admin = createAdminSupabase();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata,
  });

  if (error) {
    // Email ya registrado → mensaje accionable, no un 500 opaco. El endpoint
    // ya revela existencia de cuentas igual que lo hacía el signUp clásico.
    if (error.code === "email_exists" || /already.*registered/i.test(error.message)) {
      return NextResponse.json(
        { error: "email_exists", message: "Ya existe una cuenta con este email. Inicia sesión." },
        { status: 409 }
      );
    }
    console.error("[auth/signup] createUser failed:", error.code, error.message);
    return NextResponse.json(
      { error: "signup_failed", message: "No se pudo crear la cuenta. Inténtalo de nuevo." },
      { status: 500 }
    );
  }

  // Verificacion DIFERIDA: la cuenta ya esta activa y el usuario entra al
  // instante (la conversion no se toca), pero se le manda el enlace para que
  // confirme el correo. Sin esto, un email mal tecleado dejaba la cuenta sin
  // forma de recuperar la contrasena, y los avisos de actividad rebotaban
  // contra direcciones inventadas quemando la reputacion del dominio.
  //
  // Best-effort a proposito: si Resend falla o la migracion 141 aun no esta
  // aplicada, el alta se da por buena igualmente y el usuario podra reenviarse
  // el correo desde su perfil.
  if (created?.user?.id) {
    try {
      await sendVerificationEmail({
        userId: created.user.id,
        email: parsed.email,
        name: parsed.name,
      });
    } catch (err) {
      console.warn("[auth/signup] verification email failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
