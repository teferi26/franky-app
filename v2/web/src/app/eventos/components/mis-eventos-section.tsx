"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import Image from "next/image";
import { Calendar, CalendarDays, MapPin, Pencil, Plus, Loader2, Users, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { MADRID_TZ } from "@/lib/event-time";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { eventCategory } from "./event-category";

interface MyEvent {
  id: string;
  title: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  category: string | null;
  image_url: string | null;
  organizer_id: string;
}

type Tab = "created" | "joined";

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MisEventosSection({
  userId,
  variant = "card",
}: {
  userId: string;
  variant?: "card" | "plain";
}) {
  const [tab, setTab] = useState<Tab>("created");
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<MyEvent[]>([]);
  const [joined, setJoined] = useState<MyEvent[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = createClient();

      // Events I created (most recent first).
      const createdRes = await supabase
        .from("events")
        .select("id, title, city, start_date, end_date, category, image_url, organizer_id")
        .eq("organizer_id", userId)
        .order("start_date", { ascending: false });

      // Events I joined (excluding the ones I organize, those are already in `created`).
      // En eventos de pago la inscripción solo "vale" si hay entrada comprada:
      // un inscrito antiguo de un evento que luego pasó a ser de pago no debe
      // aparecer aquí si no compró entrada.
      const [partRes, ticketRes] = await Promise.all([
        supabase
          .from("event_participants")
          .select("event_id, events(id, title, city, start_date, end_date, category, image_url, organizer_id, price)")
          .eq("user_id", userId)
          .eq("status", "registered"),
        supabase
          .from("event_tickets")
          .select("event_id")
          .eq("holder_id", userId)
          .in("status", ["valid", "used"]),
      ]);

      // El join `events(...)` puede llegar como objeto o como array segun la
      // forma del select; lo normalizamos a un unico evento con precio.
      type JoinedEvent = MyEvent & { price: number | null };
      type ParticipantRow = { event_id: string; events: JoinedEvent | JoinedEvent[] | null };
      type TicketRow = { event_id: string };

      const paidTicketEventIds = new Set(
        ((ticketRes.data as TicketRow[] | null) || []).map((r) => r.event_id)
      );

      const joinedAll: MyEvent[] = ((partRes.data as ParticipantRow[] | null) || [])
        .map((row) => (Array.isArray(row.events) ? row.events[0] ?? null : row.events))
        .filter(
          (e): e is JoinedEvent =>
            !!e &&
            e.organizer_id !== userId &&
            (Number(e.price ?? 0) === 0 || paidTicketEventIds.has(e.id))
        );

      // Sort joined by start_date descending so most recent appear first.
      joinedAll.sort((a, b) => {
        const ta = a.start_date ? Date.parse(a.start_date) : 0;
        const tb = b.start_date ? Date.parse(b.start_date) : 0;
        return tb - ta;
      });

      setCreated(createdRes.data || []);
      setJoined(joinedAll);
      setLoading(false);
    })();
  }, [userId]);

  const list = tab === "created" ? created : joined;
  const wrapperClass = variant === "card"
    ? "rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8"
    : "";

  return (
    <section id="mis-eventos" className={wrapperClass}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-violet">Tu agenda</p>
          <h2 className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">Mis eventos</h2>
          <p className="mt-1 text-sm text-text-muted">
            Tus eventos creados y aquellos en los que participas.
          </p>
        </div>
        <Link href="/eventos/crear" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Crear evento
        </Link>
      </div>

      {/* Pestañas: segmento neutro, la activa en blanco */}
      <div role="tablist" aria-label="Tus eventos" className="mb-5 inline-flex items-center gap-1 rounded-xl bg-bg-secondary p-1">
        {([
          { key: "created", label: "Creados", count: created.length },
          { key: "joined", label: "Apuntado", count: joined.length },
        ] as { key: Tab; label: string; count: number }[]).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`mis-eventos-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="mis-eventos-tabpanel"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 cursor-pointer",
              tab === t.key
                ? "bg-bg-primary font-semibold text-text-primary shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)]"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {t.label}
            <span className="text-xs text-text-muted tabular">{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-muted" aria-hidden="true" />
        </div>
      ) : list.length === 0 ? (
        /* Vacío del sistema. La pestaña "Apuntado" no ofrecía ninguna salida:
           ahora las dos llevan a la acción que las llena. */
        <EmptyState
          icon={CalendarDays}
          tone="orange"
          compact
          title={
            tab === "created"
              ? "Todavía no has creado ningún evento"
              : "Todavía no te has apuntado a nada"
          }
          description={
            tab === "created"
              ? "Monta una quedada, una fiesta o un grupo de estudio. Lo verá tu campus entero."
              : "Cuando te apuntes a un evento aparecerá aquí con su hora y su sitio."
          }
          action={
            tab === "created"
              ? { href: "/eventos/crear", label: "Crear un evento" }
              : { href: "/eventos", label: "Ver qué hay esta semana" }
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((e, i) => {
            const CatIcon = eventCategory(e.category).icon;
            return (
            <div
              key={e.id}
              className="hover-lift animate-list-in flex gap-3 rounded-xl border border-border bg-bg-primary p-3 shadow-card hover:border-text-primary/15"
              style={{ "--i": i } as React.CSSProperties}
            >
              <div className="img-zoom relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-secondary">
                {e.image_url ? (
                  <Image
                    src={e.image_url}
                    alt={e.title ?? "Evento"}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <CatIcon className="h-6 w-6 text-text-muted/60" strokeWidth={1.5} aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/eventos/${e.id}`}
                  className="block truncate font-heading text-sm font-semibold text-text-primary transition-colors hover:text-violet"
                >
                  {e.title || "Evento"}
                </Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted mt-0.5">
                  {e.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> <span className="tabular">{formatWhen(e.start_date)}</span>
                    </span>
                  )}
                  {e.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> {e.city}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/eventos/${e.id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-text-primary/30 hover:text-text-primary"
                  >
                    <Users className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Ver evento
                  </Link>
                  {tab === "created" && (
                    <>
                      <Link
                        href={`/eventos/${e.id}/asistentes`}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-text-primary/30 hover:text-text-primary"
                      >
                        <Users className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Apuntados
                      </Link>
                      <Link
                        href={`/eventos/${e.id}/codigos`}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-text-primary/30 hover:text-text-primary"
                      >
                        <Tag className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Códigos
                      </Link>
                      <Link
                        href={`/eventos/${e.id}/editar`}
                        className="inline-flex items-center gap-1 rounded-full bg-text-primary px-2.5 py-1 text-[11px] font-semibold text-bg-primary transition-colors hover:bg-violet"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Editar
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
