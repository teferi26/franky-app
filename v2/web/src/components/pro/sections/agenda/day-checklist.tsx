"use client";

import * as React from "react";
import { Check, ClipboardCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type {
  ProChecklistItem,
  ProChecklistMoment,
} from "@/lib/pro/agenda-types";
import {
  checklistItems,
  checklistMoment,
  checklistProgress,
  marksOn,
  saveChecklist,
  toggleCheck,
} from "@/lib/pro/agenda-day";
import { localDate, localMinutes, time } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Panel, Segmented, inputClass } from "../../kit";
import { staffFirst, useAgenda } from "./parts";

const MOMENT_LABEL: Record<ProChecklistMoment, string> = {
  open: "Apertura",
  close: "Cierre",
};

/** Quién está marcando en este dispositivo: se recuerda solo aquí. */
function useMarker(
  spaceId: string,
  teamIds: string[],
  fallback: string | undefined,
) {
  const key = `franky-pro-checklist-${spaceId}`;
  const [who, setWho] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    try {
      setWho(window.localStorage.getItem(key) ?? undefined);
    } catch {
      setWho(undefined);
    }
  }, [key]);
  const choose = (id: string) => {
    setWho(id);
    try {
      window.localStorage.setItem(key, id);
    } catch {
      // Sin almacenamiento (modo privado): vale para esta visita.
    }
  };
  // Si esa persona ya no está en el equipo, marca quien ha fichado primero.
  const current = who && teamIds.includes(who) ? who : fallback;
  return [current, choose] as const;
}

/**
 * Tareas de apertura y cierre en Hoy. Cada una se marca con un toque y queda
 * quién la hizo y a qué hora: orden en el equipo sin papeles en la pared.
 */
