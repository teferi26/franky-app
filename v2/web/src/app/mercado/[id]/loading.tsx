import { Skeleton, SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

// Esqueleto de la ficha del mercado: foto, precio y datos del anuncio. La ruta
// es force-dynamic (depende de la sesión), así que cada entrada espera al
// servidor y sin esqueleto se veía una pantalla vacía.
export default function MercadoDetalleLoading() {
  return (
    <SkeletonPage label="Cargando el anuncio" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Skeleton className="mb-6 h-4 w-24 rounded" />
        <div className="overflow-hidden rounded-2xl border border-border-light bg-bg-primary shadow-card">
          <Skeleton className="h-72 w-full rounded-none" />
          <div className="space-y-3 p-6">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-6 w-28 rounded" />
            <SkeletonText lines={4} />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
