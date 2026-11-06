import { BookOpen } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function CarreraNotFound() {
  return (
    <RouteNotFound
      icon={BookOpen}
      title="No encontramos esta carrera"
      description="Puede que el enlace esté mal escrito. Búscala por nota de corte y universidad."
      primary={{ href: "/notas-corte", label: "Buscar por nota de corte" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
