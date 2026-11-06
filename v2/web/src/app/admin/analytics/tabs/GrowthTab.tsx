"use client";

import { TrendingUp, QrCode, Megaphone, Compass, Trophy } from "lucide-react";
import KpiCard from "../components/KpiCard";
import TimeSeriesChart from "../components/TimeSeriesChart";
import MultiSeriesChart, { type ChartSeries } from "../components/MultiSeriesChart";
import TopListCard from "../components/TopListCard";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";
import { Badge } from "@/components/ui/badge";
import { tableWrapClass, tableClass, thClass, tdClass, trClass } from "../../components/panel-ui";

type GrowthResponse = {
  by_utm_source: { source: string; count: number }[];
  by_utm_campaign: { campaign: string; count: number }[];
  by_signup_source: { source: string; count: number }[];
  qr_scans_period: number;
  signups_period: number;
  active_after_signup: number;
  conversion_pct: number;
  period_days: number;
};

type UsersResponse = {
  signups_daily: { date: string; count: number; cumulative?: number }[];
};

type AmbassadorsResponse = {
  period_days: number;
  totals: { ambassador: string; signups: number }[];
  all_time: { ambassador: string; signups: number }[];
  daily: { date: string; ambassador: string; count: number }[];
};

type LeadDetail = {
  created_at: string;
  full_name: string | null;
  email: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  signup_landing_path: string | null;
};

type LeadDetailResponse = { leads: LeadDetail[]; _scope?: { truncated?: boolean; limit?: number } };

