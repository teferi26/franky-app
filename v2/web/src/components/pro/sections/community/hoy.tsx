"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Boxes,
  Bus,
  CalendarDays,
  FileCheck2,
  GraduationCap,
  Handshake,
  HandCoins,
  KeyRound,
  Landmark,
  ListChecks,
  Megaphone,
  MapPin,
  MessageSquareText,
  Plus,
  QrCode,
  Shirt,
  UserPlus,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { dayLabel, greeting, localDate, money, pct, relative, time, addDays, capitalize } from "@/lib/pro/format";
import {
  communityCash,
  daysBetween,
  windowLabel,
  MEMBER_FEE_CENTS,
  type CommunityActivity,
  type CommunityMember,
} from "@/lib/pro/demo/community";
import { communityLedger } from "@/lib/pro/community";
import { communityTodayItems, type CommunityTodayKind } from "@/lib/pro/community-today";
import { Empty, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Row, RowList, Tip } from "../../kit";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { CohortPanel } from "./cohort";

const TODAY_ICON: Record<CommunityTodayKind, LucideIcon> = {
  task: ListChecks,
  reimburse: HandCoins,
  registry: Landmark,
  assembly: Vote,
  prep: CalendarDays,
  volunteers: UserPlus,
  handover: KeyRound,
  feedback: MessageSquareText,
  trip: Bus,
  loans: Boxes,
  merch: Shirt,
};

