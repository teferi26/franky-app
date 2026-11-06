import { Skeleton, SkeletonCard, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto con la silueta del listado de universidades (cabecera editorial,
// buscador, chips y rejilla). Sin él, al navegar aquí la pantalla anterior se
// quedaba congelada hasta que el servidor terminaba la consulta.
export default function UniversidadesLoading() {
  return (
    <SkeletonPage label="Cargando universidades" className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Skeleton className="h-3 w-24 rounded-md" />
          <SkeletonHero className="mt-4" />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 w-full sm:w-44" />
            <Skeleton className="h-11 w-full sm:w-44" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-4 w-48 rounded-md" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
