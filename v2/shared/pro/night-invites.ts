/**
 * Invitaciones de la barra con nombre. Cada copa regalada queda apuntada con
 * quién la invita, a quién y por qué, para que el cierre sepa cuánto se ha
 * regalado y el dueño vea quién invita más. Cupo opcional por persona y noche.
 *
 * Funciones puras sobre `ProNightOps`: la web y la app nativa cuentan igual.
 */
import type { ProMenuItem } from "./types";
import type { ProInvite, ProInviteReason, ProNightOps } from "./night-types";
import { localMinutes, minutesToLabel, money } from "./format";
import { normalizeName } from "./night-ops";

export const INVITE_REASONS: Record<ProInviteReason, { label: string }> = {
  equipo: { label: "Equipo" },
  dj: { label: "DJ o artista" },
  habitual: { label: "Cliente habitual" },
  cumple: { label: "Cumpleaños" },
  compensacion: { label: "Compensar un fallo" },
  promo: { label: "Promoción" },
  otro: { label: "Otro" },
};

export const INVITE_REASON_ORDER: ProInviteReason[] = [
  "habitual",
  "cumple",
  "equipo",
  "dj",
  "compensacion",
  "promo",
  "otro",
];

/** Opciones de cupo por persona y noche que se ofrecen en pantalla. */
export const INVITE_CAP_CHOICES = [null, 3, 5, 8, 10] as const;

/** Precio de una copa si no se elige nada de la carta. */
export const DEFAULT_DRINK_CENTS = 700;

export function invitesOf(ops: ProNightOps): ProInvite[] {
  return ops.invites ?? [];
}

/** Invitaciones de una noche, de la más antigua a la más reciente. */
export function invitesOfNight(ops: ProNightOps, night: string): ProInvite[] {
  return invitesOf(ops)
    .filter((i) => i.night === night)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Invitaciones entre dos noches (ambas incluidas). */
export function invitesBetween(ops: ProNightOps, from: string, to: string): ProInvite[] {
  return invitesOf(ops).filter((i) => i.night >= from && i.night <= to);
}

export function inviteTotals(list: ProInvite[]) {
  return {
    count: list.length,
    drinks: list.reduce((a, i) => a + i.drinks, 0),
    cents: list.reduce((a, i) => a + i.cents, 0),
  };
}

export type InviterRow = {
  by: string;
  count: number;
  drinks: number;
  cents: number;
  /** Solo tiene sentido en una noche: si ha pasado su cupo. */
  over: boolean;
};

/**
 * Quién invita, de más a menos copas. Con `cap` (copas por persona y noche)
 * marca a quien lo ha pasado; úsalo solo con las invitaciones de una noche.
 */
export function invitesByPerson(list: ProInvite[], cap?: number | null): InviterRow[] {
  const map = new Map<string, InviterRow>();
  for (const i of list) {
    const key = normalizeName(i.by) || i.by;
    const row = map.get(key) ?? { by: i.by, count: 0, drinks: 0, cents: 0, over: false };
    row.count++;
    row.drinks += i.drinks;
    row.cents += i.cents;
    map.set(key, row);
  }
  const rows = [...map.values()];
  if (typeof cap === "number") rows.forEach((r) => (r.over = r.drinks > cap));
  return rows.sort((a, b) => b.drinks - a.drinks || b.cents - a.cents || a.by.localeCompare(b.by));
}

/** Por qué se invita, de más a menos copas. */
export function invitesByReason(list: ProInvite[]) {
  const map = new Map<ProInviteReason, number>();
  for (const i of list) map.set(i.reason, (map.get(i.reason) ?? 0) + i.drinks);
  return [...map.entries()]
    .map(([reason, drinks]) => ({ reason, label: INVITE_REASONS[reason].label, drinks }))
    .sort((a, b) => b.drinks - a.drinks);
}

/** Copas que le quedan a una persona esta noche, o null si no hay cupo. */
export function inviteCapLeft(ops: ProNightOps, night: string, by: string): number | null {
  const cap = ops.settings.invitesPerPerson;
  if (typeof cap !== "number") return null;
  const key = normalizeName(by);
  const used = invitesOfNight(ops, night)
    .filter((i) => normalizeName(i.by) === key)
    .reduce((a, i) => a + i.drinks, 0);
  return Math.max(0, cap - used);
}

/** Lo que el cierre de caja debe apuntar como invitaciones de esa noche. */
export function closeInvitesDraft(ops: ProNightOps, night: string) {
  const t = inviteTotals(invitesOfNight(ops, night));
  return { invitations: t.drinks, invitationsCents: t.cents, count: t.count };
}

export function addInvite(ops: ProNightOps, invite: ProInvite): ProNightOps {
  return { ...ops, invites: [...invitesOf(ops), invite] };
}

export function removeInvite(ops: ProNightOps, id: string): ProNightOps {
  return { ...ops, invites: invitesOf(ops).filter((i) => i.id !== id) };
}

/**
 * Productos de la carta que se suelen invitar: copas, chupitos y cervezas
 * disponibles. Primero los favoritos; fuera botellas, cubos y comida.
 */
export function invitableItems(menu: ProMenuItem[], limit = 6): ProMenuItem[] {
  return menu
    .filter(
      (m) =>
        m.available &&
        m.priceCents > 0 &&
        m.priceCents <= 2000 &&
        !/picoteo|compartir|botellas|comida|tapas/i.test(m.section),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.studentFavorite)) - Number(Boolean(a.studentFavorite)) ||
        b.priceCents - a.priceCents,
    )
    .slice(0, limit);
}

/** Una línea de texto para listas y resúmenes: "01:20 Rubén a Lucía, 2 copas (cumpleaños)". */
export function inviteLine(i: ProInvite): string {
  const what = i.itemName ? `${i.drinks} x ${i.itemName}` : `${i.drinks} ${i.drinks === 1 ? "copa" : "copas"}`;
  return `${minutesToLabel(localMinutes(i.at))} ${i.by.split(" ")[0]} a ${i.to}: ${what}, ${money(i.cents)} (${INVITE_REASONS[i.reason].label.toLowerCase()})`;
}

/** Filas del CSV de invitaciones de un mes (YYYY-MM) para la gestoría. */
export function inviteRows(ops: ProNightOps, month: string): string[][] {
  const rows: string[][] = [["Noche", "Hora", "Invita", "A quién", "Motivo", "Producto", "Copas", "Valor (€)"]];
  const list = invitesOf(ops)
    .filter((i) => i.night.startsWith(month))
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const i of list) {
    rows.push([
      i.night,
      minutesToLabel(localMinutes(i.at)),
      i.by,
      i.to,
      INVITE_REASONS[i.reason].label,
      i.itemName ?? "",
      String(i.drinks),
      (i.cents / 100).toFixed(2).replace(".", ","),
    ]);
  }
  return rows;
}
