import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de /notas-corte: cabecera tipográfica, las cuatro cifras y el
// listado. Rendimiento (sep-2026): es la página con más tráfico orgánico y la
// que más datos mueve; mientras el servidor los sirve, el visitante ve ya la
// forma de la página en lugar de esperar delante de la anterior.
export default function NotasCorteLoading() {
  return (
    <SkeletonPage label="Cargando notas de corte" className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-16">
            <div className="lg:col-span-7">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-4 h-12 w-full max-w-lg" />
              <Skeleton className="mt-3 h-12 w-full max-w-md" />
              <Skeleton className="mt-5 h-5 w-full max-w-xl" />
              <div className="mt-8 flex flex-wrap gap-3">
                <Skeleton className="h-12 w-48 rounded-xl" />
                <Skeleton className="h-12 w-56 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-t border-border-light pt-7 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-9 w-20" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-8 h-28 w-full rounded-2xl" />
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-full sm:w-48" />
          <Skeleton className="h-11 w-full sm:w-40" />
        </div>
        <div className="mt-6 divide-y divide-border-light rounded-2xl border border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
