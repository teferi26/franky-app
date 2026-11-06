/**
 * RRPP más allá del ranking: objetivos por noche con aviso de quién va flojo
 * y el panel que ve cada RRPP con su propio acceso (su enlace, su lista, sus
 * escaneados, lo ganado y lo que le falta para el siguiente tramo).
 *
 * Funciones puras sobre `ProData`: la web y la app nativa cuentan igual.
 */
import type { ProData, ProEvent, ProPromoter } from "./types";
import { localDate, money } from "./format";
import {
  eventPhase,
  focusEvent,
  pendingSettlement,
  promoterLink,
  promoterNights,
  ruleLabel,
  upcomingEvents,
  type PromoterNight,
} from "./night";
import { promoterCapState, promoterCutoffAt } from "./night-ops";

/** Opciones de objetivo por noche que se ofrecen en pantalla. */
export const TARGET_CHOICES = [null, 15, 25, 40, 60] as const;

export type TargetStatus = "none" | "ahead" | "on_track" | "behind" | "done" | "missed";

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = {
  none: "Sin objetivo",
  ahead: "Va sobrado",
  on_track: "Va bien",
  behind: "Va flojo",
  done: "Objetivo cumplido",
  missed: "No llegó",
};

/**
 * Parte del objetivo que debería llevar apuntada según lo que falta para
 * abrir: una lista se llena sobre todo en los dos últimos días.
 */
export function expectedShare(hoursLeft: number): number {
  if (hoursLeft > 72) return 0.25;
  if (hoursLeft > 48) return 0.4;
  if (hoursLeft > 24) return 0.5;
  if (hoursLeft > 6) return 0.7;
  return 0.85;
}

export type TargetState = {
  target: number | null;
  signedUp: number;
  scanned: number;
  /** Porcentaje del objetivo: apuntados antes de abrir, escaneados después. */
  progress: number;
  /** Personas que le faltan para el objetivo (0 si ya llega). */
  missing: number;
  status: TargetStatus;
};

/** Cómo va un RRPP frente a su objetivo en una noche concreta. */
export function promoterTargetState(
  data: ProData,
  p: ProPromoter,
  ev: ProEvent,
  now: Date,
): TargetState {
  const own = data.guests.filter((g) => g.eventId === ev.id && g.promoterId === p.id);
  const signedUp = own.length;
  const scanned = own.filter((g) => g.checkedInAt).length;
  const target = p.cap?.targetPerNight ?? null;
  if (!target) {
    return { target: null, signedUp, scanned, progress: 0, missing: 0, status: "none" };
  }
  const phase = eventPhase(ev, now);
  // Antes de abrir cuenta lo apuntado; con la puerta abierta o cerrada, quien entró.
  const count = phase === "live" || phase === "past" ? scanned : signedUp;
  const progress = Math.round((count / target) * 100);
  const missing = Math.max(0, target - count);
  let status: TargetStatus;
  if (count >= target) status = "done";
  else if (phase === "past") status = "missed";
  else if (phase === "live") status = count >= target * 0.6 ? "on_track" : "behind";
  else {
    const hoursLeft = (new Date(ev.doorsOpen).getTime() - now.getTime()) / 3_600_000;
    const expected = target * expectedShare(hoursLeft);
    status = count >= expected * 1.3 ? "ahead" : count >= expected ? "on_track" : "behind";
  }
  return { target, signedUp, scanned, progress, missing, status };
}

/** Objetivos de todos los RRPP activos para una noche, primero quien va peor. */
export function promoterTargets(data: ProData, ev: ProEvent, now: Date) {
  const order: Record<TargetStatus, number> = {
    behind: 0,
    missed: 1,
    on_track: 2,
    ahead: 3,
    done: 4,
    none: 5,
  };
  return data.promoters
    .filter((p) => p.active && p.cap?.targetPerNight)
    .map((p) => ({ promoter: p, state: promoterTargetState(data, p, ev, now) }))
    .sort((a, b) => order[a.state.status] - order[b.state.status] || a.state.progress - b.state.progress);
}

/** Mensaje para animar a un RRPP que va flojo, listo para WhatsApp. */
export function promoterNudge(p: ProPromoter, ev: ProEvent, state: TargetState, slug: string): string {
  const first = p.name.split(" ")[0];
  return [
    `Hola ${first}, para ${ev.name} llevas ${state.signedUp} de ${state.target} en tu lista.`,
    `Te faltan ${state.missing}. Tu enlace: https://${promoterLink(p.code, slug)}`,
  ].join("\n");
}

/**
 * Lo que le falta para el siguiente tramo de comisión en una noche, si su
 * regla es por tramos y aún no lo ha pasado.
 */
export function nextTierHint(p: ProPromoter, scanned: number): string | null {
  const spec = p.spec;
  if (!spec || spec.kind !== "tiers") return null;
  if (scanned > spec.upTo) return `Ya cobras ${money(spec.highCents)} por cada entrada más.`;
  const left = spec.upTo + 1 - scanned;
  return `Con ${left} ${left === 1 ? "entrada más" : "entradas más"} en puerta pasas a ${money(spec.highCents)} por entrada.`;
}

export type PromoterPanel = {
  link: string;
  rule: string;
  /** Noche a la que apunta ahora (la de hoy o la siguiente a la venta). */
  event: ProEvent | null;
  cap: ReturnType<typeof promoterCapState> | null;
  cutoffAt: string | null;
  target: TargetState | null;
  tierHint: string | null;
  monthCents: number;
  monthScanned: number;
  pendingCents: number;
  lastPayout: { at: string; amountCents: number } | null;
  recent: (PromoterNight & { name: string; date: string })[];
};

/** Todo lo que ve un RRPP en su panel, y nada de los demás. */
export function promoterPanel(data: ProData, p: ProPromoter, now: Date): PromoterPanel {
  const focus = focusEvent(data, now);
  const event =
    focus && eventPhase(focus, now) !== "past" ? focus : (upcomingEvents(data, now)[0] ?? null);
  const nights = promoterNights(data, p);
  const month = localDate(now).slice(0, 7);
  const inMonth = nights.filter((n) => {
    const ev = data.events.find((e) => e.id === n.eventId);
    return ev?.date.startsWith(month);
  });
  const tonight = event ? nights.find((n) => n.eventId === event.id) : undefined;
  const recent = nights
    .map((n) => {
      const ev = data.events.find((e) => e.id === n.eventId);
      return ev && eventPhase(ev, now) === "past" ? { ...n, name: ev.name, date: ev.date } : null;
    })
    .filter((n): n is PromoterNight & { name: string; date: string } => Boolean(n))
    .slice(0, 4);
  const payout = p.payouts?.[0];
  return {
    link: promoterLink(p.code, data.space.slug),
    rule: ruleLabel(p.spec, p.rule),
    event,
    cap: event ? promoterCapState(data, p, event.id) : null,
    cutoffAt: event ? promoterCutoffAt(p, event) : null,
    target: event ? promoterTargetState(data, p, event, now) : null,
    tierHint: event ? nextTierHint(p, tonight?.scanned ?? 0) : null,
    monthCents: inMonth.reduce((a, n) => a + n.commissionCents, 0),
    monthScanned: inMonth.reduce((a, n) => a + n.scanned, 0),
    pendingCents: pendingSettlement(data, p, now).cents,
    lastPayout: payout ? { at: payout.at, amountCents: payout.amountCents } : null,
    recent,
  };
}
