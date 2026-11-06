import OrganizationEventBadge from '@/components/OrganizationEventBadge';
import { shirtPrices, shirtPriceLabel } from "@/lib/event-shirt-pricing";
﻿import {
  Calendar, MapPin, Clock, Users, Tag, ArrowLeft, ExternalLink, Share2,
  ShieldCheck, MessageSquare, Pencil, Sparkles, Shirt, ArrowUpRight,
} from "lucide-react";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase-server";
import { getPayoutStatus } from "@/lib/connect";
import { holdIsLive } from "@/lib/ticket-hold";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import EventActions from "./event-actions";
import TicketPurchase from "./ticket-purchase";
import EventWaitlist from "./event-waitlist";
import EventGroupChat from "./event-group-chat";
import EventPhotoGallery from "./event-photo-gallery";
import RouteButton from "@/app/ocio/[id]/route-button";
import EventShareButton from "./event-share-button";
import EventAdmissionNotice from './event-admission-notice';
import EventCard, { OfficialChip } from "../components/event-card";
import { eventCategory } from "../components/event-category";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, ScrollProgress } from "@/components/motion";
import type { EventData } from "../components/event-card";
import { MADRID_TZ } from "@/lib/event-time";
import { EVENT_DETAIL_SELECT } from "@/lib/event-queries";
import JsonLd from "@/components/JsonLd";

export const dynamic = 'force-dynamic'


