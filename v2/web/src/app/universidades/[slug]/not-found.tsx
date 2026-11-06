import { Building2 } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function UniversidadNotFound() {
  return (
    <RouteNotFound
      icon={Building2}
      title="No encontramos esta universidad"
      description="Puede que el enlace esté mal escrito. Están todas en el listado."
      primary={{ href: "/universidades", label: "Ver todas las universidades" }}
      secondary={{ href: "/notas-corte", label: "Ver notas de corte" }}
    />
  );
}
