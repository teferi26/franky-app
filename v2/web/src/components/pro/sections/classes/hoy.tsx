"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarCheck2, CheckCheck, Repeat, Sparkles, UserCheck, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProClassSession } from "@/lib/pro/types";
import { addDays, dayLabel, greeting, localDate, money, pct, plural, relative, time } from "@/lib/pro/format";
import {
  classCopy,
  freeSpots,
  isRoomMode,
  isTrial,
  recurringCents,
  sessionRoster,
  sessionState,
  sessionsOn,
  shortUni,
  weekStart,
} from "@/lib/pro/classes";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Kpi, KpiRow, LiveDot, Meter, PageHeader, Panel, Pill, Row, RowList, Tip } from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { atRiskMembers, chargeMessage, chargeSummary, extrasOf, isLate, markChargeReminded, monthOf, wasContactedRecently } from "@/lib/pro/classes-care";
import { arrivalWindow, type ExamAhead } from "@/lib/pro/classes-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { ClassesFrankyCard, SessionDrawer, capitalize, fillTone, isFromFranky } from "./parts";
import { CareList } from "./care";
import { ExamStrip, IntensiveDrawer } from "./intensive";
import { ReviewAsk, RoomsReadyLine, TomorrowReminders } from "./room";
import { DoorArrivals, DoorDrawer } from "./door";
import { CheerList } from "./records";
import { LeadsToday, SeasonCard } from "./today-extras";
import { ContinuityToday, ReinforcementToday } from "./study";
import { BirthdaysToday, ErasmusCard, MaterialNeedsPanel, StaffGapsPanel } from "./leisure";