export default function CommunityHoy() {
  const { data, now, spaceId, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const members = data.communityMembers as CommunityMember[];
  const activities = data.activities as CommunityActivity[];
  const cash = communityCash(data);

  const upcoming = activities
    .filter((a) => a.status === "published" && a.date >= now.toISOString())
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const newThisMonth = members.filter((m) => localDate(m.joinedAt) >= addDays(today, -30));
  const proposed = data.sponsors.filter((s) => s.status === "proposed");
  const subsidy = data.subsidies.find((s) => s.status === "preparing");
  const subsidyMissing = subsidy ? subsidy.checklist.filter((c) => !c.done) : [];
  const subsidyDays = subsidy ? daysBetween(today, subsidy.window) : 0;
  const lastAnnouncement = [...data.announcements].sort((a, b) => b.at.localeCompare(a.at))[0];
  const attention = communityTodayItems(data, now);
  const ledger = communityLedger(data, now);
  const [reminded, setReminded] = React.useState(false);

  const remind = () => {
    setReminded(true);
    update("community.remindFees", (d) => ({
      ...d,
      announcements: [
        {
          id: `an-${Date.now()}`,
          title: "Recordatorio: cuota del curso",
          body: `Te queda por pagar la cuota de ${money(MEMBER_FEE_CENTS)}. Pagarla desde Franky es un momento.`,
          at: new Date().toISOString(),
          audience: "socios",
          reads: 0,
        },
        ...d.announcements,
      ],
    }));
    toast.success("Recordatorio enviado", `${cash.pending} socios reciben el enlace de pago en Franky.`);
  };

  const summary = next
    ? `${data.space.name} tiene ${members.length} socios. ${capitalize(relative(next.date, now.getTime()))}, ${next.title.replace("Cinefórum: ", "cinefórum de ")} con ${next.registered} inscritos${cash.pending ? ` y ${cash.pending} cuotas por cobrar` : ""}.`
    : `${data.space.name} tiene ${members.length} socios y ninguna actividad publicada. Publica la próxima y llegará a toda la universidad.`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={
          <Button asChild variant="dark">
            <Link href={`${sectionHref(spaceId, "actividades")}?nueva=1`}>
              <Plus className="h-4 w-4" /> Nueva actividad
            </Link>
          </Button>
        }
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi icon={Users} label="Socios" value={members.length} hint={`+${newThisMonth.length} en los últimos 30 días`} />
        <Kpi icon={Wallet} label="Cuotas por cobrar" value={cash.pending} hint={`${money(cash.pendingCents, { round: true })} pendientes`} emphasis={cash.pending > 0} />
        <Kpi icon={CalendarDays} label="Próximas actividades" value={upcoming.length} hint={next ? `La siguiente ${relative(next.date, now.getTime())}` : "Ninguna publicada"} />
        <Kpi icon={Handshake} label="Cobrado este curso" value={money(cash.totalCents, { round: true })} hint="Entradas, cuotas y patrocinios" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {next ? <NextActivity activity={next} /> : (
            <Panel>
              <Empty
                icon={CalendarDays}
                title="No hay ninguna actividad a la vista"
                body="Publica la próxima: la ven los estudiantes de toda la universidad, no solo quien ya te sigue."
                action={
                  <Button asChild variant="dark">
                    <Link href={`${sectionHref(spaceId, "actividades")}?nueva=1`}>Nueva actividad</Link>
                  </Button>
                }
              />
            </Panel>
          )}

          <Panel title="Para hoy" description="Lo que conviene resolver antes de que se te olvide." flush>
            <RowList>
              {cash.pending ? (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Wallet className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{cash.pending} socios no han pagado la cuota</span>
                    <span className="block text-xs text-text-muted">
                      {money(cash.pendingCents, { round: true })} sin perseguir transferencias ni Excel. Les llega el enlace de pago.
                    </span>
                  </span>
                  <Button size="sm" variant={reminded ? "ghost" : "secondary"} onClick={remind} disabled={reminded}>
                    <BellRing className="h-3.5 w-3.5" /> {reminded ? "Enviado" : "Recordar cuota"}
                  </Button>
                </div>
              ) : null}
              {subsidy && subsidyMissing.length ? (
                <Row href={sectionHref(spaceId, "subvenciones")}>
                  <FileCheck2 className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      Te faltan {subsidyMissing.length} requisitos para la subvención
                    </span>
                    <span className="block truncate text-xs text-text-muted">{subsidyMissing.map((m) => m.label).join(", ")}</span>
                  </span>
                  <Pill tone={subsidyDays <= 14 ? "warning" : "neutral"}>{subsidyDays} días</Pill>
                </Row>
              ) : null}
              {proposed.map((s) => (
                <Row key={s.id} href={sectionHref(spaceId, "patrocinios")}>
                  <Handshake className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.business} tiene tu propuesta</span>
                    <span className="block truncate text-xs text-text-muted">
                      {s.packageName}, {money(s.amountCents, { round: true })}
                    </span>
                  </span>
                  <Pill tone="violet">Propuesta</Pill>
                </Row>
              ))}
              {attention.map((item) => {
                const Icon = TODAY_ICON[item.kind];
                const href = sectionHref(spaceId, item.section);
                return (
                  <Row key={item.id} href={item.query ? `${href}?${item.query}` : href}>
                    <Icon className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.title}</span>
                      <span className="block truncate text-xs text-text-muted">{item.detail}</span>
                    </span>
                    {item.badge ? <Pill tone={item.urgent ? "warning" : "neutral"}>{item.badge}</Pill> : null}
                  </Row>
                );
              })}
              {!cash.pending && !subsidyMissing.length && !proposed.length && !attention.length ? (
                <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Todo al día. Buen momento para preparar la próxima actividad.</p>
              ) : null}
            </RowList>
          </Panel>

          <Tip title="Asistencia que vale">
            El check-in con QR y cuenta universitaria deja la asistencia verificada: sirve para los créditos de tus socios y para justificar la subvención sin hojas de firmas.
          </Tip>

          {upcoming.length > 1 ? (
            <Panel
              title="Lo que viene"
              action={
                <Link href={sectionHref(spaceId, "actividades")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                  Actividades <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
              flush
            >
              <RowList>
                {upcoming.slice(1, 5).map((a) => (
                  <Row key={a.id} href={`${sectionHref(spaceId, "actividades")}?a=${a.id}`}>
                    <DateBadge iso={a.date} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.title}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {a.registered} de {a.capacity} plazas · {a.priceCents ? money(a.priceCents) : "Gratis"}
                        {a.ectsHours ? ` · ${a.ectsHours} h para créditos` : ""}
                      </span>
                    </span>
                    <span className="hidden w-24 sm:block">
                      <Meter value={a.registered} max={a.capacity} />
                    </span>
                  </Row>
                ))}
              </RowList>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {subsidy ? (
            <Panel title="Próxima ventana de subvención" description="Convocatoria del Consejo de Estudiantes.">
              <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{subsidyDays} días</p>
              <p className="text-sm text-text-muted">hasta el {windowLabel(subsidy.window)}, pides {money(subsidy.requestedCents, { round: true })}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
                <span>Requisitos listos</span>
                <span className="tabular">
                  {subsidy.checklist.length - subsidyMissing.length} de {subsidy.checklist.length}
                </span>
              </div>
              <Meter value={subsidy.checklist.length - subsidyMissing.length} max={subsidy.checklist.length} className="mt-1.5" tone={subsidyMissing.length ? "violet" : "success"} />
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link href={sectionHref(spaceId, "subvenciones")}>Preparar la solicitud</Link>
              </Button>
            </Panel>
          ) : null}

          <Panel
            title="Caja del curso"
            description="Lo cobrado con Franky y lo apuntado a mano."
            action={
              <Link href={sectionHref(spaceId, "caja")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                Caja <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">
              {money(ledger.balanceCents, { round: true })}
            </p>
            <p className="text-sm text-text-muted">de saldo ahora mismo</p>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
              <CashLine label="Entradas de actividades" value={cash.ticketsCents} />
              <CashLine label={`Cuotas (${cash.paid} pagadas)`} value={cash.feesCents} />
              <CashLine label="Patrocinios activos" value={cash.sponsorsCents} />
              <CashLine label="Gastos del curso" value={-ledger.expenseCents} />
            </ul>
            {ledger.pendingReimburseCents ? (
              <p className="mt-3 border-t border-border-light pt-3 text-xs text-text-muted">
                Pendiente de devolver a quien adelantó: {money(ledger.pendingReimburseCents)}.
              </p>
            ) : null}
          </Panel>

          <CohortPanel />

          {lastAnnouncement ? (
            <Panel
              title="Último aviso"
              action={
                <Link href={sectionHref(spaceId, "avisos")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                  Avisos <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
                <span className="min-w-0 truncate">{lastAnnouncement.title}</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">{relative(lastAnnouncement.at, now.getTime())}</p>
              <p className="mt-3 font-heading text-2xl font-bold tabular">{lastAnnouncement.reads.toLocaleString("es-ES")}</p>
              <p className="text-xs text-text-muted">
                {lastAnnouncement.audience === "junta" ? "lecturas de la junta" : lastAnnouncement.audience === "socios" ? "socios lo han leído" : "estudiantes lo han leído"}
              </p>
            </Panel>
          ) : null}

          <FrankyCard />
        </div>
      </div>
    </div>
  );
}

function NextActivity({ activity: a }: { activity: CommunityActivity }) {
  const { data, now, spaceId } = usePro();
  const sponsor = data.sponsors.find((s) => s.id === a.sponsorId);
  const free = a.capacity - a.registered;
  const isToday = localDate(a.date) === localDate(now);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-stretch sm:p-6">
        <div className="flex shrink-0 flex-row items-center gap-3 sm:w-28 sm:flex-col sm:items-start sm:justify-between sm:border-r sm:border-border-light sm:pr-5">
          <div>
            <p className="eyebrow">{isToday ? "Hoy" : "Próxima"}</p>
            <p className="mt-1 font-heading text-4xl font-extrabold leading-none tracking-[-0.03em] tabular">
              {new Date(a.date).toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" })}
            </p>
            <p className="text-sm font-semibold text-text-muted">
              {capitalize(new Date(a.date).toLocaleDateString("es-ES", { weekday: "short", timeZone: "Europe/Madrid" }))},{" "}
              {new Date(a.date).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" })}
            </p>
          </div>
          <p className="ml-auto text-sm font-semibold tabular sm:ml-0">{time(a.date)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={a.priceCents ? "neutral" : "success"}>{a.priceCents ? money(a.priceCents) : "Gratis"}</Pill>
            {a.ectsHours ? (
              <Pill tone="info">
                <GraduationCap className="h-3 w-3" /> {a.ectsHours} h para créditos
              </Pill>
            ) : null}
            {sponsor ? <Pill tone="violet">Con {sponsor.business}</Pill> : null}
          </div>
          <h2 className="mt-2 font-heading text-xl font-bold tracking-[-0.01em] sm:text-2xl">{a.title}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{a.place}</span>
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Figure label="Inscritos" value={a.registered} />
            <Figure label="Plazas libres" value={Math.max(0, free)} />
            <Figure label="Ya la han visto" value={(a.reachOutside ?? 0).toLocaleString("es-ES")} />
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-text-muted">
              <span>Ocupación</span>
              <span className="tabular">{pct(a.registered, a.capacity)} %</span>
            </div>
            <Meter value={a.registered} max={a.capacity} tone={free <= 3 ? "warning" : "violet"} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="dark" size="sm">
              <Link href={`${sectionHref(spaceId, "actividades")}?a=${a.id}`}>
                <QrCode className="h-3.5 w-3.5" /> Abrir check-in
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={sectionHref(spaceId, "avisos")}>
                <Megaphone className="h-3.5 w-3.5" /> Avisar a los socios
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-heading text-xl font-bold tabular">{value}</p>
      <p className="truncate text-xs text-text-muted">{label}</p>
    </div>
  );
}

function DateBadge({ iso }: { iso: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-border">
      <span className="font-heading text-base font-bold leading-none tabular">
        {new Date(iso).toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" })}
      </span>
      <span className="text-[0.62rem] font-semibold uppercase text-text-muted">
        {new Date(iso).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" }).replace(".", "")}
      </span>
    </span>
  );
}

function CashLine({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium tabular">{money(value, { round: true })}</span>
    </li>
  );
}

/** Lo que Franky le da a la asociación: alcance, socios nuevos y comisiones que no pagas. */
function FrankyCard() {
  const { data, now } = usePro();
  const today = localDate(now);
  const members = data.communityMembers as CommunityMember[];
  const activities = data.activities as CommunityActivity[];
  const cash = communityCash(data);
  const reach = activities.filter((a) => a.status !== "draft").reduce((acc, a) => acc + (a.reachOutside ?? 0), 0);
  const newViaFranky = members.filter((m) => m.viaFranky && localDate(m.joinedAt) >= addDays(today, -30)).length;
  const verified = members.filter((m) => m.verified !== false).length;
  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Lo que Franky te da</p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{reach.toLocaleString("es-ES")}</p>
      <p className="text-sm text-white/70">estudiantes que no te seguían vieron tus actividades este curso</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">{newViaFranky}</p>
          <p className="text-xs text-white/60">socios nuevos llegados por Franky en 30 días</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">{money(cash.savedCents, { round: true })}</p>
          <p className="text-xs text-white/60">menos en comisiones que con el 6 % de Eventbrite</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-white/60">
        <BadgeCheck className="h-3.5 w-3.5 text-violet-light" /> {verified} de tus socios tienen la cuenta universitaria verificada.
      </p>
      <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
        Y las cuotas de socio, que Eventbrite ni siquiera cobra, entran por el mismo sitio y sin Excel.
      </p>
    </section>
  );
}
