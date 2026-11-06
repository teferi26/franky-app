import { Calendar, Plus, Heart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, CountUp } from "@/components/motion";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import type { Metadata } from "next";
import EventFilters from "./components/event-filters";
import EventCard from "./components/event-card";
import MisEventosSection from "./components/mis-eventos-section";
import EventsViewSwitch from "./components/events-view-switch";
import type { EventData } from "./components/event-card";
import type { MapEvent, MapSpot } from "@/components/EventsMap";
import JsonLd from "@/components/JsonLd";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Eventos Universitarios",
  description: "Descubre eventos, charlas, ferias, fiestas y actividades en universidades de toda España. Filtra por ciudad, categoría y fecha.",
  alternates: { canonical: "/eventos" },
};

interface SearchParams {
  buscar?: string;
  ciudad?: string;
  categoria?: string;
  fecha?: string;
  gratis?: string;
  pasados?: string;
  orden?: string;
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createServerSupabase();

  // An event is "current/upcoming" if its end_date is in the future,
  // OR if it has no end_date but the start_date is in the future.
  // Using PostgREST's `or` clause so NULL end_date rows aren't filtered out.
  const nowIso = new Date().toISOString();
  const upcomingFilter = `end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${nowIso})`;

  // --- Featured events (always fetch for hero section) ---
  // select("*") en vez de la lista de columnas: la ficha y la app ya lo hacen
  // así, y evita que añadir una columna nueva (p. ej. is_official de la 164)
  // rompa el listado entero mientras la migración no esté aplicada en la BD.
  const featuredQuery = supabase
    .from("events")
    .select("*")
    .eq("is_featured", true)
    .or(upcomingFilter)
    .order("start_date", { ascending: true })
    .limit(6);

  // --- Build main query with filters ---
  // latitude/longitude (migracion 128) solo hacen falta para el modo Mapa: se
  // piden aqui para no repetir la consulta de eventos.
  let query = supabase
    .from("events")
    .select("*");

  // Past events toggle
  if (!params.pasados) {
    query = query.or(upcomingFilter);
  }

  // City
  if (params.ciudad) {
    query = query.eq("city", params.ciudad);
  }

  // Category
  if (params.categoria) {
    query = query.eq("category", params.categoria);
  }

