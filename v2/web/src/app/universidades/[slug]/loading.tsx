import { Skeleton, SkeletonText, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de la ficha de universidad con su silueta real: cabecera en dos
// columnas (texto y foto en marco), fila de cifras, pestañas y dos columnas de
// contenido. Rendimiento (sep-2026): la ficha resuelve varias consultas en el
// servidor; mientras llegan, el visitante ve la estructura en vez de una
// pantalla congelada.
export default function UniversidadLoading() {
  return (
    <SkeletonPage label="Cargando universidad" className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Skeleton className="h-4 w-64 max-w-full rounded-md" />
          <div className="mt-8 grid gap-10 pb-10 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pb-14">
            <div className="lg:col-span-6">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
              <Skeleton className="mt-5 h-12 w-4/5" />
              <Skeleton className="mt-3 h-12 w-3/5" />
              <Skeleton className="mt-4 h-4 w-72 max-w-full rounded-md" />
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Skeleton className="h-12 w-full sm:w-64" />
                <Skeleton className="h-12 w-full sm:w-44" />
              </div>
            </div>
            <Skeleton className="aspect-[4/3] w-full rounded-3xl lg:col-span-6" />
          </div>
          <div className="grid grid-cols-2 gap-6 border-t border-border-light py-8 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="mt-2 h-3 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Skeleton className="h-11 w-80 max-w-full" />
            <Skeleton className="mt-8 h-3 w-32 rounded-md" />
            <SkeletonText lines={5} className="mt-4 max-w-3xl" />
            <Skeleton className="mt-12 h-3 w-24 rounded-md" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
          <div className="space-y-6 lg:col-span-4">
            <div className="rounded-2xl border border-border p-6">
              <Skeleton className="h-5 w-24" />
              <SkeletonText lines={4} className="mt-4" />
              <Skeleton className="mt-5 h-10 w-full" />
            </div>
            <div className="rounded-2xl border border-border p-6">
              <Skeleton className="h-5 w-24" />
              <SkeletonText lines={2} className="mt-4" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
