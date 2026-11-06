import { Skeleton, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de /crush: cabecera, pestañas y tarjetas del muro. Rendimiento
// (sep-2026): el servidor comprueba sesión y rol antes de pintar; este
// esqueleto cubre esa espera y la descarga del chunk de la sección.
export default function CrushLoading() {
  return (
    <SkeletonPage label="Cargando Crush" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <SkeletonHero className="mb-6" />
        <div className="mb-6 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="mb-6 h-28 w-full rounded-2xl" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border-light bg-bg-primary p-5 shadow-card">
              <div className="mb-4 flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="mt-2 h-4 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
