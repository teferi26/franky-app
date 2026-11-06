import { Skeleton, SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

// Esqueleto del hilo de FOMO: mensaje de cabecera y respuestas. Es la pantalla
// donde aterriza el tráfico de los enlaces compartidos en Instagram, así que el
// primer pintado tiene que enseñar la silueta y no una pantalla vacía.
export default function HiloFomoLoading() {
  return (
    <SkeletonPage label="Cargando el hilo" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-2xl px-4 py-5">
        <Skeleton className="mb-5 h-4 w-24 rounded" />
        <div className="rounded-2xl border border-border-light bg-bg-primary p-5 shadow-card">
          <div className="mb-3 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          </div>
          <SkeletonText lines={3} />
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border-light bg-bg-primary p-4 shadow-card"
            >
              <div className="mb-2 flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
