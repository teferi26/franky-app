import { MapPin } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function SitioNotFound() {
  return (
    <RouteNotFound
      icon={MapPin}
      title="No encontramos este sitio"
      description="Puede que lo hayamos retirado o que el enlace esté mal. Descubre el resto de zonas de ocio."
      primary={{ href: "/ocio", label: "Ver zonas de ocio" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
