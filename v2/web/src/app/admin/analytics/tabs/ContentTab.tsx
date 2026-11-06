"use client";

import { Home as HomeIcon, MapPin } from "lucide-react";
import KpiCard from "../components/KpiCard";
import DistributionBarChart from "../components/DistributionBarChart";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";

type ContentResponse = {
  universities: number;
  careers: number;
  scholarships: { total: number; active: number };
  accommodations: { total: number; by_type: { label: string; count: number }[] };
  leisure_spots: { total: number; by_type: { label: string; count: number }[] };
  events: { upcoming: number; past: number };
  news: number;
};

export default function ContentTab() {
  const { data, loading, error, refetch } = useAnalyticsQuery<ContentResponse>(
    `/api/admin/analytics/content`
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-28 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <EmptyDataState title="Error al cargar" hint={error} onRetry={refetch} />;
  if (!data) return <EmptyDataState />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="Universidades"
          value={data.universities}
        />
        <KpiCard
          label="Carreras"
          value={data.careers}
        />
        <KpiCard
          label="Becas activas"
          value={data.scholarships.active}
          caption={`${data.scholarships.total} en total`}
        />
        <KpiCard
          label="Alojamientos"
          value={data.accommodations.total}
        />
        <KpiCard
          label="Zonas de ocio"
          value={data.leisure_spots.total}
        />
        <KpiCard
          label="Eventos próximos"
          value={data.events.upcoming}
          caption={`${data.events.past} pasados`}
        />
        <KpiCard
          label="Noticias"
          value={data.news}
        />
        <KpiCard
          label="Inventario total"
          value={
            data.universities +
            data.careers +
            data.scholarships.total +
            data.accommodations.total +
            data.leisure_spots.total +
            data.events.upcoming +
            data.events.past +
            data.news
          }
          caption="Suma de todos los catálogos"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <HomeIcon className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Alojamientos por tipo
          </h3>
          <DistributionBarChart
            data={data.accommodations.by_type.map((t) => ({
              ...t,
              label: t.label === "sin_dato" ? "Sin tipo" : t.label,
            }))}
            horizontal
            height={Math.max(180, data.accommodations.by_type.length * 36)}
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Zonas de ocio por categoría
          </h3>
          <DistributionBarChart
            data={data.leisure_spots.by_type.map((t) => ({
              ...t,
              label: t.label === "sin_dato" ? "Sin categoría" : t.label,
            }))}
            horizontal
            height={Math.max(180, data.leisure_spots.by_type.length * 36)}
          />
        </div>
      </div>
    </div>
  );
}
