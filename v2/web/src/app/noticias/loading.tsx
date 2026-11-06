import { SkeletonCard, SkeletonHero, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de /noticias: cabecera y rejilla de artículos.
export default function NoticiasLoading() {
  return (
    <SkeletonPage label="Cargando noticias" className="min-h-screen bg-bg-primary">
      <div className="border-b border-border-light py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SkeletonHero />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14 pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
