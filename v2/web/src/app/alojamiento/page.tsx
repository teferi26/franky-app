import HousingSearchAlert from "@/components/HousingSearchAlert";
import { Home, ArrowRight, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createPublicSupabase } from "@/lib/supabase-server";
import HousingEmptyAlert from "./housing-empty-alert";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, SpotlightCard, Magnetic } from "@/components/motion";
import { cn } from "@/lib/utils";
import AccommodationFilters from "./components/accommodation-filters";
import AccommodationCard, { type AccommodationData } from "./components/accommodation-card";
import { listingMetadata } from "@/lib/listing-seo";

// Catálogo público cacheable: la variante sin filtros se sirve estática y se
// regenera cada 15 minutos con el cliente anon sin cookies. Se listan TODOS los
// anuncios activos y pagados, incluidos los que buscan un perfil concreto
// (chicos/chicas): la preferencia se enseña etiquetada, no se usa para
// esconderlos (antes eran invisibles para todo el mundo).
export const revalidate = 900;

// Las ciudades con anuncios activos cambian poco: cacheamos la lista 15 minutos
// para no repetir una consulta full-table en cada carga de la ruta.
const getUniqueCities = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = createPublicSupabase();
    const { data: allAccomm } = await supabase
      .from("accommodations")
      .select("city")
      .eq("status", "active")
      .eq("is_paid", true);
    return [...new Set((allAccomm || []).map((a) => a.city).filter(Boolean))].sort() as string[];
  },
  ["alojamiento-unique-cities"],
  { revalidate: 900 }
);

// Metadatos por variante: las combinaciones de filtros van a noindex y la
// paginación lleva su propia canonical, para no generar casi-duplicados de la
// misma página. Ver lib/listing-seo.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  return listingMetadata({
    path: "/alojamiento",
    title: "Alojamiento Universitario",
    description: "Encuentra pisos compartidos, residencias y colegios mayores cerca de tu universidad en España.",
    params: await searchParams,
  });
}

const tips = [
  { title: "Piso compartido", price: "200-600€/mes", badge: "Más popular", desc: "La opción más económica. Comparte gastos y haz amigos." },
  { title: "Residencia universitaria", price: "500-900€/mes", badge: "Pensión completa", desc: "Incluye comida, limpieza y actividades sociales. Ideal para primer año." },
  { title: "Colegio mayor", price: "700-1.200€/mes", badge: "Premium", desc: "Formación complementaria, red de contactos y vida comunitaria." },
  { title: "Estudio individual", price: "400-800€/mes", badge: "Independiente", desc: "Máxima privacidad. Más caro pero ideal si prefieres tu espacio." },
];

// Map URL param → DB column for boolean filters
const BOOLEAN_FILTER_MAP: Record<string, string> = {
  agua: "water_included",
  luz: "electricity_included",
  wifi: "has_wifi",
  ac: "has_air_conditioning",
  calefaccion: "has_heating",
  ascensor: "has_elevator",
  parking: "has_parking",
  terraza: "has_terrace",
  lavadora: "has_washing_machine",
  lavavajillas: "has_dishwasher",
  piscina: "has_pool",
  gym: "has_gym",
  amueblado: "is_furnished",
  mascotas: "pets_allowed",
};

interface SearchParams {
  ciudad?: string;
  tipo?: string;
  precio_max?: string;
  habitaciones?: string;
  banos?: string;
  estancia_min?: string;
  pagina?: string;
  [key: string]: string | undefined;
}

const PAGE_SIZE = 24;

/** Enlace a otra página conservando los filtros activos. */
function pageHref(params: SearchParams, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== "pagina" && typeof v === "string" && v.trim()) qs.set(k, v);
  }
  if (page > 1) qs.set("pagina", String(page));
  const s = qs.toString();
  return s ? `/alojamiento?${s}` : "/alojamiento";
}

