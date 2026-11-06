import { MapPin, Users, Sparkles, Shirt } from "lucide-react";
import { eventCategory } from "./event-category";
import Image from "next/image";
import Link from "next/link";
import EventFavoriteButton from "./event-favorite-button";
import { SpotlightCard } from "@/components/motion";
import { MADRID_TZ } from "@/lib/event-time";
import { cn } from "@/lib/utils";

export interface EventData {
  id: string;
  title: string;
  description: string | null;
  city: string;
  venue: string | null;
  address: string | null;
  start_date: string;
  end_date: string | null;
  category: string;
  price: number | null;
  max_capacity: number | null;
  image_url: string | null;
  is_featured: boolean | null;
  status: string | null;
  show_participant_count?: boolean | null;
  participant_count?: number;
  /** Evento Franky: lo organiza el equipo (migración 164, lo pone la BD). */
  is_official?: boolean | null;
  /** El evento reparte camisetas y pregunta la talla al apuntarse (164). */
  shirts_enabled?: boolean | null;
  price_without_shirt?: number | null; price_with_shirt?: number | null;
}

/** Distintivo de evento organizado por el equipo de Franky (sólido, sin degradado). */
export function OfficialChip({ small = false }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-text-primary font-semibold text-bg-primary",
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      )}
    >
      <Sparkles className={small ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden="true" /> Evento Franky
    </span>
  );
}

/**
 * Tarjeta de evento (v3 Editorial). Foto en marco con zoom lento, fecha en
 * bloque tipográfico (día grande, mes en rótulo) y precio en cifras tabulares.
 * Va envuelta en SpotlightCard: foco de luz al pasar el ratón sin re-renders.
 */
export default function EventCard({ event, variant = "default" }: { event: EventData; variant?: "default" | "featured" }) {
  const start = new Date(event.start_date);
  const isPast = start < new Date();
  const cat = eventCategory(event.category);
  const CatIcon = cat.icon;
  const isFree = !event.price || event.price === 0;
  const capacityPct = event.max_capacity && event.participant_count != null
    ? Math.min((event.participant_count / event.max_capacity) * 100, 100)
    : null;
  const isFull = capacityPct !== null && capacityPct >= 100;

  const dayNum = start.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, day: "numeric" });
  const monthShort = start.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, month: "short" }).replace(".", "");
  const weekday = start.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, weekday: "short" }).replace(".", "");
  const timeStr = start.toLocaleTimeString("es-ES", { timeZone: MADRID_TZ, hour: "2-digit", minute: "2-digit" });
  const priceLabel = isFree
    ? "Gratis"
    : `${event.price_without_shirt != null ? "Desde " : ""}${Number(event.price).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`;
  const featured = variant === "featured";

  return (
    <SpotlightCard asChild>
      <Link
        href={`/eventos/${event.id}`}
        className={cn(
          "group hover-lift relative flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2",
          featured && "w-[300px] shrink-0 sm:w-[340px]",
          isPast && "opacity-80"
        )}
      >
        {/* Foto en marco. Sin velo oscuro: el texto va debajo, no encima. */}
        <div className={cn("img-zoom relative bg-bg-secondary", featured ? "aspect-[4/3]" : "aspect-[16/10]")}>
          {event.image_url ? (
            <Image
              src={event.image_url}
              alt={event.title}
              fill
              className="object-cover"
              sizes={featured ? "340px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <CatIcon className="h-8 w-8 text-text-muted/50" aria-hidden="true" />
            </div>
          )}
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {event.is_featured && (
              <span className="rounded-full bg-bg-primary/95 px-2.5 py-1 text-[11px] font-semibold text-text-primary shadow-card">
                Destacado
              </span>
            )}
            <EventFavoriteButton eventId={event.id} />
          </div>
          {isPast && (
            <span className="absolute bottom-3 left-3 rounded-full bg-bg-primary/95 px-2.5 py-1 text-[11px] font-semibold text-text-muted shadow-card">
              Finalizado
            </span>
          )}
        </div>

        <div className="flex flex-1 gap-4 p-4">
          {/* Fecha como bloque tipográfico */}
          <div className="flex w-12 shrink-0 flex-col items-center border-r border-border-light pr-4 pt-0.5">
            <span className="font-heading text-[26px] font-extrabold leading-none tracking-tight text-text-primary tabular">
              {dayNum}
            </span>
            <span className="eyebrow mt-1 text-[10px]">{monthShort}</span>
            <span className="mt-0.5 text-[10px] text-text-muted">{weekday}</span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet">
              <span className="inline-flex items-center gap-1">
                <CatIcon className="h-3 w-3" aria-hidden="true" /> {cat.label}
              </span>
              {event.is_official && <OfficialChip small />}
            </p>
            <h3 className={cn(
              "mt-1.5 line-clamp-2 font-heading font-bold leading-snug text-text-primary transition-colors duration-200 group-hover:text-violet",
              featured ? "text-base" : "text-[15px]"
            )}>
              {event.title}
            </h3>
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-[13px] text-text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{event.venue ? `${event.venue}, ${event.city}` : event.city}</span>
            </p>

            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
              <span className="text-[13px] text-text-muted tabular">{timeStr} h</span>
              <span className={cn("font-heading text-sm font-bold tabular", isFree ? "text-success" : "text-text-primary")}>
                {priceLabel}
              </span>
            </div>

            {(event.shirts_enabled || (event.max_capacity && capacityPct !== null && event.show_participant_count !== false)) && (
              <div className="mt-3 flex items-center gap-3 border-t border-border-light pt-3">
                {event.shirts_enabled && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary">
                    <Shirt className="h-3 w-3 text-violet" aria-hidden="true" /> Camiseta
                  </span>
                )}
                {/* Barra de aforo, solo cuando el organizador la enseña */}
                {event.max_capacity && capacityPct !== null && event.show_participant_count !== false && (
                  <div className="flex flex-1 items-center gap-2">
                    <Users className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />
                    <div className="h-1 flex-1 rounded-full bg-bg-tertiary">
                      <div
                        className={cn("h-1 rounded-full", capacityPct >= 90 ? "bg-error" : capacityPct >= 70 ? "bg-warning" : "bg-success")}
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] text-text-muted tabular">
                      {event.participant_count}/{event.max_capacity}
                      {isFull && " · Lleno"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </SpotlightCard>
  );
}
