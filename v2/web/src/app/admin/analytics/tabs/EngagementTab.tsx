"use client";

import { Activity } from "lucide-react";
import KpiCard from "../components/KpiCard";
import DistributionBarChart from "../components/DistributionBarChart";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";
import ProductInsights from "../components/ProductInsights";

type EngResponse = {
  metrics: {
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
};

const FUNNEL_LABELS: Record<string, string> = {
  signup: "Registro",
  verified_email: "Correo universitario verificado",
  completed_vocational: "Test vocacional",
  first_match: "Con match actual",
  first_message: "Primer mensaje",
};

export default function EngagementTab() {
  const { queryString } = useAnalyticsFilters();
  const { data, loading, error, refetch } = useAnalyticsQuery<EngResponse>(
    `/api/admin/analytics/engagement?${queryString}`
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <ProductInsights section="screens" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
          ))}
        </div>
        <div className="h-72 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
      </div>
    );
  }
  if (error) return <div className="space-y-6"><ProductInsights section="screens" /><EmptyDataState title="No se cargaron los indicadores complementarios" hint={error} onRetry={refetch} /></div>;
  if (!data?.metrics) return <div className="space-y-6"><ProductInsights section="screens" /><EmptyDataState /></div>;

  const m = data.metrics;
  const funnelData = Object.entries(m.engagement_funnel).map(([k, v]) => ({
    label: FUNNEL_LABELS[k] ?? k,
    count: v as number,
  }));

  return (
    <div className="space-y-6">
      <ProductInsights section="screens" />
      {/* Active KPIs */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="Con actividad hoy"
          value={m.dau}
          caption="Mensajes, Roomie o test vocacional"
        />
        <KpiCard
          label="Con actividad en 7 días"
          value={m.wau}
          caption="Últimos 7 días"
        />
        <KpiCard
          label="Con actividad en 30 días"
          value={m.mau}
          caption="Últimos 30 días"
        />
        <KpiCard
          label="Actividad hoy / 30 días"
          value={`${m.dau_mau_ratio}%`}
          caption="Mismas acciones medidas en ambas ventanas"
        />
      </div>

      {/* Activity counters */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="Mensajes 7d"
          value={m.messages_sent_7d}
        />
        <KpiCard
          label="Tests vocacionales 30d"
          value={m.vocational_tests_completed_30d}
        />
        <KpiCard
          label="Matches Roomie actuales"
          value={m.roommate_connections_current}
          caption="Parejas con interés mutuo, sin duplicar"
        />
        <KpiCard
          label="Inscripciones a eventos 30d"
          value={m.events_joined_30d}
        />
      </div>

      {/* Funnel */}
      <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
        <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet" strokeWidth={1.75} />
          Hitos de uso acumulados
        </h3>
        <p className="text-xs text-text-muted mb-4">
          Recuentos independientes de personas por hito. No exigen haber pasado
          por el paso anterior ni seguir el mismo orden. No permiten calcular
          abandono entre pasos. Las acciones históricas pueden incluir perfiles
          posteriormente descartados; registros y verificación los excluyen.
        </p>
        <DistributionBarChart data={funnelData} horizontal height={260} />
      </div>

    </div>
  );
}