export default function ClassesHoy() {
  const { data, now, spaceId, vertical, demo, update } = usePro();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [exam, setExam] = React.useState<ExamAhead | null>(null);
  const [door, setDoor] = React.useState(false);

  const todays = sessionsOn(data, today);
  const live = todays.find((s) => sessionState(s, now) === "live");
  const next = todays.find((s) => sessionState(s, now) === "next");
  const focus = live ?? next;
  const started = todays.filter((s) => sessionState(s, now) !== "next");
  const attended = started.some((s) => s.checkedIn === null) ? null : started.reduce((a, s) => a + (s.checkedIn ?? 0), 0);
  const expected = started.reduce((a, s) => a + s.booked, 0);
  const bookedToday = todays.reduce((a, s) => a + s.booked, 0);
  const waitingToday = todays.reduce((a, s) => a + s.waitlist, 0);

  const monday = weekStart(today);
  const week = data.sessions.filter((s) => s.status !== "cancelled" && localDate(s.start) >= monday && localDate(s.start) < addDays(monday, 7));
  const weekPct = pct(
    week.reduce((a, s) => a + s.booked, 0),
    week.reduce((a, s) => a + s.capacity, 0),
  );

  const active = data.members.filter((m) => m.status === "active" || m.status === "overdue");
  const monthStart = `${today.slice(0, 8)}01`;
  const newThisMonth = data.members.filter((m) => localDate(m.since) >= monthStart && m.status !== "cancelled").length;
  const overdue = data.members.filter((m) => m.status === "overdue");
  const risks = atRiskMembers(data, now).filter((r) => !wasContactedRecently(r, now));
  const monthCharges = chargeSummary(data, monthOf(today), now);
  // Lo que se debe de verdad: recibos devueltos y cuotas ya vencidas del mes.
  const owedCharges = extrasOf(data)
    .charges.filter((c) => c.period === monthOf(today) && (c.status === "returned" || isLate(c, today)))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const owedCents = monthCharges.returnedCents + monthCharges.lateCents;
  const trialsToday = todays.flatMap((s) => sessionRoster(data, s, now).booked.filter(isTrial).map((b) => ({ b, s })));
  const newGroups = data.groupRequests.filter((g) => g.status === "new");
  const mrr = recurringCents(data);
  const hasMembers = data.members.length > 0;
  const weekRevenue = data.history.at(-1)?.revenueCents ?? 0;

  const agenda = todays.length
    ? `Hoy tienes ${plural(todays.length, copy.sessionOne, copy.sessionMany)} con ${bookedToday} ${copy.groups ? "personas" : "reservas"}${waitingToday ? `, ${waitingToday} en lista de espera` : ""}${trialsToday.length ? ` y ${plural(trialsToday.length, trialsLabel(vertical.id, false), trialsLabel(vertical.id, true))}` : ""}.`
    : `Hoy no hay ${copy.sessionMany}. Aprovecha para preparar la semana.`;
  // Estado del centro en una frase: cuotas y socios en riesgo, solo si los hay.
  const care = [
    owedCharges.length ? `${money(owedCents, { round: true })} de cuotas por cobrar` : "",
    risks.length ? plural(risks.length, `${copy.member} que se te puede ir`, `${copy.members} que se te pueden ir`) : "",
  ].filter(Boolean);
  const summary = hasMembers && care.length ? `${agenda} Tienes ${care.join(" y ")}.` : agenda;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={data.space.owner.firstName ? `${greeting(now)}, ${data.space.owner.firstName}` : `Hoy en ${data.space.name}`}
        description={summary}
        actions={
          focus ? (
            <Button variant="dark" onClick={() => setOpen(focus.id)}>
              <CheckCheck className="h-4 w-4" />
              {vertical.id === "culture"
                ? live
                  ? "Partida en curso"
                  : `Partida de las ${time(focus.start)}`
                : `Pasar lista${live ? "" : ` de las ${time(focus.start)}`}`}
            </Button>
          ) : undefined
        }
      >
        {vertical.id === "culture" ? <RoomsReadyLine /> : null}
      </PageHeader>

      <SetupChecklist />

      <SeasonCard />

      <KpiRow>
        <Kpi
          icon={UserCheck}
          label="Asistencia hoy"
          value={attended === null ? "No disponible" : expected ? `${pct(attended, expected)} %` : "Sin empezar"}
          hint={attended === null ? "Asistencia no visible con este acceso" : expected ? `${attended} de ${expected} han venido` : `${bookedToday} reservas para hoy`}
        />
        <Kpi icon={CalendarCheck2} label="Ocupación de la semana" value={`${weekPct} %`} hint={`${week.length} ${copy.sessionMany}`} />
        {demo && (hasMembers ? (
          <>
            <Kpi
              icon={Users}
              label={`${copy.Members} activos`}
              value={active.length}
              hint={newThisMonth ? `+${newThisMonth} este mes` : "sin altas este mes"}
              onClick={() => router.push(sectionHref(spaceId, "socios"))}
            />
            <Kpi icon={Wallet} label="Recurrente al mes" value={money(mrr, { round: true })} hint={overdue.length ? `${overdue.length} cuotas por cobrar` : "todas cobradas"} emphasis={overdue.length > 0} />
          </>
        ) : (
          <>
            <Kpi icon={Users} label="Grupos por responder" value={newGroups.length} hint="asociaciones, Erasmus y cumpleaños" emphasis={newGroups.length > 0} />
            <Kpi icon={Wallet} label="Facturado esta semana" value={money(weekRevenue, { round: true })} hint="salas, talleres y grupos" />
          </>
        ))}
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {focus ? <FocusCard session={focus} live={Boolean(live)} onOpen={() => setOpen(focus.id)} /> : null}

          <Panel
            title={`${capitalize(copy.sessionMany)} de hoy`}
            description={todays.length ? `${todays.filter((s) => sessionState(s, now) === "past").length} terminadas, ${todays.filter((s) => sessionState(s, now) === "next").length} por delante.` : undefined}
            action={
              <Link href={sectionHref(spaceId, "horario")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                {vertical.nav.find((n) => n.id === "horario")?.label ?? "Horario"} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {todays.length ? (
              <ol className="relative">
                {todays.map((s) => (
                  <TimelineRow key={s.id} session={s} onOpen={() => setOpen(s.id)} />
                ))}
              </ol>
            ) : (
              <Empty
                icon={CalendarCheck2}
                title={`Hoy no hay ${copy.sessionMany}`}
                body={`Crea tus ${copy.sessionMany} en ${vertical.nav.find((n) => n.id === "horario")?.label ?? "Horario"} y tus ${copy.members} las reservarán desde Franky.`}
                action={
                  <Button variant="outline" asChild>
                    <Link href={sectionHref(spaceId, "horario")}>Ir al horario</Link>
                  </Button>
                }
              />
            )}
          </Panel>

          {hasMembers ? <CareList /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {vertical.id === "academy" ? <ExamStrip compact onPrepare={setExam} /> : null}
          {vertical.id === "academy" ? <ReinforcementToday /> : null}
          {vertical.id === "academy" ? <ContinuityToday /> : null}
          {vertical.id === "culture" ? <TomorrowReminders /> : null}
          {vertical.id === "culture" ? <ReviewAsk /> : null}
          {vertical.id === "culture" ? <ErasmusCard onOffer={setOffer} /> : null}
          {vertical.id === "culture" ? <BirthdaysToday /> : null}
          {vertical.id === "culture" ? <MaterialNeedsPanel /> : null}
          {vertical.id === "culture" ? <StaffGapsPanel /> : null}
          {vertical.id !== "culture" ? <LeadsToday /> : null}
          {vertical.id === "sports" ? <CheerList compact /> : null}
          {demo && (hasMembers ? (
            <Panel
              title="Cuotas sin cobrar"
              description={owedCharges.length ? `${money(owedCents, { round: true })} entre recibos devueltos y cuotas vencidas. Un aviso amable suele bastar.` : undefined}
              action={
                <Link href={`${sectionHref(spaceId, "socios")}?vista=cobros`} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                  Cobros <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
              flush
            >
              {owedCharges.length ? (
                <RowList>
                  {owedCharges.slice(0, 4).map((c) => {
                    const member = data.members.find((m) => m.id === c.memberId);
                    const sender = data.space.owner.firstName || data.space.name;
                    const link = customerWhatsApp(member?.phone, chargeMessage(c, sender, data.space.name, today, money(c.amountCents)));
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <Avatar name={c.memberName} size="sm" tone="rose" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{c.memberName}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {money(c.amountCents)} · {c.status === "returned" ? "recibo devuelto" : `vencía ${relative(`${c.dueOn}T09:00:00Z`, now.getTime())}`}
                            {c.remindedAt ? " · avisado" : ""}
                          </span>
                        </span>
                        {link ? (
                          <Button size="sm" variant="secondary" asChild>
                            <a href={link} target="_blank" rel="noreferrer" onClick={() => void update("charge.remind", (d) => markChargeReminded(d, c.id, now))}>
                              Avisar
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </RowList>
              ) : (
                <Empty icon={Wallet} title="Todo cobrado" body={`Ningún ${copy.member} tiene la cuota vencida.`} />
              )}
            </Panel>
          ) : (
            <Panel
              title="Grupos que quieren venir"
              description="Asociaciones, Erasmus y cumpleaños que te han pedido presupuesto."
              flush
            >
              {newGroups.length ? (
                <RowList>
                  {newGroups.map((g) => (
                    <Row key={g.id} href={sectionHref(spaceId, vertical.nav.some((n) => n.id === "grupos") ? "grupos" : "estudiantes")}>
                      <Avatar name={g.organization} size="sm" tone="violet" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{g.organization}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {g.kind} · {g.people} personas · {dayLabel(g.date, { weekday: false })}
                        </span>
                      </span>
                      <Pill tone="violet">Nueva</Pill>
                    </Row>
                  ))}
                </RowList>
              ) : (
                <Empty icon={Users} title="Sin peticiones nuevas" body="Cuando una asociación o un grupo te pida presupuesto, aparecerá aquí." />
              )}
            </Panel>
          ))}

          {demo || data.classOperations?.rosterVisible ? <Panel
            title={vertical.id === "culture" ? "Primeras visitas de hoy" : "Clases de prueba de hoy"}
            description={trialsToday.length ? "Llegan sin conocerte: el trato de hoy decide si se quedan." : undefined}
            flush
          >
            {trialsToday.length ? (
              <RowList>
                {trialsToday.map(({ b, s }) => {
                  const ct = data.classTypes.find((c) => c.id === s.classTypeId);
                  const client = data.clients.find((c) => c.id === b.clientId);
                  return (
                    <Row key={b.id} onClick={() => setOpen(s.id)}>
                      <Avatar name={b.clientName} size="sm" tone="violet" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 truncate text-sm font-semibold">
                          <span className="truncate">{b.clientName}</span>
                          {client?.student?.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {ct?.name} a las {time(s.start)}
                          {client?.student ? ` · ${shortUni(client.student.university)}` : ""}
                        </span>
                      </span>
                      {b.status === "arrived" ? (
                        <Pill tone="success">Ha venido</Pill>
                      ) : isFromFranky(b.source) ? (
                        <Pill tone="violet">
                          <Sparkles className="h-3 w-3" /> Franky
                        </Pill>
                      ) : null}
                    </Row>
                  );
                })}
              </RowList>
            ) : (
              <Empty
                icon={Sparkles}
                title="Hoy no hay pruebas"
                body={demo ? vertical.id === "culture" ? "Las primeras visitas llegan desde tu ficha de Franky." : "La clase de prueba para quien llega a la ciudad trae unas 10 personas al mes a un centro como el tuyo." : "Las reservas marcadas como prueba aparecerán aquí."}
              />
            )}
          </Panel> : null}

          {vertical.id !== "culture" ? <DoorArrivals onOpenDoor={() => setDoor(true)} /> : null}

          {demo ? <ClassesFrankyCard /> : null}

          {demo ? <Tip title={vertical.id === "academy" ? "Tu mejor momento" : "Horas valle"}>
            {vertical.id === "academy"
              ? "Las tres semanas antes de los exámenes de enero y junio llenan los intensivos. Prográmalos ya en Estudiantes y Franky los enseña a quien tiene esa asignatura."
              : vertical.id === "culture"
                ? "Las sesiones de 16:00 entre semana son las que más cuesta llenar. Un precio de estudiante solo en esa franja no rebaja tus sábados."
                : "Las clases de 10 a 14 h van a media ocupación. La tarifa universitaria solo en esa franja llena huecos sin bajar la cuota de la tarde."}
          </Tip> : null}
        </div>
      </div>

      <SessionDrawer sessionId={open} onClose={() => setOpen(null)} onOffer={setOffer} />
      <IntensiveDrawer exam={exam} onClose={() => setExam(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      <DoorDrawer open={door} onClose={() => setDoor(false)} />
    </div>
  );
}

function trialsLabel(v: string, many: boolean) {
  if (v === "culture") return many ? "primeras visitas" : "primera visita";
  return many ? "clases de prueba" : "clase de prueba";
}

/** La clase en curso (o la siguiente), bien grande para pasar lista en un toque. */
function FocusCard({ session: s, live, onOpen }: { session: ProClassSession; live: boolean; onOpen: () => void }) {
  const { data, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const ct = data.classTypes.find((c) => c.id === s.classTypeId);
  const coach = data.staff.find((x) => x.id === s.coachId);
  const tone = TONES[ct?.tone ?? "slate"];
  const { booked } = sessionRoster(data, s, now);
  const minutesLeft = Math.round((new Date(live ? s.end : s.start).getTime() - now.getTime()) / 60000);
  const perGroup = isRoomMode(data, ct);
  const arrival = perGroup && s.booked ? arrivalWindow(s, now, extrasOf(data).policy.courtesyMin) : null;
  const waiting = perGroup && booked.some((b) => b.status === "confirmed");

  return (
    <section className={cn("rounded-2xl border border-border p-4 shadow-card sm:p-5", tone.block)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]", tone.text)}>
            {live ? <LiveDot /> : null}
            {live ? `En curso, quedan ${minutesLeft} min` : `Siguiente, empieza ${minutesLeft < 60 ? `en ${minutesLeft} min` : `a las ${time(s.start)}`}`}
          </p>
          <h2 className="mt-1.5 font-heading text-2xl font-extrabold tracking-[-0.02em]">{ct?.name}</h2>
          <p className="text-sm text-text-secondary">
            {time(s.start)} a {time(s.end)} · {s.room} · {coach?.name}
            {vertical.id === "academy" && ct ? ` · ${ct.category}` : ""}
          </p>
        </div>
        <Button variant="dark" onClick={onOpen}>
          <CheckCheck className="h-4 w-4" /> {perGroup ? "Abrir reserva" : "Pasar lista"}
        </Button>
      </div>
      {arrival && waiting && arrival.phase === "courtesy" ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          El grupo aún no ha llegado: quedan {arrival.minutesLeft} min de cortesía.
        </p>
      ) : arrival && waiting && arrival.phase === "lost" ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          Cortesía agotada. Márcalo como no presentado desde la reserva.
        </p>
      ) : null}
      <div className="mt-4 flex items-baseline gap-3">
        <p className="font-heading text-3xl font-extrabold tabular">
          {live ? s.checkedIn ?? "No disponible" : s.booked}
          <span className="text-lg text-text-muted">/{live ? s.booked : s.capacity}</span>
        </p>
        <p className="text-sm text-text-secondary">
          {live ? "han llegado" : perGroup ? "personas en la sala" : "plazas reservadas"}
          {s.waitlist ? ` · ${s.waitlist} en espera` : ""}
          {!live && freeSpots(s) && !perGroup ? ` · ${freeSpots(s)} libres` : ""}
        </p>
      </div>
      {!live || s.checkedIn !== null ? <Meter value={live ? s.checkedIn! : s.booked} max={live ? Math.max(1, s.booked) : s.capacity} className="mt-2 bg-bg-primary/70" tone={live ? "success" : "violet"} /> : null}
      <div className="mt-4 flex -space-x-2">
        {booked.slice(0, 9).map((b) => (
          <Avatar key={b.id} name={b.clientName} size="sm" tone={b.status === "arrived" ? "emerald" : "slate"} className="ring-2 ring-bg-primary" />
        ))}
        {booked.length > 9 ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-primary text-[0.7rem] font-semibold ring-2 ring-bg-primary tabular">+{booked.length - 9}</span>
        ) : null}
      </div>
    </section>
  );
}

function TimelineRow({ session: s, onOpen }: { session: ProClassSession; onOpen: () => void }) {
  const { data, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const ct = data.classTypes.find((c) => c.id === s.classTypeId);
  const coach = data.staff.find((x) => x.id === s.coachId);
  const state = sessionState(s, now);
  const tone = TONES[ct?.tone ?? "slate"];
  const perGroup = isRoomMode(data, ct);
  const trials = sessionRoster(data, s, now).booked.filter(isTrial).length;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-stretch gap-3 border-b border-border-light px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5",
          state === "past" && "opacity-60",
          state === "live" && "bg-violet-50/50 dark:bg-violet-950/20",
        )}
      >
        <span className="flex w-12 shrink-0 flex-col pt-0.5">
          <span className="font-heading text-[0.95rem] font-bold tabular">{time(s.start)}</span>
          <span className="text-xs text-text-muted tabular">{time(s.end)}</span>
        </span>
        <span className={cn("w-1 shrink-0 rounded-full", tone.bar)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold">{ct?.name}</span>
            {state === "live" ? (
              <Pill tone="success">
                <LiveDot className="h-1.5 w-1.5" /> Ahora
              </Pill>
            ) : null}
            {s.booked >= s.capacity && !perGroup ? <Pill tone="danger">Completa</Pill> : null}
            {trials ? <Pill tone="violet">{plural(trials, "prueba", "pruebas")}</Pill> : null}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {vertical.id === "academy" ? `${ct?.category} · ` : ""}
            {coach?.name.split(" ")[0]} · {s.room}
          </span>
          <span className="mt-2 flex items-center gap-2">
            {state === "next" || s.checkedIn !== null ? <Meter
              value={state === "next" ? s.booked : s.checkedIn!}
              max={state === "next" ? s.capacity : Math.max(1, s.booked)}
              className="max-w-[220px] flex-1"
              tone={state === "next" ? (fillTone(s) === "danger" ? "danger" : fillTone(s) === "warning" ? "warning" : "violet") : "success"}
            /> : null}
            <span className="shrink-0 text-xs font-semibold tabular">
              {perGroup
                ? s.booked
                  ? `Grupo de ${s.booked}`
                  : "Sala libre"
                : state === "next"
                  ? `${s.booked}/${s.capacity}`
                  : s.checkedIn === null ? "Asistencia no disponible" : `${s.checkedIn} de ${s.booked} vinieron`}
            </span>
            {s.waitlist ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-300">
                <Repeat className="h-3 w-3" /> {s.waitlist}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}
