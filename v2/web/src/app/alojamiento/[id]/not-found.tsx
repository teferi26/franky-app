import { Home } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function PisoNotFound() {
  return (
    <RouteNotFound
      icon={Home}
      title="Este anuncio ya no está"
      description="Puede que se haya alquilado o que el enlace esté mal. Aquí tienes el resto de pisos."
      primary={{ href: "/alojamiento", label: "Ver todos los pisos" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
