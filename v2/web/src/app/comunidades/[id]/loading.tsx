import { Skeleton, SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

// Esqueleto de la comunidad: banner, cabecera y los primeros mensajes. Misma
// silueta que el contenido real para que la entrada no parpadee.
export default function ComunidadLoading() {
  return (
    <SkeletonPage label="Cargando la comunidad" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Skeleton className="mb-6 h-4 w-32 rounded" />
        <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-primary shadow-card">
          <Skeleton className="h-32 w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-7 w-1/2" />
            <SkeletonText lines={2} />
            <Skeleton className="h-11 w-40 rounded-xl" />
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border-light bg-bg-primary p-4 shadow-card"
            >
              <div className="mb-3 flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