// Rendimiento (sep-2026): generateMetadata y la página pedían el evento por
// separado. `cache()` de React deduplica dentro de la misma petición: una
// consulta en vez de dos. Cliente de sesión a propósito: el organizador ve su
// evento aunque la RLS lo oculte a los demás.
// EVENT_DETAIL_SELECT nombra la FK de universities: con el embed ambiguo
// (PGRST201) la ficha daba 404 a todo el mundo, ver lib/event-queries.ts.
const getEvent = cache(async (id: string) => {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("events")
    .select(EVENT_DETAIL_SELECT)
    .eq("id", id)
    .single();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: "Evento", robots: { index: false, follow: true } };
  const description = (event.description as string | null)?.trim().slice(0, 160) || `Evento universitario en ${event.city}: fecha, lugar y entradas en Franky.`;
  return {
    title: `${event.title} · ${event.city}`,
    description,
    alternates: { canonical: `/eventos/${id}` },
    openGraph: {
      title: event.title,
      description,
      url: `/eventos/${id}`,
      type: "website",
      ...(event.image_url ? { images: [{ url: event.image_url }] } : {}),
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  // El evento y la sesión no dependen entre sí: en paralelo.
  const [event, { data: { user } }] = await Promise.all([
    getEvent(id),
    supabase.auth.getUser(),
  ]);

  if (!event) notFound();

  const isOrganizer = !!user && user.id === event.organizer_id;

  // Fuente de verdad de la participación según el tipo de evento:
  //  - Gratuito → event_participants (inscripción "Inscribirme").
  //  - De pago  → event_tickets (entrada comprada y pagada).
  // El recuento de plazas y el estado "apuntado" se leen de la tabla que
  // corresponde. Si en un evento de pago se contara event_participants,
  // aparecerían como apuntados quienes se inscribieron cuando el evento era
  // gratis (o por otra vía) sin comprar entrada.
  // Tres modos de cobro (migración 097):
  //  - 'app'  → se cobra por la app (entradas Stripe Connect).
  //  - 'info' → precio orientativo; la gente se apunta gratis y paga aparte.
  //  - 'free' → gratuito.
  // Fallback a la semántica antigua (price > 0 ⇒ app) por si alguna fila aún no
  // tuviera payment_mode al desplegar antes de aplicar la migración.
  const paymentMode: string =
    (event.payment_mode as string | null) ??
    (Number(event.price) > 0 ? "app" : "free");
  const prices = shirtPrices(event);
  const isPaidViaApp = Number(event.price) > 0 && paymentMode === "app";
  const isInformationalPrice = Number(event.price) > 0 && paymentMode !== "app";

  // Rendimiento (sep-2026): esta ficha encadenaba hasta ocho consultas en
  // serie (entradas, aforo, estado de cobros, relacionados, normas, nombre del
  // organizador...). Ninguna depende del resultado de otra, así que ahora van
  // todas en paralelo: el tiempo de servidor pasa de la suma al máximo. La
  // lógica de cada bloque es la misma que antes, solo cambia cuándo se espera.
  const resolveParticipation = async () => {
    let isRegistered = false;
    let participantCount = 0;
    let hasTicket = false;
    let pendingReservation = false;
    let ticketsSoldOut = false;
    let organizerConnectStatus: "active" | "pending" | "none" = "none";

    if (isPaidViaApp) {
      const [myTicketsRes, availabilityRes, connectStatus] = await Promise.all([
        // select("*") para leer reserved_until (165) sin romper la ficha si la
        // migración no estuviera aplicada, y varias filas en vez de una: quien
        // tenga una reserva caducada Y una entrada pagada tiene que ver la pagada.
        user
          ? supabase
              .from("event_tickets")
              .select("*")
              .eq("event_id", id)
              .eq("holder_id", user.id)
              .in("status", ["valid", "used", "pending_payment"])
              .limit(5)
          : Promise.resolve({ data: null }),
        // Aforo/plazas por entradas. get_event_ticket_availability es SECURITY
        // DEFINER: devuelve el recuento global aunque RLS oculte entradas ajenas.
        supabase.rpc("get_event_ticket_availability", { p_event_id: id }),
        // Estado de cobros del organizador. Se calcula SIEMPRE (no solo para el
        // organizador): si no puede recibir el dinero todavía, la compra
        // terminaría en un 409 de /api/stripe/pay/ticket después de haber
        // reservado plaza, así que al comprador se le dice que las entradas aún
        // no están a la venta en vez de dejarle chocar contra el error.
        //
        // `live` solo para el propio organizador (que puede venir de terminar
        // el alta); para los visitantes vale el estado guardado, que
        // getPayoutStatus refresca desde Stripe como mucho una vez cada pocos
        // minutos.
        event.organizer_id
          ? getPayoutStatus(event.organizer_id, { live: isOrganizer })
          : Promise.resolve("none" as const),
      ]);

      if (user) {
        const myTickets = myTicketsRes.data;
        const pagada = (myTickets ?? []).find(
          (t) => t.status === "valid" || t.status === "used"
        );
        // Una reserva CADUCADA no es una entrada: si se contara, la ficha diría
        // "tienes tu entrada" y le esconderíamos el botón de comprar a alguien
        // que ya no tiene plaza.
        const reservaViva = (myTickets ?? []).find(
          (t) => t.status === "pending_payment" && holdIsLive(t.reserved_until as string | null)
        );
        hasTicket = !!pagada;
        pendingReservation = !!reservaViva && !pagada;
        // El chat y el estado "apuntado" requieren entrada pagada (valid/used),
        // no una reserva pendiente de pago.
        isRegistered = !!pagada;
      }
      const av = availabilityRes.data as { sold?: number; sold_out?: boolean } | null;
      participantCount = av?.sold ?? 0;
      ticketsSoldOut = !!av?.sold_out;
      organizerConnectStatus = connectStatus;
    } else {
      // Evento gratuito: inscripción vía event_participants.
      // La tabla ya no es legible en bloque (migración 150); el conteo público
      // viaja por RPC, que solo devuelve el número.
      const [countRes, participationRes] = await Promise.all([
        supabase.rpc("get_event_participant_count", { p_event_id: id }),
        user
          ? supabase
              .from("event_participants")
              .select("id")
              .eq("event_id", id)
              .eq("user_id", user.id)
              .eq("status", "registered")
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      participantCount = (countRes.data as number | null) ?? 0;
      isRegistered = !!participationRes.data;
    }

    return { isRegistered, participantCount, hasTicket, pendingReservation, ticketsSoldOut, organizerConnectStatus };
  };

  // Related events (same category, excluding current). Include events without
  // end_date by also accepting future start_date.
  const nowIso = new Date().toISOString();
  const [
    { isRegistered, participantCount, hasTicket, pendingReservation, ticketsSoldOut, organizerConnectStatus },
    { data: relatedRaw },
    { data: eventRules },
    { data: org },
  ] = await Promise.all([
    resolveParticipation(),
    supabase
      .from("events")
      .select("*")
      .eq("category", event.category)
      .neq("id", event.id)
      .or(`end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${nowIso})`)
      .order("start_date", { ascending: true })
      .limit(3),
    // Event rules
    supabase
      .from("event_rules")
      .select("id, rule_text, display_order")
      .eq("event_id", id)
      .order("display_order", { ascending: true }),
    // Nombre del organizador para enlazar a su página pública
    // (/organizador/[id]), como en la app. Fail-soft: sin perfil, se queda
    // como estaba (solo la uni).
    event.organizer_id
      ? supabase
          .from("public_profiles")
          .select("full_name")
          .eq("id", event.organizer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const relatedEvents: EventData[] = (relatedRaw || []).map((e) => ({ ...e, participant_count: undefined }));
  const organizerName: string | null =
    ((org as { full_name?: string | null } | null)?.full_name ?? null)?.trim() || null;

  const startDate = new Date(event.start_date);
  const endDate = event.end_date ? new Date(event.end_date) : null;
  const isPast = startDate < new Date();
  const isFull = event.max_capacity && participantCount >= event.max_capacity;
  // Quién ve el chat del grupo: los apuntados y el organizador, que es el admin
  // del grupo de su evento (migración 166).
  const puedeChatear = !!user && (isRegistered || isOrganizer);

  // Lista de espera (migración 136): solo tiene sentido con el evento agotado
  // (entradas vendidas en eventos de pago, aforo lleno en los gratuitos) y para
  // quien todavía no tiene sitio. El estado "ya apuntado" se lee en servidor.
  const eventSoldOut = isPaidViaApp ? ticketsSoldOut : !!isFull;
  const showWaitlist = eventSoldOut && !isPast && !isOrganizer && !hasTicket && !pendingReservation && !isRegistered;
  let waitlistJoined = false;
  if (showWaitlist && user) {
    const { data: wl } = await supabase
      .from("event_waitlist")
      .select("event_id")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    waitlistJoined = !!wl;
  }
  const cat = eventCategory(event.category);
  const CatIcon = cat.icon;
  const capacityPct = event.max_capacity
    ? Math.min((participantCount / event.max_capacity) * 100, 100)
    : null;

  // Photos: prefer the array column, fall back to the legacy single image_url.
  const eventPhotos: string[] = Array.isArray(event.photos) && event.photos.length > 0
    ? event.photos
    : event.image_url ? [event.image_url] : [];

  const locationLabel = event.venue ? `${event.venue}, ${event.city}` : event.city;
  const mapsUrl =
    event.latitude && event.longitude
      ? `https://www.google.com/maps?q=${event.latitude},${event.longitude}`
      : event.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address + ", " + event.city)}`
      : null;

  const timeLabel =
    startDate.toLocaleTimeString("es-ES", { timeZone: MADRID_TZ, hour: "2-digit", minute: "2-digit" }) +
    (endDate ? ` a ${endDate.toLocaleTimeString("es-ES", { timeZone: MADRID_TZ, hour: "2-digit", minute: "2-digit" })}` : "");
  const longDate = startDate.toLocaleDateString("es-ES", {
    timeZone: MADRID_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dayNum = startDate.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, day: "numeric" });
  const monthShort = startDate.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, month: "short" }).replace(".", "");

  // Datos estructurados Event (resultados enriquecidos de Google).
  const eventUrl = `https://franky.es/eventos/${event.id}`;
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    ...(event.description ? { description: event.description } : {}),
    startDate: event.start_date,
    ...(event.end_date ? { endDate: event.end_date } : {}),
    eventStatus:
      event.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: eventUrl,
    ...(eventPhotos.length > 0 ? { image: eventPhotos } : {}),
    location: {
      "@type": "Place",
      name: event.venue || event.city,
      address: {
        "@type": "PostalAddress",
        ...(event.address ? { streetAddress: event.address } : {}),
        addressLocality: event.city,
      },
      ...(event.latitude && event.longitude
        ? { geo: { "@type": "GeoCoordinates", latitude: event.latitude, longitude: event.longitude } }
        : {}),
    },
    offers: {
      "@type": "Offer",
      price: Number(event.price) > 0 ? Number(event.price) : 0,
      priceCurrency: "EUR",
      availability: eventSoldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: eventUrl,
      validFrom: event.created_at ?? undefined,
    },
    organizer: organizerName
      ? { "@type": "Person", name: organizerName, url: `https://franky.es/organizador/${event.organizer_id}` }
      : { "@type": "Organization", name: event.universities?.name || "Franky", url: "https://franky.es" },
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={eventJsonLd} />
      <ScrollProgress />

      {/* Cabecera editorial: sin foto a sangre, la imagen va después en un marco */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 lg:pt-10 lg:pb-12">
          <Link
            href="/eventos"
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Todos los eventos
          </Link>

          <Reveal className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex gap-6">
              {/* Fecha como bloque tipográfico */}
              <div className="hidden shrink-0 flex-col items-center border-r border-border-light pr-6 sm:flex">
                <span className="font-heading text-5xl font-extrabold leading-none tracking-tight text-text-primary tabular">{dayNum}</span>
                <span className="eyebrow mt-2 text-text-muted">{monthShort}</span>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="eyebrow inline-flex items-center gap-1.5 text-violet">
                    <CatIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> {cat.label}
                  </p>
                  {/* Evento Franky (164): lo pone la BD según el rol del organizador, nunca el formulario. */}
                  {event.is_official && <OfficialChip small />}
                  <OrganizationEventBadge eventId={event.id}/>
                  {event.shirts_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      <Shirt className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> {prices ? "Camiseta opcional" : "Con camiseta"}
                    </span>
                  )}
                  {event.is_featured && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">Destacado</span>
                  )}
                  {isPast && (
                    <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-muted">Finalizado</span>
                  )}
                </div>

                <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
                  {event.title}
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <span className="capitalize">{longDate}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular">
                    <Clock className="h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" /> {timeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" /> {locationLabel}
                  </span>
                </div>

                {(organizerName || event.universities?.name) && (
                  <p className="mt-3 text-sm text-text-muted">
                    Organizado por{" "}
                    {organizerName ? (
                      <Link href={`/organizador/${event.organizer_id}`} className="link-underline font-semibold text-text-primary">
                        {organizerName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-primary">{event.universities?.name}</span>
                    )}
                    {organizerName && event.universities?.name && <span> · {event.universities.name}</span>}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <EventShareButton eventId={event.id} title={event.title} city={event.city} />
              {event.is_official &&
                event.crush_live_enabled &&
                ["upcoming", "ongoing"].includes(event.status ?? "") && (
                <Link href={`/crush/live?eventId=${encodeURIComponent(event.id)}`} className={buttonVariants({ variant: "outline" })}>
                  <Sparkles className="h-4 w-4 text-fuchsia" strokeWidth={1.75} aria-hidden="true" /> Crush Live
                </Link>
              )}
              {isOrganizer && (
                <Link href={`/eventos/${event.id}/editar`} className={buttonVariants({ variant: "dark" })}>
                  <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Editar evento
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-20">
        {/* Foto principal en marco */}
        {event.image_url && (
          <Reveal variant="scale" className="img-zoom relative mt-8 aspect-[16/9] overflow-hidden rounded-3xl border border-border bg-bg-secondary shadow-card sm:aspect-[21/9]">
            <Image
              src={event.image_url}
              alt={event.title}
              fill
              className="object-cover"
              priority
              // Es la imagen grande de la ficha (la que decide la sensacion de
              // velocidad al abrir un evento). Optimizada, el navegador recibe
              // AVIF o WebP del tamano justo en vez del original de Storage, que
              // puede pesar varios megas. Consume cuota de imagenes de Vercel,
              // pero con pocos eventos y cache de 30 dias compensa de sobra.
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1152px"
            />
          </Reveal>
        )}

        {/* Galería (solo cuando hay más fotos aparte de la principal) */}
        {eventPhotos.length > 1 && (
          <Reveal className="mt-4">
            <EventPhotoGallery photos={eventPhotos} alt={event.title} />
          </Reveal>
        )}

        <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-3 lg:gap-14">
          {/* Contenido */}
          <div className="max-w-3xl space-y-12 lg:col-span-2">
            <EventAdmissionNotice eventId={event.id} />
            {/* Descripción */}
            <Reveal as="section">
              <p className="eyebrow text-text-muted">Sobre este evento</p>
              <p className="mt-4 whitespace-pre-line text-[17px] leading-relaxed text-text-secondary">
                {event.description || "Sin descripción disponible."}
              </p>
            </Reveal>

            {/* Normas */}
            {eventRules && eventRules.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Normas del evento
                </p>
                <ol className="mt-4 divide-y divide-border-light border-y border-border-light">
                  {eventRules.map((rule, i) => (
                    <li key={rule.id} className="flex items-start gap-4 py-3">
                      <span className="w-6 shrink-0 font-heading text-sm font-bold text-text-muted tabular">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-sm leading-relaxed text-text-secondary">{rule.rule_text}</p>
                    </li>
                  ))}
                </ol>
              </Reveal>
            )}

            {/* Chat del grupo: inscritos y SIEMPRE el organizador. En un evento
                de pago el organizador no puede tener entrada (no se compra la
                de tu propio evento), así que exigirle "estar apuntado" le dejaba
                fuera del chat de su propio evento (migración 166). */}
            {puedeChatear && (
              <Reveal as="section" className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
                <div className="flex items-center gap-2 border-b border-border-light px-6 py-4">
                  <MessageSquare className="h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                  <h2 className="font-heading text-base font-bold text-text-primary">Chat del evento</h2>
                </div>
                <EventGroupChat eventId={id} userId={user.id} />
              </Reveal>
            )}

            {/* Aviso para quien aún no participa */}
            {user && !puedeChatear && !isPast && (
              <Reveal as="section" className="rounded-2xl border border-dashed border-border px-6 py-8 text-center">
                <MessageSquare className="mx-auto h-6 w-6 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
                <p className="mt-3 font-heading font-semibold text-text-primary">Chat exclusivo para participantes</p>
                <p className="mt-1 text-sm text-text-muted">
                  {isPaidViaApp
                    ? "Compra tu entrada para acceder al chat grupal."
                    : "Apúntate al evento para acceder al chat grupal."}
                </p>
              </Reveal>
            )}

            {/* Eventos similares */}
            {relatedEvents.length > 0 && (
              <section>
                <Reveal className="flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow text-violet">Te puede interesar</p>
                    <h2 className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">Eventos similares</h2>
                  </div>
                  <Link href="/eventos" className="group hidden items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary sm:inline-flex">
                    Ver todos <ArrowUpRight className="arrow-nudge h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </Reveal>
                <Reveal stagger className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedEvents.map((e, i) => (
                    <RevealItem key={e.id} index={i} className="flex">
                      <EventCard event={e} />
                    </RevealItem>
                  ))}
                </Reveal>
              </section>
            )}
          </div>

          {/* Lateral pegajoso: datos + acción principal */}
          <aside className="lg:col-span-1">
            <Reveal variant="fade" delay={120} className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card lg:sticky lg:top-24">
              <dl className="space-y-5">
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="eyebrow text-text-muted">Cuándo</dt>
                    <dd className="mt-1 text-sm font-semibold capitalize text-text-primary">{longDate}</dd>
                    <dd className="mt-0.5 text-sm text-text-muted tabular">{timeLabel}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <dt className="eyebrow text-text-muted">Dónde</dt>
                    <dd className="mt-1 text-sm font-semibold text-text-primary">{locationLabel}</dd>
                    {event.address && <dd className="mt-0.5 text-sm text-text-muted">{event.address}</dd>}
                    {/* Con coordenadas, la ruta se calcula DENTRO de la web
                        (overlay con tiempos reales de OSRM, a pie y en coche).
                        Solo sin coordenadas queda el enlace externo, porque
                        sin lat/lng no hay ruta posible. */}
                    {event.latitude && event.longitude ? (
                      <dd className="mt-1.5">
                        <RouteButton
                          lat={event.latitude}
                          lng={event.longitude}
                          name={event.venue ? `${event.venue}, ${event.city}` : event.title}
                          className="link-underline inline-flex items-center gap-1 text-sm font-medium text-violet"
                        >
                          Cómo llegar
                        </RouteButton>
                      </dd>
                    ) : mapsUrl ? (
                      <dd className="mt-1.5">
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-underline inline-flex items-center gap-1 text-sm font-medium text-violet"
                        >
                          Ver en Google Maps
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        </a>
                      </dd>
                    ) : null}
                  </div>
                </div>

                {/* Aforo: siempre lo ve el organizador; el resto solo si el evento lo permite */}
                {(event.show_participant_count !== false || isOrganizer) && (
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div className="flex-1">
                      <dt className="eyebrow text-text-muted">Aforo</dt>
                      <dd className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-text-primary tabular">
                          {event.max_capacity
                            ? `${participantCount}/${event.max_capacity} plazas`
                            : `${participantCount} ${participantCount === 1 ? "persona apuntada" : "personas apuntadas"}`}
                        </span>
                        {isFull && <span className="eyebrow text-error">Completo</span>}
                      </dd>
                      {event.max_capacity && (
                        <dd className="mt-2 h-1 w-full rounded-full bg-bg-tertiary">
                          <div
                            className={`h-1 rounded-full transition-[width] duration-700 ease-[var(--ease-out-quart)] ${
                              capacityPct && capacityPct >= 90
                                ? "bg-error"
                                : capacityPct && capacityPct >= 70
                                ? "bg-warning"
                                : "bg-success"
                            }`}
                            style={{ width: `${capacityPct || 0}%` }}
                          />
                        </dd>
                      )}
                      {isOrganizer && event.show_participant_count === false && (
                        <dd className="mt-1.5 text-xs text-text-muted">
                          Solo tú ves este recuento: está oculto para el resto.
                        </dd>
                      )}
                      {isOrganizer && (
                        <dd className="mt-2">
                          <Link
                            href={
                              isPaidViaApp
                                ? `/eventos/${event.id}/entradas`
                                : `/eventos/${event.id}/asistentes`
                            }
                            className="link-underline inline-flex items-center gap-1.5 text-sm font-medium text-violet"
                          >
                            <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            {isPaidViaApp
                              ? "Ver quién tiene entrada"
                              : "Ver quién se ha apuntado"}
                          </Link>
                        </dd>
                      )}
                    </div>
                  </div>
                )}

                {/* Precio en cifras tabulares */}
                {event.price != null && (
                  <div className="flex items-start gap-3">
                    <Tag className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    <div>
                      <dt className="eyebrow text-text-muted">Precio</dt>
                      <dd className="mt-1 text-sm font-semibold text-text-primary tabular">
                        {prices ? (
                          <span className="block space-y-1">
                            <span className="block">Sin camiseta · {shirtPriceLabel(prices.withoutCents)}</span>
                            <span className="block">Con camiseta · {shirtPriceLabel(prices.withCents)}</span>
                          </span>
                        ) : event.price === 0 ? (
                          <span className="text-success">Entrada gratuita</span>
                        ) : isInformationalPrice ? (
                          <>
                            <span className="font-heading text-2xl font-extrabold">{event.price}€</span>{" "}
                            <span className="block text-xs font-normal text-text-muted">Orientativo, se paga aparte</span>
                          </>
                        ) : (
                          <>
                            <span className="font-heading text-2xl font-extrabold">{event.price}€</span>{" "}
                            <span className="text-xs font-normal text-text-muted">por persona</span>
                          </>
                        )}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              {/* Apuntarse / comprar entrada */}
              <div className="mt-6 border-t border-border-light pt-5">
                {isPaidViaApp ? (
                  <TicketPurchase
                    eventId={event.id}
                    price={Number(event.price)}
                    accountId={user?.id ?? null}
                    isLoggedIn={!!user}
                    isPast={isPast}
                    isOrganizer={isOrganizer}
                    hasTicket={hasTicket}
                    pendingReservation={pendingReservation}
                    soldOut={ticketsSoldOut}
                    connectStatus={organizerConnectStatus}
                    shirtsEnabled={!!event.shirts_enabled}
                  />
                ) : (
                  <>
                    <EventActions
                      prices={prices}
                      eventId={event.id}
                      isLoggedIn={!!user}
                      isRegistered={isRegistered}
                      isPast={isPast}
                      isFull={!!isFull}
                      shirtsEnabled={!!event.shirts_enabled}
                    />
                    {isInformationalPrice && (
                      <p className="mt-3 flex items-start gap-2 text-xs text-text-muted">
                        <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span>
                          Apúntate para reservar tu sitio. El pago {prices ? "de la opción elegida" : `(${event.price}€)`}
                          se hace aparte, fuera de la app (en persona, Bizum…).
                        </span>
                      </p>
                    )}
                  </>
                )}
                {/* Lista de espera cuando el evento está agotado (migración 136) */}
                {showWaitlist && (
                  <EventWaitlist
                    eventId={event.id}
                    isLoggedIn={!!user}
                    initialJoined={waitlistJoined}
                  />
                )}
              </div>
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  );
}
