import { createHash, randomBytes } from "crypto";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { verifyEmailTemplate } from "@/lib/email-templates";

/**
 * Verificacion de email DIFERIDA.
 *
 * El alta sigue siendo instantanea (el usuario entra sin pasar por su bandeja,
 * que es lo que mantenia vivo el embudo de Instagram/TikTok), pero ahora ademas
 * se le manda un enlace de verificacion. La app puede exigir el email
 * verificado para acciones sensibles sin bloquear el registro.
 *
 * El token viaja en la URL y en la base solo se guarda su SHA-256: leer la
 * tabla no permite verificar cuentas ajenas.
 */

const TOKEN_TTL_HOURS = 72;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://franky.es");
  return raw.replace(/\/+$/, "");
}

/**
 * Crea un token nuevo y envia el email. Best-effort: si Resend falla o no esta
 * configurado, el registro NO se rompe (el usuario ya esta dentro y puede
 * reenviarse el correo mas tarde desde su perfil).
 */
export async function sendVerificationEmail(opts: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const token = randomBytes(32).toString("base64url");
  const admin = createAdminSupabase();

  const { error } = await admin.from("email_verification_tokens").insert({
    token_hash: hashToken(token),
    user_id: opts.userId,
    email: opts.email,
    expires_at: new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000).toISOString(),
  });
  if (error) {
    // Tipicamente: la migracion 141 aun no esta aplicada en este entorno.
    console.warn("[email-verification] no se pudo guardar el token:", error.message);
    return { ok: false, reason: "store_failed" };
  }

  const url = `${siteUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const tpl = verifyEmailTemplate({ name: opts.name ?? null, url, hours: TOKEN_TTL_HOURS });
  const res = await sendEmail({ to: opts.email, ...tpl, actorUserId: opts.userId });
  return res.ok ? { ok: true } : { ok: false, reason: res.error };
}

/**
 * Consume un token. Devuelve el userId si era valido.
 *
 * Busca el hash y confirma el correo en la misma transacción que consume el
 * token. Un fallo de escritura permite reintentar sin perder el enlace.
 */
export async function consumeVerificationToken(
  token: string
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  if (!token || token.length < 20 || token.length > 200) {
    return { ok: false, reason: "invalid" };
  }
  const admin = createAdminSupabase();
  const expected = hashToken(token);

  const { data, error } = await admin.rpc("consume_email_verification", { p_token_hash: expected });
  if (error || !data) return { ok: false, reason: "unavailable" };
  if (data.ok === true && typeof data.userId === "string") return { ok: true, userId: data.userId };
  return { ok: false, reason: ["used", "expired", "invalid"].includes(data.reason) ? data.reason : "invalid" };
}
