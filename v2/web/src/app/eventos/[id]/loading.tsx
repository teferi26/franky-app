import { Skeleton, SkeletonText, SkeletonPage } from "@/components/ui/skeleton";

// Silueta de la ficha de evento (v3). Copia la estructura real de page.tsx:
// cabecera editorial con el bloque de fecha, marco de la foto y dos columnas.
// Si el esqueleto no coincide con lo que llega despues, la pagina "salta".
export default function EventDetailLoading() {
  return (
    <SkeletonPage label="Cargando evento" className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6 lg:px-8 lg:pt-10 lg:pb-12">
          <Skeleton className="h-4 w-40 rounded-md" />
          <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex gap-6">
              {/* Bloque tipografico de la fecha */}
              <div className="hidden shrink-0 flex-col items-center gap-2 border-r border-border-light pr-6 sm:flex">
                <Skeleton className="h-12 w-14" />
                <Skeleton className="h-3 w-10 rounded-md" />
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <Skeleton className="h-3 w-28 rounded-md" />
                <Skeleton className="h-11 w-[28rem] max-w-full" />
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <Skeleton className="h-4 w-44 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-4 w-36 rounded-md" />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-10 w-32 rounded-xl" />
              <Skeleton className="h-10 w-36 rounded-xl" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <Skeleton className="mt-8 aspect-[16/9] w-full rounded-3xl sm:aspect-[21/9]" />
        <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-3 lg:gap-14">
          <div className="max-w-3xl space-y-10 lg:col-span-2">
            <div className="space-y-4">
              <Skeleton className="h-3 w-32 rounded-md" />
              <SkeletonText lines={5} />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-3 w-28 rounded-md" />
              <SkeletonText lines={3} />
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="space-y-4 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-32 rounded-md" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <div className="space-y-2.5 pt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-3.5 w-full rounded-md" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
