import { Skeleton, SkeletonCard, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto del catálogo de pisos: cabecera, filtros y rejilla de anuncios.
// Rendimiento (sep-2026): aparece al instante al navegar y lo sustituye el
// listado real cuando el servidor lo tiene. Misma silueta que la página real
// (cabecera editorial con el buscador dentro) para que no salte el layout.
export default function AlojamientoLoading() {
  return (
    <SkeletonPage label="Cargando alojamientos" className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <Skeleton className="mb-4 h-3 w-24 rounded" />
          <SkeletonHero />
          <div className="mt-8 rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11 w-full lg:w-28" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <Skeleton className="mb-5 h-4 w-40 rounded" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
