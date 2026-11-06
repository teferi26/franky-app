"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Cake,
  Laptop,
  Plug,
  Plus,
  Recycle,
  Settings2,
  ShoppingBag,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProStudySettings } from "@/lib/pro/tables-types";
import {
  STUDY_RULE_LABEL,
  ordersOn,
  ordersToRemind,
  studyStatus,
} from "@/lib/pro/tables-ops";
import {
  defaultStudySettings,
  leftoversOffer,
  leftoversWindow,
  sellLeftovers,
  setShowcaseItem,
  showcaseCandidates,
  showcaseToday,
  studyCount,
} from "@/lib/pro/tables-day";
import {
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  time,
  weekdayIndex,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Meter,
  Panel,
  Pill,
  RowList,
} from "../../kit";
import { sectionHref } from "../../shell";
import type { OfferPreset } from "../common/offer-composer";
import { AllergenCodes } from "./table-kit";
import { Stepper, useTablesOps } from "./ops-kit";

/**
 * Tarjetas de Hoy propias de la cafetería: el sitio para estudiar con sus
 * reglas, la vitrina del día con las sobras de última hora y los pedidos
 * para recoger.
 */

const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAY_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/* ------------------------------------------------------------------ */
/* Sitio para estudiar                                                 */
/* ------------------------------------------------------------------ */

export function StudyPanel({ onOffer }: { onOffer: (preset: OfferPreset) => void }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const hours = data.space.hours[weekdayIndex(today)];
  const study = ops.study;

  if (!study || !study.enabled) {
    return (
      <Panel title="Sitio para estudiar">
        <Empty
          icon={BookOpen}
          title="Llena las tardes con gente que estudia"
          body="Di cuántos sitios tienes, si hay enchufes y qué consumición pides. Los estudiantes de cerca ven los sitios libres y tus reglas."
          action={
            <Button
              variant="dark"
              onClick={async () => {
                const next = study
                  ? { ...study, enabled: true }
                  : defaultStudySettings(hours);
                if (await save("study.enable", (o) => ({ ...o, study: next })))
                  setEditing(true);
              }}
            >
              Activar sitio para estudiar
            </Button>
          }
          className="py-6"
        />
        <StudyDrawer open={editing} onClose={() => setEditing(false)} />
      </Panel>
    );
  }

  const status = studyStatus(study, now);
  const count = (delta: number) =>
    save("study.count", (o) =>
      o.study ? { ...o, study: studyCount(o.study, delta, now.toISOString()) } : o,
    );

  return (
    <Panel
      title="Sitio para estudiar"
      description={
        status.open
          ? "Lo que ven ahora los estudiantes que buscan dónde estudiar."
          : `Abre de ${minutesToLabel(study.fromMinute)} a ${minutesToLabel(study.toMinute)}.`
      }
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => setEditing(true)}
        >
          <Settings2 className="h-3.5 w-3.5" strokeWidth={1.9} /> Reglas
        </Button>
      }
    >
      <div className="flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
            {status.open ? status.free : study.seats}
          </span>
          <span className="text-sm text-text-muted">
            {status.open ? `libres de ${study.seats}` : "sitios"}
          </span>
        </p>
        {status.open ? (
          <Stepper
            label="Personas estudiando ahora"
            value={study.occupied}
            min={0}
            max={study.seats}
            onChange={(v) => void count(v - study.occupied)}
          />
        ) : null}
      </div>
      <Meter
        value={status.open ? study.occupied : 0}
        max={study.seats}
        className="mt-3"
        tone={status.free <= 3 ? "warning" : "violet"}
      />
      {status.open ? (
        <p className="mt-2 text-xs text-text-muted">
          Toca más o menos cuando alguien se sienta o se va. Así nadie viene
          para nada.
        </p>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-secondary">
        <li className="inline-flex items-center gap-1">
          <Plug className="h-3.5 w-3.5" strokeWidth={1.9} />
          {study.plugs > 0 ? `${study.plugs} enchufes` : "Sin enchufes"}
        </li>
        <li className="inline-flex items-center gap-1">
          <Wifi className="h-3.5 w-3.5" strokeWidth={1.9} />
          {study.wifi ? "Wifi" : "Sin wifi"}
        </li>
        <li className="inline-flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" strokeWidth={1.9} />
          {STUDY_RULE_LABEL[study.rule]}
        </li>
        <li className="inline-flex items-center gap-1">
          <Laptop className="h-3.5 w-3.5" strokeWidth={1.9} />
          {status.laptopsToday ? "Portátiles hoy sí" : "Hoy sin portátiles"}
        </li>
      </ul>
      {status.open && status.free > 0 ? (
        <Button
          variant="secondary"
          className="mt-4 h-11 w-full"
          onClick={() => {
            onOffer({
              title: "Sitio para estudiar",
              what: `Sitio con enchufe y ${study.rule === "none" ? "café a precio de estudiante" : "tu consumición"}`,
              from: Math.ceil(localMinutes(now) / 15) * 15,
              to: Math.min(study.toMinute, hours?.close ?? study.toMinute),
              priceCents: 160,
              slots: status.free,
            });
            toast.info("Oferta preparada", "Revisa el precio y publícala.");
          }}
        >
          Avisar de que hay sitio
        </Button>
      ) : null}
      <StudyDrawer open={editing} onClose={() => setEditing(false)} />
    </Panel>
  );
}

function StudyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save, pending } = useTablesOps();
  const toast = useToast();
  const hours = data.space.hours[weekdayIndex(localDate(now))];
  const [draft, setDraft] = React.useState<ProStudySettings>(
    () => ops?.study ?? defaultStudySettings(hours),
  );

  React.useEffect(() => {
    if (open) setDraft(ops?.study ?? defaultStudySettings(hours));
    // Solo al abrir: mientras se edita no se pisa el borrador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Horas en punto y medias dentro del horario más amplio de la semana.
  const open0 = Math.min(...data.space.hours.map((h) => h?.open ?? 24 * 60));
  const close0 = Math.max(...data.space.hours.map((h) => h?.close ?? 0));
  const slots: number[] = [];
  for (let m = Math.min(open0, 8 * 60); m <= Math.max(close0, 21 * 60); m += 30)
    slots.push(m);
  const set = (patch: Partial<ProStudySettings>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.seats > 0 && draft.toMinute > draft.fromMinute;

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Reglas del sitio para estudiar"
      description="Los estudiantes las ven antes de venir. Así nadie se queda cuatro horas con un café."
      footer={
        <>
          {draft.enabled ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                if (
                  await save("study.disable", (o) => ({
                    ...o,
                    study: { ...draft, enabled: false },
                  }))
                ) {
                  toast.success("Sitio para estudiar pausado");
                  onClose();
                }
              }}
            >
              Pausar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={pending || !valid}
            onClick={async () => {
              if (
                !(await save("study.save", (o) => ({
                  ...o,
                  study: {
                    ...draft,
                    enabled: true,
                    occupied: Math.min(draft.occupied, draft.seats),
                  },
                })))
              )
                return;
              toast.success(
                "Reglas guardadas",
                `${plural(draft.seats, "sitio", "sitios")} de ${minutesToLabel(draft.fromMinute)} a ${minutesToLabel(draft.toMinute)}.`,
              );
              onClose();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Sitios">
            <Stepper
              label="Sitios"
              value={draft.seats}
              min={1}
              max={80}
              onChange={(v) => set({ seats: v })}
            />
          </FormField>
          <FormField label="Enchufes">
            <Stepper
              label="Enchufes"
              value={draft.plugs}
              min={0}
              max={80}
              onChange={(v) => set({ plugs: v })}
            />
          </FormField>
        </div>
        <FormField label="Wifi para clientes">
          <ChoiceChips
            value={draft.wifi ? "si" : "no"}
            onChange={(v) => set({ wifi: v === "si" })}
            options={[
              { value: "si", label: "Sí" },
              { value: "no", label: "No" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Desde" htmlFor="st-from">
            <select
              id="st-from"
              value={draft.fromMinute}
              onChange={(e) => set({ fromMinute: Number(e.target.value) })}
              className="h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm"
            >
              {slots.map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Hasta" htmlFor="st-to">
            <select
              id="st-to"
              value={draft.toMinute}
              onChange={(e) => set({ toMinute: Number(e.target.value) })}
              className="h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm"
            >
              {slots.map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField
          label="Consumición"
          hint="Una cada dos horas es lo que mejor funciona en tardes de exámenes."
        >
          <ChoiceChips
            value={draft.rule}
            onChange={(v) => set({ rule: v })}
            options={(["none", "one", "every2h"] as const).map((r) => ({
              value: r,
              label: STUDY_RULE_LABEL[r],
            }))}
          />
        </FormField>
        <FormField
          label="Días sin portátiles"
          hint={
            draft.noLaptopDays.length
              ? `Sin portátiles el ${draft.noLaptopDays.map((d) => WEEKDAY_LONG[d]).join(", ")}.`
              : "Portátiles bienvenidos todos los días."
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((label, day) => {
              const on = draft.noLaptopDays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Sin portátiles el ${WEEKDAY_LONG[day]}`}
                  onClick={() =>
                    set({
                      noLaptopDays: on
                        ? draft.noLaptopDays.filter((d) => d !== day)
                        : [...draft.noLaptopDays, day].sort(),
                    })
                  }
                  className={cn(
                    "h-10 w-10 rounded-xl border text-sm font-semibold transition-colors",
                    on
                      ? "border-violet bg-violet-50 text-violet-deep"
                      : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Vitrina del día y sobras                                            */
/* ------------------------------------------------------------------ */

export function ShowcasePanel({ onOffer }: { onOffer: (preset: OfferPreset) => void }) {
  const { data, now } = usePro();
  const { ops, saveAll } = useTablesOps();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const hours = data.space.hours[weekdayIndex(today)];
  const rows = showcaseToday(ops, data.menu, today);
  const late = leftoversWindow(ops, hours, nowMin);
  const units = rows.reduce((a, r) => a + (r.item.available ? r.left : 0), 0);
  const soldLate = rows.reduce((a, r) => a + r.soldLate, 0);
  const offer = late?.active ? leftoversOffer(rows, late, nowMin) : null;

  // Agotar quita el producto de la carta y del QR; reponer lo devuelve.
  const setLeft = (menuItemId: string, left: number) =>
    saveAll("showcase.set", (d, o) => ({
      ...d,
      tablesOps: setShowcaseItem(o, today, menuItemId, left),
      menu: d.menu.map((m) =>
        m.id === menuItemId ? { ...m, available: left > 0 } : m,
      ),
    }));

  const sell = async (menuItemId: string) => {
    const item = data.menu.find((m) => m.id === menuItemId);
    if (!item) return;
    const ok = await saveAll("showcase.leftover", (d, o) => {
      const next = sellLeftovers(o, {
        id: localId("w"),
        date: today,
        at: now.toISOString(),
        item,
        qty: 1,
      });
      const row = next.showcase?.items.find((r) => r.menuItemId === item.id);
      return {
        ...d,
        tablesOps: next,
        menu: row && row.left === 0
          ? d.menu.map((m) => (m.id === item.id ? { ...m, available: false } : m))
          : d.menu,
      };
    });
    if (ok) toast.success("Sobra vendida", `${item.name}. Queda apuntada en tu plan contra el desperdicio.`);
  };

  return (
    <Panel
      title="Vitrina de hoy"
      description={
        rows.length
          ? `${plural(units, "unidad", "unidades")} a la vista. Agotar lo quita al momento de la carta y del QR.`
          : "Lo que cambia cada día: tartas, bollería y bocadillos."
      }
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Añadir
        </Button>
      }
      flush
    >
      {rows.length ? (
        <RowList>
          {rows.map(({ item, left }) => (
            <div
              key={item.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5",
                !item.available && "bg-bg-secondary/60",
              )}
            >
              <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-semibold",
                    !item.available && "text-text-muted line-through",
                  )}
                >
                  {item.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span className="tabular">{money(item.priceCents)}</span>
                  <AllergenCodes list={item.allergens} />
                </span>
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Stepper
                  label={`Quedan de ${item.name}`}
                  value={item.available ? left : 0}
                  min={0}
                  max={99}
                  onChange={(v) => void setLeft(item.id, v)}
                />
                {late?.active && item.available && left > 0 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10"
                    onClick={() => void sell(item.id)}
                  >
                    Vendida
                  </Button>
                ) : (
                  <button
                    type="button"
                    aria-pressed={!item.available}
                    onClick={() => void setLeft(item.id, item.available ? 0 : 1)}
                    className={cn(
                      "h-10 w-[5.6rem] shrink-0 rounded-xl border text-xs font-semibold transition-colors",
                      item.available
                        ? "border-border text-text-secondary hover:border-text-primary/25"
                        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
                    )}
                  >
                    {item.available ? "Agotar" : "Agotado"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </RowList>
      ) : (
        <Empty
          icon={Cake}
          title="Pon lo que ha llegado hoy"
          body="Cuántas unidades hay de cada cosa. Cuando se acabe, un toque y desaparece del QR y de tu ficha."
          action={
            <Button variant="dark" onClick={() => setAdding(true)}>
              Preparar la vitrina
            </Button>
          }
        />
      )}

      {late ? (
        <div className="flex flex-col gap-3 border-t border-border-light px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <Recycle className="hidden h-4 w-4 shrink-0 text-violet sm:block" strokeWidth={1.9} />
          <p className="min-w-0 flex-1 text-sm">
            {late.active ? (
              <>
                <span className="font-semibold">
                  Sobras hasta las {minutesToLabel(late.until)}.
                </span>{" "}
                <span className="text-text-muted">
                  {soldLate
                    ? `Hoy ya has colocado ${plural(soldLate, "unidad", "unidades")}.`
                    : "Lo que quede, a mitad de precio para los estudiantes de al lado."}
                </span>
              </>
            ) : (
              <span className="text-text-muted">
                A partir de las {minutesToLabel(late.from)} podrás ofrecer
                lo que quede a mitad de precio.
              </span>
            )}
          </p>
          {offer ? (
            <Button
              variant="dark"
              className="h-10 shrink-0"
              onClick={() => onOffer(offer)}
            >
              Ofrecer lo que queda
            </Button>
          ) : null}
        </div>
      ) : null}

      <ShowcaseDrawer open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
}

function ShowcaseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, saveAll, pending } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [hour, setHour] = React.useState<string>("none");

  React.useEffect(() => {
    if (!open || !ops) return;
    const rows = showcaseToday(ops, data.menu, today);
    setQty(Object.fromEntries(rows.map((r) => [r.item.id, r.left])));
    setHour(ops.leftoversFrom === undefined ? "none" : String(ops.leftoversFrom));
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!ops) return null;
  const candidates = showcaseCandidates(data.menu);
  const current = showcaseToday(ops, data.menu, today).map((r) => r.item.id);

  const submit = async () => {
    // Lo que tiene unidades entra en la vitrina y en la carta; lo que ya
    // estaba y se deja a cero queda como agotado.
    const touched = candidates.filter(
      (item) => (qty[item.id] ?? 0) > 0 || current.includes(item.id),
    );
    const ok = await saveAll("showcase.save", (d, o) => {
      let next = o;
      for (const item of touched)
        next = setShowcaseItem(next, today, item.id, qty[item.id] ?? 0);
      return {
        ...d,
        tablesOps: {
          ...next,
          leftoversFrom: hour === "none" ? undefined : Number(hour),
        },
        menu: d.menu.map((m) =>
          touched.some((t) => t.id === m.id)
            ? { ...m, available: (qty[m.id] ?? 0) > 0 }
            : m,
        ),
      };
    });
    if (!ok) return;
    toast.success(
      "Vitrina lista",
      "Tus clientes ven lo que hay hoy en la carta y en el QR.",
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Vitrina de hoy"
      description="Cuántas unidades han llegado de cada cosa. Los alérgenos vienen de tu carta."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" disabled={pending} onClick={submit}>
            Guardar vitrina
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {candidates.length ? (
          <ul className="divide-y divide-border-light rounded-2xl border border-border">
            {candidates.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <AllergenCodes list={item.allergens} />
                </span>
                <Stepper
                  label={`Unidades de ${item.name}`}
                  value={qty[item.id] ?? 0}
                  min={0}
                  max={99}
                  onChange={(v) => setQty((q) => ({ ...q, [item.id]: v }))}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">
            Crea en la carta tus dulces, bollería y bocadillos y aparecerán aquí.
          </p>
        )}
        <FormField
          label="Sobras de última hora desde"
          hint="Desde esa hora, Hoy te propone ofrecer lo que quede hasta el cierre."
        >
          <ChoiceChips
            value={hour}
            onChange={setHour}
            options={[
              { value: String(17 * 60), label: "17:00" },
              { value: String(18 * 60), label: "18:00" },
              { value: String(19 * 60), label: "19:00" },
              { value: "none", label: "No ofrecer" },
            ]}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Pedidos para recoger                                                */
/* ------------------------------------------------------------------ */

export function OrdersMini() {
  const { spaceId, now, vertical } = usePro();
  const { ops } = useTablesOps();
  if (!ops || !vertical.nav.some((n) => n.id === "pedidos")) return null;
  const today = localDate(now);
  const open = ordersOn(ops, today, "pickup").filter(
    (o) => o.status !== "collected" && o.status !== "cancelled",
  );
  const remind = ordersToRemind(ops, today);
  if (!open.length && !remind.length) return null;
  return (
    <Panel
      title="Pedidos para recoger"
      description={
        remind.length
          ? `${plural(remind.length, "encargo recoge", "encargos recogen")} mañana: recuérdaselo hoy.`
          : undefined
      }
      action={
        <Link
          href={sectionHref(spaceId, "pedidos")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          Pedidos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      {open.length ? (
        <RowList>
          {open.slice(0, 4).map((o) => (
            <Link
              key={o.id}
              href={sectionHref(spaceId, "pedidos")}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-secondary sm:px-5"
            >
              <span className="w-12 shrink-0 text-sm font-bold tabular">
                {time(o.pickupAt)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{o.clientName}</span>{" "}
                <span className="text-text-muted">
                  · {o.lines.map((l) => `${l.qty} ${l.name}`).join(", ")}
                </span>
              </span>
              <Pill tone={o.status === "ready" ? "success" : "violet"}>
                {o.status === "ready" ? "Listo" : o.status === "preparing" ? "Preparando" : "Nuevo"}
              </Pill>
            </Link>
          ))}
        </RowList>
      ) : (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted sm:px-5">
          <ShoppingBag className="h-4 w-4" strokeWidth={1.9} /> Nada por
          preparar ahora.
        </p>
      )}
    </Panel>
  );
}
