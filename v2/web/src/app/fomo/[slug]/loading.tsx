import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto del FOMO de una universidad: la fila de historias, el compositor
// y los hilos. Rendimiento (sep-2026): la ruta es dinámica (con sesión se
// sirve el feed real, sin ella la vista previa); mientras el servidor decide
// y el chunk del feed se descarga, el visitante ve ya la forma del muro.
export default function FomoLoading() {
  return (
    <SkeletonPage label="Cargando FOMO" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        <div className="mb-6 flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-2">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          ))}
        </div>
        <Skeleton className="mb-6 h-24 w-full rounded-2xl" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border-light bg-bg-primary p-5 shadow-card">
              <div className="mb-4 flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              </div>
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="mt-2 h-4 w-5/6 rounded" />
              <div className="mt-4 flex gap-4">
                <Skeleton className="h-8 w-16 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
