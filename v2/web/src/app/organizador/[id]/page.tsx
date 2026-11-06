import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, GraduationCap, MapPin, ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, RevealItem, CountUp } from "@/components/motion";
import { MADRID_TZ } from "@/lib/event-time";
import { createServerSupabase } from "@/lib/supabase-server";
import VerifiedBadge from "@/components/VerifiedBadge";
import EventCard, { type EventData } from "@/app/eventos/components/event-card";

// ─── Página pública del organizador ───────────────────────────────────────
// Dado el id de un perfil, lista TODOS sus eventos (tabla events, columna
// organizer_id) separados en "Próximos" y "Pasados". Visible para cualquiera
// (RLS "Events are viewable by everyone"), no solo para el propio organizador:
// es la ficha a la que se llega desde "Organizado por" en la ficha de evento.
// Espejo de mobile/app/organizador/[id].tsx. Solo lee public_profiles (sin PII).

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrganizerProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  career: string | null;
  city: string | null;
  student_email_verified: boolean | null;
  universities: { name?: string | null } | null;
};

async function loadOrganizer(id: string): Promise<OrganizerProfile | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("public_profiles")
    .select("id, full_name, avatar_url, bio, career, city, student_email_verified, universities")
    .eq("id", id)
    .maybeSingle();
  return (data as OrganizerProfile | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await loadOrganizer(id);
  // Sin perfil: 404 real desde la metadata (la ruta ya añade su propio
  // noindex; antes salían dos etiquetas robots y un 200 con "no encontrado").
  if (!profile) notFound();
  const name = profile.full_name?.trim() || "Organizador";
  return {
    title: `Eventos de ${name}`,
    description: `Todos los eventos universitarios que organiza ${name} en Franky: próximos y pasados.`,
    alternates: { canonical: `/organizador/${profile.id}` },
    openGraph: {
      title: `Eventos de ${name}`,
      description: `Próximos planes y eventos organizados por ${name}.`,
      url: `/organizador/${profile.id}`,
      type: "profile",
      ...(profile.avatar_url ? { images: [{ url: profile.avatar_url }] } : {}),
    },
  };
}

function initialsOf(name: string | null): string {
  const src = (name ?? "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function OrganizadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await loadOrganizer(id);
  if (!profile) notFound();

  const supabase = await createServerSupabase();
  const { data: rows } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", profile.id)
    .order("start_date", { ascending: false })
    .limit(200);
  const events = ((rows ?? []) as EventData[]).map((e) => ({ ...e, participant_count: undefined }));

  const nowMs = Date.now();
  const upcoming = events
    .filter((e) => new Date(e.start_date).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  const past = events.filter((e) => new Date(e.start_date).getTime() < nowMs);

  const name = profile.full_name?.trim() || "Organizador";
  const universityName = profile.universities?.name ?? null;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial del organizador */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 lg:pt-10 lg:pb-12">
          <Link
            href="/eventos"
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Todos los eventos
          </Link>

          <Reveal className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-secondary shadow-card">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={name}
                  width={96}
                  height={96}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="font-heading text-3xl font-bold text-text-primary">{initialsOf(profile.full_name)}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-violet">Organizador</p>
              <h1 className="mt-2 flex items-center gap-2 font-heading text-fluid-h2 font-extrabold tracking-tight text-text-primary">
                <span className="truncate">{name}</span>
                <VerifiedBadge verified={profile.student_email_verified} size="md" />
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
                {profile.career && <span>{profile.career}</span>}
                {universityName && (
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-text-primary" strokeWidth={1.75} aria-hidden="true" /> {universityName}
                  </span>
                )}
                {profile.city && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-text-primary" strokeWidth={1.75} aria-hidden="true" /> {profile.city}
                  </span>
                )}
              </div>
              {profile.bio && (
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-text-secondary">{profile.bio}</p>
              )}
              <Link
                href={`/perfil/${profile.id}`}
                className="group mt-4 inline-flex items-center gap-1 text-sm font-medium text-text-primary"
              >
                <span className="link-underline">Ver perfil completo</span>
                <ArrowUpRight className="arrow-nudge h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>

            {/* Cifras en tabular */}
            <dl className="grid shrink-0 grid-cols-3 gap-6 border-t border-border-light pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
              <div>
                <dt className="eyebrow text-text-muted">Eventos</dt>
                <dd className="mt-1 font-heading text-3xl font-bold text-text-primary tabular"><CountUp value={events.length} /></dd>
              </div>
              <div>
                <dt className="eyebrow text-text-muted">Próximos</dt>
                <dd className="mt-1 font-heading text-3xl font-bold text-text-primary tabular"><CountUp value={upcoming.length} /></dd>
              </div>
              <div>
                <dt className="eyebrow text-text-muted">Pasados</dt>
                <dd className="mt-1 font-heading text-3xl font-bold text-text-primary tabular"><CountUp value={past.length} /></dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        {events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Sin eventos"
            description="Este organizador todavía no ha publicado ningún evento."
            action={{ href: "/eventos", label: "Ver otros eventos" }}
          />
        ) : (
          <>
            {upcoming.length > 0 && (
              <section aria-labelledby="proximos-title">
                <Reveal className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow text-violet">Agenda</p>
                    <h2 id="proximos-title" className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">Próximos</h2>
                  </div>
                  <span className="text-sm text-text-muted tabular">{upcoming.length}</span>
                </Reveal>
                <Reveal stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((e, i) => (
                    <RevealItem key={e.id} index={i} className="flex">
                      <EventCard event={e} />
                    </RevealItem>
                  ))}
                </Reveal>
              </section>
            )}
            {past.length > 0 && (
              <section aria-labelledby="pasados-title">
                <Reveal className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow text-text-muted">Historial</p>
                    <h2 id="pasados-title" className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">Pasados</h2>
                  </div>
                  <span className="text-sm text-text-muted tabular">{past.length}</span>
                </Reveal>
                {/* Tabla compacta: los eventos pasados no necesitan tarjeta */}
                <Reveal className="overflow-x-auto rounded-2xl border border-border shadow-card">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th scope="col" className="eyebrow px-5 py-3 font-semibold text-text-muted">Fecha</th>
                        <th scope="col" className="eyebrow px-5 py-3 font-semibold text-text-muted">Evento</th>
                        <th scope="col" className="eyebrow px-5 py-3 font-semibold text-text-muted">Ciudad</th>
                        <th scope="col" className="eyebrow px-5 py-3 text-right font-semibold text-text-muted">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {past.map((e) => (
                        <tr key={e.id} className="transition-colors hover:bg-bg-secondary">
                          <td className="whitespace-nowrap px-5 py-3 text-text-muted tabular">
                            {new Date(e.start_date).toLocaleDateString("es-ES", { timeZone: MADRID_TZ, day: "2-digit", month: "short", year: "numeric" }).replace(".", "")}
                          </td>
                          <td className="px-5 py-3">
                            <Link href={`/eventos/${e.id}`} className="font-heading font-semibold text-text-primary transition-colors hover:text-violet">
                              {e.title}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-text-secondary">{e.city}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-text-secondary tabular">
                            {!e.price || e.price === 0 ? "Gratis" : `${Number(e.price).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Reveal>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
