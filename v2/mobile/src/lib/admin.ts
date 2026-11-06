// ─── Panel de administración en la app ───────────────────────────────────
//
// Llama a las MISMAS RPC que el panel web (migraciones 044 / 044b / 110). No
// hay API paralela: lo que cambia es la pantalla.
//
// Los nombres de los campos NO se adivinan: están sacados del SQL de esas
// migraciones. Una primera versión de este fichero los invento y la pantalla
// entera pintaba guiones, porque las claves no existian.
//
// Seguridad: desde la migración 152 estas RPC exigen AAL2 (segundo factor)
// ademas del rol, así que aquí vive también el flujo de elevar la sesión con
// el código TOTP. Sin él, la base de datos responde 'mfa_required'.

import { supabase, WEB_URL, fetchConTimeout } from '@/lib/supabase';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { assertSessionOwner, withOwnedRequest, type OwnedRequest } from '@/lib/owned-request';
import { adminOperationError, isUuidResult, isRestorationResult, isReportStrikeResult } from './admin-operation-result';

export type StaffRole = 'admin' | 'analyst';
export type AalLevel = 'aal1' | 'aal2' | null;

/** Los repartos vienen como lista de pares, no como diccionario. */
export type Par = { label: string; count: number };
export type ParAnio = { year: number | string; count: number };

// Las tres funciones del arranque LANZAN si la petición falla (sin red, timeout,
// error del servidor). Antes tragaban el error y devolvían null o [], y el
// panel lo leía como "no eres staff" o "no tienes segundo factor", que es
// mentira: un fallo de red no dice nada de la cuenta.
export async function getStaffRole(): Promise<StaffRole | null> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles').select('role, is_discarded').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const row = data as { role?: string | null; is_discarded?: boolean | null } | null;
  if (!row || row.is_discarded) return null;
  return row.role === 'admin' || row.role === 'analyst' ? row.role : null;
}

export async function getAal(): Promise<AalLevel> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return (data?.currentLevel as AalLevel) ?? null;
}

export async function listVerifiedFactors(): Promise<{ id: string; name: string | null }[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).filter((f) => f.status === 'verified')
    .map((f) => ({ id: f.id, name: f.friendly_name ?? null }));
}

/** Eleva la sesión a aal2 con el código de la app de autenticación. */
const mfaSessionGuard = (isCurrent?: () => boolean) => {
  const owner = captureSessionIdentity();
  return () => { if (!owner || !isCurrentSessionIdentity(owner) || (isCurrent && !isCurrent())) throw new Error('session_changed'); };
};

export async function elevateWithTotp(factorId: string, code: string, isCurrent?: () => boolean): Promise<void> {
  const check = mfaSessionGuard(isCurrent);
  check();
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  check();
  if (cErr) throw cErr;
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId, challengeId: challenge.id, code: code.trim(),
  });
  check();
  if (vErr) throw vErr;
}

// ─── Alta del segundo factor DESDE LA APP ────────────────────────────────
// Antes el alta solo se podía hacer en la web, así que un admin con el móvil en
// la mano y sin ordenador delante se quedaba fuera de su propio panel.
//
// El flujo de Supabase son tres pasos: enroll (da el secreto y la URI otpauth),
// challenge y verify. Hasta que no se verifica, el factor queda en estado
// 'unverified' y no sirve para nada.

export type FactorNuevo = {
  factorId: string;
  /** URI otpauth://… para pintar el QR que escanea la app de autenticación. */
  uri: string;
  /** El mismo secreto en texto, para poder teclearlo si el QR falla. */
  secret: string;
};

/**
 * Empieza el alta de un TOTP nuevo. Limpia antes los intentos a medias: si se
 * abandona el proceso, Supabase deja el factor 'unverified' y el siguiente
 * enroll falla con "factor with friendly name already exists".
 */
export async function empezarAltaTotp(nombre = 'Franky móvil', isCurrent?: () => boolean): Promise<FactorNuevo> {
  const check = mfaSessionGuard(isCurrent);
  check();
  const { data: factores, error: listError } = await supabase.auth.mfa.listFactors();
  check();
  if (listError) throw listError;
  for (const f of factores?.all ?? []) {
    if (f.status === 'unverified') {
      check();
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      check();
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `${nombre} ${new Date().toISOString().slice(0, 10)}`,
  });
  check();
  if (error) throw error;
  return {
    factorId: data.id,
    uri: data.totp.uri,
    secret: data.totp.secret,
  };
}

