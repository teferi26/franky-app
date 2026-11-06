import { Skeleton, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de la agenda: cabecera, pestañas y la parrilla de la semana.
// Rendimiento (sep-2026): la agenda lee horario, exámenes y entregas en el
// servidor con la sesión; mientras tanto se enseña su silueta.
export default function AgendaLoading() {
  return (
    <SkeletonPage label="Cargando agenda" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <SkeletonHero />
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
        <div className="mb-6 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-full" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border-light bg-bg-primary p-4 shadow-card">
              <Skeleton className="mb-4 h-4 w-20 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
