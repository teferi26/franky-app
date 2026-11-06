"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarCheck2, Gauge, Plus, Send, Sparkles, Sun, Users, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProResource } from "@/lib/pro/types";
import { addDays, dayLabel, durationLabel, greeting, localDate, localMinutes, minutesToLabel, money, plural, time } from "@/lib/pro/format";
import {
  MATCH_MINUTES,
  SLOT_MINUTES,
  dayOccupancy,
  hoursFor,
  isBusy,
  isShared,
  isValley,
  matchesOn,
  occupancyAt,
  priceFor,
  resourceBookings,
  valleyGaps,
  type OpenMatchX,
  type ValleyGap,
} from "@/lib/pro/courts";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Kpi, KpiRow, LiveDot, Meter, PageHeader, Panel, Pill, Row, RowList, Tip } from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { RealCourtsHoy } from "./real-hoy";
import { TodayAttention } from "./hoy-attention";
import { useAutoRelease } from "./use-courts";
import { pendingOn } from "@/lib/pro/courts-ops";
import { uniCalendar } from "@/lib/pro/courts-growth";
import { shortDate } from "./state";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import {
  BookingStatusPill,
  CourtBookingDrawer,
  CourtsFrankyCard,
  MatchDrawer,
  NewCourtBookingDrawer,
  courtsCopy,
  fromFranky,
  type NewCourtPreset,
} from "./parts";

export default function CourtsHoy() {
  const { demo } = usePro();
  return demo ? <DemoCourtsHoy /> : <RealCourtsHoy />;
}

