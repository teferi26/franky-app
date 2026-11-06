"use client";

import { Activity, Lightbulb } from "lucide-react";
import KpiCard from "../components/KpiCard";
import TimeSeriesChart from "../components/TimeSeriesChart";
import TopListCard from "../components/TopListCard";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";
import { formatEur } from "@/lib/pricing";

type KpisResponse = {
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
  period_days: number;
};

type UsersResponse = {
  demographics: { by_comunidad: { label: string; count: number }[] };
  signups_daily: { date: string; count: number; cumulative?: number }[];
  range_days: number;
};

export default function OverviewTab() {
  const { queryString } = useAnalyticsFilters();
  const kpis = useAnalyticsQuery<KpisResponse>(`/api/admin/analytics/kpis?${queryString}`);
  const users = useAnalyticsQuery<UsersResponse>(`/api/admin/analytics/users?${queryString}`);

  const k = kpis.data;

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      {kpis.error ? <EmptyDataState title="No se pudo cargar el resumen" hint={kpis.error} onRetry={kpis.refetch} /> : <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          loading={kpis.loading}
          label="Usuarios totales"
          value={k?.total_users}
          current={k?.total_users}
          previous={k?.total_users_prev}
          caption={k ? `+${k.new_signups_today} hoy` : undefined}
        />
        <KpiCard
          loading={kpis.loading}
          label="Altas en el periodo"
          value={k?.new_signups_period}
          current={k?.new_signups_period}
          previous={k?.new_signups_prev_period}
          caption="vs período anterior"
        />
        <KpiCard
          loading={kpis.loading}
          label="MRR estimado"
          value={k?.mrr_estimate}
          formatter={(v) => formatEur(typeof v === "number" ? v : Number(v))}
          caption={k ? `ARR: ${formatEur(k.arr_estimate)}` : undefined}
        />
        <KpiCard
          loading={kpis.loading}
          label="Premium activos"
          value={k?.total_premium}
          caption={k ? `Pro: ${k.total_student} · Business: ${k.total_business}` : undefined}
        />
        <KpiCard
          loading={kpis.loading}
          label="Estudiantes verificados"
          value={k?.verified_students}
          caption={k && k.total_users > 0 ? `${Math.round((k.verified_students / k.total_users) * 100)}% del total` : undefined}
        />
        <KpiCard
          loading={kpis.loading}
          label="Propietarios"
          value={k?.total_propietarios}
        />
        <KpiCard
          loading={kpis.loading}
          label="Reportes pendientes"
          value={k?.pending_reports}
        />
        <KpiCard
          loading={kpis.loading}
          label="Incidentes 24h"
          value={k?.security_incidents_24h}
        />
      </div>}

      {/* Signups time series + top comunidades */}
      {users.error ? <EmptyDataState title="No se pudieron cargar las altas y comunidades" hint={users.error} onRetry={users.refetch} /> : <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-bg-primary shadow-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-heading text-sm font-bold text-text-primary flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet" strokeWidth={1.75} />
                Nuevos registros diarios
              </h3>
              <p className="text-xs text-text-muted mt-0.5">Registros del periodo y perfiles seleccionados</p>
            </div>
          </div>
          {users.loading ? (
            <div className="h-[280px] skeleton-shimmer rounded-xl bg-bg-secondary" />
          ) : (
            <TimeSeriesChart
              data={users.data?.signups_daily ?? []}
              showCumulative
              label="Registros"
            />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-4 sm:p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Top comunidades
          </h3>
          {users.loading ? (
            <div className="h-[280px] skeleton-shimmer rounded-xl bg-bg-secondary" />
          ) : (
            <TopListCard
              items={(users.data?.demographics?.by_comunidad ?? []).slice(0, 8).map((d) => ({
                label: d.label === "sin_dato" ? "Sin especificar" : d.label,
                count: d.count,
              }))}
            />
          )}
        </div>
      </div>}
    </div>
  );
}
