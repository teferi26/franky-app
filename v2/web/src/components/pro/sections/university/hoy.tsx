"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  ClipboardList,
  Copy,
  Flag,
  GraduationCap,
  Home,
  Megaphone,
  MessageCircleQuestion,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sprout,
  Stamp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProUniMetric } from "@/lib/pro/types";
import { dayLabel, greeting, localDate, minutesToLabel, pct, relative } from "@/lib/pro/format";
import {
  FIRST_YEAR_ALERT_SHARE,
  PRIVACY_MIN_GROUP,
  caseState,
  creditEligible,
  firstYearAlerts,
  octoberCheckpoint,
  publicationForDeadline,
  sortModerationQueue,
  uniExtrasOf,
  upcomingDeadlines,
} from "@/lib/pro/university";
import type { UniAssociation, UniHousing, UniModeration, UniPublication, UniWelcomeStop } from "@/lib/pro/university-types";
import { suspectedCopies } from "@/lib/pro/university-listings";
import { mentorsOf } from "@/lib/pro/university-mentors";
import { dayAgenda, daySummary, officeOf } from "@/lib/pro/university-office";
import { renewalSummary } from "@/lib/pro/university-renewal";
import { faqsOf, uncoveredTopics } from "@/lib/pro/university-faq";
import { cn } from "@/lib/utils";
import { Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Row, RowList, Tip } from "../../kit";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { HiddenGroup, UrgentBanner } from "./ui";

function metricValue(m: ProUniMetric) {
  return m.unit === "%" ? `${m.value} %` : m.value.toLocaleString("es-ES");
}

function Delta({ m }: { m: ProUniMetric }) {
  if (m.delta === undefined) return null;
  const up = m.delta >= 0;
  const label = m.unit === "%" ? `${up ? "+" : ""}${m.delta} pts` : `${up ? "+" : ""}${m.delta.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular", up ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function daysUntil(date: string, now: Date): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${localDate(now)}T12:00:00Z`)) / 86_400_000);
}

