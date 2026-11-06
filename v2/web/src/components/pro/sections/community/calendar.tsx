"use client";

import * as React from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { dayLabel, localDate, time } from "@/lib/pro/format";
import {
  ASSEMBLY_KIND_LABEL,
  PERIOD_LABEL,
  communityOps,
  examClash,
  monthGrid,
  periodsOn,
  shiftMonth,
  withCommunityOps,
} from "@/lib/pro/community";
import type {
  CommunityActivity,
  CommunityPeriod,
  CommunityPeriodKind,
} from "@/lib/pro/community-types";
import { windowLabel } from "@/lib/pro/demo/community";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, FormField, IconButton, Panel, Pill, StepNav, inputClass } from "../../kit";

type Item = {
  key: string;
  date: string;
  label: string;
  kind: "activity" | "draft" | "assembly" | "subsidy" | "mandate";
  activityId?: string;
  time?: string;
};

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

const ITEM_STYLE: Record<Item["kind"], string> = {
  activity: "bg-violet-50 text-violet-deep",
  draft: "border border-dashed border-border text-text-muted",
  assembly: "bg-text-primary text-bg-primary",
  subsidy: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  mandate: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const DOT_STYLE: Record<Item["kind"], string> = {
  activity: "bg-violet",
  draft: "bg-border",
  assembly: "bg-text-primary",
  subsidy: "bg-sky-500",
  mandate: "bg-rose-500",
};

const PERIOD_STYLE: Record<CommunityPeriodKind, string> = {
  examenes: "bg-amber-50 dark:bg-amber-950/25",
  acogida: "bg-emerald-50 dark:bg-emerald-950/25",
  erasmus: "bg-emerald-50 dark:bg-emerald-950/25",
  festivo: "bg-bg-secondary",
  otro: "bg-sky-50 dark:bg-sky-950/25",
};

/**
 * Calendario del curso: actividades, asambleas, ventanas de subvención, fin
 * del mandato y épocas del curso (exámenes, acogida, Erasmus) de un vistazo.
 */
export function CourseCalendar({
  onOpenActivity,
  onCreate,
}: {
  onOpenActivity: (id: string) => void;
  onCreate: (date: string) => void;
}) {
  const { data, now } = usePro();
  const today = localDate(now);
  const ops = communityOps(data);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [selected, setSelected] = React.useState(today);
  const [adding, setAdding] = React.useState(false);

  const items = React.useMemo(() => {
    const list: Item[] = [];
    for (const a of data.activities as CommunityActivity[]) {
      list.push({
        key: `a-${a.id}`,
        date: localDate(a.date),
        label: a.title,
        kind: a.status === "draft" ? "draft" : "activity",
        activityId: a.id,
        time: time(a.date),
      });
    }
    for (const as of ops.assemblies) {
      list.push({
        key: `as-${as.id}`,
        date: localDate(as.date),
        label: as.kind === "junta" ? as.title : ASSEMBLY_KIND_LABEL[as.kind],
        kind: "assembly",
        time: time(as.date),
      });
    }
    for (const s of data.subsidies) {
      if (s.status !== "preparing") continue;
      list.push({ key: `sb-${s.id}`, date: s.window, label: "Plazo de la subvención", kind: "subsidy" });
    }
    const until = data.board[0]?.until;
    if (until) list.push({ key: "mandate", date: until, label: "Fin del mandato de la junta", kind: "mandate" });
    return list;
  }, [data.activities, data.subsidies, data.board, ops.assemblies]);

  const byDay = React.useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
    return map;
  }, [items]);

  const weeks = monthGrid(month);
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dayItems = byDay.get(selected) ?? [];
  const dayPeriods = periodsOn(selected, ops.periods);
  const clash = examClash(selected, ops.periods);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepNav
          label={monthName}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          onToday={() => {
            setMonth(today.slice(0, 7));
            setSelected(today);
          }}
          isToday={month === today.slice(0, 7)}
        />
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted" aria-label="Leyenda">
          <Legend className="bg-violet" label="Actividad" />
          <Legend className="bg-text-primary" label="Asamblea" />
          <Legend className="bg-sky-500" label="Subvención" />
          <Legend className="bg-amber-400" label="Exámenes" square />
          <Legend className="bg-emerald-400" label="Acogida y Erasmus" square />
        </ul>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
        <div className="grid grid-cols-7 border-b border-border-light text-center text-[0.7rem] font-semibold text-text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date) => {
            const inMonth = date.slice(0, 7) === month;
            const list = byDay.get(date) ?? [];
            const period = periodsOn(date, ops.periods)[0];
            const isToday = date === today;
            const isSelected = date === selected;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={isSelected}
                aria-label={`${dayLabel(`${date}T12:00:00Z`)}${list.length ? `, ${list.length} cosas` : ""}${period ? `, ${period.title}` : ""}`}
                className={cn(
                  "flex min-h-[3.4rem] min-w-0 flex-col items-stretch gap-1 border-b border-r border-border-light p-1 text-left transition-colors sm:min-h-[5.75rem] sm:p-1.5",
                  period ? PERIOD_STYLE[period.kind] : "",
                  !inMonth && "opacity-40",
                  isSelected ? "ring-2 ring-inset ring-violet" : "hover:bg-bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold tabular",
                    isToday ? "bg-violet text-white" : "text-text-secondary",
                  )}
                >
                  {Number(date.slice(8, 10))}
                </span>
                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {list.slice(0, 2).map((it) => (
                    <span
                      key={it.key}
                      className={cn("truncate rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold", ITEM_STYLE[it.kind])}
                    >
                      {it.label}
                    </span>
                  ))}
                  {list.length > 2 ? (
                    <span className="px-1 text-[0.65rem] text-text-muted">y {list.length - 2} más</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-0.5 sm:hidden">
                  {list.slice(0, 4).map((it) => (
                    <span key={it.key} className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLE[it.kind])} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Panel
        title={dayLabel(`${selected}T12:00:00Z`)}
        description={dayPeriods.length ? dayPeriods.map((p) => p.title).join(" · ") : undefined}
        action={
          <Button size="sm" variant="outline" onClick={() => onCreate(selected)} disabled={selected < today}>
            <CalendarPlus className="h-3.5 w-3.5" /> Actividad este día
          </Button>
        }
        flush
      >
        {clash && selected >= today ? (
          <p className="border-b border-border-light bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:px-5">
            Cae en {clash.title.toLowerCase()}. Mucha gente no podrá venir: si puedes, muévela.
          </p>
        ) : null}
        {dayItems.length ? (
          <ul className="divide-y divide-border-light">
            {dayItems.map((it) => (
              <li key={it.key}>
                {it.activityId ? (
                  <button
                    type="button"
                    onClick={() => onOpenActivity(it.activityId!)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary sm:px-5"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT_STYLE[it.kind])} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{it.label}</span>
                    {it.kind === "draft" ? <Pill tone="warning">Borrador</Pill> : null}
                    <span className="shrink-0 text-xs text-text-muted tabular">{it.time}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT_STYLE[it.kind])} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{it.label}</span>
                    {it.time ? <span className="shrink-0 text-xs text-text-muted tabular">{it.time}</span> : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Nada este día.</p>
        )}
      </Panel>

      <Panel
        title="Fechas del curso"
        description="Exámenes, acogida y lo que marque tu universidad. Franky avisa si programas algo encima."
        action={
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <CalendarPlus className="h-3.5 w-3.5" /> Añadir
          </Button>
        }
        flush
      >
        {ops.periods.length ? (
          <PeriodList periods={ops.periods} />
        ) : (
          <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
            Añade las épocas de exámenes de tu universidad para que te avisemos al programar.
          </p>
        )}
      </Panel>

      <PeriodDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function Legend({ className, label, square }: { className: string; label: string; square?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2", square ? "rounded-sm" : "rounded-full", className)} />
      {label}
    </li>
  );
}

function PeriodList({ periods }: { periods: CommunityPeriod[] }) {
  const { update } = usePro();
  const toast = useToast();
  const remove = (p: CommunityPeriod) => {
    update("community.period.remove", (d) =>
      withCommunityOps(d, (o) => ({ ...o, periods: o.periods.filter((x) => x.id !== p.id) })),
    );
    toast.success("Fecha quitada", p.title);
  };
  return (
    <ul className="divide-y divide-border-light">
      {[...periods]
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2 pl-4 pr-2 sm:pl-5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{p.title}</span>
              <span className="block text-xs text-text-muted">
                {PERIOD_LABEL[p.kind]} · {windowLabel(p.from)}
                {p.to !== p.from ? ` al ${windowLabel(p.to)}` : ""}
              </span>
            </span>
            <IconButton label={`Quitar ${p.title}`} icon={Trash2} onClick={() => remove(p)} className="h-10 w-10" />
          </li>
        ))}
    </ul>
  );
}

function PeriodDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [title, setTitle] = React.useState("");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [kind, setKind] = React.useState<CommunityPeriodKind>("examenes");

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setFrom(today);
    setTo(today);
    setKind("examenes");
  }, [open, today]);

  const valid = title.trim().length > 2 && from && to && to >= from;

  const save = () => {
    const period: CommunityPeriod = { id: localId("per"), title: title.trim(), from, to, kind };
    update("community.period.add", (d) =>
      withCommunityOps(d, (o) => ({ ...o, periods: [...o.periods, period] })),
    );
    toast.success("Fecha añadida al calendario", period.title);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Añadir fecha clave"
      description="Una época o un día que conviene tener presente al programar."
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          Añadir
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Qué es" htmlFor="per-title">
          <input
            id="per-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Exámenes de febrero de Derecho"
          />
        </FormField>
        <FormField label="Tipo">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={(Object.keys(PERIOD_LABEL) as CommunityPeriodKind[]).map((k) => ({
              value: k,
              label: PERIOD_LABEL[k],
            }))}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde" htmlFor="per-from">
            <input id="per-from" type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="Hasta" htmlFor="per-to">
            <input id="per-to" type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}
