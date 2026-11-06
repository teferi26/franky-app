import type {
  CommunityMerchLine,
  CommunityMerchOrder,
  CommunityMovement,
  CommunityPayMethod,
  ProCommunityOps,
} from "./community-types";
import { proCsvCell } from "./csv";
import { dayLabel, localDate, money } from "./format";

/**
 * Pedidos de sudaderas, camisetas y demás merchandising.
 *
 * Así se hace hoy: un Forms para la talla, un Excel para quién ha pagado y
 * un audio al proveedor con "unas diez M y no sé cuántas L". Aquí cada socio
 * tiene su línea con talla, pago y entrega; el total por talla sale solo y el
 * dinero entra en la caja del curso sin apuntarlo dos veces.
 */

export const MERCH_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

/** Métodos con los que se cobra un pedido fuera de Franky. */
export const MERCH_PAY_METHODS: CommunityPayMethod[] = ["bizum", "efectivo", "transferencia", "tarjeta"];

export function merchOrders(ops: ProCommunityOps): CommunityMerchOrder[] {
  return ops.merch ?? [];
}

export function lineUnits(order: CommunityMerchOrder): number {
  return order.lines.reduce((acc, l) => acc + l.qty, 0);
}

/** Unidades por talla, en el orden de tallas del pedido. */
export function sizeTotals(order: CommunityMerchOrder): { size: string; qty: number }[] {
  const extra = order.lines.map((l) => l.size).filter((s) => !order.sizes.includes(s));
  return [...order.sizes, ...new Set(extra)].map((size) => ({
    size,
    qty: order.lines.filter((l) => l.size === size).reduce((acc, l) => acc + l.qty, 0),
  }));
}

export type MerchSummary = {
  units: number;
  people: number;
  paidCents: number;
  pendingCents: number;
  unpaid: CommunityMerchLine[];
  undelivered: CommunityMerchLine[];
  costCents: number;
  /** Lo que queda para la asociación: venta menos proveedor. null sin coste. */
  marginCents: number | null;
};

