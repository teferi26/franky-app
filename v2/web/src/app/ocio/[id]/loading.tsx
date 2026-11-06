import { Skeleton, SkeletonText, SkeletonPage } from "@/components/ui/skeleton";

// Silueta de la ficha de un sitio de ocio (v3). Sigue la estructura real de
// page.tsx: cabecera editorial, marco de la foto y dos columnas con la barra
// lateral pegajosa.
export default function LeisureDetailLoading() {
  return (
    <SkeletonPage label="Cargando sitio" className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6 lg:px-8 lg:pt-10 lg:pb-12">
          <Skeleton className="h-4 w-40 rounded-md" />
          <div className="mt-8 max-w-3xl space-y-4">
            <Skeleton className="h-3 w-32 rounded-md" />
            <Skeleton className="h-11 w-[26rem] max-w-full" />
            <Skeleton className="h-5 w-[32rem] max-w-full rounded-lg" />
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <Skeleton className="mt-8 aspect-[16/9] w-full rounded-3xl sm:aspect-[21/9]" />
        <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-3 lg:items-start lg:gap-14">
          <div className="max-w-3xl space-y-10 lg:col-span-2">
            <div className="space-y-4">
              <Skeleton className="h-3 w-24 rounded-md" />
              <SkeletonText lines={5} />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-3 w-28 rounded-md" />
              <Skeleton className="h-[250px] w-full rounded-2xl" />
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="space-y-3 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <Skeleton className="h-3 w-20 rounded-md" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full rounded-md" />
              ))}
              <Skeleton className="mt-3 h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
