import { safeOcioReturn } from "@/lib/discovery-filters";
﻿import {
  MapPin, Star, Clock, ArrowLeft, ExternalLink, Globe, Phone, Tag, CheckCircle,
  Sparkles, GraduationCap, Sun, FileText, Link as LinkIcon, Mail, Instagram,
  Users, Wifi, Wind, Trees, Music, Car, Dog, UtensilsCrossed, CreditCard,
  CalendarCheck, BadgePercent, Armchair, Info, BadgeCheck, ShieldAlert, Euro, ArrowUpRight,
} from "lucide-react";
import { createPublicSupabase } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import LeisureMapWrapper from "./leisure-map-wrapper";
import LeisureImage, { leisureCategoryIcon } from "../leisure-image";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, SpotlightCard, ScrollProgress } from "@/components/motion";
import LeisureGallery from "./leisure-gallery";
import JsonLd from "@/components/JsonLd";
import RouteButton from "./route-button";
import { LEISURE_FEATURES, UNRELIABLE_WITHOUT_OWNER } from "../leisure-features";
import { ProSpotCta } from "@/components/pro-public/spot-cta";

// Ficha enriquecida (columna details jsonb, migración 121)
interface LeisureDetails {
  why_go?: string[] | null;
  highlights?: string[] | null;
  best_time?: string | null;
  student_tip?: string | null;
  price_text?: string | null;
  opening_hours_text?: string | null;
  sources?: { titulo?: string | null; url: string; fecha_consulta?: string | null }[] | null;
  confidence?: string | null;
}

// Ficha pública cacheable con ISR: el contenido del sitio de ocio no depende
// del visitante. Cliente anon sin cookies para permitir el ISR real.
export const revalidate = 900;

const categoryLabels: Record<string, string> = {
  bar: "Bares y Tapas",
  restaurante: "Restaurantes",
  cafeteria: "Cafeterías",
  discoteca: "Discotecas",
  parque: "Parques y Aire Libre",
  cultural: "Cultura y Museos",
  deportivo: "Deportes",
  coworking: "Coworking y Estudio",
  pub: "Pubs",
};


const priceLabels = ["Gratis", "€", "€€", "€€€", "€€€€"];

// Iconos de las 13 características del alta. La lista y las etiquetas viven en
// ../leisure-features para que ficha, listado y filtros no se desincronicen.
const FEATURE_ICONS: Record<string, React.ReactNode> = {
  has_wifi: <Wifi className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_terrace: <Trees className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_outdoor_seating: <Armchair className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_food: <UtensilsCrossed className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_live_music: <Music className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_billiards: <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_air_conditioning: <Wind className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  has_parking: <Car className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  accepts_groups: <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  accepts_pets: <Dog className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  student_discount: <BadgePercent className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  reservations: <CalendarCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
  card_payment: <CreditCard className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = createPublicSupabase();
  const { data: spot } = await supabase
    .from("leisure_spots")
    .select("name, description, city, image_url, is_verified, is_paid")
    .eq("id", id)
    .maybeSingle();
  if (!spot) return { title: "Zona de Ocio" };
  // Ficha creada pero sin publicar: existe una página (para su dueño), pero no
  // debe entrar en el índice de Google.
  if (!spot.is_verified || !spot.is_paid) {
    return { title: "Ficha pendiente de publicación", robots: { index: false, follow: false } };
  }

  const title = `${spot.name} · ${spot.city} | Ocio universitario | Franky`;
  const description = spot.description
    ? spot.description.slice(0, 160)
    : `${spot.name}, plan de ocio en ${spot.city}. Descúbrelo en Franky.`;

  return {
    // `absolute`: el titulo ya incluye "| Franky", el template del layout lo
    // duplicaba ("… | Franky | Franky").
    title: { absolute: title },
    description,
    alternates: { canonical: `/ocio/${id}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/ocio/${id}`,
      images: spot.image_url ? [{ url: spot.image_url }] : undefined,
    },
  };
}

