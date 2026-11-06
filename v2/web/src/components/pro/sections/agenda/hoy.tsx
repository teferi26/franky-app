"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Clock3,
  Sparkles,
  Star,
  Tablet,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { bookingsOn, daySummary, freeGaps, type Gap } from "@/lib/pro/agenda";
import {
  dayLabel,
  durationLabel,
  greeting,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  relative,
  time,
} from "@/lib/pro/format";
import { frankyMonth } from "@/lib/pro/results";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Empty,
  FixedPortal,
  Kpi,
  KpiRow,
  LiveDot,
  PageHeader,
  Panel,
  Pill,
  Row,
  RowList,
  StatusPill,
} from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import {
  BookingDrawer,
  NewBookingDrawer,
  isFromFranky,
  type NewBookingPreset,
} from "./booking-drawers";
import {
  AttentionPanel,
  TomorrowReminders,
  WaitlistToday,
} from "./today-panels";
import { WalkinPanel } from "./walkins";
import { GroupPlanDrawer } from "./group-plan";
import { DayChecklist } from "./day-checklist";
import { ReceptionScreen, StaffDayDrawer } from "./reception";

export default function AgendaHoy() {
  const { data, now, spaceId, vertical, demo, can, pending, loadDate } =
    usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewBookingPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const summary = daySummary(data, today, nowMin);
  const gaps = freeGaps(data, today, nowMin, 30);
  // Las mismas cifras de 30 días que en Estudiantes.
  const franky = frankyMonth(data, now);
  const requested = data.bookings
    .filter((b) => b.status === "requested")
    .sort((a, b) => a.start.localeCompare(b.start));
  // Grupos por contestar o con presupuesto enviado: se montan desde aquí.
  const newGroups = data.groupRequests.filter(
    (g) => g.status === "new" || g.status === "quoted",
  );
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const [reception, setReception] = React.useState(false);
  // Persona cuyo día (con los avisos de sus fichas) se está mirando.
  const [dayOf, setDayOf] = React.useState<string | null>(null);
  const canPlanGroups = Boolean(data.agendaOps) || demo;
  const liveOffers = data.offers.filter(
    (o) => o.status === "live" && o.kind === "flash",
  );
  const freeMinutes = gaps.reduce((a, g) => a + (g.to - g.from), 0);
  // Por la tarde toca mandar los recordatorios de mañana: suben arriba.
  const remindersFirst = nowMin >= 17 * 60;
  const showFinance = demo || can("finance.read");
  const canOffer = can("offer.launch");
  const chargedToday = demo
    ? summary.chargedCents
    : data.payments
        .filter((payment) => localDate(payment.at) === today)
        .reduce((total, payment) => total + payment.amountCents, 0);

  React.useEffect(() => {
    if (!demo) void loadDate(today);
  }, [demo, loadDate, today]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={
          data.space.owner.firstName
            ? `${greeting(now)}, ${data.space.owner.firstName}`
            : greeting(now)
        }
        description={
          summary.total
            ? `Hoy tienes ${plural(summary.total, "cita", "citas")}: ${listText([
                `${summary.pending} por delante`,
                gaps.length
                  ? `${durationLabel(freeMinutes)} libres para estudiantes`
                  : "",
                showFinance && summary.expectedCents
                  ? `${money(summary.expectedCents, { round: true })} previstos`
                  : "",
              ])}.`
            : "Hoy no hay citas todavía."
        }
        actions={
          summary.total ? (
            <Button
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => setReception(true)}
            >
              <Tablet className="h-4 w-4" strokeWidth={1.9} /> Recepción
            </Button>
          ) : undefined
        }
      />

      {demo ? <SetupChecklist /> : null}

      <KpiRow>
        <Kpi
          icon={CalendarCheck2}
          label="Citas de hoy"
          value={`${summary.done}/${summary.total}`}
          hint={
            summary.requested
              ? `${summary.requested} por confirmar`
              : "atendidas / total"
          }
        />
        {showFinance ? (
          <Kpi
            icon={Wallet}
            label={demo ? "Cobrado hoy" : "Registrado en caja"}
            value={money(chargedToday, { round: true })}
            hint={`${money(summary.expectedCents, { round: true })} previstos`}
          />
        ) : null}
        <Kpi
          icon={Zap}
          label="Huecos libres"
          value={durationLabel(freeMinutes)}
          hint={
            gaps.length
              ? canOffer
                ? "Ofrécelos a estudiantes"
                : "Disponibles en tu agenda"
              : "Sin huecos disponibles"
          }
          emphasis={gaps.length > 0}
          onClick={
            gaps.length && canOffer
              ? () => setOffer({ gap: gaps[0] })
              : undefined
          }
        />
        {demo ? (
          <Kpi
            icon={Sparkles}
            label="Por Franky, 30 días"
            value={franky.people}
            hint={`${money(franky.revenueCents, { round: true })} sin comisión`}
          />
        ) : null}
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {remindersFirst ? (
            <TomorrowReminders onOpen={setOpenBooking} />
          ) : null}
          {requested.length ? (
            <Panel
              title="Esperan tu respuesta"
              description="Citas pedidas online que necesitan confirmación."
              flush
            >
              <RowList>
                {requested.slice(0, 4).map((b) => {
                  const service = data.services.find(
                    (s) => s.id === b.serviceId,
                  );
                  return (
                    <Row key={b.id} onClick={() => setOpenBooking(b.id)}>
                      <Avatar name={b.clientName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {b.clientName}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {service?.name} ·{" "}
                          {dayLabel(b.start, { weekday: true })} a las{" "}
                          {time(b.start)}
                        </span>
                      </span>
                      <StatusPill status="requested" />
                    </Row>
                  );
                })}
              </RowList>
            </Panel>
          ) : null}

          <Panel
            title="Ahora y a continuación"
            description="Lo que tiene cada profesional en las próximas horas."
            action={
              <Link
                href={sectionHref(spaceId, "agenda")}
                className="inline-flex items-center gap-1 text-sm font-semibold text-violet"
              >
                Agenda <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            <div className="grid divide-y divide-border-light md:grid-cols-3 md:divide-x md:divide-y-0">
              {data.staff
                .filter((s) =>
                  data.services.some((sv) => sv.staffIds.includes(s.id)),
                )
                .map((s) => {
                  const list = bookingsOn(data, today, s.id).filter(
                    (b) =>
                      b.status !== "no_show" &&
                      Date.parse(b.end) > now.getTime(),
                  );
                  const current = list.find(
                    (b) =>
                      b.status === "in_service" ||
                      (Date.parse(b.start) <= now.getTime() &&
                        Date.parse(b.end) > now.getTime()),
                  );
                  const next = list.filter((b) => b !== current).slice(0, 3);
                  return (
                    <div key={s.id} className="flex flex-col gap-3 p-4 sm:p-5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.name} tone={s.tone} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {s.name.split(" ")[0]}
                          </p>
                          <p className="text-xs text-text-muted">{s.title}</p>
                        </div>
                        {s.clockedInAt ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                            <LiveDot /> Desde {time(s.clockedInAt)}
                          </span>
                        ) : demo ? (
                          <Pill>Sin fichar</Pill>
                        ) : null}
                      </div>
                      {current ? (
                        <button
                          type="button"
                          onClick={() => setOpenBooking(current.id)}
                          className={cn(
                            "rounded-xl p-3 text-left transition-transform hover:-translate-y-px",
                            TONES[s.tone].block,
                          )}
                        >
                          <p
                            className={cn(
                              "text-xs font-semibold uppercase tracking-wider",
                              TONES[s.tone].text,
                            )}
                          >
                            Ahora
                          </p>
                          <p className="mt-0.5 truncate font-semibold">
                            {current.clientName}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {
                              data.services.find(
                                (x) => x.id === current.serviceId,
                              )?.name
                            }{" "}
                            · hasta las {time(current.end)}
                          </p>
                        </button>
                      ) : (
                        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-text-muted">
                          Libre ahora
                        </p>
                      )}
                      <ul className="flex flex-col gap-1.5">
                        {next.map((b) => (
                          <li key={b.id}>
                            <button
                              type="button"
                              onClick={() => setOpenBooking(b.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-bg-secondary"
                            >
                              <span className="w-11 shrink-0 text-xs font-semibold text-text-muted tabular">
                                {time(b.start)}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {b.clientName}
                              </span>
                              {b.student ? (
                                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" />
                              ) : null}
                              {b.status === "arrived" ? (
                                <Pill tone="info">Llegó</Pill>
                              ) : null}
                            </button>
                          </li>
                        ))}
                        {!next.length && !current ? (
                          <li className="text-sm text-text-muted">
                            Nada más hoy.
                          </li>
                        ) : null}
                      </ul>
                      {bookingsOn(data, today, s.id).length ? (
                        <button
                          type="button"
                          onClick={() => setDayOf(s.id)}
                          className="inline-flex h-10 items-center gap-1 self-start text-sm font-semibold text-violet"
                        >
                          Su día con avisos{" "}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </Panel>

          <WaitlistToday />
          {vertical.id === "hairdresser" ? <WalkinPanel /> : null}
          {!remindersFirst ? (
            <TomorrowReminders onOpen={setOpenBooking} />
          ) : null}

          {newGroups.length ? (
            <Panel
              title="Grupos que quieren venir"
              description={
                canPlanGroups
                  ? "Toca un grupo y Franky te monta el horario en tu agenda."
                  : "Peticiones de delegaciones, clubes y asociaciones."
              }
              flush
            >
              <RowList>
                {newGroups.map((g) => (
                  <Row
                    key={g.id}
                    onClick={
                      canPlanGroups ? () => setOpenGroup(g.id) : undefined
                    }
                    href={
                      canPlanGroups
                        ? undefined
                        : sectionHref(
                            spaceId,
                            vertical.nav.some((n) => n.id === "grupos")
                              ? "grupos"
                              : "estudiantes",
                          )
                    }
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-secondary">
                      <Users className="h-4 w-4 text-text-secondary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {g.organization}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {g.kind} · {g.people} personas · {dayLabel(g.date)}
                      </span>
                    </span>
                    <Pill tone="violet">
                      {g.status === "new" ? "Nueva" : "Presupuestada"}
                    </Pill>
                  </Row>
                ))}
              </RowList>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <DayChecklist />
          <AttentionPanel onOpen={setOpenBooking} />
          <Panel
            title="Huecos para llenar hoy"
            description={
              demo
                ? "Ofrécelos a estudiantes cerca de tu negocio."
                : "Disponibilidad según los horarios y las citas de tu agenda."
            }
            flush
          >
            {gaps.length ? (
              <RowList>
                {gaps.slice(0, 5).map((g) => (
                  <GapRow
                    key={`${g.staffId}-${g.from}`}
                    gap={g}
                    onOffer={() => setOffer({ gap: g })}
                  />
                ))}
              </RowList>
            ) : (
              <Empty
                icon={CalendarCheck2}
                title="Sin huecos disponibles hoy"
                body="Consulta otro día en la agenda para ver los próximos huecos."
              />
            )}
            {liveOffers.length ? (
              <div className="border-t border-border-light px-4 py-3 sm:px-5">
                {liveOffers.map((o) => (
                  <p key={o.id} className="flex items-center gap-2 text-sm">
                    <LiveDot />
                    <span className="min-w-0 flex-1 truncate">{o.detail}</span>
                    <span className="shrink-0 text-xs text-text-muted tabular">
                      {o.claimed}/{o.slots}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
          </Panel>

          {demo ? <FrankyCard /> : null}

          <Panel
            title="Últimas reseñas"
            action={
              data.space.rating !== null ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {data.space.rating.toFixed(1).replace(".", ",")}
                </span>
              ) : undefined
            }
            flush
          >
            <RowList>
              {data.reviews.slice(0, 2).map((r) => (
                <div key={r.id} className="px-4 py-3 sm:px-5">
                  <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                    <span>{r.clientName}</span>
                    <span className="text-xs font-normal text-text-muted">
                      {relative(r.at, now.getTime())}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                    {r.text}
                  </p>
                </div>
              ))}
            </RowList>
          </Panel>
        </div>
      </div>

      <FixedPortal>
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 sm:hidden">
          <Button
            variant="dark"
            size="lg"
            className="rounded-full shadow-float"
            disabled={pending || !can("booking.create")}
            onClick={() => setPreset({ date: today })}
          >
            + Cita
          </Button>
        </div>
      </FixedPortal>

      <BookingDrawer
        bookingId={openBooking}
        onClose={() => setOpenBooking(null)}
        onNewBooking={setPreset}
      />
      <NewBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      <GroupPlanDrawer
        requestId={openGroup}
        onClose={() => setOpenGroup(null)}
      />
      <StaffDayDrawer
        staffId={dayOf}
        date={today}
        onClose={() => setDayOf(null)}
        onOpenBooking={(id) => {
          setDayOf(null);
          setOpenBooking(id);
        }}
      />
      {reception ? (
        <ReceptionScreen onClose={() => setReception(false)} />
      ) : null}
    </div>
  );
}

/** "a, b y c" sin los trozos vacíos. */
function listText(parts: string[]): string {
  const list = parts.filter(Boolean);
  return list.length > 1
    ? `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}`
    : (list[0] ?? "");
}

function GapRow({ gap, onOffer }: { gap: Gap; onOffer: () => void }) {
  const { data, pending, can } = usePro();
  const s = data.staff.find((x) => x.id === gap.staffId);
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span
        className={cn(
          "h-9 w-1 shrink-0 rounded-full",
          TONES[s?.tone ?? "slate"].bar,
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold tabular">
          {minutesToLabel(gap.from)} a {minutesToLabel(gap.to)}
        </span>
        <span className="flex items-center gap-1 text-xs text-text-muted">
          <Clock3 className="h-3 w-3" /> {durationLabel(gap.to - gap.from)} con{" "}
          {s?.name.split(" ")[0]}
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !can("offer.launch")}
        onClick={onOffer}
      >
        <Zap className="h-3.5 w-3.5" /> Ofrecer
      </Button>
    </div>
  );
}

/** Lo que Franky ha traído: la cifra que justifica la cuota. */
function FrankyCard() {
  const { data, now, spaceId } = usePro();
  const franky = frankyMonth(data, now);
  const fromFrankyToday = bookingsOn(data, localDate(now)).filter((b) =>
    isFromFranky(b.source),
  ).length;
  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
        Franky, últimos 30 días
      </p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
        {franky.people}
      </p>
      <p className="text-sm text-white/70">clientes han llegado por Franky</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">
            {money(franky.revenueCents, { round: true })}
          </p>
          <p className="text-xs text-white/60">facturado con ellos</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">
            {money(franky.agendaSavedCents, { round: true })}
          </p>
          <p className="text-xs text-white/60">que no pagas en comisiones</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/60">
        {fromFrankyToday} de las citas de hoy vienen de Franky.
      </p>
      <Link
        href={sectionHref(spaceId, "estudiantes")}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white"
      >
        Ver resultados <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
