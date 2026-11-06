// ─── Seguridad de la cuenta (cualquier usuario) ──────────────────────────
//
// Complemento de src/lib/admin.ts, que ya tiene el alta y la verificación del
// segundo factor (TOTP). Aquí vive lo que la pantalla /seguridad necesita
// además de eso: quitar el factor, saber si la cuenta tiene contraseña y
// cambiarla. Misma política de contraseñas que la web (lib/password-strength):
// mínimo 10 caracteres, sin reglas de composición, sin repeticiones absurdas.
import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { validarPassword } from '@/lib/password-policy';

export { PASSWORD_MIN, PASSWORD_MAX, validarPassword } from '@/lib/password-policy';

export type CuentaInfo = {
  email: string | null;
  /** false si entra solo con Google o Apple: no hay contraseña que cambiar. */
  tienePassword: boolean;
};

export async function getCuentaInfo(): Promise<CuentaInfo> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  const meta = (user?.app_metadata ?? {}) as { provider?: string; providers?: string[] };
  const providers = Array.isArray(meta.providers) ? meta.providers : [];
  const tienePassword = providers.includes('email') || meta.provider === 'email';
  return { email: user?.email ?? null, tienePassword };
}

/**
 * Comprueba la contraseña actual SIN tocar la sesión de la app.
 *
 * signInWithPassword en el cliente principal sustituiría la sesión por una
 * nueva en aal1, y si la cuenta tiene segundo factor, el cambio de contraseña
 * posterior fallaría por falta de aal2. Un cliente desechable (sin persistir
 * nada) solo verifica que la contraseña es la buena y se tira.
 */
async function comprobarPasswordActual(email: string, password: string): Promise<boolean> {
  const efimero = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'franky-reauth' },
  });
  const { data, error } = await efimero.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  // Se cierra solo esa sesión efímera (scope local), la de la app no se toca.
  await efimero.auth.signOut({ scope: 'local' }).catch(() => {});
  return true;
}

/**
 * Cambia la contraseña reautenticando antes con la actual. Si la cuenta tiene
 * segundo factor, la sesión debe estar ya en aal2 (la pantalla pide el código
 * antes de llamar aquí).
 */
export async function cambiarPassword(actual: string, nueva: string, isCurrent?: () => boolean): Promise<void> {
  const owner = captureSessionIdentity();
  const check = () => { if (!owner || !isCurrentSessionIdentity(owner) || (isCurrent && !isCurrent())) throw new Error('session_changed'); };
  check();
  const motivo = validarPassword(nueva);
  if (motivo) throw new Error(motivo);
  const { data: { user } } = await supabase.auth.getUser();
  check();
  if (!user?.email || user.id !== owner?.userId) throw new Error('Sesión caducada. Vuelve a entrar.');
  const ok = await comprobarPasswordActual(user.email, actual);
  check();
  if (!ok) throw new Error('La contraseña actual no es correcta.');
  const { error } = await supabase.auth.updateUser({ password: nueva });
  check();
  if (error) {
    const msg = error.message ?? '';
    if (/aal2|assurance/i.test(msg)) throw new Error('Verifica primero el código de tu app de autenticación.');
    if (/same password|different from the old/i.test(msg)) throw new Error('La contraseña nueva tiene que ser distinta de la actual.');
    throw new Error(msg || 'No se pudo cambiar la contraseña.');
  }
}

/**
 * Quita un factor ya verificado. Supabase exige aal2 para retirar un factor
 * verificado, así que la pantalla eleva la sesión con el código antes.
 */
export async function quitarFactor(factorId: string, isCurrent?: () => boolean): Promise<void> {
  if (isCurrent && !isCurrent()) throw new Error('session_changed');
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (isCurrent && !isCurrent()) throw new Error('session_changed');
  if (error) {
    const msg = error.message ?? '';
    if (/aal2|assurance/i.test(msg)) throw new Error('Verifica primero el código de tu app de autenticación.');
    throw new Error(msg || 'No se pudo desactivar la verificación en dos pasos.');
  }
}
