"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarClock,
  CalendarCheck2,
  Inbox,
  KeyRound,
  MapPin,
  MessageCircle,
  Plus,
  Sparkles,
  Users,
  Video,
  Wallet,
  Wrench,
} from "lucide-react";
import { housingDeadlines, patchTenant, rentReminderText, tomorrowVisits, whatsappHref, type HousingDeadline } from "@/lib/pro/housing-ops";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { dayLabel, greeting, localDate, money, pct, plural, relative, time } from "@/lib/pro/format";
import {
  GVA_URL,
  PORTAL_FEE,
  currentTenants,
  findRoom,
  freeBy,
  housingResults,
  intakes,
  occupancy,
  rentSummary,
  roomieSuggestions,
  shortDate,
  uniShort,
  waitingLabel,
  waitingMinutes,
  waitingTone,
  VISIT_STATUS,
} from "@/lib/pro/housing";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Row, RowList, Tip, FixedPortal } from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "../common/checklist";
import { IncidentDrawer, LeadDrawer, NewPropertyDrawer, PriorityDot, TenantDrawer, VisitDrawer } from "./drawers";
import { RoomieBadge, UniBadge } from "./shared";
import { HousingSearchBox } from "./search";

export default function HousingHoy() {
  const { data, now, spaceId, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [visitId, setVisitId] = React.useState<string | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [tenantLeaving, setTenantLeaving] = React.useState(false);
  const [incidentId, setIncidentId] = React.useState<string | null>(null);
  const [newProperty, setNewProperty] = React.useState(false);

  const occ = occupancy(data);
  const win = intakes(now);
  const freeSoon = freeBy(data, win.soon.by);
  const freeFeb = freeBy(data, win.feb.by);
  const rent = rentSummary(data, now);
  const newLeads = data.leads
    .filter((l) => l.stage === "new")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const unanswered = newLeads.filter((l) => waitingMinutes(l, now) >= 60);
  const visitsToday = data.visits
    .filter((v) => localDate(v.start) === today && v.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  const nextVisit = visitsToday.find((v) => v.status === "scheduled");
  const deposits = data.tenants
    .filter((t) => t.deposit.status === "pending")
    .sort((a, b) => a.deposit.dueAt.localeCompare(b.deposit.dueAt));
  const openIncidents = data.incidents.filter((i) => i.status !== "resolved");
  const urgentIncidents = openIncidents.filter((i) => i.priority === "urgent");
  const leaving = currentTenants(data, now)
    .filter((t) => t.leavingAt)
    .sort((a, b) => (a.leavingAt ?? "").localeCompare(b.leavingAt ?? ""));
  const lateTenants = rent.tenants.filter((t) => t.rentStatus === "late");
  const monthName = new Date(now).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });

  const summary = [
    newLeads.length ? plural(newLeads.length, "interesado nuevo", "interesados nuevos") : null,
    visitsToday.length ? plural(visitsToday.length, "visita hoy", "visitas hoy") : null,
    freeSoon.length ? `${plural(freeSoon.length, "habitación libre", "habitaciones libres")} para ${win.soon.label}` : null,
  ].filter(Boolean);

  const remind = (id: string, name: string) => {
    update("tenant.remind", (d) => patchTenant(d, id, (t) => ({ ...t, remindedAt: new Date().toISOString() })));
    toast.success("Recordatorio listo en WhatsApp", `Con el importe que debe ${name.split(" ")[0]}. Solo tienes que enviarlo.`);
  };
  const tomorrow = tomorrowVisits(data, now);
  const deadlines = housingDeadlines(data, now, 45);
  // El que se va antes y ya tiene sustitutos: lo primero que hay que mirar.
  const firstLeaving = leaving.map((t) => ({ t, sug: roomieSuggestions(data, t, now, 3) })).find((x) => x.sug.length);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary.length ? `Hoy tienes ${summary.join(", ").replace(/, ([^,]*)$/, " y $1")}.` : "Todo al día. Buen momento para revisar precios."}
        actions={
          <Button variant="dark" onClick={() => setNewProperty(true)}>
            <Plus className="h-4 w-4" /> Añadir piso
          </Button>
        }
      />

      {data.properties.length || data.leads.length ? <HousingSearchBox className="md:max-w-md" /> : null}

      <SetupChecklist />

      {firstLeaving || tomorrow.list.length ? (
        <div className="grid gap-2.5 md:grid-cols-2">
          {firstLeaving ? (
            <button
              type="button"
              onClick={() => {
                setTenantLeaving(true);
                setTenantId(firstLeaving.t.id);
              }}
              className="flex items-center gap-3 rounded-2xl border border-violet/25 bg-violet-50 px-4 py-3 text-left transition-colors hover:border-violet/50"
            >
              <Users className="h-5 w-5 shrink-0 text-violet" strokeWidth={1.9} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-violet-deep">
                  {firstLeaving.t.name.split(" ")[0]} se va el {shortDate(firstLeaving.t.leavingAt ?? firstLeaving.t.contractEnd)}
                </span>
                <span className="block text-xs text-text-secondary">
                  Roomie tiene {firstLeaving.sug.length === 1 ? "1 sustituto compatible" : `${firstLeaving.sug.length} sustitutos compatibles`} con los que se quedan.
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-violet" />
            </button>
          ) : null}
          {tomorrow.list.length ? (
            <Link
              href={sectionHref(spaceId, "visitas")}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors",
                tomorrow.unconfirmed.length ? "border-amber-500/40 bg-amber-50 hover:border-amber-500/70 dark:bg-amber-950/30" : "border-border bg-bg-primary hover:border-text-primary/20",
              )}
            >
              <CalendarCheck2 className={cn("h-5 w-5 shrink-0", tomorrow.unconfirmed.length ? "text-amber-700 dark:text-amber-300" : "text-text-muted")} strokeWidth={1.9} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  Mañana: {plural(tomorrow.list.length, "visita", "visitas")}
                  {tomorrow.unconfirmed.length ? `, ${tomorrow.unconfirmed.length} sin confirmar` : ", todas confirmadas"}
                </span>
                <span className="block text-xs text-text-secondary">
                  {tomorrow.unconfirmed.length ? "Pide confirmación por WhatsApp y evita plantones." : "Nadie debería fallarte."}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <KpiRow>
        <Kpi
          icon={BedDouble}
          label="Ocupación"
          value={`${pct(occ.occupied, occ.total)} %`}
          hint={
            <span className="flex flex-col gap-1.5">
              <span>
                {occ.occupied} de {occ.total} habitaciones{occ.reserved ? `, ${occ.reserved} reservadas` : ""}
              </span>
              <Meter value={occ.occupied + occ.reserved} max={occ.total} tone={pct(occ.occupied, occ.total) >= 90 ? "success" : "violet"} />
            </span>
          }
        />
        <Kpi
          icon={KeyRound}
          label={`Libres para ${win.soon.label}`}
          value={freeSoon.length}
          hint={`${freeFeb.length} para febrero`}
          emphasis={freeSoon.length > 0}
        />
        <Kpi icon={Wallet} label={`Cobrado en ${monthName}`} value={money(rent.paidCents, { round: true })} hint={`${money(rent.pendingCents + rent.lateCents, { round: true })} por cobrar`} />
        <Kpi icon={Inbox} label="Interesados nuevos" value={newLeads.length} hint={unanswered.length ? `${unanswered.length} esperan más de 1 h` : "Todos al día"} />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Esperan tu respuesta"
            description="Estudiantes verificados que han escrito. Contestar el mismo día duplica las visitas."
            action={
              <Link href={sectionHref(spaceId, "interesados")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                Interesados <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {newLeads.length ? (
              <RowList>
                {newLeads.slice(0, 5).map((l) => {
                  const wait = waitingMinutes(l, now);
                  const tone = waitingTone(wait);
                  const { property } = findRoom(data, l.propertyId, l.roomId);
                  return (
                    <Row key={l.id} onClick={() => setLeadId(l.id)}>
                      <Avatar name={l.name} size="sm" tone={l.roomieGroup ? "violet" : "slate"} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm font-semibold">{l.name}</span>
                          <UniBadge university={l.university} verified={l.verified} />
                          {l.roomieGroup ? <RoomieBadge group={l.roomieGroup} /> : null}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          Entrada {shortDate(l.moveIn)} · {l.months} meses · hasta {money(l.budgetCents)}
                          {property ? ` · ${property.title}` : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-right text-xs font-semibold tabular",
                          tone === "danger" ? "text-rose-700 dark:text-rose-300" : tone === "warning" ? "text-amber-800 dark:text-amber-300" : "text-text-muted",
                        )}
                      >
                        {waitingLabel(wait)}
                        <span className="block font-normal text-text-muted">esperando</span>
                      </span>
                    </Row>
                  );
                })}
              </RowList>
            ) : (
              <Empty icon={Inbox} title="Nadie esperando" body="Has contestado a todos. Los nuevos interesados aparecen aquí en cuanto escriben." />
            )}
          </Panel>

          <Panel
            title="Visitas de hoy"
            description={nextVisit ? `La próxima, a las ${time(nextVisit.start)}.` : visitsToday.length ? "Ya no quedan más por hoy." : undefined}
            action={
              <Link href={sectionHref(spaceId, "visitas")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                Agenda <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {visitsToday.length ? (
              <RowList>
                {visitsToday.map((v) => {
                  const lead = data.leads.find((l) => l.id === v.leadId);
                  const property = data.properties.find((p) => p.id === v.propertyId);
                  const agent = data.staff.find((s) => s.id === v.agentId);
                  const past = v.status !== "scheduled";
                  return (
                    <Row key={v.id} onClick={() => setVisitId(v.id)} className={cn(past && "opacity-70")}>
                      <span className="w-12 shrink-0 font-heading text-sm font-bold tabular">{time(v.start)}</span>
                      <span className={cn("h-9 w-1 shrink-0 rounded-full", TONES[agent?.tone ?? "slate"].bar)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{lead?.name ?? "Interesado"}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-text-muted">
                          {v.mode === "video" ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                          <span className="truncate">
                            {property?.title}
                            {agent && data.staff.length > 1 ? ` · ${agent.name.split(" ")[0]}` : ""}
                          </span>
                        </span>
                      </span>
                      <Pill tone={VISIT_STATUS[v.status].tone}>{VISIT_STATUS[v.status].label}</Pill>
                    </Row>
                  );
                })}
              </RowList>
            ) : (
              <Empty icon={KeyRound} title="Hoy no hay visitas" body="Propón visitas a tus interesados desde su ficha. Eligen hora dentro de tus franjas." />
            )}
          </Panel>

          <Panel
            title="Se van y Roomie ya tiene sustitutos"
            description="Inquilinos que dejan la habitación y estudiantes compatibles con los que se quedan."
            flush
          >
            {leaving.length ? (
              <RowList>
                {leaving.map((t) => {
                  const { property, room } = findRoom(data, t.propertyId, t.roomId);
                  const sug = roomieSuggestions(data, t, now, 2);
                  return (
                    <div key={t.id} className="flex flex-col gap-2.5 px-4 py-3.5 sm:px-5">
                      <button type="button" onClick={() => { setTenantLeaving(false); setTenantId(t.id); }} className="flex items-center gap-3 text-left">
                        <Avatar name={t.name} size="sm" tone="amber" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{t.name}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {property?.title}, {room?.name.toLowerCase()} · libre el {shortDate(t.leavingAt ?? t.contractEnd)}
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular">{money(t.rentCents)}</span>
                      </button>
                      {sug.length ? (
                        <div className="ml-11 flex flex-wrap items-center gap-1.5">
                          {sug.map((s) => (
                            <span key={s.lead.id} className="inline-flex items-center gap-1.5 rounded-full border border-violet/25 bg-violet-50 px-2 py-1 text-xs text-violet-deep">
                              <Users className="h-3 w-3" strokeWidth={1.9} />
                              {s.lead.name.split(" ")[0]} ({uniShort(s.lead.university)}), {s.score} %
                            </span>
                          ))}
                          <Button size="sm" variant="ghost" onClick={() => { setTenantLeaving(true); setTenantId(t.id); }}>
                            Proponer
                          </Button>
                        </div>
                      ) : (
                        <p className="ml-11 text-xs text-text-muted">Roomie te avisa en cuanto entre un interesado compatible.</p>
                      )}
                    </div>
                  );
                })}
              </RowList>
            ) : (
              <Empty icon={Users} title="Nadie se va por ahora" body="Cuando registres una salida, Roomie te propone sustitutos compatibles." />
            )}
          </Panel>

          <Panel title="Tus pisos" description="Habitaciones ocupadas sobre el total de cada piso." flush>
            <RowList>
              {data.properties.map((p) => {
                const taken = p.rooms.filter((r) => r.status !== "free").length;
                const free = p.rooms.filter((r) => r.status === "free").length;
                return (
                  <Row key={p.id} href={sectionHref(spaceId, "cartera")}>
                    <Building2 className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.title}</span>
                      <Meter value={taken} max={p.rooms.length} className="mt-1.5 max-w-xs" tone={free ? "violet" : "success"} />
                    </span>
                    <span className="shrink-0 text-xs text-text-muted tabular">
                      {taken}/{p.rooms.length}
                      {free ? <span className="ml-1.5 font-semibold text-emerald-700 dark:text-emerald-300">{free} libre{free > 1 ? "s" : ""}</span> : null}
                    </span>
                  </Row>
                );
              })}
            </RowList>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title={`Cobros de ${monthName}`}
            action={
              <Link href={sectionHref(spaceId, "inquilinos")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                Ver <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-2xl font-extrabold tabular">{money(rent.paidCents, { round: true })}</span>
              <span className="text-sm text-text-muted tabular">de {money(rent.totalCents, { round: true })}</span>
            </p>
            <Meter value={rent.paidCents} max={rent.totalCents} className="mt-2" tone="success" />
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Cobrado</dt>
                <dd className="font-semibold tabular">{rent.paid}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Pendiente</dt>
                <dd className="font-semibold tabular">{rent.pending}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Con retraso</dt>
                <dd className={cn("font-semibold tabular", rent.late && "text-rose-700 dark:text-rose-300")}>{rent.late}</dd>
              </div>
            </dl>
            {lateTenants.length ? (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-border-light pt-3">
                {lateTenants.map((t) => {
                  const reminded = (t as { remindedAt?: string }).remindedAt;
                  return (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <button type="button" onClick={() => setTenantId(t.id)} className="min-w-0 flex-1 truncate text-left hover:underline">
                        {t.name}
                      </button>
                      <span className="text-xs text-text-muted tabular">{money(t.rentCents)}</span>
                      {reminded ? (
                        <Pill>Recordado</Pill>
                      ) : (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={whatsappHref(rentReminderText(data, t, now))} target="_blank" rel="noreferrer" onClick={() => remind(t.id, t.name)}>
                            <MessageCircle className="h-3.5 w-3.5" /> Recordar
                          </a>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Panel>

          {deadlines.length ? (
            <Panel title="Próximos plazos" description="Fianzas, contratos que acaban, certificado, seguro e IBI." flush>
              <RowList>
                {deadlines.slice(0, 6).map((dl) => (
                  <DeadlineRow
                    key={dl.id}
                    deadline={dl}
                    today={today}
                    onOpen={() => {
                      if (dl.tenantId) setTenantId(dl.tenantId);
                    }}
                    href={dl.propertyId ? sectionHref(spaceId, "cartera") : undefined}
                  />
                ))}
              </RowList>
              {deposits.length ? (
                <div className="border-t border-border-light px-4 py-3 sm:px-5">
                  <a href={GVA_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
                    Depositar fianzas en la sede de la Generalitat <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel
            title="Incidencias"
            description={openIncidents.length ? `${openIncidents.length} abiertas, ${urgentIncidents.length} urgentes.` : undefined}
            action={
              <Link href={sectionHref(spaceId, "inquilinos")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
                Todas <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
            flush
          >
            {openIncidents.length ? (
              <RowList>
                {[...openIncidents]
                  .sort((a, b) => (a.priority === "urgent" ? -1 : 0) - (b.priority === "urgent" ? -1 : 0) || a.createdAt.localeCompare(b.createdAt))
                  .slice(0, 4)
                  .map((i) => (
                    <Row key={i.id} onClick={() => setIncidentId(i.id)}>
                      <PriorityDot priority={i.priority} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{i.title}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {data.properties.find((p) => p.id === i.propertyId)?.title} · {relative(i.createdAt, now.getTime())}
                          {i.assignee ? ` · ${i.assignee}` : " · sin asignar"}
                        </span>
                      </span>
                      <Wrench className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                    </Row>
                  ))}
              </RowList>
            ) : (
              <Empty icon={Wrench} title="Sin incidencias" body="Tus inquilinos las abren desde su Franky, con fotos." />
            )}
          </Panel>

          <FrankyCard />

          <Tip title="Septiembre y febrero">
            En julio Franky ve a los admitidos que buscarán piso y en noviembre a los Erasmus de febrero, semanas antes que los portales. Deja tus habitaciones de febrero publicadas ya.
          </Tip>
        </div>
      </div>

      <FixedPortal>
        <div className="fixed bottom-20 right-4 z-40 sm:hidden">
          <Button variant="dark" size="lg" className="rounded-full shadow-float" onClick={() => setNewProperty(true)} aria-label="Añadir piso">
            <Plus className="h-4 w-4" /> Piso
          </Button>
        </div>
      </FixedPortal>

      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} />
      <VisitDrawer
        visitId={visitId}
        onClose={() => setVisitId(null)}
        onOpenLead={(id) => {
          setVisitId(null);
          setLeadId(id);
        }}
      />
      <TenantDrawer tenantId={tenantId} startLeaving={tenantLeaving} onClose={() => { setTenantId(null); setTenantLeaving(false); }} />
      <IncidentDrawer incidentId={incidentId} onClose={() => setIncidentId(null)} />
      <NewPropertyDrawer open={newProperty} onClose={() => setNewProperty(false)} />
    </div>
  );
}

/** Un plazo con los días que quedan. */
function DeadlineRow({ deadline, today, onOpen, href }: { deadline: HousingDeadline; today: string; onOpen: () => void; href?: string }) {
  const days = Math.round((new Date(`${deadline.date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
  const when = days < 0 ? "Vencido" : days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`;
  const content = (
    <>
      <CalendarClock className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{deadline.title}</span>
        <span className="block truncate text-xs text-text-muted">
          {shortDate(deadline.date)} · {deadline.detail}
        </span>
      </span>
      <Pill tone={deadline.tone === "neutral" ? "neutral" : deadline.tone}>{when}</Pill>
    </>
  );
  if (!deadline.tenantId && href) return <Row href={href}>{content}</Row>;
  return <Row onClick={onOpen}>{content}</Row>;
}

/** Lo que Franky ha traído: la cifra que justifica la cuota. */
function FrankyCard() {
  const { data, now, spaceId } = usePro();
  const res = housingResults(data, now, 30);
  const week = data.history.at(-1);
  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Franky, últimos 30 días</p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{res.verified}</p>
      <p className="text-sm text-white/70">interesados verificados por su universidad</p>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">{res.groups}</p>
          <p className="text-xs text-white/60">grupos de Roomie</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">{res.signed}</p>
          <p className="text-xs text-white/60">contratos firmados</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">{money(res.savedCents, { round: true })}</p>
          <p className="text-xs text-white/60">sin comisiones</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/60">
        Con la comisión del {Math.round(PORTAL_FEE * 100)} % por contrato de los portales para estudiantes habrías pagado {money(res.savedCents, { round: true })} por{" "}
        {money(res.contractCents, { round: true })} en contratos. En Franky pagas cuota fija.
        {week ? ` Esta semana, ${week.franky} interesados nuevos.` : ""}
      </p>
      <Link href={sectionHref(spaceId, "interesados")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white">
        <Sparkles className="h-3.5 w-3.5" /> Ver interesados <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

