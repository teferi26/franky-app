"use client";

import * as React from "react";
import {
  ArrowRight,
  BedDouble,
  CalendarRange,
  CheckCircle2,
  Megaphone,
  MessageCircle,
  Repeat,
  Sun,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProProperty, ProRoom, ProTenant } from "@/lib/pro/types";
import { localDate, money, plural } from "@/lib/pro/format";
import { PORTAL_FEE, findRoom, shortDate, uniShort } from "@/lib/pro/housing";
import {
  RENEWAL_LABEL,
  courseRange,
  courseResults,
  courseStartYear,
  leadsForGap,
  monthLabel,
  occupancyGrid,
  proposedRent,
  renewalState,
  renewalText,
  seasonMoment,
  segmentDays,
  whatsappHref,
  type OccupancySegment,
  type RenewalState,
} from "@/lib/pro/housing-ops";
import {
  answerRenewal,
  courseLabel,
  courseSummary,
  freedRoomText,
  launchSeason,
  markWaitlistNotified,
  monthlyOccupancy,
  offerGapToLead,
  renewalBoard,
  renewalRentCents,
  seasonPlan,
  segmentBox,
  sendRenewalOffers,
  setSummer,
  waitlist,
} from "@/lib/pro/housing-plan";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, Kpi, KpiRow, PageHeader, Panel, Pill, RowList, Segmented, StepNav, Tip } from "../../kit";
import { sectionHref } from "../../shell";
import { LeadDrawer, TenantDrawer } from "./drawers";
import { RoomChip, UniBadge } from "./shared";

type Tab = "calendar" | "season" | "renewals";

/** Un hueco elegido en la rejilla. */
type GapPick = { property: ProProperty; room: ProRoom; segment: OccupancySegment };

/**
 * El curso de un vistazo: cada habitación mes a mes, de septiembre a agosto,
 * con quién vive, quién tiene reserva y dónde quedan huecos. Desde aquí se
 * lanza la campaña de la próxima entrada y se renueva a los que siguen.
 */
