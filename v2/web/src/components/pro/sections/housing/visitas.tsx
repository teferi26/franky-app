"use client";

import * as React from "react";
import { CalendarClock, CalendarPlus, Clock3, Copy, KeyRound, MapPin, MessageCircle, Settings2, Video } from "lucide-react";
import { tomorrowVisits, visitConfirmText, whatsappHref } from "@/lib/pro/housing-ops";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProVisit } from "@/lib/pro/types";
import { addDays, dayLabel, localDate, localMinutes, minutesToLabel, pct, time, weekdayIndex } from "@/lib/pro/format";
import { VISIT_MINUTES, VISIT_STATUS, uniShort } from "@/lib/pro/housing";
import { cn } from "@/lib/utils";
import { Drawer, Empty, Kpi, KpiRow, PageHeader, Panel, Pill, Segmented, StepNav, Tip, inputClass } from "../../kit";
import { TONES } from "../../tones";
import { LeadDrawer, NewVisitDrawer, VisitDrawer } from "./drawers";
import { UniBadge } from "./shared";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function HousingVisitas() {
  const { data, now } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [view, setView] = React.useState<"day" | "week">("day");
  const [date, setDate] = React.useState(today);
  const [open, setOpen] = React.useState<string | null>(null);
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editHours, setEditHours] = React.useState(false);

  const monday = addDays(date, -weekdayIndex(date));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const live = data.visits.filter((v) => v.status !== "cancelled");
  const onDay = (d: string) => live.filter((v) => localDate(v.start) === d).sort((a, b) => a.start.localeCompare(b.start));
  const todayList = onDay(today);
  const thisWeek = live.filter((v) => {
    const d = localDate(v.start);
    return d >= addDays(today, -weekdayIndex(today)) && d <= addDays(today, 6 - weekdayIndex(today));
  });
  const past = data.visits.filter((v) => v.status === "done" || v.status === "no_show");
  const showRate = pct(past.filter((v) => v.status === "done").length, past.length);
  const videoShare = pct(live.filter((v) => v.mode === "video").length, live.length);
  const openDays = data.space.hours.filter(Boolean).length;
  const weeklySlots = data.space.hours.reduce((a, h) => a + (h ? Math.floor((h.close - h.open) / VISIT_MINUTES) : 0), 0);

  const dayVisits = onDay(date);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Visitas"
        title="Agenda de visitas"
        description={
          todayList.length
            ? `Hoy ${todayList.length === 1 ? "hay 1 visita" : `hay ${todayList.length} visitas`} (${todayList.filter((v) => v.mode === "video").length} por vídeo) y ${thisWeek.length} esta semana.`
            : `Hoy no hay visitas. Esta semana, ${thisWeek.length}.`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditHours(true)}>
              <Settings2 className="h-4 w-4" /> Franjas
            </Button>
            <Button variant="dark" onClick={() => setCreating(true)}>
              <CalendarPlus className="h-4 w-4" /> Nueva visita
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi icon={KeyRound} label="Hoy" value={todayList.length} hint={todayList.filter((v) => v.status === "scheduled").length ? `${todayList.filter((v) => v.status === "scheduled").length} por hacer` : "Todas hechas"} />
        <Kpi icon={CalendarClock} label="Esta semana" value={thisWeek.length} hint={`${weeklySlots} franjas abiertas`} />
        <Kpi icon={Clock3} label="Asistencia" value={`${showRate} %`} hint="de las visitas pasadas" />
        <Kpi icon={Video} label="Por vídeo" value={`${videoShare} %`} hint="Erasmus y quien aún no ha llegado" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StepNav
              label={view === "day" ? dayLabel(`${date}T12:00:00Z`) : `Semana del ${new Date(`${monday}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" })}`}
              onPrev={() => setDate(addDays(date, view === "day" ? -1 : -7))}
              onNext={() => setDate(addDays(date, view === "day" ? 1 : 7))}
              onToday={() => setDate(today)}
              isToday={date === today}
            />
            <Segmented
              size="sm"
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: "day", label: "Día" },
                { value: "week", label: "Semana" },
              ]}
            />
          </div>

          {view === "day" ? (
            <Panel flush>
              {dayVisits.length ? (
                <ol className="divide-y divide-border-light">
                  {dayVisits.map((v, i) => {
                    const showNow = date === today && localMinutes(v.start) > nowMin && (i === 0 || localMinutes(dayVisits[i - 1].start) <= nowMin);
                    return (
                      <React.Fragment key={v.id}>
                        {showNow ? (
                          <li aria-label="Ahora" className="flex items-center gap-2 px-4 py-1 sm:px-5">
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-rose-600">Ahora</span>
                            <span className="h-px flex-1 bg-rose-500/60" />
                          </li>
                        ) : null}
                        <li>
                          <VisitRow visit={v} onOpen={() => setOpen(v.id)} />
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ol>
              ) : (
                <Empty
                  icon={CalendarClock}
                  title={data.space.hours[weekdayIndex(date)] ? "Sin visitas este día" : "Este día no enseñas pisos"}
                  body={
                    data.space.hours[weekdayIndex(date)]
                      ? "Propón visitas desde la ficha de cada interesado o crea una aquí."
                      : "Abre franjas este día si quieres que los interesados puedan elegirlo."
                  }
                  action={
                    <Button variant="outline" onClick={() => (data.space.hours[weekdayIndex(date)] ? setCreating(true) : setEditHours(true))}>
                      {data.space.hours[weekdayIndex(date)] ? "Nueva visita" : "Editar franjas"}
                    </Button>
                  }
                />
              )}
            </Panel>
          ) : (
            <div className="overflow-x-auto pb-1 pro-scroll">
              <div className="grid min-w-[760px] grid-cols-7 gap-2">
                {weekDays.map((d) => {
                  const list = onDay(d);
                  const closed = !data.space.hours[weekdayIndex(d)];
                  return (
                    <div key={d} className={cn("flex min-h-40 flex-col rounded-2xl border p-2", d === today ? "border-violet/40 bg-violet-50/40" : "border-border bg-bg-primary", closed && "bg-bg-secondary/60")}>
                      <button
                        type="button"
                        onClick={() => {
                          setDate(d);
                          setView("day");
                        }}
                        className="mb-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-bg-secondary"
                      >
                        <span className="block text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted">{WEEKDAYS[weekdayIndex(d)].slice(0, 3)}</span>
                        <span className={cn("font-heading text-lg font-bold tabular", d === today && "text-violet")}>{Number(d.slice(8, 10))}</span>
                      </button>
                      <div className="flex flex-col gap-1">
                        {list.map((v) => {
                          const lead = data.leads.find((l) => l.id === v.leadId);
                          const agent = data.staff.find((s) => s.id === v.agentId);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setOpen(v.id)}
                              className={cn(
                                "rounded-lg px-2 py-1.5 text-left text-xs transition-transform hover:-translate-y-px",
                                TONES[agent?.tone ?? "slate"].block,
                                v.status === "no_show" && "opacity-60 line-through",
                              )}
                            >
                              <span className="flex items-center gap-1 font-semibold tabular">
                                {time(v.start)}
                                {v.mode === "video" ? <Video className="h-3 w-3" /> : null}
                              </span>
                              <span className="block truncate">{lead?.name.split(" ")[0]}</span>
                            </button>
                          );
                        })}
                        {closed ? <span className="px-1 text-[0.7rem] text-text-muted">Sin franjas</span> : !list.length ? <span className="px-1 text-[0.7rem] text-text-muted">Libre</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <TomorrowPanel onOpen={setOpen} />
          <SelfBookingPanel />
          <Panel
            title="Franjas para visitas"
            description={`${openDays} días a la semana, visitas de ${VISIT_MINUTES} minutos.`}
            action={
              <Button size="sm" variant="ghost" onClick={() => setEditHours(true)}>
                Editar
              </Button>
            }
            flush
          >
            <ul className="divide-y divide-border-light">
              {WEEKDAYS.map((w, i) => {
                const h = data.space.hours[i];
                return (
                  <li key={w} className="flex items-center justify-between px-4 py-2.5 text-sm sm:px-5">
                    <span className={cn(i === weekdayIndex(today) && "font-semibold")}>{w}</span>
                    {h ? (
                      <span className="tabular text-text-secondary">
                        {minutesToLabel(h.open)} a {minutesToLabel(h.close)}
                      </span>
                    ) : (
                      <span className="text-text-muted">Sin visitas</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Tip title="Visitas por vídeo">
            Los Erasmus de febrero y los admitidos de fuera no pueden venir en persona. Una videollamada de diez minutos enseñando cada habitación reserva tanto como una visita.
          </Tip>
          <Tip title="Menos plantones">
            Pide confirmación la víspera con el botón de WhatsApp: el mensaje ya lleva la hora y la dirección. Si alguien no viene, márcalo: queda en su historial.
          </Tip>
        </div>
      </div>

      <VisitDrawer
        visitId={open}
        onClose={() => setOpen(null)}
        onOpenLead={(id) => {
          setOpen(null);
          setLeadId(id);
        }}
      />
      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} />
      <NewVisitDrawer key={creating ? "open" : "closed"} open={creating} onClose={() => setCreating(false)} />
      <HoursDrawer key={editHours ? "h-open" : "h-closed"} open={editHours} onClose={() => setEditHours(false)} />
    </div>
  );
}

function VisitRow({ visit, onOpen }: { visit: ProVisit; onOpen: () => void }) {
  const { data } = usePro();
  const lead = data.leads.find((l) => l.id === visit.leadId);
  const property = data.properties.find((p) => p.id === visit.propertyId);
  const agent = data.staff.find((s) => s.id === visit.agentId);
  const done = visit.status !== "scheduled";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5"
    >
      <span className="w-12 shrink-0">
        <span className={cn("block font-heading text-base font-bold tabular", done && "text-text-muted")}>{time(visit.start)}</span>
        <span className="block text-[0.7rem] text-text-muted tabular">{VISIT_MINUTES} min</span>
      </span>
      <span className={cn("h-10 w-1 shrink-0 rounded-full", TONES[agent?.tone ?? "slate"].bar)} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("truncate text-sm font-semibold", visit.status === "no_show" && "line-through")}>{lead?.name ?? "Interesado"}</span>
          {lead ? <UniBadge university={lead.university} verified={lead.verified} /> : null}
          {lead?.roomieGroup ? <Pill tone="violet">Grupo de {lead.roomieGroup.size}</Pill> : null}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-text-muted">
          {visit.mode === "video" ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
          <span className="truncate">
            {property?.title}
            {lead ? ` · ${uniShort(lead.university)}, entrada ${new Date(`${lead.moveIn.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
            {agent && data.staff.length > 1 ? ` · ${agent.name.split(" ")[0]}` : ""}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Pill tone={VISIT_STATUS[visit.status].tone}>{VISIT_STATUS[visit.status].label}</Pill>
        {visit.status === "scheduled" && visit.confirmedAt ? <Pill tone="success">Confirmada</Pill> : null}
        {visit.source === "public" ? <Pill tone="violet">Desde tu ficha</Pill> : null}
      </span>
    </button>
  );
}

/** Mañana: quién viene y quién no ha confirmado todavía, con WhatsApp en un toque. */
function TomorrowPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const { list, unconfirmed } = tomorrowVisits(data, now);
  if (!list.length) return null;
  const confirm = (id: string) => {
    update("visit.confirm", (d) => ({ ...d, visits: d.visits.map((v) => (v.id === id ? { ...v, confirmedAt: new Date().toISOString() } : v)) }));
    toast.success("Visita confirmada");
  };
  return (
    <Panel
      title={`Mañana: ${list.length === 1 ? "1 visita" : `${list.length} visitas`}`}
      description={unconfirmed.length ? `${unconfirmed.length} sin confirmar. Escríbeles hoy.` : "Todas confirmadas."}
      flush
    >
      <ul className="divide-y divide-border-light">
        {list.map((v) => {
          const lead = data.leads.find((l) => l.id === v.leadId);
          return (
            <li key={v.id} className={cn("flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5", !v.confirmedAt && "bg-amber-50/60 dark:bg-amber-950/20")}>
              <button type="button" onClick={() => onOpen(v.id)} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-semibold">
                  <span className="tabular">{time(v.start)}</span> · {lead?.name ?? "Interesado"}
                </span>
                <span className="block truncate text-xs text-text-muted">{data.properties.find((p) => p.id === v.propertyId)?.title}</span>
              </button>
              {v.confirmedAt ? (
                <Pill tone="success">Confirmada</Pill>
              ) : (
                <span className="flex gap-1.5">
                  <Button size="sm" variant="outline" asChild>
                    <a href={whatsappHref(visitConfirmText(data, v))} target="_blank" rel="noreferrer" aria-label={`Pedir confirmación a ${lead?.name ?? "el interesado"}`}>
                      <MessageCircle className="h-3.5 w-3.5" /> Pedir
                    </a>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => confirm(v.id)}>
                    Confirmada
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** El enlace de cada piso para que los estudiantes elijan hora solos. */
function SelfBookingPanel() {
  const { data } = usePro();
  const toast = useToast();
  const url = `https://franky.es/n/${data.space.slug}`;
  const fromPage = data.visits.filter((v) => v.source === "public" && v.status !== "cancelled").length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado", "Pégalo en tus anuncios y en tu bio de Instagram.");
    } catch {
      toast.info("Copia el enlace", url);
    }
  };
  return (
    <Panel title="Que reserven solos" description="Los estudiantes eligen hora en tus franjas, presencial o por vídeo, y la visita aparece aquí.">
      <p className="truncate rounded-xl bg-bg-secondary px-3 py-2 text-sm font-semibold">{url.replace("https://", "")}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          <Copy className="h-3.5 w-3.5" /> Copiar enlace
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a href={`/n/${data.space.slug}`} target="_blank" rel="noreferrer">
            Ver tu ficha
          </a>
        </Button>
      </div>
      {fromPage ? <p className="mt-2 text-xs text-text-muted">{fromPage === 1 ? "1 visita pedida" : `${fromPage} visitas pedidas`} desde tu ficha.</p> : null}
    </Panel>
  );
}

type DayDraft = { on: boolean; open: string; close: string };

function HoursDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [days, setDays] = React.useState<DayDraft[]>(() =>
    WEEKDAYS.map((_, i) => {
      const h = data.space.hours[i];
      return { on: Boolean(h), open: minutesToLabel(h?.open ?? 17 * 60), close: minutesToLabel(h?.close ?? 20 * 60) };
    }),
  );
  const toMin = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const valid = days.every((d) => !d.on || toMin(d.close) - toMin(d.open) >= VISIT_MINUTES);
  const save = () => {
    const hours = days.map((d) => (d.on ? { open: toMin(d.open), close: toMin(d.close) } : null));
    update("space.visitHours", (d) => ({ ...d, space: { ...d.space, hours } }));
    const slots = hours.reduce((a, h) => a + (h ? Math.floor((h.close - h.open) / VISIT_MINUTES) : 0), 0);
    toast.success("Franjas guardadas", `${slots} huecos de visita a la semana. Los interesados eligen hora dentro de ellas.`);
    onClose();
  };
  const set = (i: number, fields: Partial<DayDraft>) => setDays((prev) => prev.map((d, j) => (j === i ? { ...d, ...fields } : d)));

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Franjas para visitas"
      description="Cuándo puedes enseñar los pisos. Los interesados solo pueden pedir visita dentro de estas horas."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid}>Guardar franjas</Button>
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {WEEKDAYS.map((w, i) => (
          <li key={w} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border px-3 py-2.5">
            <label className="flex min-h-10 min-w-28 flex-1 items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" checked={days[i].on} onChange={(e) => set(i, { on: e.target.checked })} className="h-4 w-4 accent-[var(--color-violet)]" />
              {w}
            </label>
            {days[i].on ? (
              <span className="flex items-center gap-1.5 text-sm">
                <input type="time" step={900} value={days[i].open} onChange={(e) => set(i, { open: e.target.value })} className={cn(inputClass, "h-9 w-[6.5rem]")} aria-label={`${w}, desde`} />
                <span className="text-text-muted">a</span>
                <input type="time" step={900} value={days[i].close} onChange={(e) => set(i, { close: e.target.value })} className={cn(inputClass, "h-9 w-[6.5rem]")} aria-label={`${w}, hasta`} />
              </span>
            ) : (
              <span className="text-sm text-text-muted">Sin visitas</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-muted">Consejo: una franja de tarde entre semana y el sábado por la mañana cubre a casi todos los estudiantes.</p>
    </Drawer>
  );
}