// El horario se guarda como jsonb, y jsonb NO conserva el orden de inserción
// (ordena por longitud de clave y luego bytes): sin esto salía "lunes, jueves,
// martes, sábado...". Se recorre la semana, no el objeto.
const ORDEN_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
function ordenarSemana(h: Record<string, string>): [string, string][] {
  const claves = Object.keys(h);
  const enSemana = ORDEN_SEMANA.filter((d) => claves.includes(d)).map((d) => [d, h[d]] as [string, string]);
  const resto = claves.filter((d) => !ORDEN_SEMANA.includes(d)).map((d) => [d, h[d]] as [string, string]);
  return [...enSemana, ...resto];
}

export default async function LeisureDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string }>;
}) {
  const { id } = await params;
  const backTo = safeOcioReturn((await searchParams).desde);
  const supabase = createPublicSupabase();

  const { data: spot } = await supabase
    .from("leisure_spots")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!spot) notFound();

  // Ficha creada pero todavía sin pagar (o sin verificar). Antes esto era un
  // 404, así que el negocio pinchaba en su propio panel y se encontraba con un
  // "no existe" justo después de darse de alta. No se enseña el contenido (no
  // está publicado): se explica el estado y se le lleva a terminar el pago.
  if (!spot.is_verified || !spot.is_paid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4 py-24">
        <Reveal variant="scale" className="max-w-md rounded-2xl border border-border bg-bg-primary p-8 text-center shadow-card">
          <ShieldAlert className="mx-auto h-8 w-8 text-warning" strokeWidth={1.5} aria-hidden="true" />
          <p className="eyebrow mt-5 text-text-muted">Ficha pendiente</p>
          <h1 className="mt-2 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
            Esta ficha aún no está publicada
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            {spot.name} ya está guardado, pero todavía no se ve en el catálogo.
            Si es tu local, termina el alta desde tu panel y aparecerá al instante.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href="/negocio/dashboard" className={buttonVariants({ variant: "dark" })}>
              Ir a mi panel
            </Link>
            <Link href="/ocio" className={buttonVariants({ variant: "outline" })}>
              Ver otras zonas de ocio
            </Link>
          </div>
        </Reveal>
      </div>
    );
  }

  // La ficha es estática (ISR) para SEO: la edición de admin se hace desde
  // /admin, no inline, para no atar el render del catálogo a la sesión.

  // Nearby spots (same city, same category, excluding current)
  const { data: nearbyRaw } = await supabase
    .from("leisure_spots")
    .select("id, name, city, category, image_url, rating, price_range")
    .eq("city", spot.city)
    .eq("is_verified", true)
    .eq("is_paid", true)
    .neq("id", spot.id)
    .order("rating", { ascending: false })
    .limit(6);
  const nearby = nearbyRaw || [];

  const cat = categoryLabels[spot.category] || spot.category;
  const CatIcon = leisureCategoryIcon(spot.category);
  const details: LeisureDetails = (spot.details as LeisureDetails) || {};
  // Galería: el alta admite hasta 20 fotos (columna images) y la ficha solo
  // enseñaba la portada. La portada se antepone si no está ya en el array.
  const gallery: string[] = (() => {
    const list = ((spot.images as string[] | null) || []).filter(Boolean);
    const cover = spot.image_url as string | null;
    if (cover && !list.includes(cover)) return [cover, ...list];
    return list;
  })();
  // Características marcadas por el negocio. `card_payment` solo se muestra si
  // hay dueño: se creó con DEFAULT true y en el catálogo curado nadie lo ha
  // comprobado (ver ../leisure-features).
  const features = LEISURE_FEATURES.filter(
    (f) =>
      (spot as Record<string, unknown>)[f.key] === true &&
      (spot.owner_id || !UNRELIABLE_WITHOUT_OWNER.has(f.key))
  );
  const instagramUrl = spot.instagram
    ? `https://instagram.com/${String(spot.instagram).replace(/^@+/, "").trim()}`
    : null;
  const whyGo = (details.why_go || []).filter(Boolean);
  const highlights = (details.highlights || []).filter(Boolean);
  const sources = (details.sources || []).filter((s) => s && s.url);
  const hasCoords = spot.latitude != null && spot.longitude != null;
  // Con coordenadas, el "Cómo llegar" se resuelve DENTRO de la web con el
  // overlay de ruta (OSRM). El enlace externo a Google Maps queda solo como
  // ultimo recurso para sitios sin coordenadas pero con direccion escrita.
  const mapsUrl =
    !hasCoords && spot.address
      ? spot.google_maps_url ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.address + ", " + spot.city)}`
      : null;

  // Parse opening_hours if available
  let openingHours: Record<string, string> | null = null;
  if (spot.opening_hours && typeof spot.opening_hours === "object") {
    openingHours = spot.opening_hours as Record<string, string>;
  }

  const dayNames: Record<string, string> = {
    monday: "Lunes",
    tuesday: "Martes",
    wednesday: "Miércoles",
    thursday: "Jueves",
    friday: "Viernes",
    saturday: "Sábado",
    sunday: "Domingo",
    lunes: "Lunes",
    martes: "Martes",
    miercoles: "Miércoles",
    jueves: "Jueves",
    viernes: "Viernes",
    sabado: "Sábado",
    domingo: "Domingo",
  };

  // Datos estructurados de negocio local para SEO local.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: spot.name,
    url: `https://franky.es/ocio/${spot.id}`,
    ...(spot.description ? { description: spot.description as string } : {}),
    ...(spot.image_url ? { image: spot.image_url as string } : {}),
    ...(spot.phone ? { telephone: spot.phone as string } : {}),
    ...(spot.website ? { sameAs: [spot.website as string] } : {}),
    address: {
      "@type": "PostalAddress",
      ...(spot.address ? { streetAddress: spot.address as string } : {}),
      addressLocality: spot.city,
      addressCountry: "ES",
    },
    ...(hasCoords
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: spot.latitude,
            longitude: spot.longitude,
          },
        }
      : {}),
    ...(spot.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: spot.rating,
            bestRating: 5,
          },
        }
      : {}),
  };

  const priceSummary = details.price_text
    ? details.price_text
    : typeof spot.price_range === "number"
      ? spot.price_range === 0 ? "Gratis" : priceLabels[spot.price_range]
      : null;

  const rowLink =
    "group flex w-full items-center gap-2.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary";

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={jsonLd} />
      <ScrollProgress />

      {/* Cabecera editorial: la foto va después, en un marco, no a sangre */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 lg:pt-10 lg:pb-12">
          <Link
            href={backTo}
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Zonas de ocio
          </Link>

          <Reveal className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="eyebrow inline-flex items-center gap-1.5 text-violet">
                  <CatIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> {cat}
                </p>
                {spot.owner_id && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-text-primary px-2 py-0.5 text-[11px] font-semibold text-bg-primary">
                    <BadgeCheck className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Local colaborador
                  </span>
                )}
                {priceSummary && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary tabular">{priceSummary}</span>
                )}
              </div>
              <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary text-balance">
                {spot.name}
              </h1>
              {spot.tagline && (
                <p className="mt-3 max-w-2xl text-lg text-text-secondary">{spot.tagline}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                  {spot.address ? `${spot.address}, ${spot.city}` : spot.city}
                </span>
                {!!spot.rating && (
                  <span className="inline-flex items-center gap-1.5 tabular">
                    <Star className="h-4 w-4 fill-current text-warning" strokeWidth={1.75} aria-hidden="true" />
                    <span className="font-semibold text-text-primary">{spot.rating}</span>
                    <span className="text-text-muted">/ 5</span>
                  </span>
                )}
              </div>
            </div>
            {hasCoords ? (
              <RouteButton
                lat={Number(spot.latitude)}
                lng={Number(spot.longitude)}
                name={spot.name}
                className={buttonVariants({ variant: "dark", className: "shrink-0" })}
              >
                <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Cómo llegar
              </RouteButton>
            ) : mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "dark", className: "shrink-0" })}>
                <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Cómo llegar
              </a>
            ) : null}
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-20">
        {/* Foto principal en marco */}
        <Reveal variant="scale" className="img-zoom relative mt-8 aspect-[16/9] overflow-hidden rounded-3xl border border-border bg-bg-secondary shadow-card sm:aspect-[21/9]">
          <LeisureImage
            src={spot.image_url}
            alt={spot.name}
            category={spot.category}
            className="absolute inset-0 h-full w-full"
            sizes="(max-width: 1152px) 100vw, 1152px"
          />
        </Reveal>

        <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-3 lg:items-start lg:gap-14">
          {/* Contenido */}
          <div id="el-sitio" className="max-w-3xl space-y-12 scroll-mt-28 lg:col-span-2">
            {/* Galería: todas las fotos que subió el local, no solo la portada */}
            {gallery.length > 1 && (
              <Reveal>
                <LeisureGallery images={gallery} name={spot.name} />
              </Reveal>
            )}

            {/* Descripción */}
            <Reveal as="section">
              <p className="eyebrow text-text-muted">Sobre este lugar</p>
              <p className="mt-4 whitespace-pre-line text-[17px] leading-relaxed text-text-secondary">
                {spot.description || "Sin descripción disponible."}
              </p>
              {spot.tags && spot.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {spot.tags.map((tag: string) => (
                    <span key={tag} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Reveal>

            {/* Qué ofrece: las características que marca el local en su alta */}
            {features.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow text-text-muted">Qué ofrece</p>
                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  {features.map((f) => (
                    <li key={f.key} className="flex items-center gap-2.5 text-sm text-text-primary">
                      <span className="shrink-0 text-violet">{FEATURE_ICONS[f.key]}</span>
                      <span className="font-medium">{f.label}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {/* Información extra que escribe el propio local */}
            {typeof spot.extra_info === "string" && spot.extra_info.trim() && (
              <Reveal as="section">
                <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
                  <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Información extra
                </p>
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
                  {spot.extra_info.trim()}
                </p>
              </Reveal>
            )}

            {/* Por qué ir */}
            {whyGo.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow text-text-muted">Por qué ir</p>
                <ul className="mt-4 divide-y divide-border-light border-y border-border-light">
                  {whyGo.map((r, i) => (
                    <li key={i} className="flex items-start gap-3 py-3 text-sm text-text-secondary">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden="true" />
                      {r}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {/* Imprescindibles */}
            {highlights.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow text-text-muted">No te pierdas</p>
                <ol className="mt-4 grid gap-3 sm:grid-cols-2">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-text-secondary">
                      <span className="font-heading text-sm font-bold text-text-muted tabular">{String(i + 1).padStart(2, "0")}</span>
                      {h}
                    </li>
                  ))}
                </ol>
              </Reveal>
            )}

            {/* Consejo de estudiante / mejor momento */}
            {(details.student_tip || details.best_time) && (
              <Reveal as="section" className="grid gap-4 sm:grid-cols-2">
                {details.best_time && (
                  <div className="rounded-2xl border border-border p-5">
                    <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
                      <Sun className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Mejor momento
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">{details.best_time}</p>
                  </div>
                )}
                {details.student_tip && (
                  <div className="rounded-2xl border border-violet/30 bg-violet-50/50 p-5">
                    <p className="eyebrow inline-flex items-center gap-1.5 text-violet">
                      <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Tip de estudiante
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">{details.student_tip}</p>
                  </div>
                )}
              </Reveal>
            )}

            {/* Mapa */}
            {hasCoords && (
              <Reveal as="section">
                <p className="eyebrow text-text-muted">Ubicación</p>
                <div className="mt-4 overflow-hidden rounded-3xl border border-border shadow-card">
                  <LeisureMapWrapper
                    latitude={spot.latitude}
                    longitude={spot.longitude}
                    name={spot.name}
                  />
                </div>
                {/* Ruta dentro de la web: distancia y tiempo reales de OSRM */}
                <RouteButton
                  lat={Number(spot.latitude)}
                  lng={Number(spot.longitude)}
                  name={spot.name}
                  className="link-underline mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-violet"
                >
                  <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Cómo llegar
                </RouteButton>
              </Reveal>
            )}

            {/* Otros sitios cerca */}
            {nearby.length > 0 && (
              <section>
                <Reveal className="flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow text-violet">Cerca</p>
                    <h2 className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">Otros sitios en {spot.city}</h2>
                  </div>
                  <Link href={`/ocio?ciudad=${encodeURIComponent(spot.city)}`} className="group hidden items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary sm:inline-flex">
                    Ver todos <ArrowUpRight className="arrow-nudge h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </Reveal>
                <Reveal stagger className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {nearby.map((n, i) => {
                    const NearIcon = leisureCategoryIcon(n.category);
                    return (
                      <RevealItem key={n.id} index={i} asChild>
                        <SpotlightCard asChild>
                          <Link
                            href={`/ocio/${n.id}`}
                            className="group hover-lift flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
                          >
                            <div className="img-zoom relative aspect-[16/10] bg-bg-secondary">
                              <LeisureImage
                                src={n.image_url}
                                alt={n.name}
                                category={n.category}
                                className="absolute inset-0 h-full w-full"
                                sizes="(max-width: 640px) 100vw, 33vw"
                              />
                              {!!n.rating && (
                                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-bg-primary/95 px-2 py-0.5 text-[11px] font-semibold text-text-primary shadow-card tabular">
                                  <Star className="h-3 w-3 fill-current text-warning" strokeWidth={1.75} aria-hidden="true" />
                                  {n.rating}
                                </span>
                              )}
                            </div>
                            <div className="p-3.5">
                              <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet">
                                <NearIcon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                                {categoryLabels[n.category] || n.category}
                              </p>
                              <h3 className="mt-1 line-clamp-1 font-heading text-sm font-bold text-text-primary transition-colors group-hover:text-violet">
                                {n.name}
                              </h3>
                              {typeof n.price_range === "number" && (
                                <span className="mt-0.5 block text-[11px] text-text-muted tabular">{priceLabels[n.price_range]}</span>
                              )}
                            </div>
                          </Link>
                        </SpotlightCard>
                      </RevealItem>
                    );
                  })}
                </Reveal>
              </section>
            )}

            {/* Fuentes */}
            {sources.length > 0 && (
              <details className="group overflow-hidden rounded-2xl border border-border">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-secondary">
                  <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Fuentes <span className="text-text-muted tabular">({sources.length})</span>
                </summary>
                <ul className="space-y-1.5 border-t border-border-light px-5 pb-4 pt-3">
                  {sources.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                      <LinkIcon className="mt-0.5 h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all hover:text-violet hover:underline">
                        {s.titulo || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Lateral pegajoso */}
          <aside id="prepara-visita" className="space-y-4 scroll-mt-28 lg:sticky lg:top-24">
            <ProSpotCta spotId={spot.id} />
            <Reveal variant="fade" delay={120} className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <p className="eyebrow text-text-muted">Prepara tu visita</p>
              <dl className="mt-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="text-xs text-text-muted">Categoría</dt>
                    <dd className="text-sm font-medium text-text-primary">{cat}</dd>
                  </div>
                </div>

                {/* Precio: solo si hay dato real (texto enriquecido o tramo) */}
                {(details.price_text || typeof spot.price_range === "number") && (
                  <div className="flex items-start gap-3">
                    <Euro className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-text-muted">Precio</dt>
                      <dd className="text-sm font-medium tabular">
                        {details.price_text ? (
                          <span className="text-success">{details.price_text}</span>
                        ) : spot.price_range === 0 ? (
                          <span className="text-success">Entrada gratuita</span>
                        ) : (
                          <span className="text-text-primary">{priceLabels[spot.price_range as number]}</span>
                        )}
                      </dd>
                    </div>
                  </div>
                )}

                {!!spot.rating && (
                  <div className="flex items-start gap-3">
                    <Star className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-text-muted">Valoración</dt>
                      <dd className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary tabular">{spot.rating}</span>
                        <span className="flex" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3 w-3 ${
                                s <= Math.round(spot.rating || 0) ? "fill-current text-warning" : "text-border"
                              }`}
                              strokeWidth={1.75}
                            />
                          ))}
                        </span>
                      </dd>
                    </div>
                  </div>
                )}

                {/* Edad mínima y aforo: los rellena el local en el alta */}
                {spot.min_age != null && (
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-text-muted">Edad</dt>
                      <dd className="text-sm font-medium text-text-primary">Solo mayores de {spot.min_age as number}</dd>
                    </div>
                  </div>
                )}
                {spot.capacity != null && (
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-text-muted">Aforo</dt>
                      <dd className="text-sm font-medium text-text-primary tabular">{spot.capacity as number} personas</dd>
                    </div>
                  </div>
                )}

                {spot.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt className="text-xs text-text-muted">Dirección</dt>
                      <dd className="text-sm font-medium text-text-primary">{spot.address}</dd>
                      <dd className="text-xs text-text-muted">{spot.city}</dd>
                    </div>
                  </div>
                )}
              </dl>

              {/* Contacto */}
              {(hasCoords || mapsUrl || spot.website || spot.phone || (typeof spot.email === "string" && spot.email) || instagramUrl) && (
                <div className="mt-5 space-y-2 border-t border-border-light pt-5">
                  {hasCoords ? (
                    // Overlay de ruta dentro de la web: nada de salir a Google Maps
                    <RouteButton
                      lat={Number(spot.latitude)}
                      lng={Number(spot.longitude)}
                      name={spot.name}
                      className={buttonVariants({ variant: "dark", className: "w-full cursor-pointer" })}
                    >
                      <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Cómo llegar
                    </RouteButton>
                  ) : mapsUrl ? (
                    // Sin coordenadas no hay ruta que trazar: enlace externo como
                    // ultimo recurso para no dejar al usuario sin nada
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "dark", className: "w-full" })}>
                      <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Cómo llegar
                    </a>
                  ) : null}
                  {spot.website && (
                    <a href={spot.website} target="_blank" rel="noopener noreferrer" className={rowLink}>
                      <Globe className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Visitar web
                      <ExternalLink className="ml-auto h-3 w-3 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  )}
                  {spot.phone && (
                    <a href={`tel:${spot.phone}`} className={rowLink}>
                      <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <span className="tabular">{spot.phone}</span>
                    </a>
                  )}
                  {typeof spot.email === "string" && spot.email && (
                    <a href={`mailto:${spot.email}`} className={`${rowLink} break-all`}>
                      <Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      {spot.email}
                    </a>
                  )}
                  {instagramUrl && (
                    <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={rowLink}>
                      <Instagram className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      {String(spot.instagram)}
                      <ExternalLink className="ml-auto h-3 w-3 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}

              {/* Local que colabora con Franky (ficha dada de alta por su dueño) */}
              {spot.owner_id && (
                <p className="mt-4 flex items-center gap-1.5 border-t border-border-light pt-4 text-xs font-medium text-text-secondary">
                  <BadgeCheck className="h-3.5 w-3.5 text-violet" strokeWidth={1.75} aria-hidden="true" />
                  Local colaborador de Franky
                </p>
              )}
            </Reveal>

            {/* Horarios: texto enriquecido o, si no, el JSONB legado */}
            <Reveal variant="fade" delay={200} className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              {details.opening_hours_text ? (
                <>
                  <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Horarios
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm text-text-secondary">{details.opening_hours_text}</p>
                </>
              ) : openingHours && Object.keys(openingHours).length > 0 ? (
                <>
                  <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Horarios
                  </p>
                  <dl className="mt-3 divide-y divide-border-light">
                    {ordenarSemana(openingHours).map(([day, hours]) => (
                      <div key={day} className="flex justify-between gap-3 py-1.5 text-sm">
                        <dt className="text-text-secondary">{dayNames[day.toLowerCase()] || day}</dt>
                        <dd className="font-medium text-text-primary tabular">{hours || "Por confirmar"}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <>
                  <p className="eyebrow text-text-muted">Antes de ir</p>
                  <p className="mt-3 text-sm text-text-secondary">Aún no tenemos un horario confirmado. Consulta la web del lugar o contacta con él para comprobar horarios, entradas y disponibilidad.</p>
                </>
              )}
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  );
}
