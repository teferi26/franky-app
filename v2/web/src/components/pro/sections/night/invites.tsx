"use client";

import * as React from "react";
import { Download, GlassWater, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProInvite, ProInviteReason } from "@/lib/pro/night-types";
import { addDays, money, time } from "@/lib/pro/format";
import { focusEvent, nightOf } from "@/lib/pro/night";
import { eventOfNight, nightTitle } from "@/lib/pro/night-ops";
import {
  DEFAULT_DRINK_CENTS,
  INVITE_CAP_CHOICES,
  INVITE_REASONS,
  INVITE_REASON_ORDER,
  addInvite,
  inviteCapLeft,
  inviteRows,
  invitesBetween,
  invitesByPerson,
  invitesByReason,
  invitesOfNight,
  inviteTotals,
  invitableItems,
  removeInvite,
} from "@/lib/pro/night-invites";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, Empty, FormField, Meter, Panel, Pill, RowList, Tip, inputClass } from "../../kit";
import { SignerChips, defaultSigner, downloadCsv, useNightOps } from "./ops-ui";

/* ------------------------------------------------------------------ */
/* Vista de invitaciones (pestaña de Cierre)                           */
/* ------------------------------------------------------------------ */

/**
 * Invitaciones con nombre: las de esta noche arriba, quién invita más en los
 * últimos 30 días y el cupo por persona. Cada copa regalada queda apuntada.
 */
