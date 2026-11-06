"use client";

import * as React from "react";
import { BadgeCheck, KeyRound, MessageCircle, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProProperty } from "@/lib/pro/types";
import type { ProEnergyLetter, ProPropertyCompliance } from "@/lib/pro/housing-types";
import { addDays, localDate, weekdayIndex } from "@/lib/pro/format";
import { currentTenants, shortDate } from "@/lib/pro/housing";
import {
  DEFAULT_RULES,
  ENERGY_LETTERS,
  cleaningRota,
  complianceGaps,
  housingOpsOf,
  keysFor,
  patchProperty,
  whatsappHref,
  withOps,
} from "@/lib/pro/housing-ops";
import { cn } from "@/lib/utils";
import { FormField, Pill, inputClass, textareaClass } from "../../kit";
import { selectClass } from "./shared";

/** Letra energética con su color de etiqueta: de verde (A) a rojo (G). */
const LETTER_TONE: Record<ProEnergyLetter, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-emerald-500 text-white",
  C: "bg-lime-500 text-white",
  D: "bg-amber-400 text-text-primary",
  E: "bg-amber-500 text-white",
  F: "bg-orange-500 text-white",
  G: "bg-rose-600 text-white",
};

export function EnergyBadge({ letter, className }: { letter?: ProEnergyLetter; className?: string }) {
  if (!letter) return null;
  return (
    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold", LETTER_TONE[letter], className)} title={`Certificado energético ${letter}`}>
      {letter}
    </span>
  );
}

/**
 * NRUA, letra energética, catastro, seguro e IBI de un piso. Sin NRUA ni letra
 * no se puede publicar: la ficha pública enseña la letra.
 */
export function ComplianceBox({ property }: { property: ProProperty }) {
  const { update } = usePro();
  const toast = useToast();
  const c = property.compliance ?? {};
  const [draft, setDraft] = React.useState<ProPropertyCompliance>(c);
  const gaps = complianceGaps({ ...property, compliance: draft });
  const dirty = JSON.stringify(draft) !== JSON.stringify(c);
  const set = (fields: Partial<ProPropertyCompliance>) => setDraft((d) => ({ ...d, ...fields }));

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Datos del piso para anunciarlo</p>
        {gaps.length ? <Pill tone="warning">Falta {gaps.join(" y ")}</Pill> : <Pill tone="success"><BadgeCheck className="h-3 w-3" /> Completo</Pill>}
      </div>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <FormField label="NRUA" htmlFor="cp-nrua" hint="Registro único para alquilar por temporada o por habitaciones.">
          <input id="cp-nrua" value={draft.nrua ?? ""} onChange={(e) => set({ nrua: e.target.value.toUpperCase() || undefined })} className={inputClass} placeholder="ESFCTU..." />
        </FormField>
        <FormField label="Referencia catastral" htmlFor="cp-cat">
          <input id="cp-cat" value={draft.cadastralRef ?? ""} onChange={(e) => set({ cadastralRef: e.target.value.toUpperCase() || undefined })} className={inputClass} placeholder="20 caracteres" maxLength={20} />
        </FormField>
      </div>
      <FormField label="Letra energética" className="mt-3">
        <div className="flex flex-wrap gap-1.5">
          {ENERGY_LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={draft.energyLetter === l}
              onClick={() => set({ energyLetter: l })}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-bold transition-colors",
                draft.energyLetter === l ? cn("border-transparent", LETTER_TONE[l]) : "border-border text-text-secondary hover:border-text-primary/25",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </FormField>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <FormField label="Certificado hasta" htmlFor="cp-exp">
          <input id="cp-exp" type="date" value={draft.energyExpiresAt ?? ""} onChange={(e) => set({ energyExpiresAt: e.target.value || undefined })} className={cn(inputClass, "px-2")} />
        </FormField>
        <FormField label="Seguro renueva" htmlFor="cp-ins">
          <input id="cp-ins" type="date" value={draft.insuranceRenewsAt ?? ""} onChange={(e) => set({ insuranceRenewsAt: e.target.value || undefined })} className={cn(inputClass, "px-2")} />
        </FormField>
        <FormField label="IBI" htmlFor="cp-ibi">
          <input id="cp-ibi" type="date" value={draft.ibiDueAt ?? ""} onChange={(e) => set({ ibiDueAt: e.target.value || undefined })} className={cn(inputClass, "px-2")} />
        </FormField>
      </div>
      {dirty ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            update("property.compliance", (d) => patchProperty(d, property.id, (p) => ({ ...p, compliance: draft })));
            toast.success("Datos guardados", gaps.length ? `Para publicarlo aún falta ${gaps.join(" y ")}.` : "Te avisamos antes de que caduque el certificado o renueve el seguro.");
          }}
        >
          Guardar datos
        </Button>
      ) : null}
    </div>
  );
}

