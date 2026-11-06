"use client";
import { ANALYTICS_SCOPE_NOTES, type AnalyticsBlock } from '@/lib/analytics-scope';
import { analyticsPeriodLabel } from '@/lib/analytics-period';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';
import type { TabKey } from './AnalyticsTabsNav';

const BLOCKS: Record<TabKey, AnalyticsBlock[]> = {
  overview: ['kpis', 'users'], demographics: ['users'], academic: ['product', 'engagement'],
  engagement: ['product', 'engagement'], monetization: ['monetization', 'event-creators'],
  content: ['content'], security: ['security'], growth: ['growth', 'users', 'ambassadors'],
};
const LABELS: Record<TabKey, string> = {
  overview: 'Tarjetas generales · Gráficas de personas filtradas',
  demographics: 'Personas registradas con los filtros seleccionados',
  academic: 'Estudios declarados y preferencias, por separado',
  engagement: 'Pantallas medidas y actividad general, por separado',
  monetization: 'Suscripciones actuales y ventas de eventos',
  content: 'Inventario global actual',
  security: 'Seguridad de toda la plataforma',
  growth: 'Atribución general · Serie de registros filtrada',
};
export default function AnalyticsScopeNotice({ tab }: { tab: TabKey }) {
  const { filters } = useAnalyticsFilters();
  const hasProfiles = Object.entries(filters).some(([key, value]) => key !== 'range' && Array.isArray(value) && value.length > 0);
  const ignoresProfiles = ['overview', 'monetization', 'content', 'security', 'growth'].includes(tab);
  return <aside className="mb-6 rounded-xl border border-border bg-bg-secondary/40 p-4 text-sm">
    <p className="eyebrow">Alcance</p>
    <p className="mt-2 font-semibold text-text-primary">{LABELS[tab]}</p>
    <p className="mt-1 text-xs text-text-muted">Selección: {analyticsPeriodLabel(filters.range)}{filters.range === 'all' ? '. Las series y los indicadores de periodos recientes muestran como máximo 10 años.' : ''}</p>
    {hasProfiles && ignoresProfiles && <p className="mt-2 text-sm text-text-secondary">Los filtros de personas no modifican los indicadores generales de esta sección. Su alcance se detalla debajo.</p>}
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">Qué representa cada indicador</summary>
      <div className="space-y-2 text-xs leading-relaxed text-text-muted">{BLOCKS[tab].map(block => <p key={block}>{ANALYTICS_SCOPE_NOTES[block]}</p>)}</div>
    </details>
  </aside>;
}
