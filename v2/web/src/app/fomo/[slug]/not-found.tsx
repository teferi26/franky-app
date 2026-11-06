import { Flame } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function FomoNotFound() {
  return (
    <RouteNotFound
      icon={Flame}
      title="No encontramos este campus"
      description="Puede que el enlace esté mal escrito. Elige tu universidad y verás lo que se cuece hoy."
      primary={{ href: "/universidades", label: "Elegir universidad" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
