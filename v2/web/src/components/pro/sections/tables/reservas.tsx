"use client";

import * as React from "react";
import {
  BellRing,
  CalendarPlus,
  CalendarX2,
  Link2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProBooking } from "@/lib/pro/types";
import {
  addDays,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  plural,
  relative,
  time,
  weekdayIndex,
} from "@/lib/pro/format";
import {
  TURNS,
  TURN_ORDER,
  capacity,
  covers,
  currentTurn,
  fromFranky,
  hasAllergyNote,
  tableName,
  turnBookings,
  waitlistOn,
  type Turn,
} from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Empty,
  Meter,
  PageHeader,
  Panel,
  RowList,
  Segmented,
  StepNav,
  Tip,
} from "../../kit";
import {
  NewReservationDrawer,
  NoteLine,
  RealWaitlistPanel,
  ReservationDrawer,
  SourceTag,
  StudentMark,
  TableStatus,
  useTableActions,
  type NewReservationPreset,
} from "./table-kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { ConfirmPanel, DroppedPanel } from "./service-kit";
import { noShowHistory } from "@/lib/pro/tables-ops";

type Filter = "all" | "pending" | "allergy" | "franky" | "risky";

export default function TablesReservas() {
  const { data, now, demo, pending, can, loadDate } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [date, setDate] = React.useState(today);
  const [turn, setTurn] = React.useState<Turn>(currentTurn(nowMin));
  const [filter, setFilter] = React.useState<Filter>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  React.useEffect(() => {
    loadDate(date);
  }, [date, loadDate]);

  const hours = data.space.hours[weekdayIndex(date)];
  const turnOpen = (t: Turn) =>
    !demo ||
    Boolean(
      hours && TURNS[t].from >= hours.open && TURNS[t].lastSeat < hours.close,
    );
  const cap = capacity(data);
  const all = turnBookings(data, date, turn);
  const active = all.filter((b) => b.status !== "no_show");
  const c = covers(all);
  const seated = all.filter((b) => b.status === "arrived");
  const toCome = all.filter(
    (b) => b.status === "confirmed" || b.status === "requested",
  );
  const noShows = all.filter((b) => b.status === "no_show");
  const franky = active.filter((b) => fromFranky(b.source));

  // Reservas por llegar de quien ya dejó alguna mesa vacía: conviene
  // pedirles confirmación o señal antes del servicio.
  const risky = (b: ProBooking) =>
    (b.status === "requested" || b.status === "confirmed") &&
    noShowHistory(data, {
      clientId: b.clientId,
      name: b.clientName,
      phone: data.clients.find((c) => c.id === b.clientId)?.phone,
    }) > 0;
  const filtered = all.filter((b) => {
    if (filter === "risky") return risky(b);
    if (filter === "pending") return b.status === "requested";
    if (filter === "allergy") return hasAllergyNote(b.note);
    if (filter === "franky") return fromFranky(b.source);
    return true;
  });
  const groups = groupByTime(filtered);
  const waitlist = date === today ? waitlistOn(data, today) : [];

  const shareLink = async () => {
    const url = `https://franky.es/n/${data.space.slug}`;
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
    } catch {
      toast.info("Enlace de tu negocio", url);
      return;
    }
    toast.success(
      "Enlace copiado",
      `${url.replace("https://", "")}: ponlo en tu bio de Instagram y en Google.`,
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Reservas"
        title="Libro de reservas"
        description={
          turnOpen(turn)
            ? `${TURNS[turn].label} ${date === today ? "de hoy" : `del ${dayLabel(`${date}T12:00:00Z`, { weekday: true })}`}: ${plural(active.length, "reserva", "reservas")} y ${c} cubiertos de ${cap}. ${franky.length} vienen de Franky.`
            : `Ese ${TURNS[turn].label.toLowerCase()} no abres.`
        }
        actions={
          <>
            <Button variant="outline" onClick={shareLink}>
              <Link2 className="h-4 w-4" strokeWidth={1.9} /> Tu enlace
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("table.reserve")}
              onClick={() => setPreset({ date, turn })}
            >
              <CalendarPlus className="h-4 w-4" strokeWidth={1.9} /> Nueva
              reserva
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StepNav
          label={
            date === today
              ? `Hoy, ${dayLabel(`${date}T12:00:00Z`, { weekday: false })}`
              : dayLabel(`${date}T12:00:00Z`)
          }
          onPrev={() => setDate((d) => addDays(d, -1))}
          onNext={() => setDate((d) => addDays(d, 1))}
          onToday={() => setDate(today)}
          isToday={date === today}
        />
        <Segmented
          label="Turno"
          value={turn}
          onChange={setTurn}
          options={TURN_ORDER.map((t) => ({
            value: t,
            label: TURNS[t].label,
            count: covers(turnBookings(data, date, t)),
          }))}
        />
      </div>

      <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-text-muted">Cubiertos del turno</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">
                {c}
              </span>
              <span className="text-sm text-text-muted tabular">/ {cap}</span>
            </p>
          </div>
          <dl className="flex gap-5 text-sm">
            <Stat label="Sentadas" value={seated.length} />
            <Stat label="Por llegar" value={toCome.length} />
            <Stat
              label="No vinieron"
              value={noShows.length}
              tone={noShows.length ? "danger" : undefined}
            />
            <Stat label="Franky" value={franky.length} tone="violet" />
          </dl>
        </div>
        <Meter
          value={c}
          max={cap}
          className="mt-3"
          tone={c / Math.max(1, cap) > 0.9 ? "warning" : "violet"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Segmented
            size="sm"
            label="Filtrar"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todas", count: all.length },
              {
                value: "pending",
                label: "Por confirmar",
                count: all.filter((b) => b.status === "requested").length,
              },
              {
                value: "allergy",
                label: "Alergias",
                count: all.filter((b) => hasAllergyNote(b.note)).length,
              },
              {
                value: "franky",
                label: "De Franky",
                count: all.filter((b) => fromFranky(b.source)).length,
              },
              {
                value: "risky",
                label: "Han fallado antes",
                count: all.filter(risky).length,
              },
            ]}
          />
          <Panel flush>
            {!turnOpen(turn) ? (
              <Empty
                icon={CalendarX2}
                title={`Este ${TURNS[turn].label.toLowerCase()} está cerrado`}
                body="Cambia tus turnos en Ajustes si quieres abrirlo."
              />
            ) : groups.length ? (
              <div>
                {groups.map(([minute, list]) => (
                  <div key={minute}>
                    <div className="flex items-center justify-between gap-2 border-b border-border-light bg-bg-secondary/60 px-4 py-1.5 sm:px-5">
                      <span className="font-heading text-sm font-bold tabular">
                        {minutesToLabel(minute)}
                      </span>
                      <span className="text-xs text-text-muted tabular">
                        {plural(list.length, "reserva", "reservas")} ·{" "}
                        {covers(list)} pax
                      </span>
                    </div>
                    <RowList>
                      {list.map((b) => (
                        <BookRow
                          key={b.id}
                          booking={b}
                          editable={date === today}
                          confirmable={date >= today}
                          onOpen={() => setOpenId(b.id)}
                        />
                      ))}
                    </RowList>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={CalendarPlus}
                title={
                  filter === "all"
                    ? "Sin reservas en este turno"
                    : "Nada con este filtro"
                }
                body={
                  filter === "all"
                    ? "Apunta las que te lleguen por teléfono. Las de Franky entran solas en este libro."
                    : "Prueba con Todas para ver el turno completo."
                }
                action={
                  filter === "all" ? (
                    <Button
                      variant="dark"
                      disabled={pending || !can("table.reserve")}
                      onClick={() => setPreset({ date, turn })}
                    >
                      Nueva reserva
                    </Button>
                  ) : null
                }
              />
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {!demo ? (
            <RealWaitlistPanel
              onAdd={() => setPreset({ date: today, waitlist: true })}
            />
          ) : date === today ? (
            <Panel
              title="Lista de espera"
              description={
                waitlist.length
                  ? `${plural(waitlist.length, "grupo esperando", "grupos esperando")}.`
                  : "Nadie esperando ahora."
              }
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => setPreset({ date: today, waitlist: true })}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Apuntar
                </Button>
              }
              flush
            >
              {waitlist.length ? (
                <RowList>
                  {waitlist.map((w) => (
                    <WaitRow
                      key={w.id}
                      booking={w}
                      onOpen={() => setOpenId(w.id)}
                    />
                  ))}
                </RowList>
              ) : (
                <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
                  Cuando la sala esté llena, apunta aquí a quien llegue y
                  contacta con él cuando quede una mesa.
                </p>
              )}
            </Panel>
          ) : null}

          {demo ? <DroppedPanel onOffer={setOffer} /> : null}
          {demo ? <ConfirmPanel /> : null}

          <Tip title="Tu libro, sin comisión">
            Las reservas que hacen los estudiantes en Franky entran aquí
            confirmadas y con sus alergias. No pagas nada por comensal: la cuota
            es fija y el cliente es tuyo.
          </Tip>
          <Tip title="Menos mesas vacías">
            Marca No vino cuando alguien no se presenta. Revisa las mesas que se
            liberan para sentar a las personas que están esperando.
          </Tip>
        </div>
      </div>

      {openId ? (
        <ReservationDrawer bookingId={openId} onClose={() => setOpenId(null)} />
      ) : null}
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "violet";
}) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd
        className={cn(
          "font-heading text-lg font-bold tabular",
          tone === "danger" && "text-rose-600",
          tone === "violet" && "text-violet",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function groupByTime(list: ProBooking[]): [number, ProBooking[]][] {
  const map = new Map<number, ProBooking[]>();
  for (const b of list) {
    const m = localMinutes(b.start);
    map.set(m, [...(map.get(m) ?? []), b]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function BookRow({
  booking: b,
  editable,
  confirmable,
  onOpen,
}: {
  booking: ProBooking;
  editable: boolean;
  confirmable: boolean;
  onOpen: () => void;
}) {
  const { data, pending, can } = usePro();
  const actions = useTableActions();
  const client = data.clients.find((c) => c.id === b.clientId);
  const muted = b.status === "done" || b.status === "no_show";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5",
        muted && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 basis-full items-center gap-3 text-left sm:basis-auto"
      >
        <Avatar
          name={b.clientName}
          size="sm"
          tone={b.student ? "violet" : "slate"}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{b.clientName}</span>
            {b.student ? (
              <StudentMark university={client?.student?.university} />
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
            <span className="tabular">
              {plural(b.partySize, "persona", "personas")}
            </span>
            <span>·</span>
            <span>{tableName(data, b.resourceId) ?? "Sin mesa"}</span>
            <span>·</span>
            <SourceTag source={b.source} />
          </span>
          <NoteLine note={b.note} />
        </span>
      </button>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        <TableStatus booking={b} />
        {confirmable && b.status === "requested" ? (
          <Button
            size="sm"
            variant="dark"
            className="h-10"
            disabled={pending || !can("table.confirm")}
            onClick={() => actions.confirm(b)}
          >
            Confirmar
          </Button>
        ) : null}
        {editable && b.status === "confirmed" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-10"
              disabled={pending || !can("table.no_show")}
              onClick={() => actions.noShow(b)}
            >
              No vino
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              disabled={pending || !can("table.seat")}
              onClick={() => actions.seat(b)}
            >
              Sentar
            </Button>
          </>
        ) : null}
        {editable && b.status === "arrived" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            disabled={pending || !can("table.leave")}
            onClick={() => actions.leave(b)}
          >
            Se fue
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function WaitRow({
  booking: w,
  onOpen,
}: {
  booking: ProBooking;
  onOpen: () => void;
}) {
  const { now } = usePro();
  const actions = useTableActions();
  const waited = Math.max(
    1,
    Math.round((now.getTime() - new Date(w.start).getTime()) / 60000),
  );
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={cn(
            "flex w-12 shrink-0 flex-col items-center rounded-xl py-1",
            waited >= 20
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "bg-bg-secondary",
          )}
        >
          <span className="font-heading text-base font-bold tabular">
            {waited}
          </span>
          <span className="text-[0.62rem]">min</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {w.clientName}{" "}
            <span className="font-normal text-text-muted">
              · {w.partySize}p
            </span>
          </span>
          <span className="block text-xs text-text-muted">
            Desde las {time(w.start)} ({relative(w.start, now.getTime())})
          </span>
          <NoteLine note={w.note} />
        </span>
      </button>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-10"
          onClick={() => actions.notify(w)}
        >
          <BellRing className="h-3.5 w-3.5" /> Avisar
        </Button>
        <Button size="sm" variant="outline" className="h-10" onClick={onOpen}>
          Sentar
        </Button>
      </div>
    </div>
  );
}
