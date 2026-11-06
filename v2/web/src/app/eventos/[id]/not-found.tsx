import { CalendarDays } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function EventoNotFound() {
  return (
    <RouteNotFound
      icon={CalendarDays}
      title="Este evento ya no está"
      description="Puede que se haya cancelado o que el enlace esté mal. Mira lo que hay esta semana en tu campus."
      primary={{ href: "/eventos", label: "Ver todos los eventos" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
