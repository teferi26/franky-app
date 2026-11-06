import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  MapPin, Phone, Mail, ExternalLink, ArrowLeft, ArrowUpRight, Home, Info,
  CalendarClock, ListChecks, Users, MessageSquare,
} from "lucide-react";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { createServerSupabase } from "@/lib/supabase-server";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { Reveal, RevealItem, SpotlightCard, ScrollProgress } from "@/components/motion";
import AlojamientoDetailClient from "./client";
import FlatResidents, { type FlatResident } from "./components/flat-residents";
import VisitBooking from "./components/visit-booking";
import AccommodationGallery from "./components/accommodation-gallery";
import MobileActionBar from "./components/mobile-action-bar";
import {
  Section,
  HousingSpecs,
  HousingFeatures,
  HousingRules,
  BillsIncluded,
  StayInfo,
  FlatmatesSummary,
  LocationInfo,
  ExtraInfo,
  PriceBreakdown,
  HeaderBadges,
  hasAnyFeature,
  hasAnyBills,
  hasAnyRule,
  hasAnyStayInfo,
  TYPE_LABELS,
  type AccommodationRow,
  type NearbyUniversity,
} from "./components/accommodation-facts";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

// Rendimiento (sep-2026): generateMetadata y la página pedían el mismo anuncio
// por separado. `cache()` de React deduplica dentro de la misma petición: una
// consulta en vez de dos. Va con el cliente de sesión (no el anon) porque el
// propietario tiene que poder ver su anuncio aunque esté pausado (RLS).
// OJO: las columnas reales son price/images/sqm (001+029); price_month,
// image_url y rating nunca existieron y rompían metadata, precio y similares.
const getAccommodation = cache(async (id: string) => {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("accommodations")
    .select("*")
    .eq("id", id)
    .single();
  return (data as AccommodationRow | null) ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getAccommodation(id);

  if (!data) return { title: "Alojamiento no encontrado" };

  const cover: string | undefined = data.images?.[0];

  return {
    title: `${data.title} - ${data.city}`,
    description: `Alojamiento universitario en ${data.city}. Desde ${data.price}€/mes. Fotos, servicios, gastos, condiciones de estancia y contacto directo con el anunciante.`,
    openGraph: cover ? { images: [{ url: cover }] } : undefined,
  };
}

// Enlaces a los canales externos del anunciante (WhatsApp, email, Instagram):
// una fila limpia con borde hairline, sin fondos tintados.
const channelClass =
  "flex w-full items-center gap-2.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary";

export default async function AlojamientoDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const acc = await getAccommodation(id);
  if (!acc) notFound();

  // Rendimiento (sep-2026): universidad cercana, similares y residentes no
  // dependen entre sí; iban en serie (tres viajes sumados) y ahora van en
  // paralelo: el tiempo de servidor pasa a ser el de la más lenta.
  //
  // La universidad cercana va en CONSULTA APARTE, nunca como embed
  // `universities(...)` dentro del select de accommodations: hay más de un
  // camino entre las tablas y PostgREST responde PGRST201, tumbando la
  // consulta entera (nos pasó con profiles en el catálogo).
  const [uniRes, { data: similar }, { data: residentsRaw }] = await Promise.all([
    acc.university_id
      ? supabase
          .from("universities")
          .select("name, short_name, slug, city")
          .eq("id", acc.university_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("accommodations")
      .select("id, title, city, price, type, images")
      .eq("city", acc.city)
      .eq("status", "active")
      .eq("is_paid", true)
      .neq("id", id)
      .limit(3),
    supabase.rpc("get_flat_public_residents", { p_accommodation_id: id }),
  ]);
  const university = (uniRes.data as NearbyUniversity | null) ?? null;
  const residents = (residentsRaw ?? []) as FlatResident[];

  const images = (acc.images ?? []).filter(Boolean);
  const videos = (acc.videos ?? []).filter(Boolean);
  const zona = [acc.city, acc.comunidad_autonoma].filter(Boolean).join(" · ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    name: acc.title,
    description: acc.description || undefined,
    image: images.length > 0 ? images : undefined,
    numberOfRooms: acc.rooms ?? undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: acc.address || undefined,
      addressLocality: acc.city,
      addressRegion: acc.comunidad_autonoma || undefined,
      addressCountry: "ES",
    },
    floorSize: acc.sqm
      ? { "@type": "QuantitativeValue", value: acc.sqm, unitCode: "MTK" }
      : undefined,
  };

  return (
    <div className="min-h-screen bg-bg-primary pb-28 lg:pb-16">
      <JsonLd data={jsonLd} />
      {/* La ficha es larga: línea de progreso de lectura arriba. */}
      <ScrollProgress />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        <Link
          href="/alojamiento"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
          <span className="link-underline">Volver a alojamiento</span>
        </Link>

        {/* Cabecera tipográfica: qué es, cómo se llama y dónde está. */}
        <Reveal as="header" className="mt-6 mb-8">
          <p className="eyebrow">
            {TYPE_LABELS[acc.type] ?? acc.type}
            {acc.city ? ` · ${acc.city}` : ""}
          </p>
          <h1 className="mt-3 max-w-4xl text-fluid-h1 font-extrabold text-text-primary">
            {acc.title}
          </h1>
          <p className="mt-3 flex items-center gap-1.5 text-[15px] text-text-secondary">
            <MapPin className="h-4 w-4 shrink-0 text-violet" />
            <span>{acc.address ? `${acc.address} · ${zona}` : zona}</span>
          </p>
          <div className="mt-4">
            <HeaderBadges acc={acc} />
          </div>
        </Reveal>

        {/* 1. Fotos, en marco redondeado (sin foto a sangre). */}
        <Reveal variant="scale" delay={80}>
          <AccommodationGallery
            accommodationId={id}
            title={acc.title}
            images={images}
            videos={videos}
          />
        </Reveal>

        <div className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-12">
          {/* Columna principal: secciones separadas por líneas finas. */}
          <div className="max-w-3xl space-y-10 lg:col-span-2">
            {/* 2. Precio y qué incluye (en móvil; en escritorio manda la
                tarjeta pegajosa de la derecha). */}
            <Reveal className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card lg:hidden">
              <PriceBreakdown acc={acc} />
            </Reveal>

            {/* 3. Dónde está */}
            <Reveal>
              <Section title="Dónde está" icon={<MapPin className="h-5 w-5 text-violet" />}>
                <LocationInfo acc={acc} university={university} />
              </Section>
            </Reveal>

            {/* 4. Cómo es */}
            <Reveal>
              <Section title="Cómo es" icon={<Home className="h-5 w-5 text-violet" />}>
                <p className="mb-6 whitespace-pre-line text-[15px] leading-relaxed text-text-secondary">
                  {acc.description?.trim() ||
                    "El anunciante no ha escrito una descripción. Pregúntale por el chat lo que necesites saber."}
                </p>
                <HousingSpecs acc={acc} />
              </Section>
            </Reveal>

            {/* 5. Qué tiene */}
            {(hasAnyFeature(acc) || hasAnyBills(acc) || hasAnyRule(acc)) && (
              <Reveal>
                <Section
                  title="Qué incluye"
                  icon={<ListChecks className="h-5 w-5 text-violet" />}
                >
                  <div className="space-y-6">
                    {hasAnyBills(acc) && (
                      <div>
                        <h3 className="eyebrow mb-3">Gastos</h3>
                        <BillsIncluded acc={acc} />
                      </div>
                    )}
                    {hasAnyFeature(acc) && (
                      <div>
                        <h3 className="eyebrow mb-3">Características</h3>
                        <HousingFeatures acc={acc} />
                      </div>
                    )}
                    {hasAnyRule(acc) && (
                      <div>
                        <h3 className="eyebrow mb-3">Normas y perfil del inquilino</h3>
                        <HousingRules acc={acc} />
                      </div>
                    )}
                  </div>
                </Section>
              </Reveal>
            )}

            {/* 6. Cuándo puede entrar */}
            {hasAnyStayInfo(acc) && (
              <Reveal>
                <Section
                  title="Cuándo puedes entrar"
                  icon={<CalendarClock className="h-5 w-5 text-violet" />}
                >
                  <StayInfo acc={acc} />
                </Section>
              </Reveal>
            )}

            {/* Compañeros: primero el resumen del anuncio, después las personas
                reales que ya viven en el piso. */}
            {(acc.current_flatmates_count != null ||
              (acc.current_flatmates_genders?.length ?? 0) > 0) && (
              <Reveal>
                <Section
                  title="Compañeros de piso"
                  icon={<Users className="h-5 w-5 text-violet" />}
                >
                  <FlatmatesSummary acc={acc} />
                </Section>
              </Reveal>
            )}

            <FlatResidents residents={residents} />

            {/* Información extra del anunciante */}
            {acc.extra_info?.trim() && (
              <Reveal>
                <Section
                  title="Información adicional"
                  icon={<Info className="h-5 w-5 text-violet" />}
                >
                  <ExtraInfo text={acc.extra_info.trim()} />
                </Section>
              </Reveal>
            )}
          </div>

          {/* Barra lateral pegajosa: precio y cómo contactar. */}
          <aside>
            <div className="space-y-5 lg:sticky lg:top-24">
              <Reveal
                variant="fade"
                delay={160}
                id="contactar"
                className="scroll-mt-24 rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6"
              >
                <div className="hidden lg:block">
                  <PriceBreakdown acc={acc} />
                </div>

                <AlojamientoDetailClient
                  accommodationId={id}
                  ownerId={acc.owner_id ?? null}
                />

                {/* Canales reales del alta housing: whatsapp / email / instagram */}
                {(acc.whatsapp || acc.contact_email || acc.instagram) && (
                  <div className="mt-5 space-y-2 border-t border-border-light pt-5">
                    <p className="eyebrow mb-3 flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Otros canales
                    </p>
                    {acc.whatsapp && enlaceWhatsApp(String(acc.whatsapp), acc.title) && (
                      <a
                        href={enlaceWhatsApp(String(acc.whatsapp), acc.title)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={channelClass}
                      >
                        <Phone className="h-4 w-4 text-violet" />
                        WhatsApp
                      </a>
                    )}
                    {acc.contact_email && (
                      <a href={`mailto:${acc.contact_email}`} className={channelClass}>
                        <Mail className="h-4 w-4 text-violet" />
                        Email
                      </a>
                    )}
                    {acc.instagram && (
                      <a
                        href={`https://instagram.com/${String(acc.instagram).replace(/^@/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={channelClass}
                      >
                        <ExternalLink className="h-4 w-4 text-violet" />
                        Instagram
                      </a>
                    )}
                  </div>
                )}
              </Reveal>

              {/* Reserva de visitas (se pinta sola solo si hay huecos) */}
              <VisitBooking accommodationId={id} ownerId={acc.owner_id ?? null} />
            </div>
          </aside>
        </div>

        {/* Pisos similares */}
        {similar && similar.length > 0 && (
          <section className="mt-16 border-t border-border-light pt-12 lg:mt-20">
            <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Cerca de este</p>
                <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
                  Más alojamiento en {acc.city}
                </h2>
              </div>
              <Link
                href={`/alojamiento?ciudad=${encodeURIComponent(acc.city)}`}
                className="group inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary"
              >
                <span className="link-underline">Ver todos en {acc.city}</span>
                <ArrowUpRight className="h-4 w-4 arrow-nudge" />
              </Link>
            </Reveal>
            <Reveal stagger className="mt-8 grid gap-5 sm:grid-cols-3">
              {similar.map((s: { id: string; title: string; city: string; price: number; type: string; images: string[] | null }, i: number) => (
                <RevealItem key={s.id} index={i} asChild>
                  <SpotlightCard asChild>
                    <Link
                      href={`/alojamiento/${s.id}`}
                      className="group hover-lift flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
                    >
                      <div className="img-zoom relative aspect-[4/3] bg-bg-secondary">
                        {s.images?.[0] ? (
                          <Image
                            src={s.images[0]}
                            alt={s.title}
                            fill
                            sizes="(max-width: 640px) 100vw, 33vw"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Home className="h-8 w-8 text-text-muted/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <p className="eyebrow">{TYPE_LABELS[s.type] ?? s.type}</p>
                        <h3 className="mt-1.5 line-clamp-1 font-heading text-[17px] font-bold text-text-primary transition-colors group-hover:text-violet">
                          {s.title}
                        </h3>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <span className="flex items-center gap-1 text-[13px] text-text-muted">
                            <MapPin className="h-3.5 w-3.5" />
                            {s.city}
                          </span>
                          <span className="font-heading text-xl font-extrabold tracking-tight text-text-primary tabular">
                            {Number(s.price).toLocaleString("es-ES")}
                            <span className="ml-0.5 text-xs font-semibold text-text-muted">€/mes</span>
                          </span>
                        </div>
                      </div>
                    </Link>
                  </SpotlightCard>
                </RevealItem>
              ))}
            </Reveal>
          </section>
        )}
      </div>

      <MobileActionBar
        accommodationId={id}
        price={Number(acc.price)}
        billsIncluded={!!acc.bills_included}
      />
    </div>
  );
}
