"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck2,
  Coffee,
  ScanLine,
  Sparkles,
  Stamp,
  UserRoundCheck,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProBooking } from "@/lib/pro/types";
import {
  dayLabel,
  greeting,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  relative,
  time,
  weekdayIndex,
} from "@/lib/pro/format";
import { frankyResults } from "@/lib/pro/results";
import {
  TURNS,
  TURN_ORDER,
  capacity,
  covers,
  currentTurn,
  fromFranky,
  hasAllergyNote,
  isWaitlist,
  nearbyReach,
  stampsFor,
  tableBookingsOn,
  tableLive,
  tableName,
  turnOf,
  waitlistOn,
  type Turn,
} from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Empty,
  FixedPortal,
  Kpi,
  KpiRow,
  LiveDot,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Tip,
} from "../../kit";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import {
  BonosHint,
  ClosingNoteBanner,
  MarginAlertsCard,
  RegularsCard,
  SeasonCard,
  SeptemberRadarCard,
  ValleyCard,
} from "./day-cards";
import { OrdersMini, ShowcasePanel, StudyPanel } from "./cafe-cards";
import {
  ConfirmPanel,
  DroppedPanel,
  EventTodayPanel,
  GroupsTodayPanel,
  SoldOutPanel,
  TeamTodayPanel,
} from "./service-kit";
import { noShowHistory } from "@/lib/pro/tables-ops";
import {
  FrankyBlock,
  NewReservationDrawer,
  NoteLine,
  RealWaitlistPanel,
  ReservationDrawer,
  SourceTag,
  StampDots,
  StudentMark,
  useTableActions,
  type NewReservationPreset,
} from "./table-kit";

export default function TablesHoy() {
  const { vertical, demo } = usePro();
  if (!demo) return <RealTablesHoy />;
  return vertical.id === "cafe" ? <CafeHoy /> : <ServiceHoy />;
}