/**
 * Confirma el alta con el primer código de la app de autenticación. Al
 * verificar, Supabase deja la sesión ya en aal2, así que no hace falta volver a
 * pedir el código para entrar al panel.
 */
export async function confirmarAltaTotp(factorId: string, code: string, isCurrent?: () => boolean): Promise<void> {
  await elevateWithTotp(factorId, code, isCurrent);
}

/** Cancela un alta a medias (el usuario cierra la pantalla del QR). */
export async function cancelarAltaTotp(factorId: string, isCurrent?: () => boolean): Promise<void> {
  const check = mfaSessionGuard(isCurrent);
  check();
  await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
}

// ─── Formas reales que devuelven las RPC ─────────────────────────────────

export type Kpis = {
  period_days: number;
  total_users: number;
  total_users_prev: number;
  new_signups_today: number;
  new_signups_period: number;
  new_signups_prev_period: number;
  total_propietarios: number;
  total_premium: number;
  total_student: number;
  total_business: number;
  mrr_estimate: number;
  arr_estimate: number;
  verified_students: number;
  pending_reports: number;
  security_incidents_24h: number;
  generated_at: string;
};

export type Engagement = {
  period_days: number;
  dau: number;
  wau: number;
  mau: number;
  dau_mau_ratio: number;
  messages_sent_7d: number;
  vocational_tests_completed_30d: number;
  roommate_matches_made_30d: number;
  roommate_connections_current?: number;
  events_joined_30d: number;
  engagement_funnel: {
    signup: number;
    verified_email: number;
    completed_vocational: number;
    first_match: number;
    first_message: number;
  };
};

export type Demografia = {
  total: number;
  by_gender: Par[];
  by_age_bucket: Par[];
  by_comunidad: Par[];
  by_student_type: Par[];
  by_year: ParAnio[];
  by_intent: {
    looking_housing: number;
    looking_roommate: number;
    is_propietario: number;
    student_verified: number;
  };
};

/**
 * Forma EXACTA de admin_content_inventory (044b): varios campos son objetos
 * anidados, no numeros sueltos. Declararlos mal fue lo que hizo que la
 * pantalla pintara guiones.
 */
export type Contenido = {
  universities: number;
  careers: number;
  news: number;
  scholarships: { total: number; active: number };
  accommodations: { total: number; by_type: Par[] };
  leisure_spots: { total: number; by_type: Par[] };
  events: { upcoming: number; past: number };
  generated_at: string;
};

export type Crecimiento = {
  period_days: number;
  signups_period: number;
  qr_scans_period: number;
  active_after_signup: number;
  conversion_pct: number;
  by_utm_source: { source: string; count: number }[];
  by_utm_campaign: { campaign: string; count: number }[];
};

/**
 * Forma real de admin_monetization_summary (044) MAS lo que le anade encima la
 * ruta /api/admin/analytics/monetization de la web (Plan Inmobiliarias).
 */
export type Monetizacion = {
  active_subscriptions: {
    pro_monthly: number; pro_yearly: number;
    premium_monthly: number; premium_yearly: number;
    business_leisure: number; business_housing: number;
    /** Plan Inmobiliarias pagando (80 €/mes). No lo trae la RPC: lo suma la ruta. */
    owner_plan_monthly?: number;
    /** Plan Inmobiliarias en la modalidad trimestral de entrada (192 €/3). */
    owner_plan_quarterly?: number;
    total_paying: number;
  };
  /** Inmobiliarias en prueba gratis: todavía no pagan, no van al MRR. */
  owner_plan_trialing?: number;
  mrr_normalized: number;
  arr_estimate: number;
  churn_30d: number;
  new_subscriptions_30d: number;
  avg_revenue_per_paying_user: number;
  /**
   * Se rellena SOLO cuando el resumen viene de la RPC pelada porque el
   * servidor de la web no contestó. La pantalla lo enseña como aviso: un MRR
   * al que le falta un plan entero no puede pasar por bueno sin decirlo.
   */
  incompleto?: string;
};

