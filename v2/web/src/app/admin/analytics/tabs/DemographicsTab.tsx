"use client";

import { Users, Heart, Home as HomeIcon, Building2, ShieldCheck } from "lucide-react";
import DistributionPieChart from "../components/DistributionPieChart";
import DistributionBarChart from "../components/DistributionBarChart";
import KpiCard from "../components/KpiCard";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";

type UsersResponse = {
  demographics: {
    total: number;
    by_gender: { label: string; count: number }[];
    by_age_bucket: { label: string; count: number }[];
    by_comunidad: { label: string; count: number }[];
    by_student_type: { label: string; count: number }[];
    by_year: { label: string; count: number }[];
    by_intent: {
      looking_housing: number;
      looking_roommate: number;
      is_propietario: number;
      student_verified: number;
    };
  };
};

const GENDER_LABEL: Record<string, string> = {
  hombre: "Hombre",
  mujer: "Mujer",
  no_binario: "No binario",
  prefiero_no_decirlo: "Prefiere no decir",
  sin_dato: "Sin especificar",
};

const STUDENT_TYPE_LABEL: Record<string, string> = {
  bachillerato: "Bachillerato",
  fp: "FP",
  universidad: "Universidad",
  master: "Máster",
  otro: "Otro",
  sin_dato: "Sin especificar",
};

export default function DemographicsTab() {
  const { queryString } = useAnalyticsFilters();
  const { data, loading, error, refetch } = useAnalyticsQuery<UsersResponse>(
    `/api/admin/analytics/users?${queryString}`
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-72 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
        ))}
      </div>
    );
  }
  if (error) return <EmptyDataState title="Error al cargar" hint={error} onRetry={refetch} />;
  if (!data?.demographics) return <EmptyDataState />;

  const d = data.demographics;

  return (
    <div className="space-y-6">
      {/* Intent KPIs */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="Buscan piso"
          value={d.by_intent.looking_housing}
          caption={d.total > 0 ? `${Math.round((d.by_intent.looking_housing / d.total) * 100)}% del total` : undefined}
        />
        <KpiCard
          label="Buscan roomie"
          value={d.by_intent.looking_roommate}
          caption={d.total > 0 ? `${Math.round((d.by_intent.looking_roommate / d.total) * 100)}%` : undefined}
        />
        <KpiCard
          label="Propietarios"
          value={d.by_intent.is_propietario}
        />
        <KpiCard
          label="Email univ. verificado"
          value={d.by_intent.student_verified}
          caption={d.total > 0 ? `${Math.round((d.by_intent.student_verified / d.total) * 100)}%` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Distribución por género
          </h3>
          <DistributionPieChart
            data={d.by_gender}
            labelFormatter={(l) => GENDER_LABEL[l] ?? l}
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Distribución por edad
          </h3>
          <DistributionBarChart data={d.by_age_bucket} horizontal={false} height={260} />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5 lg:col-span-2">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet" strokeWidth={1.75} />
            Distribución por comunidad autónoma
          </h3>
          <DistributionBarChart
            data={d.by_comunidad.map((c) => ({
              ...c,
              label: c.label === "sin_dato" ? "Sin especificar" : c.label,
            }))}
            horizontal
            height={Math.min(380, Math.max(200, d.by_comunidad.length * 28))}
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-success" strokeWidth={1.75} />
            Tipo de estudiante
          </h3>
          <DistributionPieChart
            data={d.by_student_type}
            labelFormatter={(l) => STUDENT_TYPE_LABEL[l] ?? l}
          />
        </div>

        <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
          <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <HomeIcon className="w-4 h-4 text-warning" strokeWidth={1.75} />
            Año (universidad)
          </h3>
          <DistributionBarChart
            data={d.by_year
              .filter((y) => y.label !== "sin_dato")
              .map((y) => ({ ...y, label: `${y.label}º` }))}
            horizontal={false}
            height={260}
          />
        </div>
      </div>

      <div className="text-xs text-text-muted text-center">
        Población filtrada: <strong>{d.total.toLocaleString("es-ES")}</strong> usuarios · Sin contar cuentas eliminadas
      </div>
    </div>
  );
}
