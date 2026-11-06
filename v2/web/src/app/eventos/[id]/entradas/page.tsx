import type { Metadata } from "next";
import OriginGuestAttendees from '@/components/OriginGuestAttendees';
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase-server";
import { Reveal } from "@/components/motion";
import EntradasClient, { type TicketRow } from "./entradas-client";
import { isShirtSize, type ShirtSize } from "@/lib/event-shirts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entradas del evento",
  robots: { index: false, follow: false },
};

export default async function EventoEntradasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/eventos/${id}/entradas`);

  const { data: event } = await supabase
    .from("events")
    // select("*"): igual que en /asistentes, no dependemos de que la 164 esté
    // aplicada para poder abrir la lista de entradas.
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
  if (event.organizer_id !== user.id && !isAdmin) redirect(`/eventos/${id}`);

  // RLS deja al organizador leer las entradas de su evento.
  const { data: ticketRows } = await supabase
    .from("event_tickets")
    .select("id, holder_id, qr_token, status, used_at, created_at")
    .eq("event_id", id)
    .in("status", ["valid", "used"])
    .order("created_at", { ascending: true });

  const holderIds = [...new Set((ticketRows ?? []).map((t) => t.holder_id as string))];
  const names = new Map<string, string | null>();
  if (holderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, full_name")
      .in("id", holderIds);
    for (const p of profiles ?? [])
      names.set(p.id as string, (p.full_name as string) ?? null);
  }

  // Tallas de camiseta (164) de los titulares, si el evento reparte.
  const shirtsEnabled = event.shirts_enabled === true;
  const shirtByUser = new Map<string, ShirtSize>();
  if (shirtsEnabled && holderIds.length > 0) {
    const { data: shirtRows } = await supabase
      .from("event_shirt_sizes")
      .select("user_id, size")
      .eq("event_id", id)
      .in("user_id", holderIds);
    for (const row of shirtRows ?? []) {
      const size = row.size as string;
      if (isShirtSize(size)) shirtByUser.set(row.user_id as string, size);
    }
  }

  const tickets: TicketRow[] = (ticketRows ?? []).map((t) => ({
    id: t.id as string,
    qr_token: t.qr_token as string,
    status: t.status as "valid" | "used",
    used_at: t.used_at as string | null,
    holder_name: names.get(t.holder_id as string) ?? null,
    shirt: shirtByUser.get(t.holder_id as string) ?? null,
  }));

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Panel del organizador: cabecera editorial y contenido sobrio */}
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
            <p className="eyebrow text-violet">Puerta del evento</p>
            <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold tracking-tight text-text-primary">Entradas</h1>
            <p className="mt-2 text-text-muted">{event.title}</p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <OriginGuestAttendees eventId={id} organizerId={event.organizer_id} />
        <EntradasClient tickets={tickets} shirtsEnabled={shirtsEnabled} />
      </div>
    </div>
  );
}