export type Seguridad = {
  period_days: number;
  incidents_by_kind: { kind: string; count: number }[];
  incidents_by_severity: { severity: string; count: number }[];
  csp_violations_24h: number;
  csp_top_blocked: { blocked_uri: string; count: number }[];
  admin_actions_7d: number;
  unique_attacker_ips: number;
};

export type TopUni = {
  name: string; short_name: string | null; city: string | null;
  user_count: number; pct_of_total: number;
};

/** La base de datos pide segundo factor: hay que mandar al usuario a verificar. */
export class MfaRequiredError extends Error {
  constructor() { super('Verifica tu cuenta con el código de tu autenticador para continuar.'); }
}

async function rpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('mfa_required')) throw new MfaRequiredError();
    throw new Error(msg || `Fallo en ${fn}`);
  }
  return data as T;
}

export const getKpis = (dias = 30) => analyticsApi<Kpis>('kpis', dias);
export const getEngagement = (dias = 30) => rpc<Engagement>('admin_engagement_metrics', { p_range_days: dias });
export const getDemografia = () => rpc<Demografia>('admin_users_demographics', { p_filters: {} });
export const getContenido = () => rpc<Contenido>('admin_content_inventory');
export const getCrecimiento = (dias = 30) => rpc<Crecimiento>('admin_growth_attribution', { p_range_days: dias });
export const getSeguridad = (dias = 30) => rpc<Seguridad>('admin_security_summary', { p_range_days: dias });
/** Financial summaries use the same complete, MFA-protected source as the web. */
async function analyticsApi<T>(block: 'kpis' | 'monetization' | 'product', days = 30): Promise<T> {
  const owner = captureSessionIdentity();
  if (!owner) throw new Error('Inicia sesión para consultar el panel.');
  const check = () => { if (!isCurrentSessionIdentity(owner)) throw new Error('session_changed'); };
  const { data: { session }, error } = await supabase.auth.getSession();
  check();
  if (error || !session || session.user.id !== owner.userId) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  const range = [7, 30, 90].includes(days) ? days : 30;
  const res = await fetchConTimeout(`${WEB_URL}/api/admin/analytics/${block}?range=${range}d`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  check();
  const json = await res.json();
  check();
  if (json?.error === 'mfa_required') throw new MfaRequiredError();
  if (res.status === 401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
  if (res.status === 403) throw new Error('Tu cuenta no tiene acceso a estos indicadores.');
  if (!res.ok || !json || typeof json !== 'object' || Array.isArray(json) || json.error || json._scope?.complete === false) {
    throw new Error('No se pudieron verificar todos los datos. Reintenta la carga.');
  }
  return json as T;
}

export const getMonetizacion = () => analyticsApi<Monetizacion>('monetization');
export type ProductAnalytics = {
  current_careers: { name: string; user_count: number }[];
  screens: { screen: string; platform: string; views: number; users: number }[];
  coverage: { views: number; users: number; first_seen: string | null; last_seen: string | null };
};
export const getProductAnalytics = (days = 30) => analyticsApi<ProductAnalytics>('product', days);

export const getTopUniversidades = (limite = 10) =>
  rpc<TopUni[]>('admin_top_universities', { p_limit: limite, p_filters: {} });
/** Forma real de admin_top_careers (044b): no es {label,count}. */
export type Carrera = {
  career_id: string;
  name: string;
  branch: string | null;
  desired_count: number;
  recommended_count: number;
  score: number;
};

export const getTopCarreras = (limite = 10) =>
  rpc<Carrera[]>('admin_top_careers', { p_limit: limite, p_filters: {} });

/** Un punto de la serie diaria de altas (admin_signups_daily). */
export type PuntoAltas = { date: string; count: number; cumulative: number };

/**
 * Serie diaria de altas. Ojo: esta RPC pide FECHAS (date), no un numero de
 * dias como las demas, y el orden de los parametros importa.
 */
export function getAltasDiarias(dias = 30): Promise<PuntoAltas[]> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400_000);
  const fecha = (d: Date) => d.toISOString().slice(0, 10);
  return rpc<PuntoAltas[]>('admin_signups_daily', {
    p_start: fecha(desde),
    p_end: fecha(hasta),
    p_filters: {},
  });
}
export const getTopCiudades = (limite = 10) =>
  rpc<{ city: string; user_count: number }[]>('admin_top_cities', { p_limit: limite, p_filters: {} });

