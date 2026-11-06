import {
  PartyPopper, BookOpen, Trophy, Drama, Handshake, Building2, Pin, CalendarDays,
  type LucideIcon,
} from "lucide-react";

/**
 * Categorías de evento con su icono de lucide. Antes cada componente
 * (tarjeta, filtros, "mis eventos") llevaba su propio mapa de EMOJIS: se
 * pintan distinto en cada sistema, no se tintan con la marca y en oscuro
 * chillan. Un solo mapa, iconos vectoriales que heredan el color.
 */
export const EVENT_CATEGORIES: Record<string, { label: string; plural: string; icon: LucideIcon }> = {
  fiesta: { label: "Fiesta", plural: "Fiestas", icon: PartyPopper },
  academico: { label: "Académico", plural: "Académico", icon: BookOpen },
  deportivo: { label: "Deportivo", plural: "Deportivo", icon: Trophy },
  cultural: { label: "Cultural", plural: "Cultural", icon: Drama },
  networking: { label: "Networking", plural: "Networking", icon: Handshake },
  feria: { label: "Feria", plural: "Ferias", icon: Building2 },
  otro: { label: "Otro", plural: "Otros", icon: Pin },
};

export const EVENT_CATEGORY_ORDER = [
  "fiesta", "academico", "deportivo", "cultural", "networking", "feria", "otro",
] as const;

export function eventCategory(key: string | null | undefined) {
  return (key && EVENT_CATEGORIES[key]) || { label: "Evento", plural: "Eventos", icon: CalendarDays };
}
