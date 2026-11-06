import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api-helpers";

/**
 * Pre-flight check llamado por los formularios de /login y /recuperar ANTES
 * de invocar Supabase Auth: rate limit por IP contra fuerza bruta. Si pasa,
 * el cliente sigue con `signInWithPassword` / `resetPasswordForEmail`.
 * (El registro usa /api/auth/signup, que ya trae su propio rate limit.)
 *
 * Historia (jul-2026): aquí vivía también Cloudflare Turnstile. Se retiró
 * porque bloqueaba usuarios reales — dentro de los webviews de Instagram y
 * TikTok (el grueso del tráfico de captación) el challenge no se completa
 * nunca y el botón quedaba muerto — y porque los límites por IP estaban tan
 * apretados que el CGNAT español (campus, móviles) tiraba leads legítimos.
 * Activar el captcha del propio Supabase también se evaluó y descartó: el
 * toggle es global por proyecto, sin excepciones por cliente, así que
 * rompería webviews y app móvil. Racional completo:
 * docs/security/2026-07-20-decision-captcha-supabase-auth.md
 *
 * Por qué no proteger Supabase directamente: Supabase Auth no soporta un
 * before-hook para password sign-in; sus propios rate limits internos y la
 * validación de credenciales siguen aplicando a llamadas directas a su API.
 *
 * `turnstileToken` se acepta y se ignora: bundles antiguos cacheados en
 * clientes aún lo envían.
 */

const schema = z.object({
  turnstileToken: z.string().max(2000).optional(),
  action: z.enum(["login", "signup", "recover"]),
  // Email del intento. Sirve SOLO para el límite por cuenta (ver abajo): no se
  // guarda, no se registra y solo viaja su hash a Upstash.
  email: z.string().trim().email().max(200).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await validateBody(req, schema);
  if (parsed instanceof NextResponse) return parsed;

  // Límites por IP pensados para CGNAT (varios usuarios legítimos comparten
  // IP en campus y redes móviles): frenan scripts, no personas.
  const limits: Record<typeof parsed.action, { limit: number; windowMs: number }> = {
    login: { limit: 20, windowMs: 15 * 60_000 },
    signup: { limit: 10, windowMs: 60 * 60_000 },
    recover: { limit: 8, windowMs: 10 * 60_000 },
  };
  const cfg = limits[parsed.action];
  const rl = await rateLimit(req, { key: `auth-precheck-${parsed.action}`, ...cfg });
  if (!rl.ok) return rl.response;

  // Límite POR CUENTA, además del de IP. El de IP no frena un credential
  // stuffing distribuido: mil IPs probando la misma cuenta no superan el
  // umbral de ninguna IP concreta, pero sí revientan esa cuenta. Aquí la
  // cuenta atacada tiene su propio contador, venga de donde venga el intento.
  //
  // Se responde EXACTAMENTE igual que en el límite por IP: un mensaje distinto
  // revelaría si el email existe.
  if (parsed.email && parsed.action !== "signup") {
    const perAccount = await rateLimit(req, {
      key: `auth-account-${parsed.action}`,
      subject: parsed.email,
      // Más holgado que el de IP en ventana larga: una persona que se pelea con
      // su contraseña hace 10 intentos, no 40.
      limit: parsed.action === "login" ? 12 : 6,
      windowMs: 30 * 60_000,
    });
    if (!perAccount.ok) return perAccount.response;
  }

  return NextResponse.json({ ok: true });
}