export default function HousingCurso() {
  const { data, now } = usePro();
  const [startYear, setStartYear] = React.useState(() => courseStartYear(now));
  const [tab, setTab] = React.useState<Tab>("calendar");
  const [gap, setGap] = React.useState<GapPick | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [leadId, setLeadId] = React.useState<string | null>(null);

  const summary = courseSummary(data, startYear);
  const moment = seasonMoment(now);
  const plan = seasonPlan(data, moment);
  const board = renewalBoard(data, now);
  const pendingRenewals = board.not_asked.length + board.waiting.length;

  const openSegment = (property: ProProperty, room: ProRoom, segment: OccupancySegment) => {
    if (segment.kind === "tenant" && segment.tenantId) setTenantId(segment.tenantId);
    else if (segment.kind === "reserved" && segment.leadId) setLeadId(segment.leadId);
    else setGap({ property, room, segment });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`Curso ${courseLabel(startYear)}`}
        title="El curso de un vistazo"
        description={
          summary.rooms
            ? `${summary.occupancyPct} % ocupado. ${
                summary.roomsWithGaps
                  ? `${plural(summary.roomsWithGaps, "habitación tiene", "habitaciones tienen")} huecos por llenar.`
                  : "Ninguna habitación con huecos."
              }`
            : "Añade tus pisos y verás aquí cada habitación mes a mes."
        }
        actions={
          <Button variant="dark" onClick={() => setTab("season")}>
            <Megaphone className="h-4 w-4" /> {plan.launched ? "Campaña en marcha" : `Llenar ${moment.id === "february" ? "febrero" : "septiembre"}`}
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={BedDouble} label="Ocupación del curso" value={`${summary.occupancyPct} %`} hint={`${summary.rooms} habitaciones`} />
        <Kpi
          icon={CalendarRange}
          label="Meses vacíos"
          value={summary.emptyRoomMonths}
          hint={summary.lostCents ? `${money(summary.lostCents, { round: true })} que no entran` : "Todo el curso lleno"}
          emphasis={summary.emptyRoomMonths > 0}
          onClick={() => setTab("calendar")}
        />
        <Kpi icon={Repeat} label="Renovaciones" value={pendingRenewals} hint={`${plural(board.staying.length, "sigue", "siguen")}, ${plural(board.leaving.length, "se va", "se van")}`} onClick={() => setTab("renewals")} />
        <Kpi icon={Sun} label="Abiertas en verano" value={summary.summerRooms} hint="Julio y agosto" />
      </KpiRow>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Tab>
          label="Vista del curso"
          value={tab}
          onChange={setTab}
          options={[
            { value: "calendar", label: "Calendario" },
            { value: "season", label: moment.id === "february" ? "Febrero" : "Septiembre", count: plan.rooms.length },
            { value: "renewals", label: "Renovaciones", count: pendingRenewals },
          ]}
        />
        {tab === "calendar" ? (
          <StepNav
            label={`Curso ${courseLabel(startYear)}`}
            onPrev={() => setStartYear((y) => y - 1)}
            onNext={() => setStartYear((y) => y + 1)}
            onToday={() => setStartYear(courseStartYear(now))}
            isToday={startYear === courseStartYear(now)}
          />
        ) : null}
      </div>

      {tab === "calendar" ? (
        <>
          <CourseGrid startYear={startYear} onOpen={openSegment} />
          <CourseResultsCard startYear={startYear} />
        </>
      ) : null}
      {tab === "season" ? <SeasonPanel /> : null}
      {tab === "renewals" ? <RenewalsPanel onOpenTenant={setTenantId} /> : null}

      <GapDrawer
        pick={gap}
        onClose={() => setGap(null)}
        onOpenLead={(id) => {
          setGap(null);
          setLeadId(id);
        }}
      />
      <TenantDrawer tenantId={tenantId} onClose={() => setTenantId(null)} />
      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rejilla del curso                                                    */
/* ------------------------------------------------------------------ */

const SEGMENT_CLASS: Record<OccupancySegment["kind"], string> = {
  tenant: "border-border bg-bg-tertiary text-text-secondary hover:border-text-primary/25",
  reserved: "border-violet/40 bg-violet-50 text-violet-deep hover:border-violet",
  summer: "border-sky-400/50 bg-sky-50 text-sky-800 hover:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200",
  gap: "border-dashed border-emerald-500/60 bg-emerald-50/60 text-emerald-800 hover:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200",
};

const SEGMENT_LABEL: Record<OccupancySegment["kind"], string> = {
  tenant: "Inquilino",
  reserved: "Reserva",
  summer: "Verano",
  gap: "Libre",
};

function CourseGrid({ startYear, onOpen }: { startYear: number; onOpen: (p: ProProperty, r: ProRoom, s: OccupancySegment) => void }) {
  const { data, now } = usePro();
  const range = courseRange(startYear);
  const grid = occupancyGrid(data, startYear);
  const months = monthlyOccupancy(data, startYear);
  const today = localDate(now);
  const todayBox = today >= range.from && today <= range.to ? segmentBox({ from: today, to: today }, range) : null;

  if (!grid.length)
    return (
      <Panel>
        <Empty icon={CalendarRange} title="Aún no hay habitaciones" body="Sube tus pisos por habitaciones y aquí verás el curso entero: quién vive, quién entra y qué meses quedan vacíos." />
      </Panel>
    );

  const byProperty = data.properties
    .map((property) => ({ property, rows: grid.filter((row) => row.property.id === property.id) }))
    .filter((x) => x.rows.length);

  return (
    <Panel flush>
      <div className="overflow-x-auto pro-scroll">
        <div className="min-w-[760px]">
          {/* Meses y ocupación de cada mes. */}
          <div className="sticky top-0 z-10 flex border-b border-border-light bg-bg-primary">
            <div className="sticky left-0 z-[3] w-28 shrink-0 bg-bg-primary px-4 py-2.5 text-xs font-semibold text-text-muted sm:w-36 sm:px-5">Habitación</div>
            <div className="grid flex-1 grid-cols-12 pr-4">
              {months.map((m) => (
                <div key={m.month} className="flex flex-col items-center gap-1 py-2">
                  <span className="text-[0.7rem] font-semibold capitalize text-text-secondary">{monthLabel(m.month)}</span>
                  <span
                    className={cn(
                      "text-[0.65rem] font-semibold tabular",
                      m.pct >= 90 ? "text-emerald-700 dark:text-emerald-300" : m.pct >= 60 ? "text-text-muted" : "text-amber-800 dark:text-amber-300",
                    )}
                  >
                    {m.pct} %
                  </span>
                </div>
              ))}
            </div>
          </div>

          {byProperty.map(({ property, rows }) => (
            <div key={property.id} className="border-b border-border-light last:border-b-0">
              <p className="bg-bg-secondary px-4 py-1.5 text-xs font-semibold text-text-secondary sm:px-5">
                {/* El nombre del piso se queda a la vista al desplazar los meses. */}
                <span className="sticky left-4 sm:left-5">
                  {property.title}
                  <span className="ml-2 font-normal text-text-muted">{property.zone}</span>
                </span>
              </p>
              {rows.map((row) => (
                <div key={row.room.id} className="flex items-center">
                  <div className="sticky left-0 z-[3] w-28 shrink-0 bg-bg-primary px-4 py-2 sm:w-36 sm:px-5">
                    <p className="truncate text-sm font-semibold">{row.room.name.replace("Habitación ", "Hab. ")}</p>
                    <p className="text-xs text-text-muted tabular">{money(row.room.priceCents)}</p>
                  </div>
                  <div className="relative mr-4 h-10 flex-1">
                    {/* Líneas de cada mes. */}
                    <div aria-hidden className="absolute inset-0 grid grid-cols-12">
                      {months.map((m) => (
                        <span key={m.month} className="border-l border-border-light first:border-l-0" />
                      ))}
                    </div>
                    {todayBox ? <span aria-hidden className="absolute inset-y-0 z-[1] w-px bg-violet" style={{ left: `${todayBox.left}%` }} /> : null}
                    {row.segments.map((s) => {
                      const box = segmentBox(s, range);
                      const days = segmentDays(s);
                      const label = `${SEGMENT_LABEL[s.kind]}${s.kind === "tenant" || s.kind === "reserved" ? `: ${s.label}` : ""}, del ${shortDate(s.from)} al ${shortDate(s.to)}`;
                      return (
                        <button
                          key={`${s.kind}-${s.from}`}
                          type="button"
                          title={label}
                          aria-label={label}
                          onClick={() => onOpen(row.property, row.room, s)}
                          className={cn(
                            "absolute inset-y-1.5 overflow-hidden rounded-lg border px-1.5 text-left text-[0.7rem] font-semibold transition-colors",
                            SEGMENT_CLASS[s.kind],
                          )}
                          style={{ left: `${box.left}%`, width: `${box.width}%` }}
                        >
                          {days >= 20 ? <span className="block truncate leading-7">{s.kind === "gap" || s.kind === "summer" ? SEGMENT_LABEL[s.kind] : s.label.split(" ")[0]}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-light px-4 py-3 text-xs text-text-muted sm:px-5">
        {(Object.keys(SEGMENT_LABEL) as OccupancySegment["kind"][]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-4 rounded-[4px] border", SEGMENT_CLASS[k])} />
            {SEGMENT_LABEL[k]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-violet" /> Hoy
        </span>
        <span className="ml-auto">Toca un hueco para ver quién puede entrar.</span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Hueco: quién puede entrar                                            */
/* ------------------------------------------------------------------ */

function GapDrawer({ pick, onClose, onOpenLead }: { pick: GapPick | null; onClose: () => void; onOpenLead: (id: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  if (!pick) return <Drawer open={false} onOpenChange={() => onClose()} title="Hueco">{null}</Drawer>;

  const { property, room, segment } = pick;
  const current = data.properties.find((p) => p.id === property.id)?.rooms.find((r) => r.id === room.id) ?? room;
  const days = segmentDays(segment);
  const waiting = waitlist(data, current);
  const waitingIds = new Set(waiting.map((l) => l.id));
  const leads = leadsForGap(data, current, segment, 5).filter((l) => !waitingIds.has(l.id));
  // El aviso dice desde cuándo está libre de verdad: nunca una fecha pasada.
  const gapFrom = segment.from > localDate(now) ? segment.from : localDate(now);
  const touchesSummer = segment.kind === "summer" || segment.to.slice(5, 7) === "07" || segment.to.slice(5, 7) === "08";

  const propose = async (leadId: string) => {
    if (!(await update("lead.assign", (d) => offerGapToLead(d, leadId, property.id, room.id)))) return;
    onOpenLead(leadId);
  };
  const notify = (leadId: string) => {
    void update("lead.waitlist.notify", (d) => markWaitlistNotified(d, leadId, new Date().toISOString()));
    toast.success("Aviso listo en WhatsApp", "Con la habitación, la fecha y el precio.");
  };
  const toggleSummer = async () => {
    const next = !current.summer;
    if (!(await update("room.summer", (d) => setSummer(d, property.id, room.id, next)))) return;
    toast.success(next ? "Abierta para el verano" : "Cerrada en verano", next ? "Julio y agosto salen para estancias cortas." : "Julio y agosto vuelven a contar como libres.");
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${room.name}, ${property.title}`}
      description={`${segment.kind === "summer" ? "Verano" : "Libre"} del ${shortDate(segment.from)} al ${shortDate(segment.to)}, ${plural(days, "día", "días")}`}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-bg-secondary px-3 py-2">
            <p className="text-xs text-text-muted">Precio</p>
            <p className="font-semibold tabular">{money(current.priceCents)} al mes</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
            <p className="text-xs text-amber-800 dark:text-amber-300">Sin alquilar</p>
            <p className="font-semibold tabular text-amber-900 dark:text-amber-200">{money(Math.round((current.priceCents * days) / 30), { round: true })}</p>
          </div>
        </div>

        {waiting.length ? (
          <section>
            <p className="text-sm font-semibold">Te pidieron aviso</p>
            <p className="text-xs text-text-muted">Les dijiste que no había hueco y llegan a este precio.</p>
            <ul className="mt-2 flex flex-col divide-y divide-border-light rounded-2xl border border-violet/25 bg-violet-50/40">
              {waiting.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar name={l.name} size="sm" tone="violet" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      Entraba el {shortDate(l.moveIn)}, hasta {money(l.budgetCents)}
                    </span>
                  </span>
                  <Button size="sm" variant="secondary" asChild>
                    <a
                      href={whatsappHref(freedRoomText(data, l, property, current, gapFrom))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => notify(l.id)}
                      aria-label={`Avisar a ${l.name} por WhatsApp`}
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Avisar
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <p className="text-sm font-semibold">Pueden entrar en esas fechas</p>
          <p className="text-xs text-text-muted">Interesados activos con entrada cercana y presupuesto suficiente.</p>
          {leads.length ? (
            <ul className="mt-2 flex flex-col divide-y divide-border-light rounded-2xl border border-border">
              {leads.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar name={l.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm font-semibold">{l.name}</span>
                      <UniBadge university={l.university} verified={l.verified} />
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      Entra el {shortDate(l.moveIn)}, {l.months} meses, hasta {money(l.budgetCents)}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => propose(l.id)}>
                    Proponer
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              className="py-6"
              icon={Users}
              title="Nadie busca para esas fechas todavía"
              body="Lanza la campaña de la próxima entrada y los estudiantes que buscan en esas fechas verán la habitación."
            />
          )}
        </section>

        {touchesSummer ? (
          <section className="rounded-2xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sun className="h-4 w-4 text-sky-600" strokeWidth={1.9} /> Estancias cortas en verano
                </span>
                <span className="block text-xs text-text-muted">Cursos de verano, prácticas y estudiantes que llegan en julio.</span>
              </span>
              <Button size="sm" variant={current.summer ? "secondary" : "outline"} onClick={toggleSummer}>
                {current.summer ? "Cerrar" : "Abrir"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados del curso                                                 */
/* ------------------------------------------------------------------ */

function CourseResultsCard({ startYear }: { startYear: number }) {
  const { data } = usePro();
  const res = courseResults(data, startYear);
  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Resultados del curso {courseLabel(startYear)}</p>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">{res.occupancyPct} %</p>
          <p className="text-xs text-white/60">ocupación media</p>
        </div>
        <div>
          <p className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">{res.emptyRoomMonths}</p>
          <p className="text-xs text-white/60">meses de habitación vacíos</p>
        </div>
        <div>
          <p className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">{res.avgDaysToRent ?? "Sin datos"}</p>
          <p className="text-xs text-white/60">{res.avgDaysToRent === null ? "días en alquilar" : "días de media en alquilar"}</p>
        </div>
        <div>
          <p className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">{money(res.avgRentCents, { round: true })}</p>
          <p className="text-xs text-white/60">renta media</p>
        </div>
      </div>
      {res.frankyContracts ? (
        <p className="mt-4 border-t border-white/10 pt-4 text-sm text-white/75">
          {plural(res.frankyContracts, "contrato ha llegado", "contratos han llegado")} por Franky, {money(res.frankyContractCents, { round: true })} en total. Con la comisión del{" "}
          {Math.round(PORTAL_FEE * 100)} % de los portales para estudiantes habrías pagado {money(res.savedCents, { round: true })}.
        </p>
      ) : null}
      {res.worstRooms.length ? (
        <p className="mt-2 text-xs text-white/60">
          Más huecos: {res.worstRooms.map((r) => `${r.room.name.toLowerCase()} de ${r.property.title} (${Math.round(r.gapDays / 30)} meses)`).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Temporada: publicar lo que se libera y lanzar la oferta              */
/* ------------------------------------------------------------------ */

function SeasonPanel() {
  const { data, now, spaceId, update } = usePro();
  const toast = useToast();
  const moment = seasonMoment(now);
  const plan = seasonPlan(data, moment);
  const readyIds = new Set(plan.ready.map((p) => p.id));
  const readyRooms = plan.rooms.filter((o) => readyIds.has(o.property.id));

  const launch = async () => {
    if (!(await update("season.launch", (d) => launchSeason(d, moment, now)))) return;
    toast.success("Campaña en marcha", `${plural(readyRooms.length, "habitación publicada", "habitaciones publicadas")} para la entrada del ${shortDate(moment.start)}.`);
  };

  const byProperty = [...new Set(plan.rooms.map((o) => o.property.id))].map((id) => ({
    property: plan.rooms.find((o) => o.property.id === id)!.property,
    rooms: plan.rooms.filter((o) => o.property.id === id),
  }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel
        title={moment.title}
        description={`Entrada el ${shortDate(moment.start)}. ${moment.audience}.`}
        action={plan.launched ? <Pill tone="success">En marcha</Pill> : undefined}
      >
        {plan.rooms.length ? (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col divide-y divide-border-light">
              {byProperty.map(({ property, rooms }) => {
                const blocked = plan.blocked.find((b) => b.property.id === property.id);
                return (
                  <li key={property.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{property.title}</span>
                        <span className="block text-xs text-text-muted">
                          {property.zone}, a {property.minutesToCampus} min del campus
                        </span>
                      </span>
                      {blocked ? (
                        <Pill tone="warning">
                          <TriangleAlert className="h-3 w-3" strokeWidth={1.9} /> Falta {blocked.gaps.join(" y ")}
                        </Pill>
                      ) : property.published ? (
                        <Pill tone="success">Publicado</Pill>
                      ) : (
                        <Pill>Se publicará</Pill>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {rooms.map((o) => (
                        <span key={o.room.id} className="inline-flex items-center gap-1.5">
                          <RoomChip room={o.room} />
                          <span className="text-xs text-text-muted">desde el {shortDate(o.from)}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {plan.blocked.length ? (
              <p className="text-xs text-text-muted">
                Los pisos sin NRUA o sin letra energética no se anuncian. Complétalos en{" "}
                <a href={sectionHref(spaceId, "cartera")} className="font-semibold text-violet">
                  tus pisos
                </a>{" "}
                y entrarán en la campaña.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 border-t border-border-light pt-4">
              {plan.launched ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.9} /> {plan.launched.idea}
                </p>
              ) : (
                <Button variant="dark" onClick={launch} disabled={!readyRooms.length}>
                  <Megaphone className="h-4 w-4" /> Publicar {plural(readyRooms.length, "habitación", "habitaciones")} y lanzar la oferta
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Empty
            icon={BedDouble}
            title={`Nada libre para el ${shortDate(moment.start)}`}
            body="Cuando alguien avise de que se va o una renovación diga que no, su habitación aparecerá aquí para anunciarla."
          />
        )}
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="Ya buscan para esa fecha" description="Interesados activos con entrada cerca de ese día.">
          <p className="font-heading text-3xl font-extrabold tabular">{plan.demand.length}</p>
          <p className="text-sm text-text-muted">
            {plan.demand.filter((l) => l.verified).length} verificados, {plan.demand.filter((l) => l.erasmus).length} Erasmus,{" "}
            {plural(plan.demand.filter((l) => l.roomieGroup).length, "grupo de Roomie", "grupos de Roomie")}
          </p>
          {waitlist(data).length ? (
            <p className="mt-1 text-sm text-text-muted">
              {plural(waitlist(data).length, "persona espera", "personas esperan")} tu aviso: les dijiste que no había hueco.
            </p>
          ) : null}
          {plan.demand.length ? (
            <a href={sectionHref(spaceId, "interesados")} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
              Ver interesados <ArrowRight className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </Panel>
        <Tip title="Cuándo lanzarla">
          De marzo a agosto Franky enseña tus habitaciones a los admitidos de septiembre. De septiembre a enero, a los Erasmus y a quien llega en febrero.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Renovaciones en bloque                                               */
/* ------------------------------------------------------------------ */

const RENEWAL_TONE: Record<RenewalState, "success" | "warning" | "info" | "neutral"> = {
  staying: "success",
  leaving: "warning",
  waiting: "info",
  not_asked: "neutral",
};

function RenewalsPanel({ onOpenTenant }: { onOpenTenant: (id: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const board = renewalBoard(data, now);
  const [pctUp, setPctUp] = React.useState("0");
  const [filter, setFilter] = React.useState<RenewalState | "all">("all");
  const pct = Number(pctUp);
  const list = filter === "all" ? board.all : board[filter];

  const sendAll = async () => {
    const ids = board.not_asked.map((t) => t.id);
    if (!(await update("tenant.renewal.bulk", (d) => sendRenewalOffers(d, ids, pct, now)))) return;
    toast.success(
      `Oferta apuntada a ${plural(ids.length, "inquilino", "inquilinos")}`,
      "Mándasela a cada uno por WhatsApp desde su fila y marca lo que conteste.",
    );
  };
  const answer = async (t: ProTenant, value: "yes" | "no") => {
    if (!(await update(`tenant.renewal.${value}`, (d) => answerRenewal(d, t.id, value, now)))) return;
    const name = t.name.split(" ")[0];
    toast.success(value === "yes" ? `${name} sigue el curso que viene` : `${name} no renueva`, value === "yes" ? "Su habitación ya no sale como libre." : "Su habitación sale en la campaña de la próxima entrada.");
  };

  if (!board.all.length)
    return (
      <Panel>
        <Empty icon={Repeat} title="Ningún contrato acaba pronto" body="Los inquilinos cuyo contrato acaba en los próximos meses aparecen aquí para ofrecerles seguir." />
      </Panel>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {(["not_asked", "waiting", "staying", "leaving"] as RenewalState[]).map((s) => (
          <Kpi
            key={s}
            label={RENEWAL_LABEL[s]}
            value={board[s].length}
            hint={s === "staying" ? `${money(renewalRentCents(board.staying), { round: true })} al mes asegurados` : undefined}
            emphasis={filter === s}
            onClick={() => setFilter(filter === s ? "all" : s)}
          />
        ))}
      </div>

      {board.not_asked.length ? (
        <Panel title="Oferta de renovación" description="La misma subida para todos los que aún no saben nada. Luego se la mandas a cada uno por WhatsApp.">
          <div className="flex flex-wrap items-center gap-3">
            <ChoiceChips
              value={pctUp}
              onChange={setPctUp}
              options={[
                { value: "0", label: "Misma renta" },
                { value: "2", label: "+2 %" },
                { value: "3", label: "+3 %" },
                { value: "5", label: "+5 %" },
              ]}
            />
            <Button variant="dark" onClick={sendAll}>
              <Repeat className="h-4 w-4" /> Ofrecer a {plural(board.not_asked.length, "inquilino", "inquilinos")}
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel flush title={filter === "all" ? "Contratos que acaban" : RENEWAL_LABEL[filter]} description="Del que acaba antes al que acaba después.">
        <RowList>
          {list.map((t) => {
            const state = renewalState(t);
            const { property, room } = findRoom(data, t.propertyId, t.roomId);
            const offer = t.renewal?.newRentCents ?? proposedRent(t.rentCents, pct);
            return (
              <div key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <button type="button" onClick={() => onOpenTenant(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={t.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm font-semibold">{t.name}</span>
                      <span className="text-xs text-text-muted">{uniShort(t.university)}</span>
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {room?.name} de {property?.title}, acaba el {shortDate(t.contractEnd)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-text-muted">
                    <span className="block text-sm font-semibold text-text-primary tabular">{money(offer)}</span>
                    {offer !== t.rentCents ? `ahora ${money(t.rentCents)}` : "misma renta"}
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <Pill tone={RENEWAL_TONE[state]}>{RENEWAL_LABEL[state]}</Pill>
                  {state === "waiting" || state === "not_asked" ? (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={whatsappHref(renewalText(data, t, offer))} target="_blank" rel="noreferrer" aria-label={`Escribir a ${t.name} por WhatsApp`}>
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </Button>
                  ) : null}
                  {state === "waiting" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => answer(t, "yes")}>
                        Sigue
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => answer(t, "no")}>
                        Se va
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </RowList>
        {!list.length ? <Empty className="py-8" icon={Repeat} title="Nadie en este grupo" body="Toca otra cifra de arriba para ver el resto." /> : null}
      </Panel>
    </div>
  );
}