function DemoCourtsHoy() {
  const { data, now, spaceId, vertical } = usePro();
  const router = useRouter();
  const copy = courtsCopy(vertical.id);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [openMatch, setOpenMatch] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  useAutoRelease();

  const todays = resourceBookings(data, today).filter((b) => b.status !== "no_show");
  const occToday = dayOccupancy(data, today);
  const hours = hoursFor(data, today);
  const upcoming = todays.filter((b) => new Date(b.end).getTime() > now.getTime()).slice(0, 6);
  const requested = data.bookings.filter((b) => b.resourceId && b.status === "requested").sort((a, b) => a.start.localeCompare(b.start));
  const matches = (data.openMatches as OpenMatchX[])
    .filter((m) => !m.releasedAt && new Date(m.start).getTime() + MATCH_MINUTES * 60000 > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));

  // Franjas valle vacías de hoy; si ya han pasado, las de mañana.
  const tomorrow = addDays(today, 1);
  const gapsToday = valleyGaps(data, today, nowMin);
  const gaps = gapsToday.length ? gapsToday : valleyGaps(data, tomorrow, 0);
  const gapsDay = gapsToday.length ? today : tomorrow;
  const valleyHours = gaps.filter((g) => !isShared(res(data.resources, g.resourceId))).reduce((a, g) => a + (g.to - g.from), 0);

  const people = data.resources.filter(isShared).reduce((a, r) => a + occupancyAt(data, r, today, nowMin), 0);
  const seats = data.resources.filter(isShared).reduce((a, r) => a + r.capacity, 0);
  const roomsBooked = todays.filter((b) => !isShared(res(data.resources, b.resourceId))).length;
  const charged = data.payments.filter((p) => localDate(p.at) === today).reduce((a, p) => a + p.amountCents, 0);
  const expected = todays.reduce((a, b) => a + b.priceCents, 0);
  const last4 = data.history.slice(-4).reduce((a, w) => a + w.franky, 0);
  const pendingToday = pendingOn(data, today);
  // Lo que viven ahora los estudiantes de la zona y la campaña que encaja.
  const moment = uniCalendar(today, coworking ? "coworking" : "sports_facility")[0];

  const offerGap = (g: ValleyGap) => {
    const r = res(data.resources, g.resourceId);
    const price = r.kind === "court" ? priceFor({ ...r, valleyPricePerHourCents: undefined }, g.date, g.from, MATCH_MINUTES)
      : r.pricePerHourCents === null ? null : r.pricePerHourCents * (isShared(r) ? 4 : 2);
    if (price === null) return;
    setOffer({
      what: copy.what(r),
      date: g.date,
      from: g.from,
      to: g.to,
      priceCents: price,
      slots: isShared(r) ? g.free : Math.max(1, Math.floor((g.to - g.from) / (r.kind === "court" ? MATCH_MINUTES : 120))),
    });
  };

  const description = coworking
    ? `Ahora hay ${people} de ${seats} puestos ocupados, ${plural(todays.length, "reserva", "reservas")} hoy y ${plural(roomsBooked, "sala de grupo", "salas de grupo")} reservadas.`
    : `Hoy tienes ${plural(todays.length, "reserva", "reservas")} y las pistas al ${occToday} %${matches.filter((m) => localDate(m.start) === today).length ? `, con ${plural(matches.filter((m) => localDate(m.start) === today).length, "partido abierto", "partidos abiertos")} por completar` : ""}${valleyHours && gapsDay === today ? `. Quedan ${durationLabel(valleyHours)} de pista en hora valle sin vender.` : "."}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={description}
        actions={
          <Button variant="dark" onClick={() => setPreset({ date: today })}>
            <Plus className="h-4 w-4" /> {copy.newBooking}
          </Button>
        }
      />

      <SetupChecklist />

      <TodayAttention />

      <KpiRow>
        {coworking ? (
          <Kpi icon={Gauge} label="Ocupación ahora" value={`${seats ? Math.round((people / seats) * 100) : 0} %`} hint={`${people} de ${seats} puestos`} />
        ) : (
          <Kpi icon={Gauge} label="Ocupación hoy" value={`${occToday} %`} hint={hours ? `de ${minutesToLabel(hours.open)} a ${minutesToLabel(hours.close)}` : "Cerrado"} />
        )}
        <Kpi icon={CalendarCheck2} label="Reservas hoy" value={todays.length} hint={`${money(charged, { round: true })} cobrados de ${money(expected, { round: true })}`} />
        <Kpi
          icon={Zap}
          label={coworking ? "Franjas valle con sitio" : "Horas valle libres"}
          value={coworking ? gaps.length : durationLabel(valleyHours)}
          hint={gaps.length ? `${gapsDay === today ? "Hoy" : "Mañana"}: ofrécelas a estudiantes` : "Todo vendido"}
          emphasis={gaps.length > 0}
          onClick={gaps.length ? () => offerGap(gaps[0]) : undefined}
        />
        {coworking ? (
          <Kpi icon={Sparkles} label="Por Franky, 4 semanas" value={last4} hint="reservas sin comisión" />
        ) : (
          <Kpi
            icon={Wallet}
            label="Por cobrar hoy"
            value={money(pendingToday, { round: true })}
            hint={pendingToday ? "partes de jugadores sin pagar" : "todo cobrado"}
            emphasis={pendingToday > 0}
            onClick={pendingToday ? () => router.push(sectionHref(spaceId, "mostrador")) : undefined}
          />
        )}
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {requested.length ? (
            <Panel title="Esperan tu respuesta" description="Reservas pedidas online que necesitan tu visto bueno." flush>
              <RowList>
                {requested.slice(0, 4).map((b) => {
                  const r = data.resources.find((x) => x.id === b.resourceId);
                  return (
                    <Row key={b.id} onClick={() => setOpenBooking(b.id)}>
                      <Avatar name={b.clientName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{b.clientName}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {r?.name} · {dayLabel(b.start)} a las {time(b.start)}
                        </span>
                      </span>
                      <BookingStatusPill status={b.status} playing={copy.playing} />
                    </Row>
                  );
                })}
              </RowList>
            </Panel>
          ) : null}

          <Panel
            title={coworking ? "Ocupación de hoy por franja" : "Pistas de hoy"}
            description={coworking ? "Cuanto más oscuro, más lleno. Toca una franja para reservar." : "Cada casilla es media hora. Toca una libre para reservar."}
            action={
              <Link href={sectionHref(spaceId, "pistas")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                {copy.section} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {hours ? (
              <MiniGrid date={today} onNew={(resourceId, minute) => setPreset({ date: today, resourceId, minute })} />
            ) : (
              <Empty icon={CalendarCheck2} title="Hoy está cerrado" body="Cambia tu horario en Ajustes si abres de forma excepcional." />
            )}
          </Panel>

          <Panel title="Próximas reservas" description={upcoming.length ? "Lo que viene en las próximas horas." : undefined} flush>
            {upcoming.length ? (
              <RowList>
                {upcoming.map((b) => {
                  const r = data.resources.find((x) => x.id === b.resourceId);
                  return (
                    <Row key={b.id} onClick={() => setOpenBooking(b.id)}>
                      <span className="w-12 shrink-0">
                        <span className="block font-heading text-[0.95rem] font-bold tabular">{time(b.start)}</span>
                        <span className="block text-xs text-text-muted tabular">{time(b.end)}</span>
                      </span>
                      <span className={cn("h-9 w-1 shrink-0 rounded-full", TONES[r?.tone ?? "slate"].bar)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-semibold">
                          <span className="truncate">{b.clientName}</span>
                          {b.student ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
                          {fromFranky(b.source) ? <Sparkles className="h-3 w-3 shrink-0 text-violet" aria-label="Vino por Franky" /> : null}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {r?.name}
                          {b.priceCents ? ` · ${money(b.priceCents)}${b.paidCents !== null && b.paidCents >= b.priceCents ? ", pagada" : ""}` : b.note ? ` · ${b.note}` : ""}
                        </span>
                      </span>
                      <BookingStatusPill status={b.status} playing={copy.playing} />
                    </Row>
                  );
                })}
              </RowList>
            ) : (
              <Empty icon={CalendarCheck2} title="Nada más por hoy" body="Las reservas de mañana aparecerán aquí a primera hora." />
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {coworking ? (
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <LiveDot /> En directo
                </span>
              }
              description="Lo mismo que ven los estudiantes en el mapa de estudio de Franky."
            >
              <ul className="flex flex-col gap-3.5">
                {data.resources.map((r) => {
                  const occ = occupancyAt(data, r, today, nowMin);
                  const cap = isShared(r) ? r.capacity : 1;
                  return (
                    <li key={r.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 font-semibold">
                          <span className={cn("h-2 w-2 rounded-full", TONES[r.tone].dot)} />
                          {r.name}
                        </span>
                        <span className="text-text-muted tabular">
                          {isShared(r) ? `${occ} de ${r.capacity}` : occ ? "Ocupada" : "Libre"}
                        </span>
                      </div>
                      <Meter value={Math.min(cap, occ)} max={cap} className="mt-1.5" tone={occ >= cap ? "danger" : occ / cap > 0.75 ? "warning" : "success"} />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : (
            <Panel
              title="Partidos abiertos por completar"
              description="Se llenan con estudiantes de nivel parecido."
              action={
                <Link href={`${sectionHref(spaceId, "pistas")}?vista=partidos`} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                  Todos <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
              flush
            >
              {matches.length ? (
                <RowList>
                  {matches.slice(0, 4).map((m) => {
                    const r = data.resources.find((x) => x.id === m.resourceId);
                    return (
                      <Row key={m.id} onClick={() => setOpenMatch(m.id)}>
                        <span className="flex -space-x-2">
                          {m.players.slice(0, 3).map((p) => (
                            <Avatar key={p} name={p} size="xs" tone="violet" className="ring-2 ring-bg-primary" />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            Nivel {m.level} · {localDate(m.start) === today ? "hoy" : "mañana"} {time(m.start)}
                          </span>
                          <span className="block truncate text-xs text-text-muted">
                            {r?.name} · {m.publishedAt ? `visto por ${m.reach ?? 0} estudiantes` : "sin publicar"}
                          </span>
                        </span>
                        <Pill tone={m.needed === 1 ? "warning" : "violet"}>Faltan {m.needed}</Pill>
                      </Row>
                    );
                  })}
                </RowList>
              ) : (
                <Empty icon={Users} title="Ningún partido abierto" body="Cuando alguien quiera jugar y le falte gente, créalo desde Pistas y se completa con estudiantes." />
              )}
            </Panel>
          )}

          <Panel
            title={`Franjas valle vacías ${gapsDay === today ? "hoy" : "mañana"}`}
            description="De 10 a 14 h. Ofrécelas a estudiantes antes de bajar precios a todos."
            flush
          >
            {gaps.length ? (
              <RowList>
                {gaps.slice(0, 5).map((g) => {
                  const r = res(data.resources, g.resourceId);
                  return (
                    <div key={`${g.resourceId}-${g.from}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span className={cn("h-9 w-1 shrink-0 rounded-full", TONES[r.tone].bar)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold tabular">
                          {minutesToLabel(g.from)} a {minutesToLabel(g.to)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Sun className="h-3 w-3" /> {r.name}
                          {isShared(r) ? ` · ${g.free} puestos libres` : r.pricePerHourCents === null ? " · Precio según servicio" : ` · ${money(r.valleyPricePerHourCents ?? r.pricePerHourCents)} la hora`}
                        </span>
                      </span>
                      <Button size="sm" variant="secondary" disabled={r.pricePerHourCents === null} onClick={() => offerGap(g)}>
                        <Send className="h-3.5 w-3.5" /> Ofrecer a estudiantes
                      </Button>
                    </div>
                  );
                })}
              </RowList>
            ) : (
              <Empty icon={Sun} title="Mañanas vendidas" body="No queda ninguna franja valle libre. Buen trabajo." />
            )}
          </Panel>

          <CourtsFrankyCard />

          {moment ? (
            <Tip title={moment.from <= today ? moment.title : `${moment.title}, desde el ${shortDate(moment.from)}`}>
              {moment.what} {moment.idea}{" "}
              <Link href={sectionHref(spaceId, "ocupacion")} className="font-semibold text-violet">
                Ver el curso
              </Link>
            </Tip>
          ) : null}
        </div>
      </div>

      <CourtBookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <MatchDrawer matchId={openMatch} onClose={() => setOpenMatch(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

function res(list: ProResource[], id?: string): ProResource {
  return list.find((r) => r.id === id) ?? list[0];
}

/** Rejilla compacta del día: una fila por pista o zona, una casilla por media hora. */
function MiniGrid({ date, onNew }: { date: string; onNew: (resourceId: string, minute: number) => void }) {
  const { data, now } = usePro();
  const hours = hoursFor(data, date)!;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const slots = Array.from({ length: (hours.close - hours.open) / SLOT_MINUTES }, (_, i) => hours.open + i * SLOT_MINUTES);
  const matchSlots = (r: ProResource, m: number) => matchesOn(data, date, r.id).some((x) => localMinutes(x.start) <= m && localMinutes(x.start) + MATCH_MINUTES > m);

  return (
    <div className="p-4 sm:p-5">
      <div className="overflow-x-auto pro-scroll">
        <div className="min-w-max">
          <div className="flex gap-[3px] pb-1.5 pl-[5.5rem]" aria-hidden>
            {slots.map((m) => (
              <span key={m} className="relative h-3.5 w-5 shrink-0">
                {m % 120 === 0 ? (
                  <span className="absolute left-0 top-0 whitespace-nowrap text-[0.65rem] font-medium text-text-muted tabular">{minutesToLabel(m)}</span>
                ) : null}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {data.resources.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-20 shrink-0 truncate text-xs font-semibold">{r.name}</span>
                <div className="flex gap-[3px]">
                  {slots.map((m) => {
                    const past = date === today && m + SLOT_MINUTES <= nowMin;
                    const valley = isValley(date, m);
                    const shared = isShared(r);
                    const occ = occupancyAt(data, r, date, m);
                    const busy = isBusy(data, r, date, m);
                    const match = !shared && matchSlots(r, m);
                    const ratio = shared ? occ / r.capacity : busy ? 1 : 0;
                    const label = `${r.name} a las ${minutesToLabel(m)}: ${shared ? `${occ} de ${r.capacity}` : match ? "partido abierto" : busy ? "reservada" : "libre"}`;
                    return (
                      <button
                        key={m}
                        type="button"
                        title={label}
                        aria-label={label}
                        disabled={past || busy}
                        onClick={() => onNew(r.id, m)}
                        className={cn(
                          "h-7 w-5 shrink-0 rounded-[5px] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:hover:scale-100",
                          match
                            ? "border border-dashed border-violet bg-violet-50"
                            : shared
                              ? ratio === 0
                                ? valley
                                  ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300/70 dark:bg-emerald-950/40"
                                  : "bg-bg-secondary"
                                : ratio < 0.4
                                  ? "bg-violet/25"
                                  : ratio < 0.75
                                    ? "bg-violet/55"
                                    : ratio < 1
                                      ? "bg-violet/80"
                                      : "bg-violet"
                              : busy
                                ? TONES[r.tone].bar
                                : valley
                                  ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300/70 dark:bg-emerald-950/40"
                                  : "bg-bg-secondary",
                          past && "opacity-40",
                          date === today && m <= nowMin && m + SLOT_MINUTES > nowMin && "outline outline-2 outline-offset-1 outline-rose-500",
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-violet" /> {data.resources.some(isShared) ? "Lleno" : "Reservada"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-emerald-50 ring-1 ring-inset ring-emerald-300" /> Valle libre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-bg-secondary ring-1 ring-inset ring-border" /> Libre
        </span>
        {data.openMatches.length ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-dashed border-violet bg-violet-50" /> Partido abierto
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] outline outline-2 outline-rose-500" /> Ahora
        </span>
      </div>
    </div>
  );
}