function RealTablesHoy() {
  const { data, now, spaceId, pending, can, canView } = usePro();
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const today = localDate(now);
  const bookings = tableBookingsOn(data, today);
  const live = data.tables.map((table) => ({
    table,
    status: tableLive(data, table, now),
  }));
  const occupied = live.filter((item) => item.status.state === "seated");
  const people = occupied.reduce(
    (sum, item) =>
      sum + (item.status.occupiedPeople ?? item.status.current?.partySize ?? 0),
    0,
  );
  const waiting =
    data.tableOperations?.waitlist.filter(
      (entry) =>
        entry.status === "waiting" &&
        Date.parse(entry.expiresAt) > now.getTime(),
    ) ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description="Las reservas, llegadas y salidas registradas de hoy."
        actions={
          <Button
            variant="dark"
            disabled={pending || !can("table.reserve")}
            onClick={() => setPreset({ date: today })}
          >
            <CalendarCheck2 className="h-4 w-4" /> Nueva reserva
          </Button>
        }
      />
      <KpiRow>
        <Kpi
          icon={UtensilsCrossed}
          label="Cubiertos reservados"
          value={covers(bookings)}
          hint="Reservas de hoy"
        />
        <Kpi
          icon={Users}
          label="En sala ahora"
          value={people}
          hint={plural(occupied.length, "mesa sentada", "mesas sentadas")}
        />
        <Kpi
          icon={BellRing}
          label="Por confirmar"
          value={
            bookings.filter((booking) => booking.status === "requested").length
          }
        />
        <Kpi
          icon={UserRoundCheck}
          label="En espera"
          value={waiting.length}
          hint="Grupos en la lista de espera"
        />
      </KpiRow>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Reservas de hoy" flush>
          {bookings.length ? (
            <RowList>
              {bookings.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
                  onClick={() => setBookingId(booking.id)}
                >
                  <span className="w-12 shrink-0 text-sm font-bold tabular">
                    {time(booking.start)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {booking.clientName}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {booking.partySize} personas ·{" "}
                      {tableName(data, booking.resourceId) ??
                        "Sin mesa en el plano"}
                    </span>
                    <NoteLine note={booking.note} />
                  </span>
                </button>
              ))}
            </RowList>
          ) : (
            <Empty
              icon={CalendarCheck2}
              title="Sin reservas hoy"
              body="Las reservas confirmadas aparecerán aquí."
            />
          )}
        </Panel>
        <div className="flex flex-col gap-5">
          <RealWaitlistPanel
            onAdd={() => setPreset({ date: today, waitlist: true })}
          />
          <Panel title="Tu sala">
            <p className="text-sm text-text-muted">
              Consulta las mesas ocupadas y las que necesitan limpieza.
            </p>
            <Button variant="outline" className="mt-3" asChild>
              <Link href={sectionHref(spaceId, "sala")}>Abrir sala</Link>
            </Button>
          </Panel>
          {canView("validar") ? (
            <Panel title="Franky Card">
              <p className="text-sm text-text-muted">
                Revisa la tarjeta del estudiante y registra su operación cuando
                haya confirmado.
              </p>
              <Button variant="dark" className="mt-3" asChild>
                <Link href={sectionHref(spaceId, "validar")}>
                  Validar tarjeta
                </Link>
              </Button>
            </Panel>
          ) : null}
        </div>
      </div>
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <ReservationDrawer
        bookingId={bookingId}
        onClose={() => setBookingId(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Restaurante y bar                                                   */
/* ------------------------------------------------------------------ */

function ServiceHoy() {
  const { data, now, spaceId, vertical } = usePro();
  const actions = useTableActions();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const hours = data.space.hours[weekdayIndex(today)];
  const turns = TURN_ORDER.filter(
    (t) =>
      hours && TURNS[t].from >= hours.open && TURNS[t].lastSeat < hours.close,
  );
  const cap = capacity(data);
  const list = tableBookingsOn(data, today);
  const coversToday = covers(list);
  const possible = cap * Math.max(1, turns.length);
  const requested = data.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        b.status === "requested" &&
        !isWaitlist(b) &&
        localDate(b.start) >= today,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const pendingToday = list.filter(
    (b) =>
      b.status === "confirmed" ||
      b.status === "requested" ||
      b.status === "arrived",
  );
  const allergies = pendingToday.filter((b) => hasAllergyNote(b.note));
  const groups = pendingToday.filter(
    (b) => b.source === "grupo" || b.partySize >= 8,
  );
  const live = data.tables.map((t) => ({
    table: t,
    live: tableLive(data, t, now),
  }));
  const seated = live.filter((x) => x.live.state === "seated");
  const seatedCovers = seated.reduce(
    (a, x) => a + (x.live.current?.partySize ?? 0),
    0,
  );
  const freeNow = live.filter(
    (x) =>
      x.live.state === "free" ||
      (x.live.state === "soon" && x.live.minutes >= 45),
  );
  const waitlist = waitlistOn(data, today);
  const upcoming = list
    .filter(
      (b) =>
        (b.status === "confirmed" || b.status === "requested") &&
        localMinutes(b.start) >= nowMin - 20,
    )
    .slice(0, 7);
  const results = frankyResults(data, now, 30);
  const newGroups = data.groupRequests.filter((g) => g.status === "new");
  const hasSala = vertical.nav.some((n) => n.id === "sala");

  const summary = !turns.length
    ? "Hoy no abres. Mañana tienes las reservas en el libro."
    : `Hoy tienes ${plural(coversToday, "cubierto reservado", "cubiertos reservados")} de ${possible} posibles${groups.length ? `, ${plural(groups.length, "grupo", "grupos")}` : ""}${allergies.length ? ` y ${plural(allergies.length, "alergia avisada", "alergias avisadas")}` : ""}.`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={
          <Button
            variant="dark"
            onClick={() =>
              setPreset({ date: today, turn: currentTurn(nowMin) })
            }
          >
            <CalendarCheck2 className="h-4 w-4" strokeWidth={1.9} /> Nueva
            reserva
          </Button>
        }
      />

      <SetupChecklist />
      <ClosingNoteBanner />

      <KpiRow>
        <Kpi
          icon={UtensilsCrossed}
          label="Cubiertos hoy"
          value={coversToday}
          hint={`de ${possible} posibles`}
        />
        <Kpi
          icon={Users}
          label="En sala ahora"
          value={seatedCovers}
          hint={`${plural(seated.length, "mesa sentada", "mesas sentadas")}`}
        />
        <Kpi
          icon={BellRing}
          label="Por confirmar"
          value={requested.length}
          hint={requested.length ? "Reservas de Franky" : "Todo respondido"}
          emphasis={requested.length > 0}
        />
        <Kpi
          icon={Sparkles}
          label="Por Franky, 30 días"
          value={results.people}
          hint={`${money(results.revenueCents, { round: true })} sin comisión`}
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {requested.length ? (
            <Panel
              title="Esperan tu respuesta"
              description="Reservas pedidas en Franky. Si respondes rápido, vuelven."
              flush
            >
              <RowList>
                {requested.slice(0, 4).map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(b.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                            <StudentMark
                              university={
                                data.clients.find((c) => c.id === b.clientId)
                                  ?.student?.university
                              }
                            />
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {plural(b.partySize, "persona", "personas")} ·{" "}
                          {localDate(b.start) === today
                            ? "hoy"
                            : dayLabel(b.start)}{" "}
                          a las {time(b.start)}
                        </span>
                        <NoShowLine booking={b} />
                        <NoteLine note={b.note} />
                      </span>
                    </button>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10 flex-1 sm:flex-none"
                        onClick={() => actions.decline(b)}
                      >
                        Rechazar
                      </Button>
                      <Button
                        size="sm"
                        variant="dark"
                        className="h-10 flex-1 sm:flex-none"
                        onClick={() => actions.confirm(b)}
                      >
                        Confirmar
                      </Button>
                    </div>
                  </div>
                ))}
              </RowList>
            </Panel>
          ) : null}

          <DroppedPanel onOffer={setOffer} />

          {turns.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {turns.map((t) => (
                <TurnCard
                  key={t}
                  turn={t}
                  bookings={list.filter(
                    (b) => turnOf(localMinutes(b.start)) === t,
                  )}
                  capacity={cap}
                  nowMin={nowMin}
                />
              ))}
            </div>
          ) : (
            <Panel>
              <Empty
                icon={CalendarCheck2}
                title="Hoy no abres"
                body="Las reservas de mañana ya están en el libro. Revisa si hay alguna por confirmar."
              />
            </Panel>
          )}

          <GroupsTodayPanel />

          <Panel
            title="Próximas llegadas"
            description="Toca Sentar cuando entren por la puerta."
            action={
              <Link
                href={sectionHref(spaceId, "reservas")}
                className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
              >
                Libro <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {upcoming.length ? (
              <RowList>
                {upcoming.map((b) => (
                  <ArrivalRow
                    key={b.id}
                    booking={b}
                    nowMin={nowMin}
                    onOpen={() => setOpenId(b.id)}
                    onSeat={() => actions.seat(b)}
                  />
                ))}
              </RowList>
            ) : (
              <Empty
                icon={UserRoundCheck}
                title="No queda nadie por llegar hoy"
                body="Las mesas que se sienten sin reserva las ves en la sala."
              />
            )}
          </Panel>

          {groups.length || allergies.length ? (
            <Panel
              title="Avisa a cocina"
              description="Grupos y alergias de las reservas que quedan hoy."
              flush
            >
              <RowList>
                {[
                  ...groups,
                  ...allergies.filter((a) => !groups.includes(a)),
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setOpenId(b.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
                  >
                    <span className="w-12 shrink-0 text-sm font-bold tabular">
                      {time(b.start)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {b.clientName}{" "}
                        <span className="font-normal text-text-muted">
                          · {plural(b.partySize, "persona", "personas")}
                        </span>
                      </span>
                      {b.note ? <NoteLine note={b.note} /> : null}
                    </span>
                    {b.source === "grupo" || b.partySize >= 8 ? (
                      <Pill tone="violet">Grupo</Pill>
                    ) : (
                      <AlertTriangle
                        className="h-4 w-4 shrink-0 text-amber-600"
                        strokeWidth={1.9}
                        aria-label="Alergia"
                      />
                    )}
                  </button>
                ))}
              </RowList>
            </Panel>
          ) : null}

          <ConfirmPanel />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Mesas libres ahora"
            action={
              hasSala ? (
                <Link
                  href={sectionHref(spaceId, "sala")}
                  className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
                >
                  Sala <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null
            }
          >
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
                {freeNow.length}
              </span>
              <span className="text-sm text-text-muted">
                de {data.tables.length} mesas
              </span>
            </p>
            <Meter
              value={data.tables.length - freeNow.length}
              max={data.tables.length}
              className="mt-3"
              tone={freeNow.length <= 2 ? "warning" : "violet"}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {freeNow.slice(0, 12).map(({ table }) => (
                <span
                  key={table.id}
                  className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-semibold"
                >
                  {tableName(data, table.id)}{" "}
                  <span className="ml-1 font-normal text-text-muted">
                    {table.seats}p
                  </span>
                </span>
              ))}
            </div>
          </Panel>

          <EventTodayPanel />

          <Panel
            title="Lista de espera"
            description={
              waitlist.length
                ? "Avisa por SMS cuando su mesa esté lista."
                : undefined
            }
            action={
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => setPreset({ date: today, waitlist: true })}
              >
                Apuntar
              </Button>
            }
            flush
          >
            {waitlist.length ? (
              <RowList>
                {waitlist.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(w.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold">
                        {w.clientName}{" "}
                        <span className="font-normal text-text-muted">
                          · {w.partySize}p
                        </span>
                      </span>
                      <span className="block text-xs text-text-muted">
                        Esperando{" "}
                        {relative(w.start, now.getTime()).replace("hace ", "")}
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-10"
                      onClick={() => actions.notify(w)}
                    >
                      <BellRing className="h-3.5 w-3.5" /> Avisar
                    </Button>
                  </div>
                ))}
              </RowList>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
                Nadie esperando. Si llega gente sin reservar con la sala llena,
                apúntala aquí.
              </p>
            )}
          </Panel>

          <TeamTodayPanel />

          <SoldOutPanel />

          <FrankyBlock />

          <DailyMenuMini />

          {newGroups.length ? (
            <Panel title="Grupos que quieren venir" flush>
              <RowList>
                {newGroups.map((g) => (
                  <Link
                    key={g.id}
                    href={sectionHref(spaceId, "grupos")}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-secondary sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {g.kind}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {g.organization} · {g.people} personas ·{" "}
                        {dayLabel(g.date, { weekday: false })}
                      </span>
                    </span>
                    <Pill tone="violet">Nueva</Pill>
                  </Link>
                ))}
              </RowList>
            </Panel>
          ) : null}

          <SeasonCard onOffer={setOffer} />

          <ValleyCard onOffer={setOffer} />

          <SeptemberRadarCard onOffer={setOffer} />

          <RegularsCard />

          <MarginAlertsCard />

          <Tip title="Antes de abrir">
            Repasa alergias y grupos, y deja libre la mesa más grande hasta que
            llegue el grupo. Las reservas que no se presentan quedan en la ficha
            del cliente.
          </Tip>
        </div>
      </div>

      <FixedPortal>
        <div className="fixed bottom-20 right-4 z-40 sm:hidden">
          <Button
            variant="dark"
            size="lg"
            className="rounded-full shadow-float"
            onClick={() =>
              setPreset({ date: today, turn: currentTurn(nowMin) })
            }
          >
            + Reserva
          </Button>
        </div>
      </FixedPortal>

      {openId ? (
        <ReservationDrawer bookingId={openId} onClose={() => setOpenId(null)} />
      ) : null}
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

/** Aviso en la solicitud: esta persona ya dejó una mesa vacía antes. */
function NoShowLine({ booking }: { booking: ProBooking }) {
  const { data } = usePro();
  const n = noShowHistory(data, {
    clientId: booking.clientId,
    name: booking.clientName,
  });
  if (!n) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
      <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
      No vino {plural(n, "vez", "veces")}: pide confirmación o señal
    </span>
  );
}

function TurnCard({
  turn,
  bookings,
  capacity: cap,
  nowMin,
}: {
  turn: Turn;
  bookings: ProBooking[];
  capacity: number;
  nowMin: number;
}) {
  const T = TURNS[turn];
  const c = covers(bookings);
  const live = nowMin >= T.from - 15 && nowMin < T.to;
  const over = nowMin >= T.to;
  const franky = bookings.filter((b) => fromFranky(b.source)).length;
  const allergies = bookings.filter(
    (b) =>
      hasAllergyNote(b.note) && b.status !== "done" && b.status !== "no_show",
  ).length;
  const seatedNow = bookings
    .filter((b) => b.status === "arrived")
    .reduce((a, b) => a + b.partySize, 0);
  return (
    <section
      className={cn(
        "rounded-2xl border bg-bg-primary p-4 shadow-card sm:p-5",
        live ? "border-violet/30" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-heading text-lg font-bold">
          {T.label}{" "}
          <span className="text-sm font-medium text-text-muted tabular">
            {minutesToLabel(T.from)} a {minutesToLabel(T.to)}
          </span>
        </p>
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <LiveDot /> En curso
          </span>
        ) : over ? (
          <Pill>Terminado</Pill>
        ) : (
          <Pill tone="info">A las {minutesToLabel(T.from)}</Pill>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">
          {c}
        </span>
        <span className="text-sm text-text-muted tabular">
          / {cap} cubiertos
        </span>
      </p>
      <Meter
        value={c}
        max={cap}
        className="mt-2"
        tone={c / Math.max(1, cap) > 0.9 ? "warning" : "violet"}
      />
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-bg-secondary px-2 py-2">
          <dt className="text-[0.68rem] text-text-muted">Reservas</dt>
          <dd className="font-heading text-base font-bold tabular">
            {bookings.filter((b) => b.status !== "no_show").length}
          </dd>
        </div>
        <div className="rounded-xl bg-bg-secondary px-2 py-2">
          <dt className="text-[0.68rem] text-text-muted">
            {live ? "En sala" : "Por Franky"}
          </dt>
          <dd className="font-heading text-base font-bold tabular">
            {live ? seatedNow : franky}
          </dd>
        </div>
        <div
          className={cn(
            "rounded-xl px-2 py-2",
            allergies ? "bg-amber-50 dark:bg-amber-950/40" : "bg-bg-secondary",
          )}
        >
          <dt
            className={cn(
              "text-[0.68rem]",
              allergies
                ? "text-amber-800 dark:text-amber-300"
                : "text-text-muted",
            )}
          >
            Alergias
          </dt>
          <dd className="font-heading text-base font-bold tabular">
            {allergies}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ArrivalRow({
  booking: b,
  nowMin,
  onOpen,
  onSeat,
}: {
  booking: ProBooking;
  nowMin: number;
  onOpen: () => void;
  onSeat: () => void;
}) {
  const { data } = usePro();
  const late = localMinutes(b.start) < nowMin;
  const client = data.clients.find((c) => c.id === b.clientId);
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="w-12 shrink-0">
          <span className="block text-sm font-bold tabular">
            {time(b.start)}
          </span>
          {late ? (
            <span className="block text-[0.68rem] font-semibold text-rose-600">
              Tarde
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{b.clientName}</span>
            {b.student ? (
              <StudentMark university={client?.student?.university} />
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
            <span className="tabular">{b.partySize}p</span>
            <span>{tableName(data, b.resourceId) ?? "Sin mesa"}</span>
            <SourceTag source={b.source} />
          </span>
          <NoteLine note={b.note} />
        </span>
      </button>
      {b.status === "requested" ? (
        <Pill tone="warning">Por confirmar</Pill>
      ) : (
        <Button size="sm" variant="outline" className="h-10" onClick={onSeat}>
          Sentar
        </Button>
      )}
    </div>
  );
}

function DailyMenuMini() {
  const { data, update, spaceId, pending, can } = usePro();
  const toast = useToast();
  const menu = data.dailyMenu;
  if (!menu) return null;
  const reach =
    data.space.demo && data.space.walkMinutesToCampus !== null
      ? nearbyReach(data.space.walkMinutesToCampus)
      : null;
  return (
    <Panel
      title="Menú del día"
      action={
        <Link
          href={sectionHref(spaceId, "carta")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          Editar <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-heading text-xl font-extrabold tabular">
            {money(menu.priceCents)}
          </span>
          {menu.studentPriceCents ? (
            <span className="ml-2 text-text-muted">
              estudiantes {money(menu.studentPriceCents)}
            </span>
          ) : null}
        </p>
        {menu.published ? (
          <Pill tone="success">Publicado</Pill>
        ) : (
          <Pill tone="warning">Sin publicar</Pill>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
        {[...menu.starters, ...menu.mains].join(", ")}
      </p>
      {!menu.published ? (
        <Button
          variant="dark"
          className="mt-3 h-11 w-full"
          disabled={pending || !can("daily.publish")}
          onClick={async () => {
            if (
              !(await update("daily.publish", (d) =>
                d.dailyMenu
                  ? { ...d, dailyMenu: { ...d.dailyMenu, published: true } }
                  : d,
              ))
            )
              return;
            toast.success(
              "Menú publicado",
              reach === null
                ? undefined
                : `Lo verán unos ${reach.toLocaleString("es-ES")} estudiantes cerca de ti antes de comer.`,
            );
          }}
        >
          Publicar para estudiantes
        </Button>
      ) : reach !== null ? (
        <p className="mt-2 text-xs text-text-muted">
          Lo están viendo unos {reach.toLocaleString("es-ES")} estudiantes a
          menos de 2 km.
        </p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cafetería                                                           */
/* ------------------------------------------------------------------ */

function CafeHoy() {
  const { data, now, spaceId } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const todays = data.validations
    .filter((v) => localDate(v.at) === today)
    .sort((a, b) => b.at.localeCompare(a.at));
  const discounts = todays.reduce((a, v) => a + v.discountCents, 0);
  const sales = todays.reduce((a, v) => a + v.amountCents - v.discountCents, 0);
  const rewards = todays.filter((v) => v.kind === "reward").length;
  const stampsToday =
    data.loyalty?.stampsToday ??
    todays.filter((v) => v.kind !== "reward").length;
  const results = frankyResults(data, now, 30);

  const regularNames = [...new Set(todays.map((v) => v.clientName))]
    .map((name) => ({
      name,
      client: data.clients.find((c) => c.name === name),
      last: todays.find((v) => v.clientName === name)!,
    }))
    .filter((x) => (x.client?.visits ?? 0) >= 15);

  const hours = data.space.hours[weekdayIndex(today)];
  const open = Boolean(hours && nowMin >= hours.open && nowMin < hours.close);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={
          todays.length
            ? `Llevas ${plural(todays.length, "validación", "validaciones")} y ${plural(stampsToday, "sello", "sellos")} hoy. ${plural(regularNames.length, "cliente habitual ya ha pasado", "clientes habituales ya han pasado")}.`
            : open
              ? "Todavía no has validado ninguna tarjeta hoy. La primera suele llegar con el café de antes de clase."
              : "Hoy aún no has abierto. Tus números de ayer están en Resultados."
        }
        actions={
          <Button variant="dark" asChild>
            <Link href={sectionHref(spaceId, "validar")}>
              <ScanLine className="h-4 w-4" strokeWidth={1.9} /> Validar tarjeta
            </Link>
          </Button>
        }
      />

      <SetupChecklist />
      <ClosingNoteBanner />

      <KpiRow>
        <Kpi
          icon={ScanLine}
          label="Validaciones hoy"
          value={todays.length}
          hint={`${money(discounts)} en descuentos`}
        />
        <Kpi
          icon={Stamp}
          label="Sellos hoy"
          value={stampsToday}
          hint={
            rewards
              ? `${plural(rewards, "premio canjeado", "premios canjeados")}`
              : "Ningún premio todavía"
          }
        />
        <Kpi
          icon={Wallet}
          label="Ventas con Card"
          value={money(sales, { round: true })}
          hint="Hoy, ya con descuento"
        />
        <Kpi
          icon={Sparkles}
          label="Por Franky, 30 días"
          value={results.people}
          hint={`${money(results.revenueCents, { round: true })} sin comisión`}
          emphasis
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <CafeMenuPanel />

          <ShowcasePanel onOffer={setOffer} />

          <Panel
            title="Habituales de hoy"
            description="Estudiantes que vienen casi a diario. Salúdales por su nombre."
            flush
          >
            {regularNames.length ? (
              <RowList>
                {regularNames.slice(0, 6).map(({ name, client, last }) => {
                  const stamps = data.loyalty
                    ? stampsFor(
                        data.validations,
                        name,
                        data.loyalty.stampsNeeded,
                      )
                    : 0;
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-3 px-4 py-3 sm:px-5"
                    >
                      <Avatar name={name} size="sm" tone="violet" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span className="truncate">{name}</span>
                          <StudentMark
                            university={client?.student?.university}
                          />
                        </span>
                        <span className="block text-xs text-text-muted">
                          {client?.visits ?? 0} visitas · hoy a las{" "}
                          {time(last.at)}
                        </span>
                      </span>
                      {data.loyalty ? (
                        <StampDots
                          value={stamps}
                          max={data.loyalty.stampsNeeded}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </RowList>
            ) : (
              <Empty
                icon={Coffee}
                title="Aún no ha venido ningún habitual"
                body="Cuando un cliente fijo valide su tarjeta, aparecerá aquí con sus sellos."
              />
            )}
          </Panel>

          <RegularsCard />

          <Panel
            title="Últimas validaciones"
            action={
              <Link
                href={sectionHref(spaceId, "validar")}
                className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
              >
                Historial <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {todays.length ? (
              <RowList>
                {todays.slice(0, 6).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <span className="w-12 shrink-0 text-sm font-semibold text-text-muted tabular">
                      {time(v.at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {v.clientName}
                    </span>
                    <Pill
                      tone={
                        v.kind === "reward"
                          ? "success"
                          : v.kind === "stamp"
                            ? "neutral"
                            : "violet"
                      }
                    >
                      {v.kind === "reward"
                        ? "Premio"
                        : v.kind === "stamp"
                          ? "Sello"
                          : `-${money(v.discountCents)}`}
                    </Pill>
                    <span className="w-16 shrink-0 text-right text-sm font-semibold tabular">
                      {money(v.amountCents - v.discountCents)}
                    </span>
                  </div>
                ))}
              </RowList>
            ) : (
              <Empty
                icon={ScanLine}
                title="Sin validaciones hoy"
                body="Cuando un estudiante te enseñe su Franky Card, valida en tres toques."
              />
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <StudyPanel onOffer={setOffer} />

          <OrdersMini />

          <SeasonCard onOffer={setOffer} />

          <ValleyCard onOffer={setOffer} />

          <SeptemberRadarCard onOffer={setOffer} />

          <MarginAlertsCard />

          <BonosHint />

          <FrankyBlock />

          <Tip title="Temporada de exámenes">
            En enero y junio los estudiantes buscan dónde estudiar. Con el sitio
            activado apareces en su mapa; un café rellenable a mitad de precio
            llena las tardes flojas.
          </Tip>
        </div>
      </div>

      <FixedPortal>
        <div className="fixed bottom-20 right-4 z-40 sm:hidden">
          <Button
            variant="dark"
            size="lg"
            className="rounded-full shadow-float"
            asChild
          >
            <Link href={sectionHref(spaceId, "validar")}>
              <ScanLine className="h-4 w-4" /> Validar
            </Link>
          </Button>
        </div>
      </FixedPortal>

      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

function CafeMenuPanel() {
  const { data, update, spaceId, pending, can } = usePro();
  const toast = useToast();
  const menu = data.dailyMenu;
  const reach =
    data.space.demo && data.space.walkMinutesToCampus !== null
      ? nearbyReach(data.space.walkMinutesToCampus)
      : null;
  const breakfast = data.offers.find(
    (o) => o.kind === "valley" && o.status === "live",
  );
  if (!menu)
    return (
      <Panel>
        <Empty
          icon={UtensilsCrossed}
          title="Sin menú del día"
          body="Un menú a mediodía con precio de estudiante es lo que más visitas trae entre semana."
          action={
            <Button variant="dark" asChild>
              <Link href={sectionHref(spaceId, "carta")}>
                Crear menú del día
              </Link>
            </Button>
          }
        />
      </Panel>
    );
  return (
    <section
      className={cn(
        "rounded-2xl border bg-bg-primary p-4 shadow-card sm:p-5",
        menu.published ? "border-border" : "border-amber-300/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Menú del día</p>
          <p className="mt-1 font-heading text-lg font-bold">
            {money(menu.priceCents)}
            {menu.studentPriceCents ? (
              <span className="ml-2 text-sm font-semibold text-violet">
                {money(menu.studentPriceCents)} con carnet
              </span>
            ) : null}
          </p>
        </div>
        {menu.published ? (
          <Pill tone="success">Publicado</Pill>
        ) : (
          <Pill tone="warning">Sin publicar</Pill>
        )}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        {[
          { label: "Primeros", items: menu.starters },
          { label: "Segundos", items: menu.mains },
          { label: "Postres", items: menu.desserts },
        ].map((g) => (
          <div key={g.label}>
            <p className="text-xs font-semibold text-text-muted">{g.label}</p>
            <ul className="mt-1 space-y-0.5 text-text-secondary">
              {g.items.map((i) => (
                <li key={i} className="truncate">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {breakfast ? (
        <p className="mt-3 flex items-center gap-2 border-t border-border-light pt-3 text-sm">
          <LiveDot />{" "}
          <span className="min-w-0 flex-1 truncate">{breakfast.detail}</span>
          <span className="shrink-0 text-xs text-text-muted tabular">
            {breakfast.claimed} hoy
          </span>
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {!menu.published ? (
          <Button
            variant="dark"
            className="h-11 flex-1"
            disabled={pending || !can("daily.publish")}
            onClick={async () => {
              if (
                !(await update("daily.publish", (d) =>
                  d.dailyMenu
                    ? { ...d, dailyMenu: { ...d.dailyMenu, published: true } }
                    : d,
                ))
              )
                return;
              toast.success(
                "Menú publicado",
                reach === null
                  ? undefined
                  : `Lo verán unos ${reach.toLocaleString("es-ES")} estudiantes cerca de ti antes de comer.`,
              );
            }}
          >
            Publicar para estudiantes
          </Button>
        ) : reach !== null ? (
          <p className="flex-1 self-center text-xs text-text-muted">
            Lo están viendo unos {reach.toLocaleString("es-ES")} estudiantes a
            menos de 2 km.
          </p>
        ) : null}
        <Button variant="outline" className="h-11" asChild>
          <Link href={sectionHref(spaceId, "carta")}>Editar menú</Link>
        </Button>
      </div>
    </section>
  );
}