/* Tabla: qué usuario entró por qué link y en qué fecha (más recientes primero). */
function LeadDetailTable({ queryString }: { queryString: string }) {
  const { data, loading, error, refetch } = useAnalyticsQuery<LeadDetailResponse>(
    `/api/admin/analytics/ambassador-detail?${queryString}`
  );

  if (loading) return <div className="skeleton-shimmer mt-4 h-32 rounded-xl bg-bg-secondary/50" />;
  if (error) return <EmptyDataState title="No se pudo cargar el detalle" hint={error} onRetry={refetch} />;
  if (!data?.leads?.length) return <EmptyDataState title="Sin registros atribuidos en este periodo" />;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mt-5">
      <p className="eyebrow mb-3">Detalle: quién entró, por qué link y cuándo</p>
      {data._scope?.truncated && <p role="status" className="mb-3 rounded-xl border border-border bg-bg-secondary/60 px-3.5 py-2.5 text-sm text-text-secondary">Se muestran los 300 registros más recientes. Hay más resultados: reduce el periodo para consultar el detalle.</p>}
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Fecha</th>
              <th className={thClass}>Usuario</th>
              <th className={thClass}>Origen</th>
              <th className={thClass}>Link</th>
              <th className={thClass}>Vídeo / tag</th>
            </tr>
          </thead>
          <tbody>
            {data.leads.map((l, i) => (
              <tr key={`${l.email}-${i}`} className={trClass}>
                <td className={`${tdClass} tabular whitespace-nowrap text-xs text-text-secondary`}>
                  {fmtDate(l.created_at)}
                </td>
                <td className={tdClass}>
                  <span className="text-sm font-medium text-text-primary">{l.full_name || "Sin nombre"}</span>
                  {l.email && (
                    <span className="block text-xs text-text-muted">{l.email}</span>
                  )}
                </td>
                <td className={tdClass}>
                  <Badge variant="outline">{capitalize(l.utm_source ?? "?")}</Badge>
                </td>
                <td className={`${tdClass} whitespace-nowrap text-xs text-text-secondary`}>
                  {l.signup_landing_path || l.utm_content || "-"}
                </td>
                <td className={`${tdClass} text-xs text-text-muted`}>{l.utm_term || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Incluye todos los registros con atribución (embajadores, QRs y campañas),
        hasta 300 del período elegido. Para medir un vídeo o cuenta concretos,
        añade ?v=nombre-del-video al link corto (ej. franky.es/tafa?v=reel-biblioteca):
        aparecerá en la columna Vídeo / tag.
      </p>
    </div>
  );
}

// Violeta para lo principal y grises para el resto: sin arcoíris.
const AMBASSADOR_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#9ca3af", "#c7cbd1"];

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* Card: ¿quién está trayendo más leads? (links UTM de embajador: Tafa vs Pau) */
function AmbassadorLeadsCard({ queryString }: { queryString: string }) {
  const { data, loading, error, refetch } = useAnalyticsQuery<AmbassadorsResponse>(
    `/api/admin/analytics/ambassadors?${queryString}`
  );

  if (loading) return <div className="h-72 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />;
  if (error) return <EmptyDataState title="Error al cargar embajadores" hint={error} onRetry={refetch} />;

  const totals = data?.totals ?? [];
  const allTime = new Map((data?.all_time ?? []).map((t) => [t.ambassador, t.signups]));
  const ambassadorKeys = [
    ...new Set([...totals.map((t) => t.ambassador), ...(data?.daily ?? []).map((d) => d.ambassador)]),
  ];

  // Pivota las filas planas {date, ambassador, count} a {date, tafa: n, pau: n}
  const byDate = new Map<string, Record<string, string | number>>();
  for (const row of data?.daily ?? []) {
    const entry = byDate.get(row.date) ?? { date: row.date };
    entry[row.ambassador] = row.count;
    byDate.set(row.date, entry);
  }
  const chartData = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const series: ChartSeries[] = ambassadorKeys.map((key, i) => ({
    key,
    label: capitalize(key),
    color: AMBASSADOR_COLORS[i % AMBASSADOR_COLORS.length],
  }));

  const leader = totals[0];

  return (
    <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
      <h3 className="font-heading text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-violet" strokeWidth={1.75} />
        Embajadores: ¿quién trae más leads?
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Registros llegados por los links UTM personales (utm_medium=ambassador).
      </p>

      {ambassadorKeys.length === 0 ? (
        <EmptyDataState
          title="Aún sin leads de embajadores"
          hint="Comparte los links con UTM de Tafa y Pau; en cuanto entre el primer registro aparecerá aquí."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4 mb-4">
            {totals.map((t, i) => (
              <KpiCard
                key={t.ambassador}
                index={i}
                label={capitalize(t.ambassador)}
                value={t.signups}
                caption={`Histórico: ${(allTime.get(t.ambassador) ?? t.signups).toLocaleString("es-ES")}${
                  leader && t.ambassador === leader.ambassador && totals.length > 1 ? " · líder del período" : ""
                }`}
              />
            ))}
          </div>
          <MultiSeriesChart data={chartData} series={series} height={280} />
        </>
      )}

      <LeadDetailTable queryString={queryString} />
    </div>
  );
}

export default function GrowthTab() {
  const { queryString } = useAnalyticsFilters();
  const growth = useAnalyticsQuery<GrowthResponse>(
    `/api/admin/analytics/growth?${queryString}`
  );
  const users = useAnalyticsQuery<UsersResponse>(
    `/api/admin/analytics/users?${queryString}`
  );

  if (growth.loading || users.loading) {
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
  if (growth.error || users.error)
    return <EmptyDataState title="Error al cargar" hint={growth.error ?? users.error ?? "Error"} onRetry={() => { growth.refetch(); users.refetch(); }} />;
  if (!growth.data) return <EmptyDataState />;

  const g = growth.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="Altas en el periodo"
          value={g.signups_period}
        />
        <KpiCard
          label="Activados"
          value={g.active_after_signup}
          caption="Con actividad posterior al registro"
        />
        <KpiCard
          label="Conversión"
          value={`${g.conversion_pct}%`}
          caption="Signup → al menos 1 acción"
        />
        <KpiCard
          label={`QR scans ${g.period_days}d`}
          value={g.qr_scans_period}
        />
      </div>

      <AmbassadorLeadsCard queryString={queryString} />

      <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
        <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet" strokeWidth={1.75} />
          Signups diarios + acumulado
        </h3>
        <TimeSeriesChart
          data={users.data?.signups_daily ?? []}
          showCumulative
          height={320}
          label="Nuevos usuarios"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-violet" strokeWidth={1.75} />
            UTM source
          </h3>
          <TopListCard
            items={(g.by_utm_source ?? []).map((s) => ({
              label: s.source === "direct" ? "Direct (sin UTM)" : s.source,
              count: s.count,
            }))}
          />
        </div>
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Compass className="w-4 h-4 text-violet" strokeWidth={1.75} />
            UTM campaign
          </h3>
          <TopListCard
            items={(g.by_utm_campaign ?? []).map((c) => ({
              label: c.campaign === "none" ? "Sin campaña" : c.campaign,
              count: c.count,
            }))}
            emptyLabel="Aún sin campañas activas"
          />
        </div>
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-warning" strokeWidth={1.75} />
            signup_source
          </h3>
          <TopListCard
            items={(g.by_signup_source ?? []).map((s) => ({
              label: s.source === "unknown" ? "Desconocido" : s.source,
              count: s.count,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
