"use client";

import * as React from "react";
import { Camera, Check, KeyRound, MessageCircle, Minus, Plus, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProTenant } from "@/lib/pro/types";
import type { ProInventory, ProInventoryState, ProMoveOut } from "@/lib/pro/housing-types";
import { localDate, money, relative } from "@/lib/pro/format";
import { findRoom, shortDate } from "@/lib/pro/housing";
import {
  INVENTORY_STATE,
  MOVE_OUT_CHECKS,
  RENEWAL_LABEL,
  inventoryChanges,
  inventoryOf,
  keysHeldBy,
  ledgerTotals,
  markMonthPaid,
  monthLabel,
  patchTenant,
  proposedRent,
  receiptFor,
  renewalState,
  renewalText,
  rentLedger,
  rentReminderText,
  settlement,
  whatsappHref,
  type LedgerStatus,
} from "@/lib/pro/housing-ops";
import { moveOutHtml, receiptHtml } from "@/lib/pro/housing-docs";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, FormField, Pill, inputClass } from "../../kit";
import { euros } from "./shared";
import { openPrintable, slugFile } from "./output";

export const LEDGER_PILL: Record<LedgerStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  paid: { label: "Cobrada", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  late: { label: "Con retraso", tone: "danger" },
  unrecorded: { label: "Sin apuntar", tone: "neutral" },
  upcoming: { label: "Por venir", tone: "info" },
};

/** Abre el recibo de un mes para imprimir o guardar en PDF. */
export function usePrintReceipt() {
  const { data, now } = usePro();
  const toast = useToast();
  return (tenant: ProTenant, month: string) => {
    const { property, room } = findRoom(data, tenant.propertyId, tenant.roomId);
    const receipt = receiptFor(data, tenant, month, now);
    const how = openPrintable(receiptHtml(data, tenant, receipt, property, room), slugFile("recibo", tenant.name, month));
    toast.success(how === "opened" ? "Recibo abierto" : "Recibo descargado", how === "opened" ? "Imprímelo o guárdalo en PDF para mandarlo." : "Ábrelo para imprimirlo.");
  };
}

/**
 * Cobros mes a mes de un inquilino: lo pagado, lo pendiente y el recibo de
 * cada mensualidad. Sustituye la hoja de cálculo de cobros.
 */