export default async function AlojamientoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = createPublicSupabase();

  const page = Math.max(1, parseInt(params.pagina ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  // Preferencia de género: NO es un filtro de visibilidad. El catálogo dejaba
  // fuera todo lo que no fuera "any", así que un anuncio dirigido a chicas (que
  // su propietario había PAGADO) no lo veía absolutamente nadie, ni con sesión.
  // Ahora se listan todos y la preferencia se muestra etiquetada en la ficha
  // ("Solo chicas" / "Solo chicos"), como hace cualquier portal del sector.

  // Build query with all filters
  let query = supabase
    .from("accommodations")
    // El nombre de la relación va explícito (profiles!accommodations_owner_id_fkey):
    // desde que existe accommodation_views (migración 161) hay DOS caminos
    // entre accommodations y profiles (el dueño, y los que ven el piso), así
    // que un `profiles(...)` a secas devuelve PGRST201 y la consulta entera
    // falla. Resultado real: el catálogo salía vacío aunque hubiera pisos.
    .select(
      "id, title, type, price, city, address, rooms, bathrooms, sqm, images, status, created_at, " +
        "gender_preference, " +
        "is_furnished, bills_included, has_wifi, has_air_conditioning, has_heating, has_elevator, " +
        "has_parking, has_terrace, has_washing_machine, has_pool, has_gym, pets_allowed, " +
        "profiles!accommodations_owner_id_fkey(full_name)",
      // count exact: el contador decía "24 encontrados" aunque hubiera cientos.
      { count: "exact" }
    )
    .eq("status", "active")
    .eq("is_paid", true)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // Basic filters
  if (params.ciudad) query = query.ilike("city", `%${params.ciudad}%`);
  if (params.tipo) query = query.eq("type", params.tipo);
  if (params.precio_max) query = query.lte("price", Number(params.precio_max));
  if (params.habitaciones) query = query.gte("rooms", Number(params.habitaciones));
  if (params.banos) query = query.gte("bathrooms", Number(params.banos));
  if (params.estancia_min) query = query.lte("min_stay_months", Number(params.estancia_min));

  // Boolean filters: only apply when param is "1" (must have)
  for (const [param, column] of Object.entries(BOOLEAN_FILTER_MAP)) {
    if (params[param] === "1") {
      query = query.eq(column, true);
    }
  }

  const { data: accommodations, count } = await query;

  // Get unique cities for filter (cacheado 15 min, ver getUniqueCities)
  const uniqueCities = await getUniqueCities();

  const total = count ?? accommodations?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.entries(params).some(([k, v]) => k !== "pagina" && v);

  const pageLinkClass =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-border px-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary hover:text-text-primary";

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial del catálogo: sin foto a sangre ni velo violeta. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Alojamiento</p>
              <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
                Un piso cerca de tu campus.
              </h1>
              <p className="mt-3 max-w-xl text-text-muted">
                Pisos compartidos, habitaciones, estudios y residencias publicados por
                propietarios e inmobiliarias. Filtra por precio y compara los que te gusten.
              </p>
            </div>
            <Link
              href="/negocio"
              className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-text-primary"
            >
              <span className="link-underline">¿Tienes un piso? Publícalo desde 9,99 €/mes</span>
              <ArrowRight className="h-4 w-4 arrow-nudge" />
            </Link>
          </Reveal>

          <Reveal delay={120} className="mt-8 scroll-mt-24" id="filtros-alojamiento">
            <AccommodationFilters cities={uniqueCities} />
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <HousingSearchAlert city={params.ciudad} budget={Number(params.precio_max) > 0 ? Number(params.precio_max) : null} />

        {/* Results */}
        {accommodations && accommodations.length > 0 ? (
          <>
            <p className="mb-5 text-sm text-text-muted tabular">
              {total === 1 ? "1 alojamiento" : `${total.toLocaleString("es-ES")} alojamientos`}
              {totalPages > 1 && ` · página ${page} de ${totalPages}`}
            </p>
            <Reveal stagger className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(accommodations as unknown as AccommodationData[]).map((acc, i) => (
                <RevealItem key={acc.id} index={i} asChild>
                  <AccommodationCard acc={acc} />
                </RevealItem>
              ))}
            </Reveal>

            {/* Paginación real: antes se cortaba en 24 sin manera de ver el resto */}
            {totalPages > 1 && (
              <nav
                aria-label="Paginación de alojamientos"
                className="mb-16 flex flex-wrap items-center justify-center gap-2"
              >
                {page > 1 && (
                  <Link href={pageHref(params, page - 1)} rel="prev" className={pageLinkClass}>
                    Anterior
                  </Link>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  // Ventana alrededor de la página actual + primera y última.
                  .filter(
                    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2
                  )
                  .map((n, i, arr) => (
                    <span key={n} className="flex items-center gap-2">
                      {i > 0 && arr[i - 1] !== n - 1 && (
                        <span className="text-sm text-text-muted">…</span>
                      )}
                      {n === page ? (
                        <span
                          aria-current="page"
                          className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-text-primary px-3.5 text-sm font-semibold text-bg-primary tabular"
                        >
                          {n}
                        </span>
                      ) : (
                        <Link href={pageHref(params, n)} className={cn(pageLinkClass, "tabular")}>
                          {n}
                        </Link>
                      )}
                    </span>
                  ))}
                {page < totalPages && (
                  <Link href={pageHref(params, page + 1)} rel="next" className={pageLinkClass}>
                    Siguiente
                  </Link>
                )}
              </nav>
            )}
          </>
        ) : hasFilters || page > 1 ? (
          /* Vacío del sistema (ilustración de marca), con la salida real:
             limpiar los filtros de un clic en vez de pedir que se quiten a
             mano en la barra de arriba. */
          <EmptyState
            className="mb-16"
            icon={Home}
            title="Ningún piso coincide"
            description="Nada encaja con lo que has filtrado. Amplía el precio o la zona, o mira el catálogo entero."
            action={{ href: "/alojamiento", label: "Ver todos los pisos" }}
            secondaryAction={{ href: "/roomie-match", label: "Buscar compañero de piso" }}
          >
            <HousingEmptyAlert city={params.ciudad} budget={Number(params.precio_max) > 0 ? Number(params.precio_max) : null} />
          </EmptyState>
        ) : (
          /* Catálogo entero vacío. Antes esto pintaba `null`: el bloque de
             resultados desaparecía sin una palabra y quedaba una página que
             parecía rota. Se dice lo que hay y se ofrece salida a los dos
             lados del mercado (quien busca y quien alquila). */
          <EmptyState
            className="mb-16"
            icon={Home}
            title="Todavía no hay pisos publicados"
            description="Estamos dando de alta a las primeras inmobiliarias y propietarios. Mientras tanto puedes buscar compañero de piso, que es por donde empieza casi todo el mundo."
            action={{ href: "/roomie-match", label: "Buscar compañero de piso" }}
            secondaryAction={{ href: "/negocio", label: "Tengo un piso para alquilar" }}
          >
            <HousingEmptyAlert city={params.ciudad} />
          </EmptyState>
        )}
      </div>

      {/* Guía de tipos de alojamiento: sección alterna en gris, sin tarjetas de colores. */}
      <section className="border-y border-border-light bg-bg-secondary/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <Reveal className="max-w-xl">
            <p className="eyebrow">Antes de decidir</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              Tipos de alojamiento
            </h2>
            <p className="mt-3 text-text-muted">
              Cuatro formas de vivir el curso, con su horquilla de precio orientativa.
            </p>
          </Reveal>
          <Reveal stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tips.map((t, i) => (
              <RevealItem key={t.title} index={i} asChild>
                <SpotlightCard className="flex flex-col rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
                  <p className="eyebrow">{t.badge}</p>
                  <h3 className="mt-4 font-heading text-lg font-bold text-text-primary">{t.title}</h3>
                  <p className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-text-primary tabular">
                    {t.price}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-text-muted">{t.desc}</p>
                </SpotlightCard>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* CTA de RoomieMatch: bloque oscuro, único de la página. */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <Reveal variant="fade" className="relative overflow-hidden rounded-[2rem] bg-bg-dark text-white">
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.12]" aria-hidden="true" />
          <div className="relative flex flex-col gap-8 p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between lg:p-16">
            <div className="max-w-xl">
              <Users className="h-6 w-6 text-violet-light" />
              <h2 className="mt-5 text-fluid-h2 font-extrabold text-white">
                ¿Buscas compañero de piso?
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-white/65">
                RoomieMatch te empareja con gente de tu ciudad según horarios, presupuesto
                y manías. Ocho factores de compatibilidad, antes de firmar nada.
              </p>
            </div>
            <Magnetic>
              <Link
                href="/roomie-match"
                className={cn(buttonVariants({ variant: "onBrand", size: "lg" }), "btn-shine group shrink-0")}
              >
                Encontrar mi roomie
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
            </Magnetic>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