  // Date range
  if (params.fecha) {
    const now = new Date();
    let cutoff: Date | null = null;
    if (params.fecha === "semana") {
      cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (params.fecha === "mes") {
      cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else if (params.fecha === "trimestre") {
      cutoff = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    }
    if (cutoff) {
      query = query.gte("start_date", now.toISOString()).lte("start_date", cutoff.toISOString());
    }
  }

  // Free only
  if (params.gratis === "1") {
    query = query.eq("price", 0);
  }

  // Search (title ilike)
  if (params.buscar) {
    query = query.ilike("title", `%${params.buscar}%`);
  }

  // Ordenación
  if (params.orden === "titulo") {
    query = query.order("title", { ascending: true });
  } else if (params.orden === "fecha-desc") {
    query = query.order("start_date", { ascending: false });
  } else {
    query = query.order("start_date", { ascending: true });
  }
  query = query.limit(60);

  // --- Get all cities + category counts for filters ---
  const allEventsQuery = supabase
    .from("events")
    .select("city, category")
    .or(upcomingFilter);

  // Estas consultas no dependen entre si: las lanzamos en paralelo para que el
  // tiempo de servidor sea el de la mas lenta y no la suma de las cuatro.
  const [
    { data: { user } },
    { data: featuredRaw },
    { data: eventsRaw },
    { data: allEvents },
  ] = await Promise.all([
    supabase.auth.getUser(),
    featuredQuery,
    query,
    allEventsQuery,
  ]);

  const featured: EventData[] = (featuredRaw || []).map((e) => ({ ...e, participant_count: undefined }));
  const events: EventData[] = (eventsRaw || []).map((e) => ({ ...e, participant_count: undefined }));

  // --- Datos del modo Mapa ---
  // Reutilizamos los eventos ya consultados (no se vuelve a preguntar por
  // ellos) y añadimos SOLO las zonas de ocio de las ciudades que aparecen en
  // los resultados, que son las unicas que el mapa puede necesitar.
  const mapEvents: MapEvent[] = (eventsRaw || []).map((e) => ({
    id: e.id,
    title: e.title,
    city: e.city,
    venue: e.venue,
    start_date: e.start_date,
    category: e.category,
    price: e.price,
    latitude: (e as { latitude?: number | null }).latitude ?? null,
    longitude: (e as { longitude?: number | null }).longitude ?? null,
  }));

  const mapCities = [...new Set(mapEvents.map((e) => (e.city || "").split(",")[0].trim()))]
    .filter(Boolean)
    .slice(0, 12);

  // Fail-soft: si la consulta falla o no devuelve nada, el mapa simplemente se
  // queda sin zonas de contexto (nunca es un error de pagina).
  let mapSpots: MapSpot[] = [];
  if (mapCities.length > 0) {
    const { data: spotsRaw } = await supabase
      .from("leisure_spots")
      .select("id, name, city, category, latitude, longitude, rating")
      .in("city", mapCities)
      .eq("is_verified", true)
      .eq("is_paid", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(150);
    mapSpots = (spotsRaw || []) as MapSpot[];
  }

  const cities = [...new Set((allEvents || []).map((e) => e.city))].sort();
  const categoryCounts: Record<string, number> = {};
  for (const e of allEvents || []) {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  }
  const totalCount = allEvents?.length || 0;

  // --- Stats ---
  const hasFilters = !!(params.buscar || params.ciudad || params.categoria || params.fecha || params.gratis || params.pasados || params.orden);

  // ItemList para Google: solo el listado sin filtros (la URL canónica).
  const itemListJsonLd = hasFilters
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Eventos universitarios en Franky",
        itemListElement: events.slice(0, 30).map((e, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `https://franky.es/eventos/${e.id}`,
          name: e.title,
        })),
      };

  return (
    <div className="min-h-screen bg-bg-primary">
      {itemListJsonLd && itemListJsonLd.itemListElement.length > 0 && <JsonLd data={itemListJsonLd} />}
      {/* Cabecera editorial: sin foto a sangre ni velo violeta */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Reveal className="max-w-2xl">
              <p className="eyebrow text-violet">Agenda universitaria</p>
              <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
                Eventos
              </h1>
              <p className="mt-3 max-w-xl text-text-muted">
                Fiestas, charlas, ferias, talleres y todo lo que pasa en las universidades de España. Filtra por ciudad, categoría o fecha.
              </p>
              <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="eyebrow text-text-muted">Próximos</dt>
                  <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary"><CountUp value={totalCount} /></dd>
                </div>
                <div>
                  <dt className="eyebrow text-text-muted">Ciudades</dt>
                  <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary"><CountUp value={cities.length} /></dd>
                </div>
                <div>
                  <dt className="eyebrow text-text-muted">Categorías</dt>
                  <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary"><CountUp value={Object.keys(categoryCounts).length} /></dd>
                </div>
              </dl>
            </Reveal>
            <Reveal delay={120} className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link href="/eventos/swipe" className={buttonVariants({ variant: "outline" })}>
                <Heart className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Modo swipe
              </Link>
              <Link href="/eventos/crear" className={buttonVariants({ variant: "dark" })}>
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Crear evento
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        {/* Mis eventos (creados + apuntado), solo con sesión */}
        {user && !hasFilters && (
          <div className="mb-12">
            <MisEventosSection userId={user.id} />
          </div>
        )}

        {/* Destacados: carril horizontal con entrada en cascada */}
        {featured.length > 0 && !hasFilters && (
          <section className="mb-12">
            <Reveal className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-violet">Selección</p>
                <h2 className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">Eventos destacados</h2>
              </div>
              <span className="text-sm text-text-muted tabular">{featured.length}</span>
            </Reveal>
            <Reveal stagger className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 scrollbar-hide">
              {featured.map((event, i) => (
                <RevealItem key={event.id} index={i} className="snap-start">
                  <EventCard event={event} variant="featured" />
                </RevealItem>
              ))}
            </Reveal>
          </section>
        )}

        {/* Filters */}
        <EventFilters cities={cities} categoryCounts={categoryCounts} totalCount={totalCount} />

        {/* Contador + conmutador Lista / Mapa (la lista es el modo por defecto:
            es lo que se renderiza en servidor y lo que indexa Google) */}
        <EventsViewSwitch
          events={mapEvents}
          spots={mapSpots}
          summary={
            `${events.length} evento${events.length !== 1 ? "s" : ""} encontrado${events.length !== 1 ? "s" : ""}` +
            (params.ciudad ? ` en ${params.ciudad}` : "") +
            (params.categoria ? ` · ${params.categoria}` : "")
          }
        >
        {/* Event grid */}
        {events.length > 0 ? (
          <Reveal stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event, i) => (
              <RevealItem key={event.id} index={i} className="flex">
                <EventCard event={event} />
              </RevealItem>
            ))}
          </Reveal>
        ) : (
          /* Vacío del sistema. Antes cada listado pintaba su propio "no hay
             nada" con un icono gris; aquí se usa la ilustración de marca y se
             separan los dos casos, porque la salida útil es distinta: con
             filtros, quitarlos; sin ellos, montar el plan o ver el histórico. */
          <EmptyState
            icon={Calendar}
            tone="orange"
            title={hasFilters ? "Ningún evento coincide" : "No hay eventos próximos"}
            description={
              hasFilters
                ? "Nada encaja con los filtros que tienes puestos. Quítalos y verás la agenda completa de tu ciudad."
                : "La agenda está vacía por ahora. Puedes ver lo que ya se ha hecho o ser quien monte el próximo."
            }
            action={
              hasFilters
                ? { href: "/eventos", label: "Ver todos los eventos" }
                : { href: "/eventos/crear", label: "Crear un evento" }
            }
            secondaryAction={
              hasFilters ? undefined : { href: "/eventos?pasados=1", label: "Ver eventos pasados" }
            }
          />
        )}
        </EventsViewSwitch>
      </div>
    </div>
  );
}