// ═══════════════════════════════════════════════════════════════════════════
//  GESTIÓN — lo que en la web es /admin (el panel de verdad), no
//  /admin/analytics (que es lo que había aquí y solo son gráficas).
// ═══════════════════════════════════════════════════════════════════════════
//
// Hasta ahora la pantalla de la app se llamaba "Panel admin" pero enseñaba
// exclusivamente las ocho secciones de analítica: las mismas que ve un
// analista. Todo el trabajo real (usuarios, reportes, auditoría, sugerencias,
// papelera) solo existía en el ordenador.
//
// Estas funciones replican las consultas EXACTAS del panel web
// (web/src/app/admin/dashboard.tsx), tabla por tabla y campo por campo. No se
// inventa ningún nombre: los que se usan aquí salen del SQL de las migraciones
// 010/015/042/111 y de lo que consulta la web.
//
// Regla que se mantiene en toda la pantalla: un dato que NO llega es null (se
// pinta como raya), nunca 0. Un panel roto no puede parecer una comunidad
// vacía.

/** Un contador que falla devuelve null, no 0. Esa diferencia es el bug. */
async function contar(
  tabla: string,
  filtro?: (q: Consulta) => Consulta,
  request?: OwnedRequest,
): Promise<number | null> {
  const base = supabase.from(tabla).select('*', { count: 'exact', head: true });
  const query = filtro ? filtro(base) : base;
  const { count, error } = await (request ? request.query(query) : query);
  if (error) return null;
  return count ?? null;
}
/** Tipo de la consulta de conteo, para no arrastrar los genéricos a mano. */
type Consulta = ReturnType<ReturnType<typeof supabase.from>['select']>;

async function withManagementRequest<T>(owner: SessionIdentity | null, work: (request: OwnedRequest) => Promise<T>, write = false): Promise<T> {
  const expected = assertSessionOwner(owner);
  const [role, aal] = await Promise.all([getStaffRole(), getAal()]);
  assertSessionOwner(expected);
  if (!role || write && role !== 'admin') throw new Error('No tienes permiso para esta acción.');
  if (aal !== 'aal2') throw new MfaRequiredError();
  return withOwnedRequest(expected, work);
}

/** Los mismos doce contadores que la web calcula en /admin (page.tsx). */
export type ResumenGestion = {
  usuarios: number | null;
  carreras: number | null;
  universidades: number | null;
  becas: number | null;
  noticias: number | null;
  eventos: number | null;
  alojamientos: number | null;
  buscanPiso: number | null;
  buscanRoomie: number | null;
  propietarios: number | null;
  papelera: number | null;
  reportesPendientes: number | null;
};

export async function getResumenGestion(owner: SessionIdentity | null = captureSessionIdentity()): Promise<ResumenGestion> {
  return withManagementRequest(owner, async request => {
  const [
    usuarios, carreras, universidades, becas, noticias, eventos, alojamientos,
    buscanPiso, buscanRoomie, propietarios, papelera, reportesPendientes,
  ] = await Promise.all([
    contar('profiles', q => q.not('is_discarded', 'is', true), request),
    contar('careers', undefined, request),
    contar('universities', undefined, request),
    contar('scholarships', undefined, request),
    contar('news', undefined, request),
    contar('events', undefined, request),
    contar('accommodations', undefined, request),
    contar('profiles', q => q.eq('looking_for_housing', true).not('is_discarded', 'is', true), request),
    contar('profiles', q => q.eq('looking_for_roommate', true).not('is_discarded', 'is', true), request),
    contar('profiles', q => q.eq('role', 'propietario').not('is_discarded', 'is', true), request),
    contar('profiles', q => q.eq('is_discarded', true), request),
    contar('user_reports', q => q.eq('status', 'pending'), request),
  ]);
  return {
    usuarios, carreras, universidades, becas, noticias, eventos, alojamientos,
    buscanPiso, buscanRoomie, propietarios, papelera, reportesPendientes,
  };
  });
}

