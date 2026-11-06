// ─── Alertas de beca: "avisarme cuando abra / antes de que cierre" ─────────
// Tabla scholarship_alerts (migración 146): PK (user_id, scholarship_id),
// RLS de lectura/alta/baja solo del propio usuario. El aviso lo manda el cron
// diario de la web con service role; la app solo gestiona la suscripción.
//
// Es distinto de "guardar en favoritos" (favorites.target_type 'scholarship',
// migración 129): guardar es para tenerla a mano; la alerta es para que te
// escriban al correo. Las dos conviven en la ficha.
//
// Todo fail-soft: sin sesión devuelve reason 'auth' (la UI lleva a entrar);
// si la migración no está aplicada, la lectura devuelve "sin alerta" y el alta
// enseña el error genérico, igual que en la web.
import { supabase } from './supabase';

/** Ids de las becas con alerta activa del usuario actual (vacío sin sesión). */
export async function getMyScholarshipAlertIds(): Promise<Set<string>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();
    const { data, error } = await supabase
      .from('scholarship_alerts')
      .select('scholarship_id')
      .eq('user_id', user.id);
    if (error) return new Set();
    return new Set(((data ?? []) as { scholarship_id: string }[]).map((r) => r.scholarship_id));
  } catch {
    return new Set();
  }
}

/** ¿Tengo alerta activa en esta beca? */
export async function hasScholarshipAlert(scholarshipId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('scholarship_alerts')
      .select('scholarship_id')
      .eq('user_id', user.id)
      .eq('scholarship_id', scholarshipId)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

/** Activa o quita la alerta. Insert/delete directo por RLS. */
export async function setScholarshipAlert(
  scholarshipId: string,
  on: boolean,
): Promise<{ ok: boolean; reason?: 'auth' | 'db' }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: 'auth' };
    const q = on
      ? supabase.from('scholarship_alerts')
          .upsert({ user_id: user.id, scholarship_id: scholarshipId }, { onConflict: 'user_id,scholarship_id' })
      : supabase.from('scholarship_alerts')
          .delete()
          .eq('user_id', user.id)
          .eq('scholarship_id', scholarshipId);
    const { error } = await q;
    return error ? { ok: false, reason: 'db' } : { ok: true };
  } catch {
    return { ok: false, reason: 'db' };
  }
}
