import { createClient } from "@/lib/supabase-client";
import { decodeAal, type AalLevel } from "@/lib/aal";
export { decodeAal, type AalLevel };

/**
 * Helpers de MFA (segundo factor) sobre Supabase Auth.
 *
 * Supabase gestiona los factores TOTP en GA: aquí solo se envuelve su SDK para
 * que las pantallas no repitan el baile de enroll → challenge → verify.
 *
 * El AAL (Authenticator Assurance Level) es lo que distingue una sesión con
 * solo contraseña (`aal1`) de una que ya pasó el segundo factor (`aal2`). El
 * middleware exige `aal2` para /admin (ver decodeAal / middleware.ts).
 */

export type EnrollResult = {
  factorId: string;
  /** URI otpauth:// para generar el QR con el que el usuario añade la cuenta. */
  totpUri: string;
  /** Secreto en texto, por si el usuario no puede escanear el QR. */
  secret: string;
};

/** Inicia la inscripción de un factor TOTP. Devuelve el QR/secreto a mostrar. */
export async function enrollTotp(friendlyName = "Franky"): Promise<EnrollResult> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `${friendlyName}-${Date.now()}`,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    totpUri: data.totp.uri,
    secret: data.totp.secret,
  };
}

/**
 * Verifica el código de 6 dígitos y activa el factor. Al completarse, la sesión
 * sube a aal2.
 */
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const supabase = createClient();
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (vErr) throw vErr;
}

/**
 * Espera a que la sesión del navegador lleve REALMENTE un token `aal2`.
 *
 * `mfa.verify()` resuelve en cuanto responde GoTrue, pero las cookies `sb-*`
 * (troceadas) se escriben después. Si navegamos en ese hueco, el middleware
 * lee todavía el token viejo con `aal1` y nos rebota a esta misma pantalla,
 * sin que nada reintente: callejón sin salida hasta recargar a mano.
 *
 * Devuelve `false` si se agota el tiempo, para poder navegar igualmente en vez
 * de dejar al usuario atrapado en un spinner.
 */
export async function waitForAal2(timeoutMs = 6000): Promise<boolean> {
  const supabase = createClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase.auth.getSession();
    if (decodeAal(data.session?.access_token) === "aal2") return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

/** Nivel de garantía actual y el que la cuenta requiere. */
export async function getAal(): Promise<{ current: AalLevel; next: AalLevel }> {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    current: (data?.currentLevel as AalLevel) ?? null,
    next: (data?.nextLevel as AalLevel) ?? null,
  };
}

/** ¿Tiene el usuario algún factor TOTP verificado? */
export async function hasVerifiedTotp(): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).some((f) => f.status === "verified");
}

/** Retira un factor (para "quitar el segundo factor" desde el perfil). */
export async function unenroll(factorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/** Lista los factores inscritos (para pintar el estado en el perfil). */
export async function listFactors() {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp ?? [];
}