/** Normas de la casa y turno de limpieza rotativo con los inquilinos de ahora. */
export function RulesBox({ property }: { property: ProProperty }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const rules = property.rules?.length ? property.rules : DEFAULT_RULES;
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(rules.join("\n"));
  const today = localDate(now);
  const monday = addDays(today, -weekdayIndex(today));
  const names = currentTenants(data, now)
    .filter((t) => t.propertyId === property.id && t.contractStart.slice(0, 10) <= today)
    .map((t) => t.name.split(" ")[0]);
  const rota = cleaningRota(names, monday, 4);
  const shareText = [
    `Normas del ${property.title}:`,
    ...rules.map((r) => `- ${r}`),
    "",
    rota[0] ? `Limpieza esta semana: ${rota[0].tasks.map((t) => `${t.zone.toLowerCase()}, ${t.name}`).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Normas de la casa</p>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancelar" : "Editar"}
        </Button>
      </div>
      {editing ? (
        <>
          <textarea aria-label="Normas, una por línea" value={text} onChange={(e) => setText(e.target.value)} className={cn(textareaClass, "mt-2 min-h-[120px]")} />
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              const next = text.split("\n").map((l) => l.trim()).filter(Boolean);
              update("property.rules", (d) => patchProperty(d, property.id, (p) => ({ ...p, rules: next })));
              toast.success("Normas guardadas", "Tus inquilinos las ven en su Franky.");
              setEditing(false);
            }}
          >
            Guardar normas
          </Button>
        </>
      ) : (
        <ul className="mt-1.5 list-disc pl-5 text-sm text-text-secondary">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <p className="eyebrow mb-1.5 mt-4">Turno de limpieza</p>
      {rota.length ? (
        <div className="-mx-1 overflow-x-auto px-1 pro-scroll">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="py-1 pr-2 font-medium">Semana</th>
                {rota[0].tasks.map((t) => (
                  <th key={t.zone} className="py-1 pr-2 font-medium">
                    {t.zone}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rota.map((w, i) => (
                <tr key={w.week} className={cn("border-t border-border-light", i === 0 && "font-semibold")}>
                  <td className="py-1.5 pr-2 tabular">{i === 0 ? "Esta" : shortDate(w.week)}</td>
                  {w.tasks.map((t) => (
                    <td key={t.zone} className="py-1.5 pr-2">
                      {t.name}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Cuando viva alguien en el piso, Franky reparte las zonas por semanas.</p>
      )}
      <Button size="sm" variant="outline" className="mt-3" asChild>
        <a href={whatsappHref(shareText)} target="_blank" rel="noreferrer">
          <MessageCircle className="h-3.5 w-3.5" /> Mandar al grupo del piso
        </a>
      </Button>
    </div>
  );
}

/** Quién tiene cada juego de llaves y desde cuándo. */
export function KeysBox({ property }: { property: ProProperty }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const keys = keysFor(data, property.id);
  const tenants = currentTenants(data, now).filter((t) => t.propertyId === property.id);
  const office = data.staff.length > 1 ? "Oficina" : data.space.owner.firstName;
  const today = localDate(now);
  const staleHolders = keys.filter((k) => k.tenantId && !tenants.some((t) => t.id === k.tenantId));

  const give = (keyId: string, value: string) => {
    const tenant = tenants.find((t) => t.id === value);
    update("keys.move", (d) =>
      withOps(d, (ops) => ({
        ...ops,
        keys: ops.keys.map((k) => (k.id === keyId ? { ...k, tenantId: tenant?.id, holder: tenant?.name ?? office, since: today } : k)),
      })),
    );
    toast.success("Llaves apuntadas", tenant ? `Las tiene ${tenant.name}.` : `Vuelven a ${office.toLowerCase() === "oficina" ? "la oficina" : office}.`);
  };
  const addSet = () => {
    update("keys.add", (d) =>
      withOps(d, (ops) => ({
        ...ops,
        keys: [...ops.keys, { id: localId("k"), propertyId: property.id, label: `Juego ${keys.length + 1}`, holder: office, since: today }],
      })),
    );
  };

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-text-muted" strokeWidth={1.9} /> Llaves
        </p>
        <Button size="sm" variant="ghost" onClick={addSet}>
          <Plus className="h-3.5 w-3.5" /> Juego
        </Button>
      </div>
      {staleHolders.length ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          {staleHolders.map((k) => k.holder).join(", ")} ya no {staleHolders.length === 1 ? "vive" : "viven"} aquí y {staleHolders.length === 1 ? "tiene" : "tienen"} llaves.
        </p>
      ) : null}
      <ul className="mt-2 flex flex-col divide-y divide-border-light">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{k.label}</span>
              <span className="block text-xs text-text-muted">desde el {shortDate(k.since)}</span>
            </span>
            <label className="sr-only" htmlFor={`key-${k.id}`}>
              Quién tiene {k.label}
            </label>
            <select id={`key-${k.id}`} value={k.tenantId ?? ""} onChange={(e) => give(k.id, e.target.value)} className={cn(selectClass, "h-10 w-auto max-w-[12rem]")}>
              <option value="">{office}</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {k.tenantId && !tenants.some((t) => t.id === k.tenantId) ? <option value={k.tenantId}>{k.holder}</option> : null}
            </select>
          </li>
        ))}
        {!keys.length ? <li className="py-2 text-sm text-text-muted">Apunta cada juego para saber siempre quién lo tiene.</li> : null}
      </ul>
    </div>
  );
}

/** De quién es el piso cuando lo gestiona una inmobiliaria: decide en qué liquidación entra. */
export function OwnerField({ property }: { property: ProProperty }) {
  const { data, update } = usePro();
  const toast = useToast();
  const owners = housingOpsOf(data).owners;
  if (!owners.length) return null;
  return (
    <FormField label="Propietario" htmlFor="prop-owner" hint="Sus rentas y gastos entran en su liquidación del mes, en Cuentas.">
      <select
        id="prop-owner"
        value={property.ownerId ?? ""}
        onChange={async (e) => {
          const ownerId = e.target.value || undefined;
          if (!(await update("property.owner", (d) => patchProperty(d, property.id, (p) => ({ ...p, ownerId }))))) return;
          toast.success("Propietario asignado", owners.find((o) => o.id === ownerId)?.name ?? "Sin propietario");
        }}
        className={selectClass}
      >
        <option value="">Sin propietario</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} (honorarios del {Math.round(o.feePct * 100)} %)
          </option>
        ))}
      </select>
    </FormField>
  );
}
