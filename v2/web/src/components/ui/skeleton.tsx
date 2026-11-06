import { cn } from "@/lib/utils";

// Bloque de carga (v3): brillo que recorre el bloque en vez de parpadeo. Las
// piezas de abajo son las siluetas que se repiten en los loading.tsx.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-xl", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Varias líneas de texto de anchos distintos, como un párrafo. */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"];
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3 rounded-md", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** Tarjeta de catálogo: imagen arriba, título y dos líneas. */
function SkeletonCard({ withImage = true, className }: { withImage?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card",
        className
      )}
      aria-hidden="true"
    >
      {withImage && <Skeleton className="h-40 w-full rounded-none" />}
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}

/** Cabecera de página de catálogo: título grande y subtítulo. */
function SkeletonHero({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full rounded-lg" />
    </div>
  );
}

/**
 * Envoltorio con semántica de carga. Un lector de pantalla anuncia "Cargando"
 * una vez; el esqueleto de dentro va con aria-hidden porque son cajas vacías.
 */
function SkeletonPage({
  label = "Cargando",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn("animate-fade-in", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonHero, SkeletonPage };
