import React from "react";
import { Home, MapPin, Check, X, ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createPublicSupabase } from "@/lib/supabase-server";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * Comparador de pisos. Usaba `createServerSupabase` (con cookies), lo que hacía
 * la página dinámica y por sesión sin necesitarlo: aquí no se lee nada del
 * usuario. Con el cliente anónimo y ISR se sirve cacheada, igual que el resto
 * del catálogo (/alojamiento y /universidades/comparar).
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Comparar Alojamientos",
  description: "Compara pisos y residencias lado a lado para encontrar tu alojamiento ideal.",
};

interface Accommodation {
  id: string;
  title: string;
  type: string | null;
  price: number | null;
  city: string | null;
  address: string | null;
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  amenities: string[] | null;
  images: string[] | null;
  available_from: string | null;
  water_included: boolean | null;
  electricity_included: boolean | null;
  has_wifi: boolean | null;
  has_air_conditioning: boolean | null;
  has_heating: boolean | null;
  has_elevator: boolean | null;
  has_parking: boolean | null;
  has_terrace: boolean | null;
  has_washing_machine: boolean | null;
  has_dishwasher: boolean | null;
  has_pool: boolean | null;
  has_gym: boolean | null;
  is_furnished: boolean | null;
  pets_allowed: boolean | null;
  min_stay_months: number | null;
}

const FEATURE_ROWS: { key: keyof Accommodation; label: string; category: string }[] = [
  { key: "water_included", label: "Agua incluida", category: "Suministros" },
  { key: "electricity_included", label: "Luz incluida", category: "Suministros" },
  { key: "has_wifi", label: "WiFi", category: "Confort" },
  { key: "has_air_conditioning", label: "Aire acondicionado", category: "Confort" },
  { key: "has_heating", label: "Calefacción", category: "Confort" },
  { key: "has_elevator", label: "Ascensor", category: "Edificio" },
  { key: "has_parking", label: "Parking", category: "Edificio" },
  { key: "has_terrace", label: "Terraza", category: "Edificio" },
  { key: "has_washing_machine", label: "Lavadora", category: "Electrodom." },
  { key: "has_dishwasher", label: "Lavavajillas", category: "Electrodom." },
  { key: "has_pool", label: "Piscina", category: "Extras" },
  { key: "has_gym", label: "Gimnasio", category: "Extras" },
  { key: "is_furnished", label: "Amueblado", category: "Otros" },
  { key: "pets_allowed", label: "Mascotas", category: "Otros" },
];

