import type { ProData } from "./types";
import type {
  CommunityItem,
  CommunityItemCategory,
  CommunityLoan,
  CommunityMember,
  ProCommunityOps,
} from "./community-types";
import { proCsvCell } from "./csv";
import { dayLabel, localDate, money } from "./format";

/**
 * El material de la asociación: proyector, altavoz, cámaras, sudaderas que
 * sobraron. La ley pide llevar inventario (LO 1/2002, art. 14) y, sobre todo,
 * cada junta quiere saber quién tiene el proyector. Cada pieza guarda sus
 * préstamos; el que no tiene fecha de devolución es el que está en curso.
 */

export const ITEM_CATEGORY_LABEL: Record<CommunityItemCategory, string> = {
  sonido: "Sonido",
  imagen: "Imagen y vídeo",
  informatica: "Informática",
  mobiliario: "Mobiliario y stand",
  merchandising: "Merchandising",
  deporte: "Deporte",
  otro: "Otro",
};

/** Días de préstamo por defecto: lo normal es devolverlo tras la actividad. */
export const DEFAULT_LOAN_DAYS = 7;

export type ItemState = "en_local" | "prestado" | "atrasado" | "baja";

export function inventory(ops: ProCommunityOps): CommunityItem[] {
  return ops.inventory ?? [];
}

export function currentLoan(item: CommunityItem): CommunityLoan | undefined {
  return item.loans.find((l) => !l.returnedAt);
}

export function itemState(item: CommunityItem, today: string): ItemState {
  if (item.retiredAt) return "baja";
  const loan = currentLoan(item);
  if (!loan) return "en_local";
  return loan.due && loan.due < today ? "atrasado" : "prestado";
}

export type InventoryNumbers = {
  items: number;
  units: number;
  valueCents: number;
  lent: number;
  late: number;
  holders: string[];
};

export function inventoryNumbers(items: CommunityItem[], today: string): InventoryNumbers {
  const active = items.filter((i) => !i.retiredAt);
  const lent = active.filter((i) => currentLoan(i));
  return {
    items: active.length,
    units: active.reduce((acc, i) => acc + i.units, 0),
    valueCents: active.reduce((acc, i) => acc + (i.valueCents ?? 0) * i.units, 0),
    lent: lent.length,
    late: active.filter((i) => itemState(i, today) === "atrasado").length,
    holders: [...new Set(lent.map((i) => currentLoan(i)?.holder ?? ""))].filter(Boolean),
  };
}

/** Préstamos que ya deberían haber vuelto, del más atrasado al más reciente. */
export function overdueLoans(
  items: CommunityItem[],
  today: string,
): { item: CommunityItem; loan: CommunityLoan }[] {
  return items
    .filter((i) => itemState(i, today) === "atrasado")
    .map((item) => ({ item, loan: currentLoan(item)! }))
    .sort((a, b) => (a.loan.due ?? "").localeCompare(b.loan.due ?? ""));
}

/* ------------------------------------------------------------------ */
/* Cambios                                                             */
/* ------------------------------------------------------------------ */

function patchItem(
  ops: ProCommunityOps,
  id: string,
  fn: (i: CommunityItem) => CommunityItem,
): ProCommunityOps {
  return { ...ops, inventory: inventory(ops).map((i) => (i.id === id ? fn(i) : i)) };
}

export function saveItem(ops: ProCommunityOps, item: CommunityItem): ProCommunityOps {
  const list = inventory(ops);
  const clean: CommunityItem = {
    ...item,
    name: item.name.trim(),
    location: item.location.trim(),
    units: Math.max(1, Math.round(item.units)),
    valueCents: item.valueCents && item.valueCents > 0 ? Math.round(item.valueCents) : undefined,
  };
  return list.some((i) => i.id === item.id)
    ? { ...ops, inventory: list.map((i) => (i.id === item.id ? clean : i)) }
    : { ...ops, inventory: [clean, ...list] };
}

/** Presta una pieza. Si ya estaba prestada, primero se da por devuelta. */
export function lendItem(
  ops: ProCommunityOps,
  itemId: string,
  loan: Omit<CommunityLoan, "returnedAt">,
): ProCommunityOps {
  const holder = loan.holder.trim();
  if (!holder) return ops;
  return patchItem(ops, itemId, (i) => {
    if (i.retiredAt) return i;
    const closed = i.loans.map((l) => (l.returnedAt ? l : { ...l, returnedAt: loan.from }));
    return { ...i, loans: [{ ...loan, holder }, ...closed] };
  });
}

export function returnItem(ops: ProCommunityOps, itemId: string, at: string): ProCommunityOps {
  return patchItem(ops, itemId, (i) => ({
    ...i,
    loans: i.loans.map((l) => (l.returnedAt ? l : { ...l, returnedAt: at })),
  }));
}

/** Da de baja una pieza. Queda en la lista con la fecha y el motivo. */
export function retireItem(
  ops: ProCommunityOps,
  itemId: string,
  at: string,
  reason: string,
): ProCommunityOps {
  return patchItem(ops, itemId, (i) => ({
    ...i,
    retiredAt: at,
    retiredReason: reason.trim() || undefined,
    loans: i.loans.map((l) => (l.returnedAt ? l : { ...l, returnedAt: at })),
  }));
}

