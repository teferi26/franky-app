import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

// Esqueleto de /chats: lista de conversaciones a la izquierda y panel del
// chat a la derecha. Rendimiento (sep-2026): el chat es la ruta con el bundle
// de cliente más grande de la web (2.000 líneas más framer-motion) y solo se
// descarga al entrar aquí; este esqueleto cubre esa descarga y la carga de
// la lista para que la entrada no parezca colgada.
export default function ChatsLoading() {
  return (
    <SkeletonPage label="Cargando chats" className="min-h-[calc(100vh-5rem)] bg-bg-secondary">
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl gap-0 px-0 sm:px-6 sm:py-6 lg:px-8">
        <div className="w-full border-r border-border bg-bg-primary sm:w-80 sm:rounded-l-2xl">
          <div className="border-b border-border-light p-4">
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden flex-1 flex-col bg-bg-primary sm:flex sm:rounded-r-2xl">
          <div className="flex items-center gap-3 border-b border-border-light p-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
          <div className="flex-1 space-y-4 p-6">
            <Skeleton className="h-10 w-1/2 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
            <Skeleton className="h-16 w-3/5 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
          </div>
          <div className="border-t border-border-light p-4">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
