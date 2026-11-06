"use client";

import Image from "next/image";
import Link from "next/link";
import { Home, MapPin, Bed, Bath, Scale, Check } from "lucide-react";
import { SpotlightCard } from "@/components/motion";
import { cn } from "@/lib/utils";
import { useComparison } from "./comparison-context";

export interface AccommodationData {
  id: string;
  title: string;
  type: string | null;
  price: number | null;
  city: string | null;
  address: string | null;
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  is_furnished: boolean | null;
  bills_included: boolean | null;
  has_wifi: boolean | null;
  has_air_conditioning: boolean | null;
  has_heating: boolean | null;
  has_elevator: boolean | null;
  has_parking: boolean | null;
  has_terrace: boolean | null;
  has_washing_machine: boolean | null;
  has_pool: boolean | null;
  has_gym: boolean | null;
  pets_allowed: boolean | null;
  gender_preference?: string | null;
  images: string[] | null;
  status: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
}

const TYPE_LABELS: Record<string, string> = {
  piso_completo: "Piso completo",
  habitacion: "Habitación",
  estudio: "Estudio",
  residencia: "Residencia",
};

/**
 * Tarjeta del catálogo (v3): foto en marco con zoom lento, precio en cifra
 * tabular grande y metadatos en gris. Acepta `className`, `style` y atributos
 * data-* para poder ir dentro de `<RevealItem asChild>` sin un div extra.
 */
export default function AccommodationCard({
  acc,
  className,
  ...rest
}: { acc: AccommodationData } & React.HTMLAttributes<HTMLDivElement>) {
  const { toggleSelection, isSelected, isFull } = useComparison();
  const selected = isSelected(acc.id);
  const disabled = !selected && isFull;

  const destacadas = [
    acc.is_furnished && "Amueblado",
    acc.bills_included && "Gastos incluidos",
    acc.has_wifi && "Wifi",
    acc.has_air_conditioning && "Aire acond.",
    acc.has_heating && "Calefacción",
    acc.has_elevator && "Ascensor",
    acc.has_parking && "Parking",
    acc.has_terrace && "Terraza",
    acc.has_washing_machine && "Lavadora",
    acc.has_pool && "Piscina",
    acc.has_gym && "Gimnasio",
    acc.pets_allowed && "Mascotas",
  ].filter((v): v is string => typeof v === "string");

  return (
    <SpotlightCard
      className={cn(
        "group hover-lift relative flex flex-col overflow-hidden rounded-2xl border bg-bg-primary shadow-card",
        selected ? "border-violet ring-2 ring-violet/20" : "border-border hover:border-text-primary/15",
        className
      )}
      {...rest}
    >
      {/* Foto en marco con zoom lento al pasar el ratón. */}
      <div className="img-zoom relative aspect-[4/3] bg-bg-secondary">
        <Link href={`/alojamiento/${acc.id}`} className="block h-full" tabIndex={-1} aria-hidden="true">
          {acc.images && acc.images[0] ? (
            <Image
              src={acc.images[0]}
              alt={acc.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Home className="h-8 w-8 text-text-muted/40" />
            </div>
          )}
        </Link>

        {/* Comparar: chip blanco en reposo, oscuro al añadir. */}
        <button
          type="button"
          onClick={() => toggleSelection(acc.id)}
          disabled={disabled}
          aria-pressed={selected}
          aria-label={selected ? "Quitar del comparador" : "Añadir al comparador"}
          title={disabled ? "Máximo 4 para comparar" : selected ? "Quitar del comparador" : "Añadir al comparador"}
          className={cn(
            "absolute left-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-card transition-[background-color,color,border-color,transform] duration-200 active:scale-95",
            selected
              ? "border-text-primary bg-text-primary text-bg-primary"
              : disabled
                ? "cursor-not-allowed border-border bg-bg-primary/80 text-text-muted"
                : "border-border bg-bg-primary/95 text-text-primary hover:border-text-primary/40"
          )}
        >
          {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Scale className="h-3.5 w-3.5" />}
          <span>{selected ? "Añadido" : "Comparar"}</span>
        </button>

        {/* Anuncio dirigido a un perfil: se dice claramente en vez de ocultarlo */}
        {(acc.gender_preference === "hombre" || acc.gender_preference === "mujer") && (
          <span className="absolute bottom-3 left-3 rounded-full bg-text-primary/85 px-2.5 py-1 text-[11px] font-semibold text-bg-primary backdrop-blur">
            {acc.gender_preference === "mujer" ? "Solo chicas" : "Solo chicos"}
          </span>
        )}
      </div>

      {/* Cuerpo: el enlace principal cubre el texto entero. */}
      <Link href={`/alojamiento/${acc.id}`} className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{TYPE_LABELS[acc.type ?? ""] ?? (acc.type || "").replace("_", " ")}</p>
            <h3 className="mt-1.5 line-clamp-1 font-heading text-[17px] font-bold text-text-primary transition-colors group-hover:text-violet">
              {acc.title}
            </h3>
          </div>
          <p className="shrink-0 text-right font-heading text-2xl font-extrabold tracking-tight text-text-primary tabular">
            {acc.price != null ? Number(acc.price).toLocaleString("es-ES") : "?"}
            <span className="ml-0.5 text-xs font-semibold text-text-muted">€/mes</span>
          </p>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {acc.city}
            {acc.address ? ` · ${acc.address}` : ""}
          </span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-light pt-4 text-[13px] text-text-secondary">
          {acc.rooms ? (
            <span className="inline-flex items-center gap-1.5">
              <Bed className="h-4 w-4 text-text-muted" /> {acc.rooms} hab.
            </span>
          ) : null}
          {acc.bathrooms ? (
            <span className="inline-flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-text-muted" /> {acc.bathrooms} baño{acc.bathrooms > 1 ? "s" : ""}
            </span>
          ) : null}
          {acc.sqm ? <span className="tabular">{acc.sqm} m²</span> : null}
        </div>

        {/* Las características salen de las COLUMNAS booleanas, que es lo que
            rellena el alta. Antes se pintaba `amenities`, un array heredado que
            el formulario nunca escribe: por eso las tarjetas no enseñaban
            ninguna característica aunque el piso tuviera wifi, terraza… */}
        {destacadas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {destacadas.slice(0, 3).map((a) => (
              <span key={a} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-text-secondary">
                {a}
              </span>
            ))}
            {destacadas.length > 3 && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-text-muted">
                +{destacadas.length - 3}
              </span>
            )}
          </div>
        )}
      </Link>
    </SpotlightCard>
  );
}
