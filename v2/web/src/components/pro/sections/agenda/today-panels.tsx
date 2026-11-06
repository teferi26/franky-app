"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Cake,
  CheckCheck,
  FlaskConical,
  Package,
  PenLine,
  Repeat,
  Ticket,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import {
  bookFromWaitlist,
  bookingMessage,
  markConfirmed,
  markReminded,
  reminderStats,
  remindersOn,
  setWaitlistStatus,
  waitlistForDay,
  waitlistMessage,
} from "@/lib/pro/agenda-ops";
import {
  birthdaysSoon,
  dueThisWeek,
  needsPatchTest,
  pendingSignature,
} from "@/lib/pro/agenda-clients";
import { lastSessionToday, lowStock } from "@/lib/pro/agenda-money";
import { bookingsOn } from "@/lib/pro/agenda";
import {
  addDays,
  localDate,
  localMinutes,
  minutesToLabel,
  plural,
  time,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { Panel, Pill, Row, RowList } from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { WhatsAppButton, useAgenda } from "./parts";

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Recordatorios de mañana                                             */
/* ------------------------------------------------------------------ */

/**
 * Las citas de mañana con su WhatsApp ya escrito. Por la tarde es lo primero
 * que se ve: es la forma más barata de bajar los no presentados.
 */
export function TomorrowReminders({
  onOpen,
}: {
  onOpen: (bookingId: string) => void;
}) {
  const { data, now, run, allowed } = useAgenda();
  const toast = useToast();
  const tomorrow = addDays(localDate(now), 1);
  const rows = remindersOn(data, tomorrow);
  const stats = reminderStats(rows);
  const [all, setAll] = React.useState(false);
  if (!rows.length) return null;
  // Primero las que faltan por confirmar; con muchas citas, solo unas pocas.
  const ordered = [...rows].sort(
    (a, b) => Number(a.confirmed) - Number(b.confirmed),
  );
  const visible = all ? ordered : ordered.slice(0, 6);

  return (
    <Panel
      title="Recuerda las citas de mañana"
      description={
        stats.toRemind
          ? `${plural(stats.total, "cita", "citas")}: ${stats.toRemind} sin recordar y ${plural(stats.confirmed, "confirmada", "confirmadas")}.`
          : `${stats.confirmed} de ${stats.total} han confirmado que vienen.`
      }
      action={
        stats.unconfirmed ? (
          <Pill tone="warning">{stats.unconfirmed} sin confirmar</Pill>
        ) : (
          <Pill tone="success">Todas confirmadas</Pill>
        )
      }
      flush
    >
      <RowList>
        {visible.map((row) => {
          const tone = TONES[row.staff?.tone ?? "slate"];
          return (
            <div
              key={row.booking.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
            >
              <button
                type="button"
                onClick={() => onOpen(row.booking.id)}
                className="flex min-w-[12rem] flex-1 items-center gap-3 text-left"
              >
                <span
                  className={cn("h-9 w-1 shrink-0 rounded-full", tone.bar)}
                />
                <span className="w-11 shrink-0 text-sm font-semibold tabular">
                  {time(row.booking.start)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {row.booking.clientName}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {row.service?.name} con {row.staff?.name.split(" ")[0]}
                  </span>
                </span>
              </button>
              {row.confirmed ? (
                <Pill tone="success">
                  <CheckCheck className="h-3 w-3" /> Viene
                </Pill>
              ) : (
                <span className="ml-auto flex items-center gap-2">
                  {row.reminded ? <Pill>Recordada</Pill> : null}
                  <WhatsAppButton
                    phone={row.phone}
                    message={bookingMessage(data, "reminder", row.booking)}
                    label={row.reminded ? "Otra vez" : "Recordar"}
                    variant={row.reminded ? "ghost" : "outline"}
                    onOpen={() => {
                      if (allowed("agenda.remind"))
                        void run("agenda.remind", (d) =>
                          markReminded(d, row.booking.id, nowIso()),
                        );
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    aria-label={`${row.booking.clientName} ha confirmado`}
                    disabled={!allowed("agenda.confirm")}
                    onClick={async () => {
                      if (
                        await run("agenda.confirm", (d) =>
                          markConfirmed(d, row.booking.id, nowIso()),
                        )
                      )
                        toast.success(
                          `${row.booking.clientName.split(" ")[0]} viene`,
                        );
                    }}
                  >
                    <CheckCheck className="h-4 w-4" /> Confirma
                  </Button>
                </span>
              )}
            </div>
          );
        })}
      </RowList>
      {ordered.length > visible.length ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex h-12 w-full items-center justify-center border-t border-border-light text-sm font-semibold text-violet"
        >
          Ver las {ordered.length} citas de mañana
        </button>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de espera que encaja hoy                                      */
/* ------------------------------------------------------------------ */

export function WaitlistToday() {
  const { data, now, run, allowed, ops } = useAgenda();
  const toast = useToast();
  const today = localDate(now);
  const matches = ops ? waitlistForDay(data, today, localMinutes(now)) : [];
  if (!matches.length) return null;

  return (
    <Panel
      title="Hay hueco para quien espera"
      description="Personas de tu lista de espera que caben en un hueco de hoy."
      flush
    >
      <RowList>
        {matches.slice(0, 4).map((match) => {
          const service = data.services.find(
            (s) => s.id === match.entry.serviceId,
          );
          const staff = data.staff.find((s) => s.id === match.gap.staffId);
          return (
            <div
              key={match.entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
            >
              <span className="min-w-[11rem] flex-1">
                <span className="block truncate text-sm font-semibold">
                  {match.entry.name}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {service?.name} a las {minutesToLabel(match.start)} con{" "}
                  {staff?.name.split(" ")[0]}
                  {match.entry.status === "offered" ? " · avisada" : ""}
                </span>
              </span>
              <WhatsAppButton
                phone={match.entry.phone}
                message={waitlistMessage(data, match)}
                label="Avisar"
                onOpen={() => {
                  if (allowed("agenda.waitlist"))
                    void run("agenda.waitlist", (d) =>
                      setWaitlistStatus(d, match.entry.id, "offered", nowIso()),
                    );
                }}
              />
              <Button
                size="sm"
                variant="dark"
                className="h-10"
                disabled={!allowed("agenda.waitlist")}
                onClick={async () => {
                  if (
                    await run("agenda.waitlist", (d) =>
                      bookFromWaitlist(d, match.entry.id, {
                        bookingId: localId("b"),
                        staffId: match.gap.staffId,
                        date: today,
                        minute: match.start,
                      }),
                    )
                  )
                    toast.success(
                      "Hueco recuperado",
                      `${match.entry.name} a las ${minutesToLabel(match.start)}`,
                    );
                }}
              >
                Darle el hueco
              </Button>
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Ojo hoy                                                             */
/* ------------------------------------------------------------------ */

type Attention = {
  key: string;
  icon: typeof Ticket;
  title: string;
  detail: string;
  href?: string;
  bookingId?: string;
  tone: "neutral" | "warning" | "violet";
};

/** "Ana, Luis, Marta y 2 más": los tres primeros y cuántos quedan. */
function firstNames(names: string[]): string {
  const shown = names.slice(0, 3).join(", ");
  const rest = names.length - 3;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

/**
 * Lo que conviene saber antes de que llegue cada clienta: pruebas y firmas
 * pendientes, señales sin cobrar, últimas sesiones de bono, stock bajo,
 * cumpleaños y quién tiene que volver.
 */
export function AttentionPanel({
  onOpen,
}: {
  onOpen: (bookingId: string) => void;
}) {
  const { data, now, spaceId, ops, vertical } = useAgenda();
  if (!ops) return null;
  const today = localDate(now);
  const items: Attention[] = [];
  const upcoming = bookingsOn(data, today).filter(
    (b) =>
      ["requested", "confirmed", "arrived"].includes(b.status) &&
      Date.parse(b.end) > now.getTime(),
  );

  for (const booking of upcoming) {
    const client = data.clients.find((c) => c.id === booking.clientId);
    const service = data.services.find((s) => s.id === booking.serviceId);
    if (needsPatchTest(data, client, service, today))
      items.push({
        key: `pt-${booking.id}`,
        icon: FlaskConical,
        title: `${booking.clientName}: sin prueba de sensibilidad`,
        detail: `${service?.name ?? "Cita"} a las ${time(booking.start)}`,
        bookingId: booking.id,
        tone: "warning",
      });
    const consent = pendingSignature(data, client, service);
    if (consent)
      items.push({
        key: `cs-${booking.id}`,
        icon: PenLine,
        title: `${booking.clientName}: falta firmar`,
        detail: `${consent.title} antes de las ${time(booking.start)}`,
        bookingId: booking.id,
        tone: "warning",
      });
    if (booking.agenda?.deposit?.status === "pending")
      items.push({
        key: `dp-${booking.id}`,
        icon: Wallet,
        title: `${booking.clientName}: señal sin cobrar`,
        detail: `Cita a las ${time(booking.start)}`,
        bookingId: booking.id,
        tone: "warning",
      });
  }
  for (const { bundle, bookingId } of lastSessionToday(data, today))
    items.push({
      key: `bn-${bundle.id}`,
      icon: Ticket,
      title: `${bundle.clientName} gasta hoy su última sesión`,
      detail: `${bundle.label}: buen momento para ofrecerle otro`,
      bookingId,
      tone: "violet",
    });
  const low = lowStock(ops.products);
  if (low.length)
    items.push({
      key: "stock",
      icon: Package,
      title: `${low.length} ${low.length === 1 ? "producto" : "productos"} bajo mínimo`,
      detail: firstNames(low.map((p) => p.name)),
      href: `${sectionHref(spaceId, "servicios")}?tab=productos`,
      tone: "neutral",
    });
  const due = dueThisWeek(data, now);
  if (due.length && vertical.nav.some((n) => n.id === "seguimiento"))
    items.push({
      key: "due",
      icon: Repeat,
      title: `A ${due.length} ${due.length === 1 ? "cliente le toca" : "clientes les toca"} volver`,
      detail: "Con el mensaje ya escrito y un hueco sugerido",
      href: sectionHref(spaceId, "seguimiento"),
      tone: "neutral",
    });
  const birthdays = birthdaysSoon(data, now, 7);
  if (birthdays.length && vertical.nav.some((n) => n.id === "seguimiento"))
    items.push({
      key: "bd",
      icon: Cake,
      title: `${birthdays.length} cumpleaños esta semana`,
      detail: firstNames(birthdays.map((b) => b.client.name.split(" ")[0])),
      href: `${sectionHref(spaceId, "seguimiento")}?tab=cumple`,
      tone: "neutral",
    });

  if (!items.length) return null;
  const iconTone = {
    neutral: "text-text-secondary",
    warning: "text-amber-600 dark:text-amber-300",
    violet: "text-violet",
  };

  return (
    <Panel title="Hoy, ojo con" flush>
      <RowList>
        {items.slice(0, 7).map((item) => {
          const Icon = item.icon;
          const body = (
            <>
              <Icon
                className={cn("h-4 w-4 shrink-0", iconTone[item.tone])}
                strokeWidth={1.9}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {item.detail}
                </span>
              </span>
              {item.href ? (
                <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
              ) : null}
            </>
          );
          if (item.href)
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex min-h-12 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-secondary sm:px-5"
              >
                {body}
              </Link>
            );
          return (
            <Row
              key={item.key}
              onClick={
                item.bookingId ? () => onOpen(item.bookingId!) : undefined
              }
            >
              {body}
            </Row>
          );
        })}
      </RowList>
    </Panel>
  );
}
