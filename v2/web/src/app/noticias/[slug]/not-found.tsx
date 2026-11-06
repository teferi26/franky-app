import { Newspaper } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function NoticiaNotFound() {
  return (
    <RouteNotFound
      icon={Newspaper}
      title="No encontramos este artículo"
      description="Puede que lo hayamos movido o que el enlace esté mal. Mira lo último que hemos publicado."
      primary={{ href: "/noticias", label: "Ver todas las noticias" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
