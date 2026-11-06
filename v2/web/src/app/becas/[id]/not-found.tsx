import { GraduationCap } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function BecaNotFound() {
  return (
    <RouteNotFound
      icon={GraduationCap}
      title="No encontramos esta beca"
      description="Puede que la convocatoria haya cerrado o que el enlace esté mal. Busca las que siguen abiertas."
      primary={{ href: "/becas", label: "Ver todas las becas" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