export default function UniversityHoy() {
  const { data, now, spaceId } = usePro();
  const extras = uniExtrasOf(data);
  const metric = (key: string) => data.uniMetrics.find((m) => m.key === key);
  const active = metric("active");
  const welcome = metric("welcome");

  const housing = data.uniHousing as UniHousing[];
  const pendingHousing = housing.filter((h) => h.status === "pending");
  const overdueCases = housing.filter((h) => h.case && caseState(h.case, now) === "overdue");
  const pendingReports = sortModerationQueue((data.uniModeration as UniModeration[]).filter((m) => m.status === "pending"));
  const associations = data.uniAssociations as UniAssociation[];
  const withEcts = associations.filter((a) => a.ectsRequests > 0);
  const ectsTotal = withEcts.reduce((a, x) => a + x.ectsRequests, 0);
  const eligibleCredits = extras.credits.filter((r) => r.status === "pending" && creditEligible(r)).length;
  const registrations = associations.filter((a) => a.pendingRegistration && !a.registered);
  const pubs = data.uniPublications as UniPublication[];
  const published = pubs.filter((p) => p.status === "published");
  const top = [...published].sort((a, b) => b.reach - a.reach)[0];
  const stops = data.uniWelcome as UniWelcomeStop[];
  const nextStop = stops.filter((s) => s.date >= now.toISOString()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const checkins = stops.reduce((a, s) => a + s.checkins, 0);
  const alerts = firstYearAlerts(extras.faculties);
  const deadlines = upcomingDeadlines(extras.deadlines, now, 30);
  const unprepared = deadlines.filter((d) => daysUntil(d.date, now) <= 10 && !publicationForDeadline(pubs, d.id));
  const copies = suspectedCopies(housing);
  const mentorWaiting = mentorsOf(data).requests.filter((r) => r.status === "waiting");
  // La renovación de asociaciones solo se recuerda en septiembre y octubre.
  const month = Number(localDate(now).slice(5, 7));
  const renewals = renewalSummary(associations, now);
  const renewalDue = month === 9 || month === 10 ? renewals.missing : [];
  const office = officeOf(data);
  const officeToday = daySummary(dayAgenda(office, localDate(now), now));
  const unanswered = uncoveredTopics(office.appointments, faqsOf(data), now);

  const summary = [
    active ? `${active.value.toLocaleString("es-ES")} estudiantes del campus activos en Franky este mes.` : null,
    pendingHousing.length || pendingReports.length
      ? `Te esperan ${pendingHousing.length} pisos por verificar y ${pendingReports.length} reportes.`
      : "No hay nada pendiente de revisar.",
  ]
    .filter(Boolean)
    .join(" ");

  const nothingPending =
    !pendingReports.length &&
    !pendingHousing.length &&
    !withEcts.length &&
    !registrations.length &&
    !overdueCases.length &&
    !unprepared.length &&
    !mentorWaiting.length &&
    !unanswered.length &&
    !renewalDue.length;
  const publish = (query = "") => `${sectionHref(spaceId, "publicaciones")}?nueva=1${query}`;

  return (
    <div className="flex flex-col gap-5">
      <UrgentBanner />

      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={
          <Button asChild variant="dark">
            <Link href={publish()}>
              <Plus className="h-4 w-4" /> Nueva publicación
            </Link>
          </Button>
        }
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi icon={Users} label="Activos en Franky" value={active ? metricValue(active) : "0"} hint={active?.hint} />
        <Kpi icon={GraduationCap} label="Primero en la bienvenida" value={welcome ? metricValue(welcome) : "0 %"} hint="Han ido a alguna actividad" emphasis />
        <Kpi icon={Home} label="Pisos por verificar" value={pendingHousing.length} hint={overdueCases.length ? `${overdueCases.length} casos fuera de plazo` : "Sin casos fuera de plazo"} />
        <Kpi icon={Flag} label="Reportes pendientes" value={pendingReports.length} hint="Lo grave, arriba" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Te esperan" description="Lo que necesita una decisión de tu equipo." flush>
            <RowList>
              {pendingReports.length ? (
                <Row href={sectionHref(spaceId, "moderacion")}>
                  <Flag className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{pendingReports.length} contenidos reportados en tu campus</span>
                    <span className="block truncate text-xs text-text-muted">
                      Arriba del todo: {pendingReports[0].reason.toLowerCase()} ({pendingReports[0].reports} reportes)
                    </span>
                  </span>
                  <Pill tone="danger">Revisar</Pill>
                </Row>
              ) : null}
              {copies.length ? (
                <Row href={sectionHref(spaceId, "alojamiento")}>
                  <Copy className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {copies.length === 1 ? "1 anuncio se parece al de otro propietario" : `${copies.length} anuncios se parecen a los de otros propietarios`}
                    </span>
                    <span className="block truncate text-xs text-text-muted">{copies.map((h) => `${h.owner}, ${h.title}`).join(" · ")}</span>
                  </span>
                  <Pill tone="danger">Posible copia</Pill>
                </Row>
              ) : null}
              {overdueCases.length ? (
                <Row href={sectionHref(spaceId, "alojamiento")}>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {overdueCases.length === 1 ? "1 propietario no ha respondido a tiempo" : `${overdueCases.length} propietarios no han respondido a tiempo`}
                    </span>
                    <span className="block truncate text-xs text-text-muted">{overdueCases.map((h) => `${h.owner}, ${h.title}`).join(" · ")}</span>
                  </span>
                  <Pill tone="danger">Plazo vencido</Pill>
                </Row>
              ) : null}
              {pendingHousing.length ? (
                <Row href={sectionHref(spaceId, "alojamiento")}>
                  <Home className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{pendingHousing.length} pisos esperan verificación</span>
                    <span className="block truncate text-xs text-text-muted">Hasta que los verifiques no los ve nadie que llegue al campus</span>
                  </span>
                  <Pill tone="warning">{pendingHousing.length}</Pill>
                </Row>
              ) : null}
              {unprepared.map((d) => (
                <Row key={d.id} href={publish(`&plazo=${d.id}`)}>
                  <CalendarClock className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{d.title}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {relative(`${d.date}T10:00:00Z`, now.getTime())} y aún no hay aviso preparado
                    </span>
                  </span>
                  <Pill tone="info">Preparar aviso</Pill>
                </Row>
              ))}
              {withEcts.length ? (
                <Row href={sectionHref(spaceId, "asociaciones")}>
                  <Stamp className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{ectsTotal} solicitudes de créditos de {withEcts.length} asociaciones</span>
                    <span className="block truncate text-xs text-text-muted">
                      {eligibleCredits ? `${eligibleCredits} cumplen la asistencia y se validan de una vez` : "Con asistencia verificada por check-in"}
                    </span>
                  </span>
                  <Pill tone="info">Validar</Pill>
                </Row>
              ) : null}
              {mentorWaiting.length ? (
                <Row href={sectionHref(spaceId, "mentores")}>
                  <Sprout className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {mentorWaiting.length === 1 ? "1 persona de primero espera mentor" : `${mentorWaiting.length} personas de primero esperan mentor`}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {[...new Set(mentorWaiting.map((r) => r.faculty))].join(", ")}
                    </span>
                  </span>
                  <Pill tone="info">Emparejar</Pill>
                </Row>
              ) : null}
              {unanswered.length ? (
                <Row href={sectionHref(spaceId, "preguntas")}>
                  <MessageCircleQuestion className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {unanswered.length === 1
                        ? "1 tema de la cita previa sin respuesta escrita"
                        : `${unanswered.length} temas de la cita previa sin respuesta escrita`}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      El que más se repite: {unanswered[0].topic.toLowerCase()} ({unanswered[0].count} citas)
                    </span>
                  </span>
                  <Pill tone="neutral">Responder</Pill>
                </Row>
              ) : null}
              {renewalDue.length ? (
                <Row href={sectionHref(spaceId, "asociaciones")}>
                  <RefreshCcw className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {renewalDue.length === 1 ? "1 asociación sin renovar este curso" : `${renewalDue.length} asociaciones sin renovar este curso`}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {renewals.done} de {renewals.total} ya han confirmado junta y socios
                    </span>
                  </span>
                  <Pill tone="neutral">Renovación</Pill>
                </Row>
              ) : null}
              {registrations.length ? (
                <Row href={sectionHref(spaceId, "asociaciones")}>
                  <Building2 className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{registrations.length} asociaciones piden entrar en el registro</span>
                    <span className="block truncate text-xs text-text-muted">{registrations.map((r) => r.name).join(", ")}</span>
                  </span>
                  <Pill tone="violet">Nuevas</Pill>
                </Row>
              ) : null}
              {nothingPending ? <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Todo revisado. Buen momento para preparar la próxima publicación.</p> : null}
            </RowList>
          </Panel>

          {extras.faculties.length ? (
            <Panel
              title="Alerta temprana de primero"
              description={`Facultades donde el ${FIRST_YEAR_ALERT_SHARE} % o más de primero no ha ido a ninguna actividad. Corte de revisión: ${dayLabel(`${octoberCheckpoint(extras.courseStart || localDate(now))}T12:00:00Z`, { weekday: false })}.`}
              flush
            >
              {alerts.length ? (
                <RowList>
                  {alerts.map((f) => (
                    <Row key={f.faculty} href={publish(`&publico=welcome_absent&facultad=${encodeURIComponent(f.faculty)}`)}>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.9} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {f.faculty}: {f.inactivePct} % sin actividad
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {f.inactive.toLocaleString("es-ES")} de {f.firstYear.toLocaleString("es-ES")} estudiantes de primero. Escríbeles antes de que se desenganchen.
                        </span>
                      </span>
                      <Pill tone="warning">Escribirles</Pill>
                    </Row>
                  ))}
                </RowList>
              ) : (
                <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Ninguna facultad por encima del umbral. Buen trabajo con la bienvenida.</p>
              )}
            </Panel>
          ) : null}

          <Panel title="El campus este mes" description="Cifras agregadas y comparadas con el mes anterior.">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
              {data.uniMetrics.map((m) => (
                <div key={m.key} className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-muted">{m.label}</p>
                  <p className="mt-1 font-heading text-2xl font-extrabold tracking-[-0.02em] tabular">{metricValue(m)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                    <Delta m={m} />
                    {m.hint ? <span className="truncate text-xs text-text-muted">{m.hint}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {extras.faculties.length ? (
            <Panel title="Embudo de integración de primero" description="Por facultad: bienvenida, asociación y activos a 30 días." flush>
              <div className="overflow-x-auto pro-scroll">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-border-light text-left text-xs text-text-muted">
                      <th className="px-4 py-2.5 font-medium sm:px-5">Facultad</th>
                      <th className="px-3 py-2.5 text-right font-medium">Primero</th>
                      <th className="px-3 py-2.5 font-medium">Bienvenida</th>
                      <th className="px-3 py-2.5 font-medium">Asociación</th>
                      <th className="px-4 py-2.5 font-medium sm:px-5">Activos 30 días</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {extras.faculties.map((f) => {
                      const hidden = f.firstYear < PRIVACY_MIN_GROUP;
                      const steps = [f.participated, f.joinedAssociation, f.active30];
                      return (
                        <tr key={f.faculty} className="hover:bg-bg-secondary">
                          <td className="px-4 py-2.5 font-medium sm:px-5">{f.faculty}</td>
                          {hidden ? (
                            <td colSpan={4} className="px-3 py-2.5 sm:pr-5">
                              <HiddenGroup />
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2.5 text-right tabular">{f.firstYear.toLocaleString("es-ES")}</td>
                              {steps.map((v, i) => {
                                const p = pct(v, f.firstYear);
                                return (
                                  <td key={i} className={cn("py-2.5", i === 2 ? "px-4 sm:px-5" : "px-3")}>
                                    <div className="flex items-center gap-2">
                                      <Meter value={v} max={f.firstYear} tone={i === 0 && p < 100 - FIRST_YEAR_ALERT_SHARE ? "warning" : "violet"} className="w-16" />
                                      <span className="w-10 text-right font-semibold tabular">{p} %</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {deadlines.length ? (
            <Panel
              title="Próximos plazos"
              action={
                <Link href={sectionHref(spaceId, "calendario")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                  Calendario <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
              flush
            >
              <RowList>
                {deadlines.slice(0, 4).map((d) => {
                  const pub = publicationForDeadline(pubs, d.id);
                  return (
                    <Row key={d.id} href={pub ? `${sectionHref(spaceId, "publicaciones")}?ver=${pub.id}` : publish(`&plazo=${d.id}`)}>
                      <span className="w-12 shrink-0 text-center">
                        <span className="block font-heading text-lg font-bold leading-none tabular">{Number(d.date.slice(8, 10))}</span>
                        <span className="block text-[0.68rem] uppercase text-text-muted">
                          {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{d.title}</span>
                      {pub ? <Pill tone="success">Aviso listo</Pill> : <Pill tone="info">Preparar</Pill>}
                    </Row>
                  );
                })}
              </RowList>
            </Panel>
          ) : null}

          {office.slots.length && officeToday.capacity ? (
            <Panel
              title="Atención hoy"
              action={
                <Link href={sectionHref(spaceId, "atencion")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                  Agenda <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{officeToday.booked}</p>
              <p className="text-sm text-text-muted">
                citas pendientes y {officeToday.free} huecos libres
                {officeToday.next ? `. La siguiente, a las ${minutesToLabel(officeToday.next.start)}` : ""}
              </p>
            </Panel>
          ) : null}

          {top ? (
            <Panel
              title="Tu publicación con más alcance"
              action={
                <Link href={sectionHref(spaceId, "publicaciones")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                  Todas <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <Pill tone="violet">
                <BadgeCheck className="h-3 w-3" /> Oficial
              </Pill>
              <p className="mt-2 font-heading text-base font-bold leading-snug">{top.title}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {top.audience} · {relative(top.at, now.getTime())}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="font-heading text-2xl font-bold tabular">{top.reach.toLocaleString("es-ES")}</p>
                  <p className="text-xs text-text-muted">estudiantes la vieron</p>
                </div>
                <div>
                  <p className="font-heading text-2xl font-bold tabular">{top.reactions.toLocaleString("es-ES")}</p>
                  <p className="text-xs text-text-muted">reacciones</p>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel
            title="Bienvenida en curso"
            action={
              <Link href={sectionHref(spaceId, "bienvenida")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                Pasaporte <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{checkins.toLocaleString("es-ES")}</p>
            <p className="text-sm text-text-muted">
              check-ins en {stops.length} paradas{extras.passport.completed ? `, ${extras.passport.completed.toLocaleString("es-ES")} pasaportes completos` : ""}
            </p>
            {welcome ? (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-text-muted">
                  <span>Primero que ha participado</span>
                  <span className="tabular">{welcome.value} %</span>
                </div>
                <Meter value={welcome.value} max={100} />
              </div>
            ) : null}
            {nextStop ? (
              <p className="mt-4 rounded-xl bg-bg-secondary px-3 py-2.5 text-sm">
                <span className="font-semibold">Siguiente:</span> {nextStop.title}, {relative(nextStop.date, now.getTime())}
              </p>
            ) : null}
          </Panel>

          <section className="rounded-2xl bg-bg-dark p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">El canal que sí se lee</p>
            <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
              {published.reduce((a, p) => a + p.reach, 0).toLocaleString("es-ES")}
            </p>
            <p className="text-sm text-white/70">visualizaciones reales de tus {published.length} publicaciones oficiales</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
              <div>
                <p className="font-heading text-xl font-bold tabular">{housing.filter((h) => h.status === "verified").length}</p>
                <p className="text-xs text-white/60">pisos verificados para quien llega</p>
              </div>
              <div>
                <p className="font-heading text-xl font-bold tabular">{associations.filter((a) => a.registered).length}</p>
                <p className="text-xs text-white/60">asociaciones registradas con actividad</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/60">Medimos quién lo vio de verdad, no cuántos correos salieron.</p>
          </section>

          <Panel title="Informe de temporada" description="Alcance, bienvenida, pisos, créditos y convivencia en un documento.">
            <Button asChild variant="outline" className="w-full">
              <Link href={sectionHref(spaceId, "memoria")}>
                <ClipboardList className="h-4 w-4" /> Ver el informe
              </Link>
            </Button>
          </Panel>

          <Tip title="Privacidad">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-600" strokeWidth={1.9} />
            Todas las cifras son agregadas. Cualquier grupo de menos de {PRIVACY_MIN_GROUP} personas se oculta y nunca verás el recorrido de un estudiante concreto.
          </Tip>

          <Panel title="Publicar ahora" description="Un aviso oficial llega hoy mismo al campus.">
            <Button asChild variant="outline" className="w-full">
              <Link href={publish()}>
                <Megaphone className="h-4 w-4" /> Escribir publicación
              </Link>
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