export function InvitesView({ onAdd }: { onAdd: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const night = nightOf(now);
  // Antes de abrir, lo útil es la última noche con invitaciones.
  const latest = [...new Set((ops.invites ?? []).map((i) => i.night))].sort((a, b) => b.localeCompare(a))[0];
  const shown = invitesOfNight(ops, night).length || !latest ? night : latest;
  const list = invitesOfNight(ops, shown);
  const totals = inviteTotals(list);
  const cap = ops.settings.invitesPerPerson ?? null;
  const byPerson = invitesByPerson(list, cap);
  const month = invitesBetween(ops, addDays(night, -30), night);
  const monthTotals = inviteTotals(month);
  const monthPeople = invitesByPerson(month);
  const reasons = invitesByReason(month);
  const maxDrinks = Math.max(1, ...monthPeople.map((r) => r.drinks));

  // En un espacio real sin estas tablas `update` devuelve false: no se avisa de nada.
  const setCap = async (value: number | null) => {
    if (!(await setOps("invites.cap", (o) => ({ ...o, settings: { ...o.settings, invitesPerPerson: value } })))) return;
    toast.success(value === null ? "Sin cupo de invitaciones" : `Cupo de ${value} copas por persona y noche`);
  };

  const remove = async (i: ProInvite) => {
    if (!(await setOps("invites.delete", (o) => removeInvite(o, i.id)))) return;
    toast.success("Invitación borrada", `${i.drinks} ${i.drinks === 1 ? "copa" : "copas"} a ${i.to}.`);
  };

  const exportMonth = () => {
    const m = night.slice(0, 7);
    const rows = inviteRows(ops, m);
    if (rows.length <= 1) {
      toast.info("Este mes aún no hay invitaciones", "Cuando apuntes la primera saldrá en el CSV.");
      return;
    }
    downloadCsv(`invitaciones-${data.space.slug}-${m}.csv`, rows);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel
          title={shown === night ? "Esta noche" : `Noche del ${nightTitle(shown).toLowerCase()}`}
          description={
            totals.count
              ? `${totals.drinks} ${totals.drinks === 1 ? "copa invitada" : "copas invitadas"}, ${money(totals.cents)} de carta.`
              : "Nadie ha invitado todavía."
          }
          action={
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" /> Apuntar
            </Button>
          }
          flush
        >
          {list.length ? (
            <RowList>
              {list.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="w-11 shrink-0 text-xs font-semibold text-text-muted tabular">{time(i.at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{i.to}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {i.by.split(" ")[0]} invita · {INVITE_REASONS[i.reason].label}
                      {i.itemName ? ` · ${i.drinks} x ${i.itemName}` : ` · ${i.drinks} ${i.drinks === 1 ? "copa" : "copas"}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-heading text-sm font-bold tabular">{money(i.cents)}</span>
                  <button
                    type="button"
                    aria-label={`Borrar la invitación a ${i.to}`}
                    onClick={() => void remove(i)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </button>
                </div>
              ))}
            </RowList>
          ) : (
            <Empty
              icon={GlassWater}
              title="Sin invitaciones apuntadas"
              body="Cuando alguien del equipo invite a una copa, apúntalo con a quién y por qué. Al cerrar la caja ya estará sumado."
              action={
                <Button variant="dark" onClick={onAdd}>
                  <Plus className="h-4 w-4" /> Apuntar invitación
                </Button>
              }
            />
          )}
          {byPerson.length ? (
            <div className="flex flex-wrap gap-2 border-t border-border-light px-4 py-3 sm:px-5">
              {byPerson.map((r) => (
                <Pill key={r.by} tone={r.over ? "warning" : "neutral"}>
                  {r.by.split(" ")[0]}: {r.drinks}
                  {cap !== null ? ` de ${cap}` : ""}
                </Pill>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Quién invita más"
          description={
            monthTotals.count
              ? `En 30 días, ${monthTotals.drinks} copas regaladas: ${money(monthTotals.cents, { round: true })} de carta.`
              : "En cuanto haya invitaciones verás aquí a cada persona del equipo."
          }
          action={
            <Button variant="ghost" size="sm" onClick={exportMonth}>
              <Download className="h-3.5 w-3.5" /> CSV del mes
            </Button>
          }
        >
          {monthPeople.length ? (
            <ul className="flex flex-col gap-3">
              {monthPeople.map((r) => (
                <li key={r.by}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-semibold">{r.by}</span>
                    <span className="shrink-0 text-text-muted tabular">
                      {r.drinks} copas · {money(r.cents, { round: true })}
                    </span>
                  </div>
                  <Meter value={r.drinks} max={maxDrinks} className="mt-1.5" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Sin invitaciones en los últimos 30 días.</p>
          )}
          {reasons.length ? (
            <p className="mt-4 text-xs text-text-muted">
              Por motivo: {reasons.map((r) => `${r.label.toLowerCase()} ${r.drinks}`).join(", ")}.
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Cupo por persona" description="Copas que puede invitar cada persona del equipo en una noche.">
          <ChoiceChips
            value={cap === null ? "none" : String(cap)}
            onChange={(v) => void setCap(v === "none" ? null : Number(v))}
            options={INVITE_CAP_CHOICES.map((c) => ({ value: c === null ? "none" : String(c), label: c === null ? "Sin cupo" : String(c) }))}
          />
          <p className="mt-3 text-xs text-text-muted">
            Quien pase su cupo sale en ámbar aquí y en el cierre. No bloquea: a veces invitar es lo correcto.
          </p>
        </Panel>
        <Tip title="Por qué con nombre">
          Una copa regalada sin apuntar es la fuga de barra más difícil de ver. Con quién, a quién y por qué, el cierre cuadra y sabes qué invitaciones traen gente de vuelta.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Apuntar una invitación                                              */
/* ------------------------------------------------------------------ */

const QUICK_TO = ["Equipo al cerrar", "DJ", "Cumpleaños", "Cliente habitual"];

export function InviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const items = invitableItems(data.menu);
  const [by, setBy] = React.useState("");
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState<ProInviteReason>("habitual");
  const [itemId, setItemId] = React.useState<string>("other");
  const [drinks, setDrinks] = React.useState(1);

  React.useEffect(() => {
    if (!open) return;
    setBy(defaultSigner(data));
    setTo("");
    setReason("habitual");
    setItemId(items[0]?.id ?? "other");
    setDrinks(1);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const night = nightOf(now);
  const item = items.find((m) => m.id === itemId);
  const unit = item?.priceCents ?? DEFAULT_DRINK_CENTS;
  const cents = unit * drinks;
  const left = by ? inviteCapLeft(ops, night, by) : null;
  const over = left !== null && drinks > left;
  const valid = Boolean(by.trim()) && to.trim().length > 1 && drinks > 0;

  const save = async () => {
    const ev = eventOfNight(data, night) ?? focusEvent(data, now);
    const invite: ProInvite = {
      id: localId("inv"),
      night,
      eventId: ev?.date === night ? ev.id : undefined,
      at: new Date().toISOString(),
      by: by.trim(),
      to: to.trim(),
      reason,
      drinks,
      cents,
      itemName: item?.name,
    };
    if (!(await setOps("invites.create", (o) => addInvite(o, invite)))) return;
    toast.success(
      `${drinks} ${drinks === 1 ? "copa" : "copas"} a ${invite.to}`,
      over ? `${by.split(" ")[0]} ha pasado su cupo de esta noche.` : `Apuntado a nombre de ${by.split(" ")[0]}.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Apuntar invitación"
      description={`Noche del ${nightTitle(night).toLowerCase()}. Quién invita, a quién y por qué.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={() => void save()} disabled={!valid}>
            Apuntar · {money(cents)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Quién invita">
          <SignerChips value={by} onChange={setBy} />
        </FormField>
        <FormField label="A quién" htmlFor="inv-to">
          <input
            id="inv-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Nombre, mesa o grupo"
            className={inputClass}
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {QUICK_TO.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setTo(q)}
                className="min-h-10 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-text-primary/25 hover:text-text-primary"
              >
                {q}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Motivo">
          <ChoiceChips
            value={reason}
            onChange={setReason}
            options={INVITE_REASON_ORDER.map((r) => ({ value: r, label: INVITE_REASONS[r].label }))}
          />
        </FormField>
        <FormField label="Qué">
          <ChoiceChips
            value={itemId}
            onChange={setItemId}
            options={[
              ...items.map((m) => ({ value: m.id, label: m.name, hint: money(m.priceCents) })),
              { value: "other", label: "Otra copa", hint: money(DEFAULT_DRINK_CENTS) },
            ]}
          />
        </FormField>
        <FormField label="Cuántas">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Una menos"
              onClick={() => setDrinks((n) => Math.max(1, n - 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
            >
              <Minus className="h-4 w-4" strokeWidth={1.9} />
            </button>
            <span className="w-10 text-center font-heading text-2xl font-extrabold tabular">{drinks}</span>
            <button
              type="button"
              aria-label="Una más"
              onClick={() => setDrinks((n) => Math.min(20, n + 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
            >
              <Plus className="h-4 w-4" strokeWidth={1.9} />
            </button>
            <span className="ml-auto text-sm text-text-muted tabular">{money(cents)} de carta</span>
          </div>
        </FormField>
        {left !== null ? (
          <p
            className={cn(
              "rounded-xl px-3 py-2.5 text-sm",
              over ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "bg-bg-secondary text-text-secondary",
            )}
          >
            {over
              ? `${by.split(" ")[0]} solo tiene ${left} ${left === 1 ? "copa" : "copas"} de cupo esta noche. Se apunta igual y lo verás en el cierre.`
              : `A ${by.split(" ")[0]} le quedan ${left} ${left === 1 ? "copa" : "copas"} de cupo esta noche.`}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/** Tarjeta de Hoy: invitaciones de la noche en curso y un toque para apuntar otra. */
export function InvitesTonightCard() {
  const { now } = usePro();
  const { ops } = useNightOps();
  const [adding, setAdding] = React.useState(false);
  const list = invitesOfNight(ops, nightOf(now));
  const t = inviteTotals(list);
  const top = invitesByPerson(list, ops.settings.invitesPerPerson ?? null);
  const over = top.filter((r) => r.over);
  return (
    <Panel
      title="Invitaciones de la noche"
      description={t.count ? `${t.drinks} copas, ${money(t.cents)} de carta.` : "Apunta cada copa regalada con su nombre."}
      action={
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Apuntar
        </Button>
      }
    >
      {top.length ? (
        <p className="text-sm text-text-secondary">
          {top
            .slice(0, 3)
            .map((r) => `${r.by.split(" ")[0]} ${r.drinks}`)
            .join(", ")}
          {over.length ? (
            <span className="text-amber-700 dark:text-amber-400">
              {" "}
              · {over.map((r) => r.by.split(" ")[0]).join(" y ")} {over.length === 1 ? "ha pasado" : "han pasado"} el cupo
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-text-muted">Aún no se ha invitado a nada esta noche.</p>
      )}
      <InviteDrawer open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
}
