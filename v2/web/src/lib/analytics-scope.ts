import { normalizeAnalyticsRange, resolveAnalyticsPeriod } from './analytics-period';
import type { AnalyticsFilters } from './analytics-filters';

export type AnalyticsBlock = 'kpis' | 'users' | 'engagement' | 'product' | 'monetization' | 'content' | 'security' | 'growth' | 'ambassadors' | 'ambassador-detail' | 'event-creators';
const PROFILE_KEYS = ['comunidad', 'city', 'university', 'gender', 'age', 'studentType', 'year'];

export const ANALYTICS_SCOPE_NOTES: Record<AnalyticsBlock, string> = {
  kpis: 'Estado actual de toda la plataforma. Las altas y su comparación usan el periodo reciente; hoy y las últimas 24 horas mantienen sus propias ventanas. Los filtros de personas no se aplican a estas tarjetas.',
  users: 'Personas no descartadas que se registraron en el periodo, con los filtros de perfil seleccionados. La serie cuenta altas, no visitas. Los rangos por fecha usan días UTC y el día final está incluido.',
  product: 'Estudios: carrera actual declarada por las personas registradas en el periodo. Pantallas: visitas del periodo con medición activada. Ambas vistas aplican filtros de perfil; no representan toda la navegación si falta consentimiento.',
  engagement: 'La actividad general conserva sus ventanas de hoy, 7 días, 30 días e histórico. Matches actuales cuenta parejas recíprocas únicas, sin fecha de formación; el campo temporal heredado solo identifica registros recientes y no debe interpretarse como fecha del match. Los rankings aplican filtros de perfil y fecha de registro; alojamientos por ciudad es inventario global.',
  monetization: 'Suscripciones activas de toda la plataforma, estimadas con precios de catálogo y periodos de facturación; las pruebas gratuitas no suman ingreso recurrente. Altas y canceladas actualizadas usan 30 días y no incluyen Plan Inmobiliarias; las altas sí incluyen pruebas. La actualización de una cancelada no acredita la fecha de cancelación. No aplica filtros de personas ni periodo seleccionado; no equivale a cobros liquidados.',
  content: 'Inventario actual de toda la plataforma, incluidos registros sin publicar. La vigencia de becas y eventos se evalúa hoy. No aplica el periodo ni los filtros de personas.',
  security: 'Incidentes y rankings del periodo reciente en toda la plataforma. CSP mantiene 24 horas y acciones administrativas 7 días. No aplica filtros de personas.',
  growth: 'Personas registradas y escaneos del periodo reciente en toda la plataforma. La activación cuenta acciones posteriores al registro, incluso fuera del periodo. No aplica filtros de personas.',
  ambassadors: 'Atribución del periodo reciente y acumulado histórico por separado. No aplica filtros de personas; el total histórico conserva su propio alcance.',
  'ambassador-detail': 'Hasta 300 registros atribuidos del periodo, sin perfiles descartados. Incluye campañas y QR con UTM, no solo embajadores. El límite y si quedan más filas se indican en la respuesta.',
  'event-creators': 'Pagos creados en el periodo reciente, con estado y reembolsos actuales. Top 25 organizadores y totales globales, no fecha de liquidación. No aplica filtros de personas.',
};

export function buildAnalyticsScope(block: AnalyticsBlock, params: URLSearchParams, now = Date.now(), appliedFilters?: AnalyticsFilters) {
  const range = normalizeAnalyticsRange(params.get('range'));
  const period = resolveAnalyticsPeriod(range, now);
  const profileFilters = Object.fromEntries(PROFILE_KEYS.flatMap(key => params.has(key) ? [[key, params.get(key)!]] : []));
  const supported = ['users', 'product', 'engagement'].includes(block);
  const periodIgnored = ['content', 'monetization'].includes(block);
  return {
    complete: true,
    generated_at: new Date(now).toISOString(),
    requested_range: params.get('range') ?? '30d',
    normalized_range: range,
    requested_profile_filters: profileFilters,
    applied_profile_filters: supported && appliedFilters
      ? Object.fromEntries(Object.entries(appliedFilters).filter(([key]) => key !== 'since' && key !== 'until'))
      : {},
    profile_registration_window: supported && appliedFilters ? { since: appliedFilters.since ?? null, until_exclusive: appliedFilters.until ?? null } : null,
    supported_profile_filters: supported ? PROFILE_KEYS : [],
    ignored_profile_filters: supported ? [] : Object.keys(profileFilters),
    period_applies: !periodIgnored,
    period: periodIgnored ? null : { ...period, until_exclusive: !!period.until, calendar_timezone: 'UTC', rolling_history_max_days: range === 'all' ? 3650 : null },
    note: ANALYTICS_SCOPE_NOTES[block],
  };
}