export function merchSummary(order: CommunityMerchOrder): MerchSummary {
  const units = lineUnits(order);
  const paid = order.lines.filter((l) => l.paidAt);
  const paidCents = paid.reduce((acc, l) => acc + l.qty * order.priceCents, 0);
  const costCents = order.unitCostCents ? units * order.unitCostCents : 0;
  return {
    units,
    people: order.lines.length,
    paidCents,
    pendingCents: units * order.priceCents - paidCents,
    unpaid: order.lines.filter((l) => !l.paidAt),
    undelivered: order.lines.filter((l) => !l.deliveredAt),
    costCents,
    marginCents: order.unitCostCents ? units * (order.priceCents - order.unitCostCents) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Cambios                                                             */
/* ------------------------------------------------------------------ */

export function saveMerchOrder(ops: ProCommunityOps, order: CommunityMerchOrder): ProCommunityOps {
  const list = merchOrders(ops);
  const next = list.some((o) => o.id === order.id)
    ? list.map((o) => (o.id === order.id ? order : o))
    : [order, ...list];
  return syncMerchCash({ ...ops, merch: next }, order.id);
}

function patchOrder(
  ops: ProCommunityOps,
  id: string,
  fn: (o: CommunityMerchOrder) => CommunityMerchOrder,
): ProCommunityOps {
  return syncMerchCash({ ...ops, merch: merchOrders(ops).map((o) => (o.id === id ? fn(o) : o)) }, id);
}

/** Apunta a alguien. Si ya estaba con esa talla, suma unidades. */
export function addMerchLine(
  ops: ProCommunityOps,
  orderId: string,
  line: CommunityMerchLine,
): ProCommunityOps {
  const name = line.name.trim();
  if (!name || line.qty < 1) return ops;
  return patchOrder(ops, orderId, (o) => {
    const same = o.lines.find(
      (l) => l.size === line.size && !l.paidAt && (line.memberId ? l.memberId === line.memberId : l.name === name),
    );
    if (same) {
      return { ...o, lines: o.lines.map((l) => (l === same ? { ...l, qty: l.qty + line.qty } : l)) };
    }
    return { ...o, lines: [...o.lines, { ...line, name, qty: Math.round(line.qty) }] };
  });
}

export function removeMerchLine(ops: ProCommunityOps, orderId: string, lineId: string): ProCommunityOps {
  return patchOrder(ops, orderId, (o) => ({ ...o, lines: o.lines.filter((l) => l.id !== lineId) }));
}

export function setLinePaid(
  ops: ProCommunityOps,
  orderId: string,
  lineId: string,
  paid: { at: string; via: CommunityPayMethod } | null,
): ProCommunityOps {
  return patchOrder(ops, orderId, (o) => ({
    ...o,
    lines: o.lines.map((l) =>
      l.id !== lineId ? l : paid ? { ...l, paidAt: paid.at, paidVia: paid.via } : { ...l, paidAt: undefined, paidVia: undefined },
    ),
  }));
}

/** Entregada o no. Con todo entregado, el pedido queda cerrado. */
export function setLineDelivered(
  ops: ProCommunityOps,
  orderId: string,
  lineId: string,
  at: string | null,
): ProCommunityOps {
  return patchOrder(ops, orderId, (o) => {
    const lines = o.lines.map((l) => (l.id === lineId ? { ...l, deliveredAt: at ?? undefined } : l));
    const all = lines.length > 0 && lines.every((l) => l.deliveredAt);
    const status = all && o.status !== "abierto" ? "entregado" : o.status === "entregado" ? "encargado" : o.status;
    return { ...o, lines, status };
  });
}

/**
 * Cierra las tallas y lo encarga al proveedor. Si se sabe el coste, se apunta
 * el gasto en la caja (con quién lo adelanta, si lo paga alguien de la junta).
 */
export function placeMerchOrder(
  ops: ProCommunityOps,
  orderId: string,
  at: string,
  opts: { paidBy?: string; movementId: string },
): ProCommunityOps {
  const order = merchOrders(ops).find((o) => o.id === orderId);
  if (!order || order.status !== "abierto" || !lineUnits(order)) return ops;
  const units = lineUnits(order);
  const cost = order.unitCostCents ? units * order.unitCostCents : 0;
  const expense: CommunityMovement | null = cost
    ? {
        id: opts.movementId,
        kind: "expense",
        date: at,
        concept: `${order.supplier ? `${order.supplier}: ` : ""}${order.title} (${units} unidades)`,
        amountCents: cost,
        category: "material",
        method: "transferencia",
        paidBy: opts.paidBy?.trim() || undefined,
      }
    : null;
  const next = patchOrder(ops, orderId, (o) => ({
    ...o,
    status: "encargado",
    orderedAt: at,
    supplierMovementId: expense ? expense.id : o.supplierMovementId,
  }));
  return expense ? { ...next, movements: [expense, ...next.movements] } : next;
}

/** Vuelve a abrir las tallas (el proveedor aún no lo tiene). Quita el gasto apuntado. */
export function reopenMerchOrder(ops: ProCommunityOps, orderId: string): ProCommunityOps {
  const order = merchOrders(ops).find((o) => o.id === orderId);
  if (!order) return ops;
  const next = patchOrder(ops, orderId, (o) => ({
    ...o,
    status: "abierto",
    orderedAt: undefined,
    supplierMovementId: undefined,
  }));
  return order.supplierMovementId
    ? { ...next, movements: next.movements.filter((m) => m.id !== order.supplierMovementId) }
    : next;
}

/* ------------------------------------------------------------------ */
/* Caja                                                                */
/* ------------------------------------------------------------------ */

export function merchIncomeId(orderId: string): string {
  return `merch-${orderId}`;
}

/**
 * Mantiene un único ingreso en la caja por pedido con lo cobrado hasta ahora.
 * Así cada pago no crea un apunte suelto y el saldo siempre cuadra.
 */
export function syncMerchCash(ops: ProCommunityOps, orderId: string): ProCommunityOps {
  const order = merchOrders(ops).find((o) => o.id === orderId);
  const id = merchIncomeId(orderId);
  const rest = ops.movements.filter((m) => m.id !== id);
  if (!order) return { ...ops, movements: rest };
  const paid = order.lines.filter((l) => l.paidAt);
  const cents = paid.reduce((acc, l) => acc + l.qty * order.priceCents, 0);
  if (!cents) return { ...ops, movements: rest };
  const existing = ops.movements.find((m) => m.id === id);
  const units = paid.reduce((acc, l) => acc + l.qty, 0);
  const dates = paid.map((l) => l.paidAt!).sort();
  const last = dates[dates.length - 1];
  const income: CommunityMovement = {
    ...(existing ?? {}),
    id,
    kind: "income",
    date: existing?.date ?? last,
    concept: `${order.title}: ${units} ${units === 1 ? "unidad cobrada" : "unidades cobradas"}`,
    amountCents: cents,
    category: "venta",
  };
  return {
    ...ops,
    movements: existing
      ? ops.movements.map((m) => (m.id === id ? income : m))
      : [income, ...ops.movements],
  };
}

/* ------------------------------------------------------------------ */
/* Mensajes                                                            */
/* ------------------------------------------------------------------ */

function fullDate(date: string): string {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

/** Mensaje para el grupo: qué se pide, cuánto cuesta y hasta cuándo. */
export function merchCallMessage(order: CommunityMerchOrder, spaceName: string): string {
  return (
    `*${order.title}*\n${order.garment}. ${money(order.priceCents)} para socios.\n` +
    `Tallas: ${order.sizes.join(", ")}.\n` +
    `Contesta con tu talla antes del ${fullDate(order.closesOn)} y te apuntamos en el pedido de ${spaceName}.`
  );
}

export function merchReminderMessage(opts: {
  line: CommunityMerchLine;
  order: CommunityMerchOrder;
  spaceName: string;
  howToPay: string;
}): string {
  const { line, order } = opts;
  const name = line.name.trim().split(/\s+/)[0] ?? line.name;
  const units = line.qty === 1 ? `tu ${order.title.toLowerCase()}` : `tus ${line.qty} unidades de ${order.title.toLowerCase()}`;
  return (
    `Hola ${name}, te escribimos de ${opts.spaceName}. ` +
    `Te queda por pagar ${units} (talla ${line.size}): ${money(line.qty * order.priceCents)}. ` +
    `${opts.howToPay} Gracias.`
  );
}

export function merchReadyMessage(opts: { line: CommunityMerchLine; order: CommunityMerchOrder; where: string }): string {
  const name = opts.line.name.trim().split(/\s+/)[0] ?? opts.line.name;
  return `Hola ${name}, ya ha llegado ${opts.order.title.toLowerCase()} (talla ${opts.line.size}). Puedes recogerla en ${opts.where}.`;
}

/** Texto para el proveedor con el total por talla. */
export function supplierOrderText(order: CommunityMerchOrder, spaceName: string): string {
  const rows = sizeTotals(order).filter((s) => s.qty);
  return (
    `Pedido de ${spaceName}: ${order.garment}.\n` +
    `${rows.map((s) => `${s.size}: ${s.qty}`).join("\n")}\n` +
    `Total: ${lineUnits(order)} unidades.`
  );
}

/** Lista de entrega en CSV: quién, talla, cuántas, si ha pagado y si la tiene. */
export function merchOrderCsv(order: CommunityMerchOrder): string {
  const header = ["Nombre", "Talla", "Unidades", "Importe", "Pagado", "Fecha de pago", "Entregado"];
  const rows = [...order.lines]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((l) => [
      l.name,
      l.size,
      String(l.qty),
      ((l.qty * order.priceCents) / 100).toFixed(2).replace(".", ","),
      l.paidAt ? "Sí" : "No",
      l.paidAt ? localDate(l.paidAt) : "",
      l.deliveredAt ? "Sí" : "No",
    ]);
  const totals = sizeTotals(order)
    .filter((s) => s.qty)
    .map((s) => [`Total talla ${s.size}`, s.size, String(s.qty), "", "", "", ""]);
  return [header, ...rows, ...totals].map((r) => r.map(proCsvCell).join(";")).join("\n");
}
