import { Skeleton, SkeletonCard, SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

// Esqueleto del artículo: foto de cabecera, cuerpo del texto y relacionados.
// La silueta reserva el alto de la imagen, así que cuando llega el contenido
// real no hay salto de layout.
export default function NoticiaLoading() {
  return (
    <SkeletonPage label="Cargando la noticia" className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <Skeleton className="mb-6 h-4 w-28 rounded" />
        <Skeleton className="mb-8 h-64 w-full rounded-2xl sm:h-80" />
        <Skeleton className="mb-4 h-9 w-4/5" />
        <SkeletonText lines={5} className="mb-8" />
        <SkeletonText lines={5} />
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
