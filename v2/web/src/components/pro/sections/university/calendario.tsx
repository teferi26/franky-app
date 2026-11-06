"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus, Megaphone, Stamp, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import { addDays, capitalize, dayLabel, localDate, time } from "@/lib/pro/format";
import {
  AUDIENCE_LABEL,
  DEADLINE_KIND_LABEL,
  calendarEntries,
  monthGrid,
  publicationForDeadline,
  shiftMonth,
  uniExtrasOf,
  upcomingDeadlines,
  withUniExtras,
  type CalendarEntry,
  type CalendarEntryKind,
} from "@/lib/pro/university";
import type { ProUniAudience, ProUniDeadline, ProUniDeadlineKind, UniPublication } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, Empty, FormField, PageHeader, Panel, Pill, RowList, Row, StepNav, Tip, inputClass } from "../../kit";
import { sectionHref } from "../../shell";
import { useUniAction } from "./ui";

const KIND: Record<CalendarEntryKind, { label: string; bar: string; dot: string; icon: typeof Megaphone }> = {
  deadline: { label: "Plazos", bar: "border-violet", dot: "bg-violet", icon: CalendarClock },
  publication: { label: "Publicaciones", bar: "border-text-primary", dot: "bg-text-primary", icon: Megaphone },
  stop: { label: "Bienvenida", bar: "border-emerald-500", dot: "bg-emerald-500", icon: Stamp },
  activity: { label: "Asociaciones", bar: "border-amber-500", dot: "bg-amber-500", icon: Users },
};

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export default function UniversityCalendario() {
  const { data, now, spaceId } = usePro();
  const run = useUniAction();
  const today = localDate(now);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [selected, setSelected] = React.useState(today);
  const [hidden, setHidden] = React.useState<CalendarEntryKind[]>([]);
  const [creating, setCreating] = React.useState(false);

  const extras = uniExtrasOf(data);
  const pubs = data.uniPublications as UniPublication[];
  const entries = calendarEntries(data).filter((e) => !hidden.includes(e.kind));
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const weeks = monthGrid(month);
  const dayEntries = byDay.get(selected) ?? [];
  const upcoming = upcomingDeadlines(extras.deadlines, now, 60);
  const unprepared = upcoming.filter((d) => !publicationForDeadline(pubs, d.id));
  const monthLabel = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

  const toggleKind = (k: CalendarEntryKind) => setHidden((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));
  const publishHref = (d: ProUniDeadline) => {
    const pub = publicationForDeadline(pubs, d.id);
    return pub ? `${sectionHref(spaceId, "publicaciones")}?ver=${pub.id}` : `${sectionHref(spaceId, "publicaciones")}?nueva=1&plazo=${d.id}`;
  };
  const removeDeadline = (id: string) =>
    run("calendar.deadline.delete", (d) => withUniExtras(d, (x) => ({ ...x, deadlines: x.deadlines.filter((k) => k.id !== id) })), "Plazo quitado del calendario");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Calendario"
        title="Calendario del curso"
        description={
          upcoming.length
            ? `${upcoming.length} plazos en los próximos dos meses${unprepared.length ? `, ${unprepared.length} sin aviso preparado` : " y todos con su aviso preparado"}.`
            : "Apunta los plazos clave del curso y cada uno te propondrá su aviso a tiempo."
        }
        actions={
          <Button variant="dark" onClick={() => setCreating(true)}>
            <CalendarPlus className="h-4 w-4" /> Añadir plazo
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND) as CalendarEntryKind[]).map((k) => {
            const on = !hidden.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(k)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[0.82rem] font-semibold transition-colors",
                  on ? "border-text-primary/25 text-text-primary" : "border-border text-text-muted line-through",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", KIND[k].dot)} aria-hidden />
                {KIND[k].label}
              </button>
            );
          })}
        </div>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <StepNav
              label={monthLabel}
              onPrev={() => setMonth((m) => shiftMonth(m, -1))}
              onNext={() => setMonth((m) => shiftMonth(m, 1))}
              onToday={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
              isToday={month === today.slice(0, 7)}
            />
            <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {WEEKDAYS.map((w) => (
                <div key={w} className="bg-bg-secondary py-1.5 text-center text-[0.7rem] font-semibold text-text-muted">
                  {w}
                </div>
              ))}
              {weeks.flat().map((day) => {
                const inMonth = day.slice(0, 7) === month;
                const list = byDay.get(day) ?? [];
                const isToday = day === today;
                const isSelected = day === selected;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelected(day)}
                    aria-pressed={isSelected}
                    aria-label={`${dayLabel(`${day}T12:00:00Z`)}, ${list.length} cosas`}
                    className={cn(
                      "flex min-h-12 flex-col items-stretch gap-1 bg-bg-primary p-1 text-left transition-colors hover:bg-bg-secondary sm:min-h-24 sm:p-1.5",
                      !inMonth && "bg-bg-secondary/60 text-text-muted",
                      isSelected && "ring-2 ring-inset ring-violet",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center self-center rounded-full text-xs font-semibold tabular sm:self-start",
                        isToday && "bg-text-primary text-bg-primary",
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    {/* Móvil: puntos. Escritorio: las tres primeras cosas del día. */}
                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {list.slice(0, 4).map((e) => (
                        <span key={`${e.kind}-${e.id}`} className={cn("h-1.5 w-1.5 rounded-full", KIND[e.kind].dot)} aria-hidden />
                      ))}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {list.slice(0, 3).map((e) => (
                        <span key={`${e.kind}-${e.id}`} className={cn("truncate border-l-2 pl-1 text-[0.68rem] leading-tight text-text-secondary", KIND[e.kind].bar)}>
                          {e.title}
                        </span>
                      ))}
                      {list.length > 3 ? <span className="text-[0.68rem] text-text-muted">+{list.length - 3} más</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title={capitalize(dayLabel(`${selected}T12:00:00Z`))} flush>
            {dayEntries.length ? (
              <RowList>
                {dayEntries.map((e) => {
                  const deadline = e.kind === "deadline" ? extras.deadlines.find((d) => d.id === e.id) : undefined;
                  const Icon = KIND[e.kind].icon;
                  const href =
                    e.kind === "publication"
                      ? `${sectionHref(spaceId, "publicaciones")}?ver=${e.id}`
                      : e.kind === "stop"
                        ? sectionHref(spaceId, "bienvenida")
                        : e.kind === "activity"
                          ? sectionHref(spaceId, "asociaciones")
                          : deadline
                            ? publishHref(deadline)
                            : sectionHref(spaceId, "publicaciones");
                  return (
                    <div key={`${e.kind}-${e.id}`} className="flex items-center">
                      <Row href={href} className="min-w-0 flex-1">
                        <Icon className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{e.title}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {e.at ? `${time(e.at)} · ` : ""}
                            {e.detail}
                          </span>
                        </span>
                        {deadline ? (
                          publicationForDeadline(pubs, deadline.id) ? <Pill tone="success">Aviso listo</Pill> : <Pill tone="info">Preparar aviso</Pill>
                        ) : null}
                      </Row>
                      {deadline ? (
                        <button
                          type="button"
                          onClick={() => removeDeadline(deadline.id)}
                          aria-label={`Quitar el plazo ${deadline.title}`}
                          className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </RowList>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Nada este día. Toca otro día del calendario o añade un plazo.</p>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Próximos plazos" description="Cada plazo te propone su aviso, programado dos días antes." flush>
            {upcoming.length ? (
              <RowList>
                {upcoming.map((d) => {
                  const ready = publicationForDeadline(pubs, d.id);
                  return (
                    <Row key={d.id} href={publishHref(d)}>
                      <span className="w-12 shrink-0 text-center">
                        <span className="block font-heading text-lg font-bold leading-none tabular">{Number(d.date.slice(8, 10))}</span>
                        <span className="block text-[0.68rem] uppercase text-text-muted">
                          {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{d.title}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {DEADLINE_KIND_LABEL[d.kind]} · {AUDIENCE_LABEL[d.audience]}
                        </span>
                      </span>
                      {ready ? <Pill tone="success">Listo</Pill> : <Pill tone="info">Preparar</Pill>}
                    </Row>
                  );
                })}
              </RowList>
            ) : (
              <Empty icon={CalendarClock} title="Sin plazos a la vista" body="Añade becas, matrícula, exámenes o la llegada de Erasmus y tendrás el aviso listo a tiempo." />
            )}
          </Panel>
          <Tip title="Los momentos que mandan">
            Julio y agosto, pisos. Septiembre, bienvenida y asociaciones. Octubre, becas y las primeras bajas. Enero, exámenes. Febrero, Erasmus. Si los tienes aquí, ningún aviso llega tarde.
          </Tip>
          <Link href={sectionHref(spaceId, "memoria")} className="text-sm font-semibold text-violet">
            Ver el informe de la temporada
          </Link>
        </div>
      </div>

      <NewDeadlineDrawer open={creating} onClose={() => setCreating(false)} defaultDate={selected >= today ? selected : addDays(today, 7)} />
    </div>
  );
}

function NewDeadlineDrawer({ open, onClose, defaultDate }: { open: boolean; onClose: () => void; defaultDate: string }) {
  const run = useUniAction();
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(defaultDate);
  const [kind, setKind] = React.useState<ProUniDeadlineKind>("becas");
  const [audience, setAudience] = React.useState<ProUniAudience>("campus");

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(defaultDate);
    setKind("becas");
    setAudience("campus");
  }, [open, defaultDate]);

  const valid = title.trim().length > 3 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const save = async () => {
    const deadline: ProUniDeadline = { id: localId("d"), title: title.trim(), date, kind, audience };
    const ok = await run(
      "calendar.deadline.create",
      (d) => withUniExtras(d, (x) => ({ ...x, deadlines: [...x.deadlines, deadline] })),
      "Plazo añadido",
      "Te propondremos su aviso para que salga a tiempo.",
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo plazo"
      description="Becas, matrícula, exámenes, Erasmus o elecciones."
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          Añadir plazo
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Qué vence" htmlFor="dl-title">
          <input id="dl-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fin del plazo de becas de la Generalitat" />
        </FormField>
        <FormField label="Fecha" htmlFor="dl-date">
          <input id="dl-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Tipo">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={(Object.keys(DEADLINE_KIND_LABEL) as ProUniDeadlineKind[]).map((k) => ({ value: k, label: DEADLINE_KIND_LABEL[k] }))}
          />
        </FormField>
        <FormField label="A quién afecta">
          <ChoiceChips
            value={audience}
            onChange={setAudience}
            options={(["campus", "first_year", "erasmus", "master", "residences"] as ProUniAudience[]).map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))}
          />
        </FormField>
      </div>
    </Drawer>
  );
}
