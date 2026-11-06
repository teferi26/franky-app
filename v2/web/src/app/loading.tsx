import { Skeleton, SkeletonCard, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Carga raíz (v3): silueta de una página de catálogo con brillo que la
// recorre, en vez de un spinner en medio de la nada. Un lector de pantalla
// anuncia "Cargando" una vez (SkeletonPage); las cajas van con aria-hidden.
const CHIPS = ["w-24", "w-20", "w-28", "w-16"];

export default function Loading() {
  return (
    <SkeletonPage label="Cargando Franky" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Skeleton className="h-3 w-40 rounded-md" />
      <SkeletonHero className="mt-4" />
      <div className="mt-8 flex gap-2">
        {CHIPS.map((w) => (
          <Skeleton key={w} className={`h-9 rounded-full ${w}`} />
        ))}
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-list-in" style={{ ["--i" as string]: i }}>
            <SkeletonCard />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
