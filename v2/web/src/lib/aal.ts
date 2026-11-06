export type AalLevel = "aal1" | "aal2" | null;

/**
 * Decodifica el claim `aal` de un access token de Supabase (JWT) SIN verificar
 * la firma.
 *
 * Vive aparte de lib/mfa.ts A PROPÓSITO: mfa.ts importa el cliente de navegador
 * de Supabase, y esto se ejecuta en el runtime Edge del middleware, donde no
 * debe entrar ni ese cliente ni `Buffer`. Aquí no hay ninguna dependencia.
 *
 * Solo se lee un claim para decidir a dónde redirigir; la cookie ya la valida
 * el propio Supabase al refrescar la sesión, así que esto no autoriza por sí
 * solo.
 */
export function decodeAal(accessToken: string | undefined | null): AalLevel {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    const payload = JSON.parse(json);
    return (payload?.aal as AalLevel) ?? null;
  } catch {
    return null;
  }
}
