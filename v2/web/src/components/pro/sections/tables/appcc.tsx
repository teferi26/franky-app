"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Printer,
  Recycle,
  Thermometer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type {
  ProColdUnit,
  ProHaccpEntry,
  ProHaccpMoment,
  ProHaccpTask,
  ProWasteEntry,
  ProWasteFate,
} from "@/lib/pro/tables-types";
import {
  WASTE_FATES,
  haccpMoment,
  haccpMonth,
  tempInRange,
  wasteSummary,
} from "@/lib/pro/tables-ops";
import {
  capitalize,
  dayLabel,
  localDate,
  localMinutes,
  money,
  plural,
  relative,
  time,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import {
  OpsMissing,
  downloadCsv,
  escapeHtml,
  parseEuros,
  printDocument,
  staffFirstName,
  useTablesOps,
} from "./ops-kit";

type Tab = "hoy" | "sobras" | "historial";

const QUICK_ACTIONS = [
  "Cerrar bien la puerta y volver a medir en 30 minutos",
  "Pasar el producto a otra nevera",
  "Retirar el producto afectado",
  "Avisar al técnico de frío",
];

export default function TablesAppcc() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("hoy");
  if (!ops) return <OpsMissing icon={Thermometer} title="Sin registros todavía" />;

  const today = localDate(now);
  const open = haccpMoment(ops, today, "apertura");
  const close = haccpMoment(ops, today, "cierre");
  const month = wasteSummary(ops, today.slice(0, 7));
  const days = haccpMonth(ops, today.slice(0, 7), today);
  const complete = days.filter((d) => d.complete).length;
  const alerts = days.reduce((a, d) => a + d.alerts, 0);
  const openDone = open.temps.length + open.tasks.length - open.pending;

  const summary =
    open.pending === 0 && close.pending === 0
      ? "Hoy lo tienes todo apuntado. Listo para cualquier inspección."
      : open.pending > 0
        ? `Apertura: ${openDone} de ${open.temps.length + open.tasks.length} hechos. Te faltan ${plural(open.pending, "registro", "registros")}.`
        : `Apertura hecha. Al cerrar te quedan ${plural(close.pending, "registro", "registros")}.`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="APPCC"
        title="Temperaturas, limpieza y sobras"
        description={summary}
        actions={
          <Button variant="outline" onClick={() => exportMonth(data, ops, today)}>
            <Download className="h-4 w-4" strokeWidth={1.9} /> Registro del mes
          </Button>
        }
      >
        <Segmented
          label="Apartado"
          value={tab}
          onChange={setTab}
          options={[
            { value: "hoy", label: "Hoy", count: open.pending + close.pending },
            { value: "sobras", label: "Desperdicio" },
            { value: "historial", label: "Historial" },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi
          icon={Thermometer}
          label="Días completos"
          value={`${complete}/${days.length}`}
          hint="este mes"
        />
        <Kpi
          icon={AlertTriangle}
          label="Fuera de rango"
          value={alerts}
          hint={alerts ? "todas con acción apuntada" : "ninguna este mes"}
        />
        <Kpi
          icon={Recycle}
          label="Sobras aprovechadas"
          value={`${month.savedPct} %`}
          hint={`${money(month.savedCents, { round: true })} que no fueron a la basura`}
          emphasis
        />
        <Kpi
          icon={Trash2}
          label="Tirado este mes"
          value={money(month.byFate.tirado.valueCents, { round: true })}
          hint={plural(month.byFate.tirado.count, "registro", "registros")}
        />
      </KpiRow>

      {tab === "hoy" ? <TodayTab /> : tab === "sobras" ? <WasteTab /> : <HistoryTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy                                                                 */
/* ------------------------------------------------------------------ */

function TodayTab() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [who, setWho] = React.useState(data.staff[0]?.id ?? "");
  const [reading, setReading] = React.useState<ProColdUnit | null>(null);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const first: ProHaccpMoment = nowMin < 16 * 60 ? "apertura" : "cierre";
  const moments: ProHaccpMoment[] = first === "apertura" ? ["apertura", "cierre"] : ["cierre", "apertura"];
  const weekly = ops.haccpTasks.filter((t) => t.moment === "semanal");

  const markTask = async (task: ProHaccpTask, moment: ProHaccpMoment) => {
    const entry: ProHaccpEntry = {
      id: localId("hc"),
      at: now.toISOString(),
      date: today,
      moment,
      staffId: who,
      taskId: task.id,
      ok: true,
    };
    if (!(await save("haccp.task", (o) => ({ ...o, haccpLog: [...o.haccpLog, entry] })))) return;
    toast.success("Hecho", `${task.name}, por ${staffFirstName(data, who)}.`);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="flex flex-col gap-2">
          <p className="text-[0.82rem] font-semibold">Quién lo apunta</p>
          <div className="flex gap-2 overflow-x-auto pb-1 pro-scroll">
            {data.staff.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={who === s.id}
                onClick={() => setWho(s.id)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border pl-1 pr-3 text-sm font-semibold transition-colors",
                  who === s.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                <Avatar name={s.name} tone={s.tone} size="sm" />
                {s.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </section>

        {moments.map((moment) => {
          const state = haccpMoment(ops, today, moment);
          const total = state.temps.length + state.tasks.length;
          return (
            <Panel
              key={moment}
              title={moment === "apertura" ? "Al abrir" : "Al cerrar"}
              description={
                state.pending
                  ? `${total - state.pending} de ${total} apuntados`
                  : "Todo apuntado"
              }
              action={state.pending === 0 ? <Pill tone="success"><Check className="h-3 w-3" /> Completo</Pill> : null}
              flush
            >
              <div className="px-4 pb-1 pt-3 sm:px-5">
                <Meter value={total - state.pending} max={total} tone={state.pending ? "violet" : "success"} />
              </div>
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:px-5">Temperaturas</p>
              <RowList>
                {state.temps.map(({ unit, entry }) => (
                  <div key={unit.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Thermometer className={cn("h-4 w-4 shrink-0", entry && !entry.ok ? "text-rose-600" : "text-text-muted")} strokeWidth={1.9} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{unit.name}</span>
                      <span className="block text-xs text-text-muted">
                        Entre {unit.min} y {unit.max} grados
                        {entry ? ` · ${staffFirstName(data, entry.staffId)} a las ${time(entry.at)}` : ""}
                      </span>
                    </span>
                    {entry ? (
                      <button
                        type="button"
                        onClick={() => setReading(unit)}
                        className={cn(
                          "inline-flex h-10 min-w-[4.5rem] items-center justify-center rounded-xl px-3 font-heading text-base font-bold tabular",
                          entry.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                        )}
                        aria-label={`Cambiar lectura de ${unit.name}`}
                      >
                        {entry.value} º
                      </button>
                    ) : (
                      <Button size="sm" variant="dark" className="h-10" onClick={() => setReading(unit)}>
                        Apuntar
                      </Button>
                    )}
                  </div>
                ))}
              </RowList>
              {state.tasks.length ? (
                <>
                  <p className="border-t border-border-light px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:px-5">Limpieza</p>
                  <RowList>
                    {state.tasks.map(({ task, entry }) => (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-semibold", entry && "text-text-muted line-through decoration-text-muted/40")}>{task.name}</span>
                          <span className="block text-xs text-text-muted">
                            {task.zone}
                            {entry ? ` · ${staffFirstName(data, entry.staffId)} a las ${time(entry.at)}` : ""}
                          </span>
                        </span>
                        {entry ? (
                          <Check className="h-5 w-5 text-emerald-600" strokeWidth={2.2} aria-label="Hecho" />
                        ) : (
                          <Button size="sm" variant="outline" className="h-10" onClick={() => markTask(task, moment)}>
                            Hecho
                          </Button>
                        )}
                      </div>
                    ))}
                  </RowList>
                </>
              ) : null}
            </Panel>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {weekly.length ? (
          <Panel title="Cada semana" flush>
            <RowList>
              {weekly.map((task) => {
                const last = ops.haccpLog
                  .filter((e) => e.taskId === task.id)
                  .sort((a, b) => b.at.localeCompare(a.at))[0];
                const days = last ? Math.floor((now.getTime() - Date.parse(last.at)) / 86_400_000) : null;
                const due = days === null || days >= 7;
                return (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{task.name}</span>
                      <span className={cn("block text-xs", due ? "text-amber-700 dark:text-amber-300" : "text-text-muted")}>
                        {last ? `Última vez ${relative(last.at, now.getTime())}` : "Sin hacer todavía"}
                      </span>
                    </span>
                    <Button size="sm" variant={due ? "dark" : "outline"} className="h-10" onClick={() => markTask(task, nowMin < 16 * 60 ? "apertura" : "cierre")}>
                      Hecho
                    </Button>
                  </div>
                );
              })}
            </RowList>
          </Panel>
        ) : null}

        <AlertsPanel />

        <Tip title="Si algo se sale de rango">
          Apunta la lectura igualmente y qué hiciste. Una alerta con su acción
          correctora es justo lo que quiere ver una inspección.
        </Tip>
      </div>

      <ReadingDrawer unit={reading} staffId={who} onClose={() => setReading(null)} />
    </div>
  );
}

function AlertsPanel() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const month = localDate(now).slice(0, 7);
  const list = ops.haccpLog
    .filter((e) => !e.ok && e.date.startsWith(month))
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Panel title="Alertas del mes" flush>
      {list.length ? (
        <RowList>
          {list.map((e) => {
            const unit = ops.coldUnits.find((u) => u.id === e.unitId);
            return (
              <div key={e.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-rose-600" strokeWidth={1.9} />
                  {unit?.name ?? "Registro"}: {e.value} º
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {capitalize(dayLabel(e.at))}, {time(e.at)} · {staffFirstName(data, e.staffId)}
                </p>
                {e.action ? <p className="mt-1 text-text-secondary">{e.action}</p> : null}
              </div>
            );
          })}
        </RowList>
      ) : (
        <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Ninguna lectura fuera de rango este mes.</p>
      )}
    </Panel>
  );
}

function ReadingDrawer({ unit, staffId, onClose }: { unit: ProColdUnit | null; staffId: string; onClose: () => void }) {
  const { now } = usePro();
  const { save } = useTablesOps();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [action, setAction] = React.useState("");
  React.useEffect(() => {
    setText("");
    setAction("");
  }, [unit]);
  if (!unit) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const value = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(value) && value > -40 && value < 40;
  const ok = valid && tempInRange(unit, value);
  const moment: ProHaccpMoment = localMinutes(now) < 16 * 60 ? "apertura" : "cierre";

  const submit = async () => {
    const entry: ProHaccpEntry = {
      id: localId("hc"),
      at: now.toISOString(),
      date: localDate(now),
      moment,
      staffId,
      unitId: unit.id,
      value: Math.round(value * 10) / 10,
      ok,
      action: ok ? undefined : action.trim(),
    };
    if (!(await save("haccp.temp", (o) => ({ ...o, haccpLog: [...o.haccpLog, entry] })))) return;
    if (ok) toast.success("Temperatura apuntada", `${unit.name}: ${entry.value} grados.`);
    else toast.info("Apuntada con acción correctora", unit.name);
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={unit.name}
      description={`Correcto entre ${unit.min} y ${unit.max} grados`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!valid || (!ok && action.trim().length < 5)} onClick={submit}>
            Guardar lectura
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Temperatura (grados)" htmlFor="hc-value">
          <input
            id="hc-value"
            inputMode="decimal"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d,.-]/g, ""))}
            placeholder={String((unit.min + unit.max) / 2)}
            className={cn(inputClass, "h-14 text-center font-heading text-3xl font-bold tabular")}
          />
        </FormField>
        {valid && !ok ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.9} /> Fuera de rango
            </p>
            <p className="mt-1">Apunta qué has hecho para corregirlo.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAction((prev) => (prev ? `${prev}. ${q}` : q))}
                  className="min-h-9 rounded-full border border-rose-300 bg-bg-primary px-3 text-left text-xs font-semibold text-text-primary dark:border-rose-800"
                >
                  {q}
                </button>
              ))}
            </div>
            <textarea
              aria-label="Acción correctora"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="mt-3 min-h-[72px] w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Desperdicio                                                         */
/* ------------------------------------------------------------------ */

const FATE_TONE: Record<ProWasteFate, "success" | "info" | "violet" | "danger"> = {
  vendido: "violet",
  donado: "info",
  aprovechado: "success",
  tirado: "danger",
};

function WasteTab() {
  const { data, now, vertical } = usePro();
  const { ops } = useTablesOps();
  const [open, setOpen] = React.useState(false);
  if (!ops) return null;
  const month = localDate(now).slice(0, 7);
  const summary = wasteSummary(ops, month);
  const list = ops.waste
    .filter((w) => w.date.startsWith(month))
    .sort((a, b) => b.at.localeCompare(a.at));
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title={`Sobras de ${monthName}`}
          description={`${plural(summary.entries, "registro", "registros")} en ${plural(summary.days, "día", "días")}`}
          action={
            <Button size="sm" variant="dark" className="h-10" onClick={() => setOpen(true)}>
              Apuntar sobras
            </Button>
          }
        >
          {summary.totalCents ? (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-tertiary" aria-hidden>
                {WASTE_FATES.map((f) => (
                  <div
                    key={f.id}
                    className={cn(
                      "h-full",
                      f.id === "vendido" ? "bg-violet" : f.id === "donado" ? "bg-sky-500" : f.id === "aprovechado" ? "bg-emerald-500" : "bg-rose-500",
                    )}
                    style={{ width: `${(summary.byFate[f.id].valueCents / summary.totalCents) * 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {WASTE_FATES.map((f) => (
                  <div key={f.id}>
                    <Pill tone={FATE_TONE[f.id]}>{f.label}</Pill>
                    <p className="mt-1.5 font-heading text-xl font-bold tabular">{money(summary.byFate[f.id].valueCents, { round: true })}</p>
                    <p className="text-xs text-text-muted">{plural(summary.byFate[f.id].count, "vez", "veces")}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty icon={Recycle} title="Sin sobras apuntadas este mes" body="Al cerrar, apunta lo que sobra y qué haces con ello. El resumen del mes se escribe solo." />
          )}
        </Panel>

        <Panel title="Últimos registros" flush>
          {list.length ? (
            <RowList>
              {list.slice(0, 20).map((w) => (
                <div key={w.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="w-14 shrink-0 text-xs text-text-muted tabular">{w.date.slice(8)}/{w.date.slice(5, 7)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {w.qty} {w.unit === "ud" ? "" : `${w.unit} de `}{w.item.toLowerCase()}
                    </span>
                    {w.reason ? <span className="block truncate text-xs text-text-muted">{w.reason}</span> : null}
                  </span>
                  <Pill tone={FATE_TONE[w.fate]}>{capitalize(w.fate)}</Pill>
                  <span className="hidden w-16 shrink-0 text-right text-sm tabular sm:block">{money(w.valueCents)}</span>
                </div>
              ))}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Aún no hay registros.</p>
          )}
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Tu plan contra el desperdicio">
          <p className="text-sm text-text-secondary">
            Con lo que apuntas cada día, Franky prepara el resumen del mes: qué sobra, qué se vende, se dona o se aprovecha y qué acaba en la basura.
          </p>
          {summary.topThrown.length ? (
            <div className="mt-3 rounded-2xl bg-bg-secondary p-3 text-sm">
              <p className="font-semibold">Lo que más tiras</p>
              <ul className="mt-1 space-y-0.5 text-text-secondary">
                {summary.topThrown.map((t) => (
                  <li key={t.item} className="flex justify-between gap-3">
                    <span className="truncate">{t.item}</span>
                    <span className="tabular">{money(t.valueCents, { round: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="outline" className="h-11" onClick={() => printWastePlan(data.space.name, monthName, summary, list)}>
              <Printer className="h-4 w-4" strokeWidth={1.9} /> Imprimir resumen del mes
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => printLeftoversPoster(data.space.name, vertical.id === "cafe")}>
              Cartel para llevarse las sobras
            </Button>
          </div>
        </Panel>
        <Tip title="Antes de tirar">
          {vertical.id === "cafe"
            ? "Desde Hoy puedes lanzar lo que sobra por la tarde como pack de última hora para los estudiantes de al lado."
            : "Ofrece siempre llevarse lo que sobra del plato. Y lo que sobre en cocina, apúntalo aquí aunque sea para la comida del equipo."}
        </Tip>
      </div>

      <WasteDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function WasteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { save } = useTablesOps();
  const toast = useToast();
  const [item, setItem] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [unit, setUnit] = React.useState<ProWasteEntry["unit"]>("ud");
  const [fate, setFate] = React.useState<ProWasteFate>("vendido");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setItem("");
    setQty("1");
    setUnit("ud");
    setFate("vendido");
    setValue("");
    setReason("");
  }, [open]);
  const suggestions = data.menu.filter((m) => m.available).slice(0, 8).map((m) => m.name);
  const amount = Number(qty.replace(",", "."));
  const cents = parseEuros(value) ?? 0;
  const valid = item.trim().length > 1 && amount > 0;

  const submit = async () => {
    const entry: ProWasteEntry = {
      id: localId("ws"),
      date: localDate(now),
      at: now.toISOString(),
      item: item.trim(),
      qty: amount,
      unit,
      fate,
      valueCents: cents,
      reason: reason.trim() || undefined,
    };
    if (!(await save("waste.add", (o) => ({ ...o, waste: [...o.waste, entry] })))) return;
    toast.success("Sobras apuntadas", `${entry.qty} ${entry.item.toLowerCase()}: ${fate}.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Apuntar sobras"
      description="Lo que sobra hoy y qué haces con ello."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!valid} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Qué ha sobrado" htmlFor="ws-item">
          <input id="ws-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Croissants, raciones de arroz..." className={inputClass} />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setItem(s)} className="h-8 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-text-primary/25">
                {s}
              </button>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cantidad" htmlFor="ws-qty">
            <input id="ws-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Unidad">
            <ChoiceChips value={unit} onChange={setUnit} options={[{ value: "ud", label: "ud" }, { value: "raciones", label: "raciones" }, { value: "kg", label: "kg" }]} />
          </FormField>
        </div>
        <FormField label="Qué has hecho con ello">
          <ChoiceChips value={fate} onChange={setFate} options={WASTE_FATES.map((f) => ({ value: f.id, label: f.label }))} />
        </FormField>
        <FormField label="Valor aproximado (€)" htmlFor="ws-value" hint="Lo que te costó. Sirve para ver cuánto dinero salvas.">
          <input id="ws-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" className={inputClass} />
        </FormField>
        <FormField label="Nota" htmlFor="ws-reason">
          <input id="ws-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entregado a la parroquia, comida del equipo..." className={inputClass} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Historial                                                           */
/* ------------------------------------------------------------------ */

function HistoryTab() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const days = haccpMonth(ops, today.slice(0, 7), today);
  const firstWeekday = (new Date(`${today.slice(0, 7)}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Este mes" description="Verde: apertura y cierre completos. Ámbar: falta algún registro.">
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <span key={d} className="font-semibold text-text-muted">{d}</span>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => <span key={`e${i}`} />)}
          {days.map((d) => (
            <span
              key={d.date}
              title={d.alerts ? `${d.alerts} alerta` : undefined}
              className={cn(
                "relative flex h-10 items-center justify-center rounded-xl font-semibold tabular",
                d.complete ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                d.date === today && "ring-2 ring-violet",
              )}
            >
              {Number(d.date.slice(8))}
              {d.alerts ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
            </span>
          ))}
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Para una inspección">
          <p className="text-sm text-text-secondary">
            Descarga todas las lecturas y limpiezas del mes con quién las hizo y a qué hora, más las acciones correctoras.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="dark" className="h-11" onClick={() => exportMonth(data, ops, today)}>
              <Download className="h-4 w-4" strokeWidth={1.9} /> Descargar registro del mes
            </Button>
            <Button variant="outline" className="h-11" onClick={() => printMonth(data, ops, today)}>
              <Printer className="h-4 w-4" strokeWidth={1.9} /> Imprimir
            </Button>
          </div>
        </Panel>
        <AlertsPanel />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exportar e imprimir                                                 */
/* ------------------------------------------------------------------ */

type Data = ReturnType<typeof usePro>["data"];
type Ops = NonNullable<Data["tablesOps"]>;

function monthRows(data: Data, ops: Ops, today: string): string[][] {
  const month = today.slice(0, 7);
  return ops.haccpLog
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => {
      const unit = ops.coldUnits.find((u) => u.id === e.unitId);
      const task = ops.haccpTasks.find((t) => t.id === e.taskId);
      return [
        e.date,
        time(e.at),
        e.moment,
        unit ? unit.name : task?.name ?? "",
        unit ? `${e.value}` : "Hecho",
        unit ? `${unit.min} a ${unit.max}` : "",
        e.ok ? "Correcto" : "Fuera de rango",
        e.action ?? "",
        data.staff.find((s) => s.id === e.staffId)?.name ?? "",
      ];
    });
}

function exportMonth(data: Data, ops: Ops, today: string) {
  downloadCsv(`appcc-${today.slice(0, 7)}.csv`, [
    ["Fecha", "Hora", "Momento", "Qué", "Lectura", "Rango", "Estado", "Acción correctora", "Quién"],
    ...monthRows(data, ops, today),
  ]);
}

function printMonth(data: Data, ops: Ops, today: string) {
  const rows = monthRows(data, ops, today)
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  printDocument(
    `APPCC ${today.slice(0, 7)}`,
    `<h1>Registro APPCC: ${escapeHtml(data.space.name)}</h1><p class="muted">${escapeHtml(data.space.address)}, ${escapeHtml(data.space.city)}. Mes ${today.slice(0, 7)}.</p>
<table><thead><tr><th>Fecha</th><th>Hora</th><th>Momento</th><th>Qué</th><th>Lectura</th><th>Rango</th><th>Estado</th><th>Acción correctora</th><th>Quién</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function printWastePlan(
  name: string,
  monthName: string,
  summary: ReturnType<typeof wasteSummary>,
  list: ProWasteEntry[],
) {
  const fates = WASTE_FATES.map(
    (f) => `<tr><td>${escapeHtml(f.label)}</td><td class="c">${summary.byFate[f.id].count}</td><td class="c">${escapeHtml(money(summary.byFate[f.id].valueCents))}</td></tr>`,
  ).join("");
  const rows = list
    .map((w) => `<tr><td>${w.date}</td><td>${escapeHtml(w.item)}</td><td class="c">${w.qty} ${w.unit}</td><td>${escapeHtml(w.fate)}</td><td>${escapeHtml(w.reason ?? "")}</td></tr>`)
    .join("");
  printDocument(
    `Desperdicio ${monthName}`,
    `<h1>Prevención del desperdicio alimentario</h1><p class="muted">${escapeHtml(name)}. Resumen de ${escapeHtml(monthName)}.</p>
<h2>Destino de las sobras</h2><table><thead><tr><th>Destino</th><th class="c">Veces</th><th class="c">Valor</th></tr></thead><tbody>${fates}</tbody></table>
<p>Valor que no acabó en la basura: <strong>${summary.savedPct} %</strong>.</p>
<h2>Medidas del local</h2><ul><li>Registro diario de sobras y su destino.</li><li>Venta a precio reducido al final del día.</li><li>Donación de lo que sigue siendo apto.</li><li>Los clientes pueden llevarse lo que no terminan, sin coste.</li></ul>
<h2>Registros</h2><table><thead><tr><th>Fecha</th><th>Qué</th><th class="c">Cantidad</th><th>Destino</th><th>Nota</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function printLeftoversPoster(name: string, cafe: boolean) {
  printDocument(
    "Llévatelo",
    `<div class="poster"><p class="big">¿No te lo terminas?<br>Te lo ponemos para llevar.</p>
<p>Pídelo al equipo. El envase no te cuesta nada.</p>
${cafe ? "<p>Y por la tarde, lo que queda en la vitrina sale más barato en Franky.</p>" : ""}
<p style="margin-top:80px;color:#555">${escapeHtml(name)}</p></div>`,
  );
}
