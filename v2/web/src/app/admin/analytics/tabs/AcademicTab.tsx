"use client";

import { GraduationCap, MapPin, Lightbulb } from "lucide-react";
import TopListCard from "../components/TopListCard";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";
import ProductInsights from "../components/ProductInsights";

type EngResponse = {
  top_universities: {
    id: string;
    name: string;
    short_name: string | null;
    city: string | null;
    comunidad_autonoma: string | null;
    user_count: number;
    pct_of_total: number;
  }[];
  top_careers: {
    career_id: string;
    name: string;
    branch: string | null;
    cut_off_score: number | null;
    employment_rate: number | null;
    desired_count: number;
    recommended_count: number;
    score: number;
  }[];
  top_cities: {
    city: string;
    user_count: number;
    accommodation_count: number;
  }[];
};

export default function AcademicTab() {
  const { queryString } = useAnalyticsFilters();
  const { data, loading, error, refetch } = useAnalyticsQuery<EngResponse>(
    `/api/admin/analytics/engagement?${queryString}&limit=25`
  );

  if (loading) {
    return (
      <div className="space-y-6"><ProductInsights section="studies" /><div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-96 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
        ))}
      </div></div>
    );
  }
  if (error) return <div className="space-y-6"><ProductInsights section="studies" /><EmptyDataState title="No se cargaron los indicadores complementarios" hint={error} onRetry={refetch} /></div>;
  if (!data) return <div className="space-y-6"><ProductInsights section="studies" /><EmptyDataState /></div>;

  return (
    <div className="space-y-6">
      <ProductInsights section="studies" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Top universidades
          </h3>
          <p className="text-xs text-text-muted mb-3">Por número de usuarios registrados</p>
          <TopListCard
            items={(data.top_universities ?? []).map((u) => ({
              label: u.name,
              sublabel: [u.city, u.comunidad_autonoma].filter(Boolean).join(" · "),
              count: u.user_count,
            }))}
            emptyLabel="Aún sin universidades asignadas a usuarios"
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Carreras deseadas
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Personas que han elegido cada carrera como objetivo. No incluye recomendaciones del test ni la carrera que ya estudian.
          </p>
          <TopListCard
            items={(data.top_careers ?? []).map((c) => ({
              label: c.name ?? "Sin nombre",
              sublabel: c.branch ?? undefined,
              count: c.desired_count,
            }))}
            emptyLabel="Aún sin señal de carreras"
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-warning" strokeWidth={1.75} />
            Top ciudades
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Personas del filtro y alojamientos del catálogo global
          </p>
          <TopListCard
            items={(data.top_cities ?? []).map((c) => ({
              label: c.city === "sin_dato" ? "Sin especificar" : c.city,
              sublabel: `${c.accommodation_count} alojamientos en el catálogo`,
              count: c.user_count,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