const TYPE_LABELS: Record<string, string> = {
  piso_completo: "Piso completo",
  habitacion: "Habitación",
  estudio: "Estudio",
  residencia: "Residencia",
};

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const ids = (params.ids || "").split(",").filter(Boolean).slice(0, 4);

  if (ids.length < 2) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <EmptyState
          icon={Home}
          title="Selecciona al menos 2 pisos"
          description="Vuelve a la lista y marca los pisos que quieres comparar (hasta 4)."
          action={{ href: "/alojamiento", label: "Volver a alojamiento" }}
        />
      </div>
    );
  }

  const supabase = createPublicSupabase();
  // Mismos filtros que el listado público: solo pisos activos y pagados. Sin
  // ellos se podía comparar una ficha caducada o sin pagar pegando su id.
  const { data } = await supabase
    .from("accommodations")
    .select("id, title, type, price, city, address, rooms, bathrooms, sqm, amenities, images, available_from, water_included, electricity_included, has_wifi, has_air_conditioning, has_heating, has_elevator, has_parking, has_terrace, has_washing_machine, has_dishwasher, has_pool, has_gym, is_furnished, pets_allowed, min_stay_months")
    .in("id", ids)
    .eq("status", "active")
    .eq("is_paid", true);

  const accommodations = (data || []) as Accommodation[];

  if (accommodations.length < 2) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <EmptyState
          icon={Home}
          title="No se encontraron los alojamientos"
          description="Puede que alguno ya no esté publicado. Vuelve al catálogo y elige otros."
          action={{ href: "/alojamiento", label: "Volver a alojamiento" }}
        />
      </div>
    );
  }

  // Mejor precio para destacarlo en la fila.
  const prices = accommodations.map((a) => a.price || Infinity);
  const bestPrice = Math.min(...prices);

  // Filas de características agrupadas por categoría.
  const categories = [...new Set(FEATURE_ROWS.map((r) => r.category))];

  // Filas de datos numéricos y de texto, antes de las de sí/no.
  const dataRows: { label: string; value: (a: Accommodation) => string }[] = [
    { label: "Tipo", value: (a) => TYPE_LABELS[a.type ?? ""] ?? ((a.type || "").replace("_", " ") || "·") },
    { label: "Habitaciones", value: (a) => (a.rooms ? `${a.rooms}` : "·") },
    { label: "Baños", value: (a) => (a.bathrooms ? `${a.bathrooms}` : "·") },
    { label: "Superficie", value: (a) => (a.sqm ? `${a.sqm} m²` : "·") },
    {
      label: "Disponible",
      value: (a) =>
        a.available_from
          ? new Date(a.available_from).toLocaleDateString("es-ES", { month: "short", year: "numeric" })
          : "·",
    },
    { label: "Estancia mínima", value: (a) => (a.min_stay_months ? `${a.min_stay_months} meses` : "·") },
  ];

  const labelCell = "sticky left-0 z-10 bg-bg-primary py-3 pr-4 text-left text-sm font-medium text-text-secondary";
  const valueCell = "px-3 py-3 text-center text-sm text-text-primary";

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial del comparador. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
          <Reveal>
            <Link
              href="/alojamiento"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
              <span className="link-underline">Volver a alojamiento</span>
            </Link>
            <p className="eyebrow mt-6">Comparador</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Compara tus pisos lado a lado.
            </h1>
            <p className="mt-3 max-w-xl text-text-muted tabular">
              {accommodations.length} pisos seleccionados. El mejor precio va marcado.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Tabla de comparación: una tabla real, con la columna de etiquetas
          pegada a la izquierda y desplazamiento horizontal en móvil. */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:py-12">
        <Reveal variant="fade" delay={120} className="overflow-x-auto rounded-2xl border border-border shadow-card">
          <table className="w-full min-w-[640px] border-collapse bg-bg-primary">
            <thead>
              <tr className="border-b border-border align-top">
                <th scope="col" className={cn(labelCell, "pl-4 pt-4 sm:pl-5")}>
                  <span className="sr-only">Piso</span>
                </th>
                {accommodations.map((acc) => (
                  <th key={acc.id} scope="col" className="px-3 pb-4 pt-4 text-left font-normal">
                    <Link href={`/alojamiento/${acc.id}`} className="group block">
                      <div className="img-zoom relative h-28 overflow-hidden rounded-xl bg-bg-secondary sm:h-36">
                        {acc.images && acc.images[0] ? (
                          <Image
                            src={acc.images[0]}
                            alt={acc.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 45vw, (max-width: 768px) 35vw, 25vw"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Home className="h-8 w-8 text-text-muted/40" />
                          </div>
                        )}
                      </div>
                      <h3 className="mt-3 line-clamp-2 font-heading text-[15px] font-bold leading-tight text-text-primary transition-colors group-hover:text-violet">
                        {acc.title}
                      </h3>
                      <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{acc.city}</span>
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-text-primary">
                        <span className="link-underline">Ver ficha</span>
                        <ArrowUpRight className="h-3.5 w-3.5 arrow-nudge" aria-hidden="true" />
                      </span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Precio: cifra grande, la mejor en negro con marca. */}
              <tr className="border-b border-border-light transition-colors hover:bg-bg-secondary">
                <th scope="row" className={cn(labelCell, "pl-4 sm:pl-5")}>
                  Precio
                </th>
                {accommodations.map((acc) => {
                  const best = acc.price === bestPrice;
                  return (
                    <td key={acc.id} className={cn(valueCell, "align-middle")}>
                      <span
                        className={cn(
                          "font-heading text-xl font-extrabold tracking-tight tabular",
                          best ? "text-text-primary" : "text-text-secondary"
                        )}
                      >
                        {acc.price != null ? Number(acc.price).toLocaleString("es-ES") : "·"}
                        <span className="ml-0.5 text-xs font-semibold text-text-muted">€/mes</span>
                      </span>
                      {best && (
                        <span className="mt-1.5 block">
                          <span className="inline-flex items-center gap-1 rounded-full border border-text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-primary">
                            <Check className="h-3 w-3" strokeWidth={2.5} />
                            Mejor precio
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {dataRows.map((row) => (
                <tr key={row.label} className="border-b border-border-light transition-colors hover:bg-bg-secondary">
                  <th scope="row" className={cn(labelCell, "pl-4 sm:pl-5")}>
                    {row.label}
                  </th>
                  {accommodations.map((acc) => (
                    <td key={acc.id} className={cn(valueCell, "tabular")}>
                      {row.value(acc)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Filas de sí/no por categoría. */}
              {categories.map((cat) => (
                <React.Fragment key={`cat-${cat}`}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={accommodations.length + 1}
                      className="bg-bg-secondary/60 px-4 pb-2 pt-5 text-left sm:px-5"
                    >
                      <span className="eyebrow">{cat}</span>
                    </th>
                  </tr>
                  {FEATURE_ROWS.filter((r) => r.category === cat).map((row) => (
                    <tr key={`row-${row.key}`} className="border-b border-border-light transition-colors hover:bg-bg-secondary">
                      <th scope="row" className={cn(labelCell, "pl-4 sm:pl-5")}>
                        {row.label}
                      </th>
                      {accommodations.map((acc) => (
                        <td key={`${acc.id}-${row.key}`} className={valueCell}>
                          <BoolCell value={acc[row.key] as boolean | null} label={row.label} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </div>
  );
}

// Sí/no como icono suelto: check verde de estado o aspa apagada.
function BoolCell({ value, label }: { value: boolean | null; label: string }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center" aria-label={`${label}: sí`}>
        <Check className="h-4.5 w-4.5 text-success" strokeWidth={2.25} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center" aria-label={`${label}: no`}>
      <X className="h-4 w-4 text-text-muted/40" />
    </span>
  );
}
