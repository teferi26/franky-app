import { ShoppingBag } from "lucide-react";
import { RouteNotFound } from "@/components/ui/route-not-found";

// 404 de sección: cuando la ficha no existe se ofrece volver al listado en vez
// de echar a la persona al inicio, que era lo que hacía el 404 global.
export default function ProductoNotFound() {
  return (
    <RouteNotFound
      icon={ShoppingBag}
      title="Este anuncio ya no está"
      description="Puede que se haya vendido o que el enlace esté mal. Mira lo que hay ahora en el mercado."
      primary={{ href: "/mercado", label: "Ver el mercado" }}
      secondary={{ href: "/", label: "Ir al inicio" }}
    />
  );
}
