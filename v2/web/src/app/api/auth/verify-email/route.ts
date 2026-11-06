import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { consumeVerificationToken } from "@/lib/email-verification";

/**
 * Confirmacion del email (verificacion diferida, ver migracion 141).
 *
 * Llega desde el enlace del correo, asi que responde con una redireccion a
 * /perfil con un aviso legible en vez de un JSON: quien hace clic es una
 * persona en su cliente de correo, no un fetch.
 *
 * Es publica a proposito (el usuario puede abrir el enlace en otro navegador,
 * sin sesion). La autenticacion es el token en si: 32 bytes aleatorios, de un
 * solo uso, caducidad de 72 h y en la base solo vive su SHA-256.
 */
export const dynamic = "force-dynamic";

function redirectWith(request: Request, status: string) {
  // Aterrizaje segun el cliente (hallazgo M3): si el navegador trae cookies de
  // sesion de Supabase (sb-...-auth-token), es un usuario con sesion web y se
  // conserva el aterrizaje clasico en /perfil con su aviso. Sin esas cookies
  // (caso tipico: usuario solo-movil que abre el enlace del correo), /perfil
  // rebotaria al login y resultaria confuso, asi que va a la pagina publica
  // /email-verificado. Es un olfateo barato, no una validacion: si la cookie
  // esta caducada, el peor caso es el rebote al login de antes.
  const hasWebSession = (request.headers.get("cookie") ?? "").includes("-auth-token");
  if (hasWebSession) {
    const url = new URL("/perfil", request.url);
    url.searchParams.set("email_verificado", status);
    return NextResponse.redirect(url);
  }
  const url = new URL("/email-verificado", request.url);
  url.searchParams.set("estado", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  // Freno a la fuerza bruta sobre el espacio de tokens. Con 256 bits de
  // entropia adivinar uno es inviable de todos modos, pero el limite evita
  // que alguien use el endpoint para hacer ruido.
  const rl = await rateLimit(request, {
    key: "auth-verify-email",
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return redirectWith(request, "limite");

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = await consumeVerificationToken(token);

  if (!result.ok) {
    if (result.reason === 'unavailable') return redirectWith(request, 'temporal');
    // "expired" y "used" se distinguen porque cambian lo que puede hacer el
    // usuario (reenviar vs. no hacer nada); "invalid" no revela nada mas.
    return redirectWith(request, result.reason === "expired" ? "caducado" : "invalido");
  }

  return redirectWith(request, "ok");
}
