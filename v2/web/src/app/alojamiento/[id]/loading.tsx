import { Skeleton, SkeletonText, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de la ficha de un piso: galería arriba, detalle a la izquierda y
// tarjeta de contacto a la derecha. Rendimiento (sep-2026): la ficha es
// dinámica (depende de la sesión), así que no se puede servir de caché; lo
// que sí se puede es enseñar su silueta mientras llega.
export default function AlojamientoDetalleLoading() {
  return (
    <SkeletonPage label="Cargando alojamiento" className="min-h-screen bg-bg-primary pb-28 lg:pb-12">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Skeleton className="mb-6 h-4 w-32 rounded" />
        <Skeleton className="mb-3 h-3 w-24 rounded" />
        <Skeleton className="mb-8 h-10 w-3/4 sm:h-12" />
        <Skeleton className="h-64 w-full rounded-3xl sm:h-80 lg:h-[26rem]" />
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div>
              <Skeleton className="mb-3 h-8 w-3/4" />
              <Skeleton className="h-4 w-48 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <Skeleton className="mb-4 h-5 w-40 rounded" />
              <SkeletonText lines={5} />
            </div>
            <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <Skeleton className="mb-4 h-5 w-32 rounded" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <Skeleton className="mb-2 h-8 w-32" />
              <Skeleton className="mb-6 h-4 w-24 rounded" />
              <Skeleton className="mb-3 h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
