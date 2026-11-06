"use client";

import { ShieldAlert, AlertTriangle, Ban } from "lucide-react";
import KpiCard from "../components/KpiCard";
import DistributionBarChart from "../components/DistributionBarChart";
import TopListCard from "../components/TopListCard";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";

type SecResponse = {
  incidents_by_kind: { kind: string; count: number }[];
  incidents_by_severity: { severity: string; count: number }[];
  csp_violations_24h: number;
  csp_top_blocked: { blocked_uri: string; count: number }[];
  admin_actions_7d: number;
  unique_attacker_ips: number;
  period_days: number;
};

const KIND_LABEL: Record<string, string> = {
  honeypot_hit: "Honeypot",
  rate_limit_blast: "Rate-limit",
  auth_brute_force: "Brute-force auth",
  banned_ip_hit: "IP baneada",
  turnstile_failed: "Captcha fallido",
  csp_violation_spike: "Spike CSP",
  admin_action_denied: "Admin denegado",
  other: "Otro",
};

export default function SecurityTab() {
  const { queryString } = useAnalyticsFilters();
  const { data, loading, error, refetch } = useAnalyticsQuery<SecResponse>(
    `/api/admin/analytics/security?${queryString}`
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
          ))}
        </div>
        <div className="h-72 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
      </div>
    );
  }
  if (error) return <EmptyDataState title="Error al cargar" hint={error} onRetry={refetch} />;
  if (!data) return <EmptyDataState />;

  const totalIncidents = (data.incidents_by_kind ?? []).reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label={`Incidentes ${data.period_days}d`}
          value={totalIncidents}
        />
        <KpiCard
          label="CSP violations 24h"
          value={data.csp_violations_24h}
          caption="Refleja intentos XSS bloqueados"
        />
        <KpiCard
          label="IPs únicas atacantes"
          value={data.unique_attacker_ips}
        />
        <KpiCard
          label="Acciones admin 7d"
          value={data.admin_actions_7d}
          caption="Auditoría de cambios"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-error" strokeWidth={1.75} />
            Incidentes por tipo
          </h3>
          <DistributionBarChart
            data={(data.incidents_by_kind ?? []).map((d) => ({
              label: KIND_LABEL[d.kind] ?? d.kind,
              count: d.count,
            }))}
            horizontal
            height={Math.max(180, (data.incidents_by_kind?.length ?? 1) * 36)}
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Ban className="w-4 h-4 text-warning" strokeWidth={1.75} />
            CSP top blocked URIs
          </h3>
          <TopListCard
            items={(data.csp_top_blocked ?? []).map((t) => ({
              label: t.blocked_uri.length > 60 ? t.blocked_uri.slice(0, 57) + "…" : t.blocked_uri,
              count: t.count,
            }))}
            emptyLabel="Sin violaciones CSP en el período"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" strokeWidth={1.75} />
            Incidentes por severidad
          </h3>
          <DistributionBarChart
            data={(data.incidents_by_severity ?? []).map((d) => ({
              label: d.severity,
              count: d.count,
            }))}
            horizontal={false}
            height={220}
          />
        </div>
      </div>
    </div>
  );
}