export function restoreItem(ops: ProCommunityOps, itemId: string): ProCommunityOps {
  return patchItem(ops, itemId, (i) => ({ ...i, retiredAt: undefined, retiredReason: undefined }));
}

/* ------------------------------------------------------------------ */
/* Relevo                                                              */
/* ------------------------------------------------------------------ */

/**
 * Material que tiene en casa alguien que deja la junta o que ya no es socio.
 * Es lo primero que se pierde en un cambio de junta.
 */
export function loansAtRisk(data: ProData): { item: CommunityItem; loan: CommunityLoan; reason: string }[] {
  const items = data.communityOps?.inventory ?? [];
  const members = data.communityMembers as CommunityMember[];
  const leaving = new Set<string>();
  const incoming = new Set((data.communityOps?.scheduledBoard ?? []).map((b) => b.name));
  if (incoming.size) data.board.filter((b) => !incoming.has(b.name)).forEach((b) => leaving.add(b.name));
  const formerIds = new Set(members.filter((m) => m.leftAt).map((m) => m.id));
  const formerNames = new Set(members.filter((m) => m.leftAt).map((m) => m.name));
  const out: { item: CommunityItem; loan: CommunityLoan; reason: string }[] = [];
  for (const item of items) {
    const loan = currentLoan(item);
    if (!loan || item.retiredAt) continue;
    if (leaving.has(loan.holder)) out.push({ item, loan, reason: "Deja la junta" });
    else if ((loan.memberId && formerIds.has(loan.memberId)) || formerNames.has(loan.holder))
      out.push({ item, loan, reason: "Ya no es socio" });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Mensajes y exportación                                              */
/* ------------------------------------------------------------------ */

function fullDate(date: string): string {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

export function loanReminderMessage(opts: {
  item: CommunityItem;
  loan: CommunityLoan;
  spaceName: string;
  today: string;
}): string {
  const { item, loan } = opts;
  const name = loan.holder.trim().split(/\s+/)[0] ?? loan.holder;
  const late = loan.due && loan.due < opts.today;
  return (
    `Hola ${name}, te escribimos de ${opts.spaceName}. ` +
    `Tienes ${item.name.toLowerCase()} desde el ${fullDate(localDate(loan.from))}` +
    (loan.due ? (late ? ` y tenía que volver el ${fullDate(loan.due)}. ` : `, vuelve el ${fullDate(loan.due)}. `) : ". ") +
    `¿Cuándo te viene bien devolverlo en ${item.location}? Gracias.`
  );
}

/** Inventario en CSV para la asamblea o la gestoría (separado por punto y coma). */
export function inventoryCsv(items: CommunityItem[], today: string): string {
  const euros = (cents?: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
  const state: Record<ItemState, string> = {
    en_local: "En su sitio",
    prestado: "Prestado",
    atrasado: "Prestado, sin devolver",
    baja: "De baja",
  };
  const header = [
    "Material",
    "Categoría",
    "Unidades",
    "Valor unitario",
    "Valor total",
    "Fecha de alta",
    "Dónde se guarda",
    "Estado",
    "Lo tiene",
    "Desde",
    "Baja",
    "Motivo de la baja",
  ];
  const rows = [...items]
    .sort((a, b) => Number(Boolean(a.retiredAt)) - Number(Boolean(b.retiredAt)) || a.name.localeCompare(b.name, "es"))
    .map((i) => {
      const loan = currentLoan(i);
      return [
        i.name,
        ITEM_CATEGORY_LABEL[i.category],
        String(i.units),
        euros(i.valueCents),
        euros(i.valueCents ? i.valueCents * i.units : undefined),
        i.acquiredAt ?? "",
        i.location,
        state[itemState(i, today)],
        loan?.holder ?? "",
        loan ? localDate(loan.from) : "",
        i.retiredAt ? localDate(i.retiredAt) : "",
        i.retiredReason ?? "",
      ];
    });
  return [header, ...rows].map((r) => r.map(proCsvCell).join(";")).join("\n");
}

/** Texto del inventario para guardarlo en el archivo de la junta. */
export function inventoryDocumentBody(items: CommunityItem[], spaceName: string, today: string): string {
  const active = items.filter((i) => !i.retiredAt);
  const n = inventoryNumbers(items, today);
  const lines = active.map((i) => {
    const loan = currentLoan(i);
    return (
      `${i.name} (${i.units} ${i.units === 1 ? "unidad" : "unidades"})` +
      `${i.valueCents ? `, ${money(i.valueCents * i.units)}` : ""}: ` +
      (loan ? `lo tiene ${loan.holder} desde el ${fullDate(localDate(loan.from))}.` : `en ${i.location}.`)
    );
  });
  const retired = items.filter((i) => i.retiredAt);
  return [
    `Inventario de ${spaceName} a ${fullDate(today)}.`,
    `${n.items} piezas y ${n.units} unidades con un valor de compra de ${money(n.valueCents)}. ` +
      `${n.lent ? `${n.lent} prestadas ahora mismo.` : "Todo está en su sitio."}`,
    lines.join("\n"),
    retired.length
      ? `Bajas: ${retired.map((i) => `${i.name} (${fullDate(localDate(i.retiredAt!))}${i.retiredReason ? `, ${i.retiredReason.toLowerCase()}` : ""})`).join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
