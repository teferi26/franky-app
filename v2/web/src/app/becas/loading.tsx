import { Skeleton, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de /becas: misma silueta que el explorador (cabecera editorial,
// buscador, dos filas de chips y la rejilla de tarjetas). Rendimiento
// (sep-2026): al enviar el formulario la página se vuelve a renderizar en el
// servidor; sin esto el botón parecía no hacer nada durante la espera.
export default function BecasLoading() {
  return (
    <SkeletonPage label="Cargando becas" className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <Skeleton className="mb-4 h-3 w-40 rounded" />
          <SkeletonHero />
          <Skeleton className="mt-8 h-12 w-56 rounded-xl" />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20 pt-10">
        <Skeleton className="h-7 w-52 rounded-md" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full rounded" />
        <Skeleton className="mt-6 h-11 w-full max-w-xl" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <Skeleton className="mt-4 h-5 w-4/5 rounded-md" />
              <Skeleton className="mt-2 h-3 w-1/2 rounded" />
              <Skeleton className="mt-4 h-3 w-full rounded" />
              <Skeleton className="mt-1.5 h-3 w-5/6 rounded" />
              <Skeleton className="mt-6 h-8 w-32 rounded-md" />
              <Skeleton className="mt-5 h-9 w-44 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