// ─── Usuarios ────────────────────────────────────────────────────────────
export type FiltroUsuarios =
  | 'todos' | 'piso' | 'roomie' | 'propietarios' | 'analistas' | 'eliminados';

export type UsuarioAdmin = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  is_discarded: boolean | null;
  strikes_count: number | null;
  looking_for_housing: boolean | null;
  looking_for_roommate: boolean | null;
  city: string | null;
};

const POR_PAGINA = 20;

export async function listUsuarios(
  filtro: FiltroUsuarios = 'todos',
  busqueda = '',
  pagina = 0,
  owner: SessionIdentity | null = captureSessionIdentity(),
): Promise<UsuarioAdmin[]> {
  return withManagementRequest(owner, async request => {
  const page = Number.isSafeInteger(pagina) && pagina >= 0 ? Math.min(pagina, 50_000) : 0;
  let q = supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at, is_discarded, strikes_count, looking_for_housing, looking_for_roommate, city')
    .order('created_at', { ascending: false })
    .range(page * POR_PAGINA, (page + 1) * POR_PAGINA - 1);

  const term = busqueda.trim().slice(0, 100).replace(/[\u0000-\u001f*]/g, '');
  const literal = term.replace(/[\\%_]/g, '\\$&').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (term) q = q.or(`full_name.ilike."%${literal}%",email.ilike."%${literal}%"`);

  // Mismos filtros que la web. Por defecto los eliminados NO salen: para verlos
  // hay que pedirlos expresamente.
  if (filtro === 'piso') q = q.eq('looking_for_housing', true).not('is_discarded', 'is', true);
  else if (filtro === 'roomie') q = q.eq('looking_for_roommate', true).not('is_discarded', 'is', true);
  else if (filtro === 'propietarios') q = q.eq('role', 'propietario').not('is_discarded', 'is', true);
  else if (filtro === 'analistas') q = q.eq('role', 'analyst').not('is_discarded', 'is', true);
  else if (filtro === 'eliminados') q = q.eq('is_discarded', true);
  else q = q.not('is_discarded', 'is', true);

  const { data, error } = await request.query(q);
  if (error) throw new Error(error.message);
  return (data ?? []) as UsuarioAdmin[];
  });
}

/** Deja constancia en admin_actions, igual que hace la web. */
async function registrarAccion(
  request: OwnedRequest, accion: string, tipo: string, objetivo: string, detalles: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await request.query(supabase.rpc('log_admin_action', {
    p_admin_id: request.owner.userId,
    p_action: accion,
    p_target_type: tipo,
    p_target_id: objetivo,
    p_details: detalles,
  }));
  if (error) throw new Error('El cambio se guardó, pero no se pudo confirmar su registro de auditoría. Actualiza antes de repetirlo.');
}

export async function ponerStrike(userId: string, motivo: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  if (!motivo.trim() || motivo.trim().length > 2000) throw new Error('Indica un motivo de hasta 2000 caracteres.');
  return withManagementRequest(owner, async request => {
  const { error } = await request.query(supabase.from('user_strikes').insert({
    user_id: userId, issued_by: request.owner.userId, reason: motivo.trim(),
  }));
  if (error) throw new Error(error.message);
  await registrarAccion(request, 'issue_strike', 'user', userId, { reason: motivo.trim() });
  }, true);
}

export async function alternarDescartado(userId: string, descartadoAhora: boolean, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  return withManagementRequest(owner, async request => {
  const { data, error } = await request.query(supabase
    .from('profiles').update({ is_discarded: !descartadoAhora }).eq('id', userId).not('self_deleted', 'is', true).select('id'));
  if (error) throw new Error(error.message);
  if (data?.length !== 1) throw new Error('La cuenta ya no está disponible para esta acción. Actualiza la lista.');
  await registrarAccion(request, descartadoAhora ? 'restore_user' : 'discard_user', 'user', userId);
  }, true);
}

/**
 * Alta/baja del rol analista. Va por la API de la web (no por la tabla): la
 * ruta re-valida en servidor que quien llama es admin y que el objetivo no es
 * la cuenta admin. Además, cambiar profiles.role desde el cliente lo bloquea un
 * trigger en producción, así que por aquí es el único camino que funciona.
 */
