import { shirtPriceLabel } from '@/lib/event-shirt-pricing';
import OriginGuestAttendees from '@/components/OriginGuestAttendees';
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Shirt } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase-server";
import { Reveal, RevealItem } from "@/components/motion";
import { EmptyState } from "@/components/ui/empty-state";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  isShirtSize,
  shirtSizeLabel,
  tallyShirtSizes,
  type ShirtSize,
} from "@/lib/event-shirts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asistentes del evento",
  robots: { index: false, follow: false },
};

export default async function EventoAsistentesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/eventos/${id}/asistentes`);

  const { data: event } = await supabase
    .from("events")
    // select("*") para no depender de que la 164 esté aplicada: si faltara
    // shirts_enabled, la lista de columnas devolvería error y esta página
    // acabaría en 404 para el organizador.
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  // Solo el organizador del evento (o un admin) puede ver la lista de apuntados.
  if (event.organizer_id !== user.id && !isAdmin) redirect(`/eventos/${id}`);

  // Los eventos que cobran por la app gestionan a sus asistentes vía entradas
  // (event_tickets), no vía event_participants. Redirige a esa vista.
  const paymentMode: string =
    (event.payment_mode as string | null) ??
    (Number(event.price) > 0 ? "app" : "free");
  const isPaidViaApp = Number(event.price) > 0 && paymentMode === "app";
  if (isPaidViaApp) redirect(`/eventos/${id}/entradas`);

  // Inscritos vigentes (no cancelados ni expulsados). RLS deja leer las
  // inscripciones; la autorización de "quién ve la lista" se hace arriba.
  const { data: participantRows } = await supabase
    .from("event_participants")
    .select("user_id, registered_at")
    .eq("event_id", id)
    .eq("status", "registered")
    .order("registered_at", { ascending: true });

  const userIds = [
    ...new Set((participantRows ?? []).map((p) => p.user_id as string)),
  ];
  const profiles = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; verified: boolean | null }
  >();
  if (userIds.length > 0) {
    // Una sola consulta para toda la lista: student_email_verified viaja con
    // el resto de columnas, sin ninguna petición extra por asistente.
    const { data: profs } = await supabase
      .from("public_profiles")
      .select("id, full_name, avatar_url, student_email_verified")
      .in("id", userIds);
    for (const p of profs ?? [])
      profiles.set(p.id as string, {
        full_name: (p.full_name as string) ?? null,
        avatar_url: (p.avatar_url as string) ?? null,
        verified: (p.student_email_verified as boolean | null) ?? null,
      });
  }

  // Tallas de camiseta (164). Solo si el evento reparte: RLS deja al organizador
  // (y a un admin) leer las de su evento. Se cruzan con los apuntados de verdad,
  // así que quien eligió talla y luego canceló no cuenta.
  const shirtsEnabled = event.shirts_enabled === true;
  const shirtByUser = new Map<string, ShirtSize>();
  const quoteByUser = new Map<string, number>();
  if (shirtsEnabled && userIds.length > 0) {
    const { data: shirtRows } = await supabase
      .from("event_shirt_sizes")
      .select("user_id, size, quoted_price_cents")
      .eq("event_id", id)
      .in("user_id", userIds);
    for (const row of shirtRows ?? []) {
      const size = row.size as string;
      if (isShirtSize(size)) shirtByUser.set(row.user_id as string, size);
      if (typeof row.quoted_price_cents === 'number') quoteByUser.set(row.user_id as string, row.quoted_price_cents);
    }
  }

  const attendees = (participantRows ?? []).map((p) => {
    const prof = profiles.get(p.user_id as string);
    return {
      id: p.user_id as string,
      full_name: prof?.full_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
      verified: prof?.verified ?? null,
      registered_at: p.registered_at as string | null,
      shirt: shirtByUser.get(p.user_id as string) ?? null,
      priceCents: quoteByUser.get(p.user_id as string) ?? null,
    };
  });

  const shirtTally = shirtsEnabled
    ? tallyShirtSizes(attendees.map((a) => a.shirt))
    : null;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Panel del organizador: cabecera editorial y listado sobrio */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-3xl px-4 pt-8 pb-10 sm:px-6 lg:px-8">
          <Link
            href={`/eventos/${id}`}
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Volver al evento
          </Link>
          <Reveal className="mt-6">
            <p className="eyebrow text-violet">Quién viene</p>
            <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold tracking-tight text-text-primary">Asistentes</h1>
            <p className="mt-2 text-text-muted">{event.title}</p>
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="eyebrow text-text-muted">Apuntados</dt>
                <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary">{attendees.length}</dd>
              </div>
              {shirtTally && (
                <div>
                  <dt className="eyebrow text-text-muted">Camisetas</dt>
                  <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary">{shirtTally.shirtsNeeded}</dd>
                </div>
              )}
            </dl>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-8 px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <OriginGuestAttendees eventId={id} organizerId={event.organizer_id} />

        {attendees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Todavía no se ha apuntado nadie"
            description="Cuando alguien se inscriba aparecerá aquí con su nombre y la hora en la que se apuntó."
          />
        ) : (
          <>
            {/* Camisetas que hay que llevar, por talla (164) */}
            {shirtTally && (
              <section>
                <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
                  <Shirt className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Camisetas para este evento
                </p>
                {shirtTally.answered === 0 ? (
                  <p className="mt-3 text-sm text-text-muted">
                    Todavía nadie ha elegido talla. Se les pregunta al apuntarse.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-text-secondary">
                      Hay que llevar{" "}
                      <strong className="font-semibold tabular text-text-primary">{shirtTally.shirtsNeeded}</strong>{" "}
                      {shirtTally.shirtsNeeded === 1 ? "camiseta" : "camisetas"}.
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {shirtTally.bySize.map(({ size, count }) => (
                        <li
                          key={size}
                          className={`rounded-lg border border-border px-2.5 py-1 text-sm font-semibold tabular ${
                            size === "ninguna" ? "text-text-muted" : "text-text-primary"
                          }`}
                        >
                          {shirtSizeLabel(size)}: {count}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {shirtTally.missing > 0 && (
                  <p className="mt-3 text-xs text-text-muted">
                    {shirtTally.missing}{" "}
                    {shirtTally.missing === 1
                      ? "persona apuntada no ha elegido talla todavía"
                      : "personas apuntadas no han elegido talla todavía"}
                    .
                  </p>
                )}
              </section>
            )}

            {/* Filas hairline que se iluminan al pasar el ratón, como el resto de paneles */}
            <section>
              <p className="eyebrow text-text-muted">Lista</p>
              <Reveal stagger as="ul" className="mt-3 divide-y divide-border-light border-y border-border-light">
                {attendees.map((a, i) => (
                  <RevealItem key={a.id} index={i} asChild>
                    <li>
                    <Link
                      href={`/perfil/${a.id}`}
                      className="flex items-center gap-3.5 px-2 py-3.5 transition-colors hover:bg-bg-secondary"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border bg-bg-secondary">
                        {a.avatar_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={a.avatar_url}
                            alt={a.full_name ?? "Asistente"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-text-muted">
                            <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-semibold text-text-primary">
                          <span className="truncate">{a.full_name || "Asistente"}</span>
                          <VerifiedBadge verified={a.verified} />
                          {shirtsEnabled && (
                            <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                              {a.shirt === null ? "Sin talla" : shirtSizeLabel(a.shirt)}
                            </span>
                          )}
                        </p>
                        {a.priceCents !== null && (
                          <p className="mt-0.5 text-xs text-text-secondary tabular">
                            {shirtPriceLabel(a.priceCents)} · pago al organizador
                          </p>
                        )}
                        {a.registered_at && (
                          <p className="mt-0.5 text-xs text-text-muted tabular">
                            Se apuntó el{" "}
                            {new Date(a.registered_at).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                      </div>
                    </Link>
                    </li>
                  </RevealItem>
                ))}
              </Reveal>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
