import { Skeleton, SkeletonHero, SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

// Esqueleto de la ficha de beca: cabecera tipográfica con cifras clave, los
// bloques de requisitos y la columna lateral con el enlace a la convocatoria.
// Evita el salto en blanco al entrar desde el buscador de /becas mientras el
// servidor resuelve la consulta.
export default function BecaLoading() {
  return (
    <SkeletonPage label="Cargando la beca" className="min-h-screen bg-bg-primary overflow-x-clip">
      <div className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 lg:pt-12 lg:pb-14">
          <Skeleton className="h-4 w-28 rounded" />
          <div className="mt-6 flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <SkeletonHero className="mt-4" />
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-border-light pt-8 sm:grid-cols-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-24 pt-10">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="space-y-12 lg:col-span-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="mt-3 h-7 w-56 rounded-md" />
                <SkeletonText lines={4} className="mt-5" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <Skeleton className="h-5 w-28 rounded-md" />
              <SkeletonText lines={4} className="mt-4" />
              <Skeleton className="mt-6 h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