export function RentLedgerBox({ tenant }: { tenant: ProTenant }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const printReceipt = usePrintReceipt();
  const [showAll, setShowAll] = React.useState(false);
  const ledger = rentLedger(tenant, now);
  const totals = ledgerTotals(ledger);
  const done = ledger.filter((m) => m.status !== "upcoming");
  const upcoming = ledger.filter((m) => m.status === "upcoming");
  const visible = showAll ? done : done.slice(-4);
  const firstName = tenant.name.split(" ")[0];

  const pay = (month: string) => {
    update("tenant.month.paid", (d) => patchTenant(d, tenant.id, (t) => markMonthPaid(t, month, new Date())));
    toast.success("Mensualidad cobrada", `${monthLabel(month, "long")} de ${firstName}, ${money(tenant.rentCents)}.`);
  };

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Cobros</p>
        <p className="text-xs text-text-muted tabular">
          {money(totals.paidCents, { round: true })} cobrados
          {totals.owedCents ? <span className="font-semibold text-rose-700 dark:text-rose-300"> · debe {money(totals.owedCents)}</span> : null}
        </p>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-border-light">
        {visible.map((m) => (
          <li key={m.month} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="capitalize">{monthLabel(m.month, "long")}</span> <span className="text-text-muted tabular">{m.month.slice(0, 4)}</span>
              {m.paidAt ? <span className="block text-xs text-text-muted">Cobrada el {shortDate(localDate(m.paidAt))}</span> : null}
            </span>
            <span className="text-sm tabular">{money(m.amountCents)}</span>
            <Pill tone={LEDGER_PILL[m.status].tone}>{LEDGER_PILL[m.status].label}</Pill>
            {m.status === "paid" ? (
              <button
                type="button"
                onClick={() => printReceipt(tenant, m.month)}
                aria-label={`Recibo de ${monthLabel(m.month, "long")}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary"
              >
                <Printer className="h-4 w-4" strokeWidth={1.9} />
              </button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => pay(m.month)}>
                <Check className="h-3.5 w-3.5" /> Cobrada
              </Button>
            )}
          </li>
        ))}
        {!visible.length ? <li className="py-2 text-sm text-text-muted">Aún no ha empezado su contrato.</li> : null}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {done.length > 4 ? (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ver menos" : `Ver los ${done.length} meses`}
          </Button>
        ) : null}
        {totals.owedCents ? (
          <Button size="sm" variant="outline" asChild>
            <a
              href={whatsappHref(rentReminderText(data, tenant, now))}
              target="_blank"
              rel="noreferrer"
              onClick={() => update("tenant.remind", (d) => patchTenant(d, tenant.id, (t) => ({ ...t, remindedAt: new Date().toISOString() })))}
            >
              <MessageCircle className="h-3.5 w-3.5" /> Recordar por WhatsApp
            </a>
          </Button>
        ) : null}
        {tenant.remindedAt && totals.owedCents ? <span className="text-xs text-text-muted">Recordado {relative(tenant.remindedAt, now.getTime())}</span> : null}
      </div>
      {upcoming.length ? (
        <p className="mt-1 text-xs text-text-muted">
          Quedan {upcoming.length} {upcoming.length === 1 ? "mensualidad" : "mensualidades"} hasta el {shortDate(tenant.contractEnd)}.
        </p>
      ) : null}
    </div>
  );
}

/** Renovación del curso siguiente: renta actual y propuesta en la misma pantalla. */
export function RenewalBox({ tenant }: { tenant: ProTenant }) {
  const { data, update } = usePro();
  const toast = useToast();
  const state = renewalState(tenant);
  const [pctUp, setPctUp] = React.useState("0");
  const [custom, setCustom] = React.useState("");
  const newRent = custom ? euros(custom) : proposedRent(tenant.rentCents, Number(pctUp));
  const firstName = tenant.name.split(" ")[0];

  const send = () => {
    update("tenant.renewal", (d) =>
      patchTenant(d, tenant.id, (t) => ({ ...t, renewalSentAt: new Date().toISOString(), renewal: { sentAt: new Date().toISOString(), newRentCents: newRent } })),
    );
    toast.success("Oferta lista en WhatsApp", `Cuando ${firstName} conteste, márcalo aquí.`);
  };
  const answer = (value: "yes" | "no") => {
    update(`tenant.renewal.${value}`, (d) =>
      patchTenant(d, tenant.id, (t) => ({
        ...t,
        renewal: { sentAt: t.renewal?.sentAt ?? new Date().toISOString(), newRentCents: t.renewal?.newRentCents ?? newRent, answer: value, answeredAt: new Date().toISOString() },
      })),
    );
    toast.success(value === "yes" ? `${firstName} sigue el curso que viene` : `${firstName} no renueva`, value === "yes" ? "Su habitación ya no sale como libre." : "Registra su salida para que Roomie busque sustituto.");
  };

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Curso que viene</p>
        <Pill tone={state === "staying" ? "success" : state === "leaving" ? "warning" : state === "waiting" ? "info" : "neutral"}>{RENEWAL_LABEL[state]}</Pill>
      </div>
      {state === "staying" && tenant.renewal ? (
        <p className="mt-1 text-sm text-text-secondary">
          Renueva por <span className="font-semibold tabular">{money(tenant.renewal.newRentCents)}</span> al mes
          {tenant.renewal.newRentCents !== tenant.rentCents ? ` (ahora ${money(tenant.rentCents)})` : ""}.
        </p>
      ) : state === "leaving" ? (
        <p className="mt-1 text-sm text-text-secondary">No sigue. Su habitación sale como libre desde el {shortDate(tenant.leavingAt ?? tenant.contractEnd)}.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-bg-secondary px-3 py-2">
              <p className="text-xs text-text-muted">Ahora paga</p>
              <p className="font-semibold tabular">{money(tenant.rentCents)}</p>
            </div>
            <div className="rounded-xl bg-violet-50 px-3 py-2">
              <p className="text-xs text-violet-deep">Propuesta</p>
              <p className="font-semibold tabular text-violet-deep">{money(newRent)}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChoiceChips
              value={custom ? "custom" : pctUp}
              onChange={(v) => {
                if (v !== "custom") {
                  setPctUp(v);
                  setCustom("");
                }
              }}
              options={[
                { value: "0", label: "Igual" },
                { value: "2", label: "+2 %" },
                { value: "3", label: "+3 %" },
              ]}
            />
            <input aria-label="Otra renta" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Otra (€)" className={cn(inputClass, "w-28")} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild>
              <a href={whatsappHref(renewalText(data, tenant, newRent))} target="_blank" rel="noreferrer" onClick={send}>
                <MessageCircle className="h-3.5 w-3.5" /> {state === "waiting" ? "Volver a ofrecer" : "Ofrecer renovación"}
              </a>
            </Button>
            {state === "waiting" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => answer("yes")}>
                  Sigue
                </Button>
                <Button size="sm" variant="ghost" onClick={() => answer("no")}>
                  Se va
                </Button>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** Juegos de llaves que tiene el inquilino. */
export function KeysLine({ tenant }: { tenant: ProTenant }) {
  const { data } = usePro();
  const keys = keysHeldBy(data, tenant.id);
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <KeyRound className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.9} />
      {keys.length ? keys.map((k) => k.label).join(", ") : "Sin llaves"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Salida y liquidación de fianza                                      */
/* ------------------------------------------------------------------ */

export type MoveOutDraft = { moveOut: ProMoveOut; inventory: ProInventory };

export function moveOutDraft(tenant: ProTenant, room?: import("@/lib/pro/types").ProRoom): MoveOutDraft {
  return {
    moveOut: tenant.moveOut ?? {
      date: (tenant.leavingAt ?? tenant.contractEnd).slice(0, 10),
      checks: { keys: false, photos: false, meters: false, room: false },
      deductions: [],
    },
    inventory: inventoryOf(tenant, room),
  };
}

const OUT_OPTIONS: { value: ProInventoryState; label: string }[] = (["good", "worn", "damaged", "missing"] as ProInventoryState[]).map((v) => ({
  value: v,
  label: INVENTORY_STATE[v].label,
}));

/**
 * Salida sin discusiones: llaves, fotos, contadores, inventario comparado con
 * la entrada, descuentos y lo que se devuelve. El padre guarda el borrador y
 * cierra la salida desde el pie del panel.
 */
export function MoveOutFlow({ tenant, draft, onChange }: { tenant: ProTenant; draft: MoveOutDraft; onChange: (d: MoveOutDraft) => void }) {
  const { data, now } = usePro();
  const { property, room } = findRoom(data, tenant.propertyId, tenant.roomId);
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const keys = keysHeldBy(data, tenant.id);
  const changes = inventoryChanges(draft.inventory);
  const owed = ledgerTotals(rentLedger(tenant, now)).owedCents;
  const s = settlement(tenant, draft.moveOut);
  const { moveOut, inventory } = draft;
  const setMoveOut = (fields: Partial<ProMoveOut>) => onChange({ ...draft, moveOut: { ...moveOut, ...fields } });
  const addDeduction = (label: string, cents: number) => {
    if (!label.trim() || cents <= 0) return;
    setMoveOut({ deductions: [...moveOut.deductions, { id: localId("dd"), label: label.trim(), amountCents: cents }] });
  };
  const has = (label: string) => moveOut.deductions.some((d) => d.label === label);

  return (
    <div className="flex flex-col gap-4">
      <FormField label="Último día en el piso" htmlFor="mo-date">
        <input id="mo-date" type="date" value={moveOut.date} onChange={(e) => setMoveOut({ date: e.target.value })} className={inputClass} />
      </FormField>

      {keys.length ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
          Tiene {keys.length === 1 ? "1 juego de llaves" : `${keys.length} juegos de llaves`} ({keys.map((k) => k.label).join(", ")}). Al cerrar la salida pasan a {data.staff.length > 1 ? "la oficina" : "ti"}.
        </p>
      ) : null}

      <div>
        <p className="eyebrow mb-1.5">Antes de devolver la fianza</p>
        <ul className="flex flex-col gap-1.5">
          {MOVE_OUT_CHECKS.map((c) => (
            <li key={c.id}>
              <label className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm", moveOut.checks[c.id] ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-border")}>
                <input
                  type="checkbox"
                  checked={moveOut.checks[c.id]}
                  onChange={(e) => setMoveOut({ checks: { ...moveOut.checks, [c.id]: e.target.checked } })}
                  className="h-4 w-4 accent-[var(--color-violet)]"
                />
                {c.label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="eyebrow">Inventario: entrada y salida</p>
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Camera className="h-3.5 w-3.5" strokeWidth={1.9} /> {inventory.inPhotos} fotos al entrar
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
          {inventory.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 px-3 py-2.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{item.label}</span>
                <span className="text-xs text-text-muted">Al entrar: {INVENTORY_STATE[item.in].label.toLowerCase()}</span>
              </span>
              <div role="group" aria-label={`${item.label} al salir`} className="flex flex-wrap gap-1">
                {OUT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={item.out === o.value}
                    onClick={() => onChange({ ...draft, inventory: { ...inventory, items: inventory.items.map((x) => (x.id === item.id ? { ...x, out: o.value } : x)) } })}
                    className={cn(
                      "h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                      item.out === o.value
                        ? o.value === "damaged" || o.value === "missing"
                          ? "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "border-text-primary bg-text-primary text-bg-primary"
                        : "border-border text-text-secondary hover:border-text-primary/25",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-sm">
          Fotos de salida
          <input
            type="number"
            min={0}
            max={60}
            value={inventory.outPhotos ?? 0}
            onChange={(e) => onChange({ ...draft, inventory: { ...inventory, outPhotos: Math.max(0, Number(e.target.value) || 0) } })}
            className={cn(inputClass, "w-20")}
          />
        </label>
      </div>

      {changes.length || owed ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-50/50 p-3 dark:bg-amber-950/20">
          <p className="text-sm font-semibold">Qué ha cambiado</p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
            {changes.map(({ item, from, to }) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {item.label}: {from.toLowerCase()} al entrar, {to.toLowerCase()} al salir
                </span>
                {!has(item.label) ? (
                  <Button size="sm" variant="ghost" onClick={() => { setConcept(item.label); setAmount(""); }}>
                    Descontar
                  </Button>
                ) : null}
              </li>
            ))}
            {owed ? (
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span>Mensualidades sin pagar: {money(owed)}</span>
                {!has("Rentas sin pagar") ? (
                  <Button size="sm" variant="ghost" onClick={() => addDeduction("Rentas sin pagar", owed)}>
                    Descontar
                  </Button>
                ) : null}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="eyebrow mb-1.5">Descuentos de la fianza</p>
        {moveOut.deductions.length ? (
          <ul className="mb-2 flex flex-col gap-1.5">
            {moveOut.deductions.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <span className="tabular">-{money(d.amountCents)}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${d.label}`}
                  onClick={() => setMoveOut({ deductions: moveOut.deductions.filter((x) => x.id !== d.id) })}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-sm text-text-muted">Sin descuentos: se devuelve entera.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Concepto" htmlFor="mo-concept" className="min-w-0 flex-1">
            <input id="mo-concept" value={concept} onChange={(e) => setConcept(e.target.value)} className={inputClass} placeholder="Silla rota" />
          </FormField>
          <FormField label="Importe (€)" htmlFor="mo-amount" className="w-28">
            <input id="mo-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </FormField>
          <Button
            variant="outline"
            onClick={() => {
              addDeduction(concept, euros(amount));
              setConcept("");
              setAmount("");
            }}
            disabled={!concept.trim() || euros(amount) <= 0}
          >
            <Plus className="h-4 w-4" /> Añadir
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm">
        <Detail label="Fianza">{money(s.depositCents)}</Detail>
        <Detail label="Descuentos">-{money(s.deductionsCents)}</Detail>
        <Detail label="A devolver">
          <span className="font-heading text-lg font-extrabold tabular">{money(s.returnCents)}</span>
        </Detail>
      </div>
      <Button
        variant="outline"
        className="w-fit"
        onClick={() => openPrintable(moveOutHtml(data, { ...tenant, inventory }, moveOut, property, room), slugFile("liquidacion-fianza", tenant.name))}
      >
        <Printer className="h-4 w-4" /> Resumen para {tenant.name.split(" ")[0]}
      </Button>
    </div>
  );
}
