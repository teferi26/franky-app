"use client";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import TopListCard from "./TopListCard";
import EmptyDataState from "./EmptyDataState";

export type ProductInsightsData = {
  current_careers: { name: string; user_count: number }[];
  screens: { screen: string; platform: string; views: number; users: number }[];
  coverage: { views: number; users: number; first_seen: string | null; last_seen: string | null };
};
const labels: Record<string, string> = { inicio: "Inicio", fomo: "FOMO", fomo_hilo: "Hilos FOMO", crush: "Crush", crush_live: "Crush Live", roomie: "RoomieMatch", roomie_conexiones: "Likes y matches Roomie", carrera_ideal: "CarreraIdeal", notas_corte: "Notas de corte", novedades: "Novedades" };
export default function ProductInsights({ section }: { section: "studies" | "screens" }) {
  const { queryString } = useAnalyticsFilters();
  const { data, loading, error, refetch } = useAnalyticsQuery<ProductInsightsData>(`/api/admin/analytics/product?${queryString}`);
  return <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6">
    <p className="eyebrow">Producto</p>
    <h3 className="mt-2 font-heading text-lg font-bold text-text-primary">{section === "studies" ? "Qué estudian las personas registradas" : "Qué pantallas se utilizan"}</h3>
    <p className="mb-5 mt-1.5 text-xs leading-relaxed text-text-muted">{section === "studies" ? "Carrera actual declarada en el perfil. El periodo filtra la fecha de registro; no incluye recomendaciones ni carreras deseadas. Los nombres libres pueden tener variantes." : "Visitas y personas con medición activada. El periodo filtra la fecha de la visita. Sin historial anterior a esta instrumentación: que una pantalla no aparezca no demuestra que sea inútil."}</p>
    {loading ? <p role="status" className="py-10 text-center text-sm text-text-muted">Cargando datos…</p> : error ? <EmptyDataState title="No se pudieron consultar estos indicadores" hint={error} onRetry={refetch} /> : section === "studies" ? <TopListCard items={(data?.current_careers ?? []).map(row => ({ label: row.name, count: row.user_count }))} emptyLabel="Sin perfiles en este periodo" /> : <>
      <p className="mb-4 text-sm text-text-secondary"><span className="tabular font-semibold text-text-primary">{data?.coverage.users ?? 0}</span> personas medidas · <span className="tabular font-semibold text-text-primary">{data?.coverage.views ?? 0}</span> visitas{data?.coverage.first_seen ? ` · Desde ${new Date(data.coverage.first_seen).toLocaleDateString("es-ES")}` : " · Aún sin datos de navegación"}</p>
      <TopListCard items={(data?.screens ?? []).map(row => ({ label: `${labels[row.screen] ?? row.screen.replaceAll("_", " ")} · ${row.platform}`, sublabel: `${row.users} personas distintas`, count: row.views }))} emptyLabel="Los datos aparecerán al recibir visitas con medición activada" />
    </>}
  </section>;
}