export async function cambiarRol(userId: string, rol: 'analyst' | 'user', owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  return withManagementRequest(owner, async request => {
  const res = await fetchConTimeout(`${WEB_URL}/api/admin/users/${userId}/set-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
    body: JSON.stringify({ role: rol }),
    signal: request.signal,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? 'No se pudo cambiar el rol.');
  }
  }, true);
}

// ─── Reportes ────────────────────────────────────────────────────────────
export type EstadoReporte = 'pending' | 'reviewed' | 'dismissed' | 'all';

export type ReporteAdmin = {
  id: string;
  context: string;
  reason: string;
  description: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reported_user_id: string;
  reporter: { full_name: string | null; email: string | null } | null;
  reported: { full_name: string | null; email: string | null } | null;
};

export async function listReportes(estado: EstadoReporte = 'pending', owner: SessionIdentity | null = captureSessionIdentity()): Promise<ReporteAdmin[]> {
  return withManagementRequest(owner, async request => {
  // Los dos perfiles se piden por el NOMBRE DE LA CLAVE AJENA: user_reports
  // apunta dos veces a profiles (quien reporta y a quien reportan) y sin eso
  // PostgREST no sabe cuál es cuál y devuelve un error de relación ambigua.
  let q = supabase
    .from('user_reports')
    .select('id, context, reason, description, status, admin_notes, created_at, reported_user_id, reporter:profiles!user_reports_reporter_id_fkey(full_name, email), reported:profiles!user_reports_reported_user_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(30);
  if (estado !== 'all') q = q.eq('status', estado);
  const { data, error } = await request.query(q);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReporteAdmin[];
  });
}

export async function resolverReporte(
  id: string, estado: 'reviewed' | 'dismissed', notas?: string,
  owner: SessionIdentity | null = captureSessionIdentity(),
): Promise<void> {
  return withManagementRequest(owner, async request => {
  const { data, error } = await request.query(supabase.from('user_reports').update({
    status: estado,
    admin_notes: notas ?? null,
    reviewed_by: request.owner.userId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'pending').select('id'));
  if (error) throw new Error(error.message);
  if (data?.length !== 1) throw new Error('El reporte ya cambió o no está disponible. Actualiza la lista.');
  await registrarAccion(request, `report_${estado}`, 'report', id, { admin_notes: notas });
  }, true);
}

/** El servidor deriva el destinatario y registra strike+revisión en una sola transacción. */
export async function strikeDesdeReporte(
  reporteId: string,
  owner: SessionIdentity | null = captureSessionIdentity(),
): Promise<void> {
  return withManagementRequest(owner, async request => {
    const { data, error } = await request.query(supabase.rpc('issue_strike_from_report', { p_report_id: reporteId }));
    if (error) throw new Error(adminOperationError(error));
    if (!isReportStrikeResult(data, reporteId)) throw new Error('No se pudo confirmar el strike. Actualiza el reporte antes de repetirlo.');
  }, true);
}

// ─── Auditoría ───────────────────────────────────────────────────────────
// Única fuente de verdad: admin_actions (042/045). admin_audit_log (010) nunca
// existió en producción y se retiró en la 111.
export type AccionAuditoria = {
  id: number;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
};

export async function listAuditoria(limite = 50, owner: SessionIdentity | null = captureSessionIdentity()): Promise<AccionAuditoria[]> {
  return withManagementRequest(owner, async request => {
  const { data, error } = await request.query(supabase
    .from('admin_actions').select('*')
    .order('created_at', { ascending: false }).limit(Math.max(1, Math.min(100, Math.trunc(limite) || 50))));
  if (error) throw new Error(error.message);
  return (data ?? []) as AccionAuditoria[];
  });
}

// ─── Sugerencias de zonas de ocio ────────────────────────────────────────
export type SugerenciaOcio = {
  id: string;
  name: string;
  city: string;
  category: string;
  description: string | null;
  address: string | null;
  status: string;
  created_at: string;
};

export async function listSugerenciasOcio(owner: SessionIdentity | null = captureSessionIdentity()): Promise<SugerenciaOcio[]> {
  return withManagementRequest(owner, async request => {
  const { data, error } = await request.query(supabase
    .from('leisure_spot_suggestions').select('*')
    .order('created_at', { ascending: false }).limit(50));
  if (error) throw new Error(error.message);
  return (data ?? []) as SugerenciaOcio[];
  });
}

export async function aprobarSugerenciaOcio(id: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  return withManagementRequest(owner, async request => {
  const { data, error } = await request.query(supabase.rpc('approve_leisure_suggestion', {
    p_suggestion_id: id, p_admin_note: 'Aprobado desde la app',
  }));
  if (error) throw new Error(adminOperationError(error));
  if (!isUuidResult(data)) throw new Error('No se pudo confirmar el local creado. Actualiza antes de repetir la aprobación.');
  }, true);
}

export async function rechazarSugerenciaOcio(id: string, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  return withManagementRequest(owner, async request => {
  const { data, error } = await request.query(supabase
    .from('leisure_spot_suggestions').update({ status: 'rejected' }).eq('id', id).eq('status', 'pending').select('id'));
  if (error) throw new Error(error.message);
  if (data?.length !== 1) throw new Error('La sugerencia ya cambió o no está disponible. Actualiza la lista.');
  await registrarAccion(request, 'reject_leisure_suggestion', 'leisure_spot_suggestions', id);
  }, true);
}

// ─── Papelera ────────────────────────────────────────────────────────────
// Dos cosas distintas en la misma lista, igual que en la web: filas borradas
// del catálogo (discarded_records) y cuentas marcadas como eliminadas.
export type ElementoPapelera = {
  tipo: 'registro' | 'usuario';
  id: string;
  etiqueta: string;
  insignia: string;
  fecha: string | null;
  /** Copia para mostrar el detalle. La restauración solo envía el UUID al servidor. */
  bruto: Record<string, unknown>;
};

export async function listPapelera(owner: SessionIdentity | null = captureSessionIdentity()): Promise<ElementoPapelera[]> {
  return withManagementRequest(owner, async request => {
  const [registros, usuarios] = await Promise.all([
    request.query(supabase.from('discarded_records').select('*')
      .is('restored_at', null).order('deleted_at', { ascending: false }).limit(50)),
    request.query(supabase.from('profiles').select('id, full_name, email, discarded_at, self_deleted, role')
      .eq('is_discarded', true).order('discarded_at', { ascending: false }).limit(50)),
  ]);
  if (registros.error || usuarios.error) throw new Error('No se pudo cargar toda la papelera. Vuelve a intentarlo.');

  const deRegistros: ElementoPapelera[] = ((registros.data ?? []) as Record<string, unknown>[]).map((r) => {
    const datos = (r.data ?? {}) as Record<string, unknown>;
    return {
      tipo: 'registro' as const,
      id: String(r.id),
      etiqueta: String(datos.name ?? datos.title ?? datos.full_name ?? r.original_id),
      insignia: String(r.original_table ?? 'registro'),
      fecha: (r.deleted_at as string | null) ?? null,
      bruto: r,
    };
  });

  const deUsuarios: ElementoPapelera[] = ((usuarios.data ?? []) as Record<string, unknown>[]).map((u) => ({
    tipo: 'usuario' as const,
    id: String(u.id),
    etiqueta: String(u.full_name ?? u.email ?? u.id),
    insignia: 'Usuario',
    fecha: (u.discarded_at as string | null) ?? null,
    bruto: u,
  }));

  return [...deRegistros, ...deUsuarios]
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  });
}

export async function restaurarDePapelera(item: ElementoPapelera, owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  if (item.tipo === 'usuario') {
    if (item.bruto.self_deleted === true) throw new Error('Esta cuenta fue eliminada por su titular y no se puede restaurar desde aquí.');
    return alternarDescartado(item.id, true, owner);
  }
  return withManagementRequest(owner, async request => {
    const { data, error } = await request.query(supabase.rpc('restore_discarded_record', { p_record_id: item.id }));
    if (error) throw new Error(adminOperationError(error));
    if (!isRestorationResult(data)) throw new Error('No se pudo confirmar la restauración. Actualiza la papelera antes de repetirla.');
  }, true);
}
