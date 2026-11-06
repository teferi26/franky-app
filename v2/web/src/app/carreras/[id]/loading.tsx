import { Skeleton, SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

// Esqueleto de la ficha de carrera. Es una página pública con ISR (revalidate
// 3600), pero la primera visita tras revalidar sí espera al servidor: sin este
// esqueleto la navegación desde /notas-corte se quedaba en blanco.
export default function CarreraLoading() {
  return (
    <SkeletonPage label="Cargando la carrera" className="min-h-screen overflow-x-clip bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Skeleton className="h-4 w-56" />
          <div className="mt-8 max-w-3xl">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-5 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-2/3" />
            <Skeleton className="mt-4 h-5 w-64" />
            <div className="mt-8 flex flex-wrap gap-3">
              <Skeleton className="h-12 w-72 rounded-xl" />
              <Skeleton className="h-12 w-44 rounded-xl" />
            </div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-border-light py-8 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-9 w-24" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-bg-primary p-6 sm:p-8">
                <Skeleton className="mb-4 h-7 w-56" />
                <SkeletonText lines={4} />
              </div>
            ))}
          </div>
          <div className="space-y-6 lg:col-span-4">
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
