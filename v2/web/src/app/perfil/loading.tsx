import { Skeleton, SkeletonText, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de /perfil (y de sus subpáginas): tarjeta de identidad arriba y
// secciones debajo. Rendimiento (sep-2026): la página de perfil es un
// componente de cliente de 1.600 líneas; su chunk se descarga al navegar y,
// hasta ahora, la pantalla anterior se quedaba congelada mientras tanto.
export default function PerfilLoading() {
  return (
    <SkeletonPage label="Cargando perfil" className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full sm:h-28 sm:w-28" />
            <div className="w-full space-y-3">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-9 w-64 max-w-full rounded" />
              <Skeleton className="h-4 w-44 rounded" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-2xl space-y-8 px-4 pb-20 pt-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
            <Skeleton className="mb-4 h-5 w-40 rounded" />
            <SkeletonText lines={3} />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
