import { Users } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function ComunidadNotFound() {
  return (
    <RouteNotFound
      icon={Users}
      title="No encontramos esta comunidad"
      description="Puede que sea privada o que el enlace esté mal. Estas son las comunidades abiertas de tu campus."
      primary={{ href: "/comunidades", label: "Ver comunidades" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