export function DayChecklist() {
  const { data, now, spaceId, ops, run, allowed, vertical } = useAgenda();
  const today = localDate(now);
  const auto = checklistMoment(data, today, localMinutes(now));
  const [picked, setPicked] = React.useState<ProChecklistMoment | null>(null);
  const [open, setOpen] = React.useState(false);
  // El equipo que está hoy: primero quien ha fichado.
  const team = [
    ...data.staff.filter((s) => s.clockedInAt),
    ...data.staff.filter((s) => !s.clockedInAt),
  ];
  const [who, setWho] = useMarker(
    spaceId,
    team.map((s) => s.id),
    team[0]?.id,
  );
  if (!ops || !auto) return null;

  const moment = picked ?? auto;
  const items = checklistItems(ops, vertical.id, moment);
  const marks = marksOn(ops, today);
  const byItem = new Map(marks.map((mark) => [mark.itemId, mark]));
  const progress = checklistProgress(items, marks);
  const complete = progress.total > 0 && progress.done === progress.total;
  const last = marks
    .filter((mark) => items.some((item) => item.id === mark.itemId))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  // Hecha la lista, se pliega: solo se abre si alguien quiere revisarla.
  const showItems = !complete || open;

  const toggle = (item: ProChecklistItem) =>
    void run("agenda.checklist", (d) =>
      toggleCheck(d, {
        itemId: item.id,
        date: today,
        at: new Date().toISOString(),
        staffId: who,
      }),
    );

  return (
    <Panel
      title={
        complete
          ? moment === "open"
            ? "Apertura hecha"
            : "Cierre hecho"
          : MOMENT_LABEL[moment]
      }
      description={
        !items.length
          ? "Añade tus tareas en Ajustes."
          : complete
            ? `${progress.total} tareas${last ? `, la última de ${staffFirst(data, last.staffId)} a las ${time(last.at)}` : ""}.`
            : `${progress.done} de ${progress.total} hechas${last ? `, la última a las ${time(last.at)}` : ""}.`
      }
      action={
        <Segmented
          size="sm"
          label="Momento del día"
          value={moment}
          onChange={setPicked}
          options={[
            { value: "open", label: "Apertura" },
            { value: "close", label: "Cierre" },
          ]}
        />
      }
      flush
    >
      {items.length && showItems ? (
        <>
          {team.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto border-b border-border-light px-4 py-2.5 pro-scroll sm:px-5">
              <span className="shrink-0 text-xs text-text-muted">Marca</span>
              {team.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={who === person.id}
                  onClick={() => setWho(person.id)}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border pl-1 pr-3 text-xs font-semibold transition-colors",
                    who === person.id
                      ? "border-text-primary text-text-primary"
                      : "border-border text-text-muted hover:text-text-primary",
                  )}
                >
                  <Avatar name={person.name} tone={person.tone} size="xs" />
                  {person.name.split(" ")[0]}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="divide-y divide-border-light">
            {items.map((item) => {
              const mark = byItem.get(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={Boolean(mark)}
                    disabled={!allowed("agenda.checklist")}
                    onClick={() => toggle(item)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-secondary disabled:opacity-60 sm:px-5"
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                        mark
                          ? "border-text-primary bg-text-primary text-bg-primary"
                          : "border-border",
                      )}
                    >
                      {mark ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm",
                        mark
                          ? "text-text-muted line-through"
                          : "font-medium text-text-primary",
                      )}
                    >
                      {item.label}
                    </span>
                    {mark ? (
                      <span className="shrink-0 text-xs text-text-muted tabular">
                        {mark.staffId
                          ? `${staffFirst(data, mark.staffId)}, `
                          : ""}
                        {time(mark.at)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {complete ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-full items-center justify-center text-xs font-semibold text-text-muted hover:text-text-primary"
        >
          {open ? "Plegar" : "Ver quién hizo qué"}
        </button>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Ajustes: las tareas del negocio                                     */
/* ------------------------------------------------------------------ */

/** Lista de tareas que se edita en Ajustes; empieza con la del sector. */
export function ChecklistSettings() {
  const { ops, run, allowed, vertical } = useAgenda();
  const toast = useToast();
  const [drafts, setDrafts] = React.useState<
    Record<ProChecklistMoment, string>
  >({ open: "", close: "" });
  if (!ops) return null;
  const items = checklistItems(ops, vertical.id);
  const can = allowed("agenda.checklist");

  const save = (next: ProChecklistItem[], message: string) =>
    run("agenda.checklist", (d) => saveChecklist(d, next)).then((ok) => {
      if (ok) toast.success(message);
      return ok;
    });

  const add = async (moment: ProChecklistMoment) => {
    const label = drafts[moment].trim();
    if (!label) return;
    const ok = await save(
      [...items, { id: localId("ck"), label, moment }],
      "Tarea añadida",
    );
    if (ok) setDrafts((d) => ({ ...d, [moment]: "" }));
  };

  return (
    <Panel
      title="Apertura y cierre"
      description="Lo que el equipo marca cada día en Hoy. Queda quién lo hizo y a qué hora."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {(["open", "close"] as const).map((moment) => {
          const list = items.filter((item) => item.moment === moment);
          return (
            <div key={moment} className="flex min-w-0 flex-col gap-2">
              <p className="eyebrow">{MOMENT_LABEL[moment]}</p>
              {list.length ? (
                <ul className="flex flex-col divide-y divide-border-light rounded-xl border border-border">
                  {list.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 py-1 pl-3 pr-1"
                    >
                      <span className="min-w-0 flex-1 text-sm">
                        {item.label}
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar ${item.label}`}
                        disabled={!can}
                        onClick={() =>
                          void save(
                            items.filter((row) => row.id !== item.id),
                            "Tarea quitada",
                          )
                        }
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary disabled:opacity-40"
                      >
                        <X className="h-4 w-4" strokeWidth={1.9} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  icon={ClipboardCheck}
                  title="Sin tareas"
                  body="Añade lo que se hace siempre, por ejemplo cuadrar la caja."
                />
              )}
              <div className="flex gap-2">
                <input
                  aria-label={`Nueva tarea de ${MOMENT_LABEL[moment].toLowerCase()}`}
                  value={drafts[moment]}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [moment]: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && void add(moment)}
                  placeholder="Nueva tarea"
                  className={cn(inputClass, "min-w-0")}
                />
                <Button
                  variant="outline"
                  className="h-10 shrink-0"
                  disabled={!can || !drafts[moment].trim()}
                  onClick={() => void add(moment)}
                >
                  <Plus className="h-4 w-4" /> Añadir
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
