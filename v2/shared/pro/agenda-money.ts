/**
 * Dinero del motor de agenda: cobro completo (servicio, productos, descuento,
 * bono, señal, tarjeta regalo, propina y pago mixto), bonos, tarjetas regalo,
 * stock, cierre del mes para la gestoría y rentabilidad de cada silla.
 *
 * Caja es el control interno del negocio: aquí se registra lo que ya se ha
 * cobrado en el local, no se emiten facturas.
 */
import type { ProData, ProPayment, ProService, ProStaff } from "./types";
import type {
  ProAgendaBundle,
  ProCabin,
  ProGiftCard,
  ProPaymentLine,
  ProProduct,
  ProServiceMaterial,
} from "./agenda-types";
import { openingIntervals } from "./agenda";
import { clientVisits } from "./agenda-clients";
import { proCsvCell } from "./csv";
import {
  addDays,
  localDate,
  localMinutes,
  money,
  weekdayIndex,
} from "./format";

type Method = ProPayment["method"];

export const METHOD_LABEL: Record<Method, string> = {
  card: "Tarjeta",
  cash: "Efectivo",
  bizum: "Bizum",
};

/* ------------------------------------------------------------------ */
/* Cobro completo                                                      */
/* ------------------------------------------------------------------ */

export type CheckoutDiscount =
  | { kind: "none" }
  | { kind: "pct"; pct: number; label: string }
  | { kind: "cents"; cents: number; label: string };

export type CheckoutDraft = {
  /** Valor del servicio de la cita (0 si es una venta sin cita). */
  serviceCents: number;
  products: { product: ProProduct; qty: number }[];
  discount: CheckoutDiscount;
  /** La sesión la cubre un bono: el servicio no se cobra. */
  useBundle: boolean;
  /** Señal cobrada antes, que ahora se descuenta. */
  depositPaidCents: number;
  /** Saldo de tarjeta regalo disponible para este cobro. */
  giftCardCents: number;
  tipCents: number;
};

export type CheckoutTotals = {
  serviceCents: number;
  productCents: number;
  bundleCents: number;
  discountCents: number;
  depositAppliedCents: number;
  giftCardCents: number;
  /** Lo que se cobra ahora, sin propina. */
  dueCents: number;
  tipCents: number;
  /** Lo que se cobra ahora con la propina. */
  chargeCents: number;
};

export function checkoutTotals(draft: CheckoutDraft): CheckoutTotals {
  const serviceCharge = draft.useBundle ? 0 : draft.serviceCents;
  const productCents = draft.products.reduce(
    (total, line) => total + line.product.priceCents * line.qty,
    0,
  );
  const base = serviceCharge + productCents;
  const discountCents =
    draft.discount.kind === "pct"
      ? Math.round((base * draft.discount.pct) / 100)
      : draft.discount.kind === "cents"
        ? Math.min(base, Math.max(0, draft.discount.cents))
        : 0;
  const afterDiscount = base - discountCents;
  const depositAppliedCents = Math.min(draft.depositPaidCents, afterDiscount);
  const remaining = afterDiscount - depositAppliedCents;
  const giftCardCents = Math.min(Math.max(0, draft.giftCardCents), remaining);
  const dueCents = remaining - giftCardCents;
  const tipCents = Math.max(0, draft.tipCents);
  return {
    serviceCents: draft.serviceCents,
    productCents,
    bundleCents: draft.useBundle ? draft.serviceCents : 0,
    discountCents,
    depositAppliedCents,
    giftCardCents,
    dueCents,
    tipCents,
    chargeCents: dueCents + tipCents,
  };
}

/** Reparte un cobro entre métodos. Si no hay reparto, todo va al método principal. */
export function paymentSplit(
  payment: ProPayment,
): { method: Method; cents: number }[] {
  const split = payment.agenda?.split;
  if (split?.length) return split;
  return [{ method: payment.method, cents: payment.amountCents }];
}

/** Suma por método de un conjunto de cobros, sin propinas. */
export function sumByMethod(payments: ProPayment[]): Record<Method, number> {
  const out: Record<Method, number> = { card: 0, cash: 0, bizum: 0 };
  for (const payment of payments)
    for (const part of paymentSplit(payment)) out[part.method] += part.cents;
  return out;
}

export type CheckoutInput = {
  paymentId: string;
  at: string;
  bookingId?: string;
  clientId?: string;
  clientName: string;
  staffId?: string;
  serviceId?: string;
  serviceName?: string;
  draft: CheckoutDraft;
  method: Method;
  /** Pago mixto: la parte que se cobra con el segundo método. */
  secondary?: { method: Method; cents: number };
  bundleId?: string;
  giftCardId?: string;
  discountLabel?: string;
};

/** Registra un cobro completo y todo lo que mueve: cita, ficha, stock, bono y tarjeta. */
export function applyCheckout(data: ProData, input: CheckoutInput): ProData {
  const totals = checkoutTotals(input.draft);
  const lines: ProPaymentLine[] = [
    ...(input.serviceName && input.draft.serviceCents
      ? [
          {
            kind: "service" as const,
            refId: input.serviceId,
            name: input.serviceName,
            qty: 1,
            cents: input.draft.serviceCents,
          },
        ]
      : []),
    ...input.draft.products.map((line) => ({
      kind: "product" as const,
      refId: line.product.id,
      name: line.product.name,
      qty: line.qty,
      cents: line.product.priceCents * line.qty,
    })),
  ];
  const secondary =
    input.secondary && input.secondary.cents > 0
      ? Math.min(input.secondary.cents, totals.dueCents)
      : 0;
  const split =
    secondary && input.secondary && input.secondary.method !== input.method
      ? [
          { method: input.method, cents: totals.dueCents - secondary },
          { method: input.secondary.method, cents: secondary },
        ]
      : undefined;
  const payment: ProPayment = {
    id: input.paymentId,
    at: input.at,
    bookingId: input.bookingId,
    clientName: input.clientName,
    staffId: input.staffId,
    concept:
      lines
        .map((line) =>
          line.qty > 1 ? `${line.qty} x ${line.name}` : line.name,
        )
        .join(", ") || "Venta",
    amountCents: totals.dueCents,
    tipCents: totals.tipCents,
    method: input.method,
    agenda: {
      lines,
      discountCents: totals.discountCents,
      discountLabel: input.discountLabel,
      depositAppliedCents: totals.depositAppliedCents,
      giftCardCents: totals.giftCardCents,
      bundleId: input.draft.useBundle ? input.bundleId : undefined,
      split,
      kind: input.bookingId ? undefined : "sale",
    },
  };
  const paidNow = totals.dueCents + totals.depositAppliedCents;
  const ops = data.agendaOps;
  const sold = new Map(
    input.draft.products.map((line) => [line.product.id, line.qty]),
  );
  // El material técnico que gasta el servicio también sale del stock.
  const materials = input.bookingId
    ? (data.services.find((row) => row.id === input.serviceId)?.agenda
        ?.materials ?? [])
    : [];
  for (const line of materials)
    sold.set(line.productId, (sold.get(line.productId) ?? 0) + line.qty);
  return {
    ...data,
    payments: [...data.payments, payment],
    bookings: input.bookingId
      ? data.bookings.map((booking) =>
          booking.id === input.bookingId
            ? {
                ...booking,
                status: "done",
                paidCents: booking.priceCents,
                agenda:
                  input.draft.useBundle && input.bundleId
                    ? { ...booking.agenda, bundleId: input.bundleId }
                    : booking.agenda,
              }
            : booking,
        )
      : data.bookings,
    clients: input.clientId
      ? data.clients.map((client) =>
          client.id === input.clientId
            ? {
                ...client,
                visits: input.bookingId ? client.visits + 1 : client.visits,
                spentCents:
                  client.spentCents === null
                    ? null
                    : client.spentCents + paidNow,
                lastVisit: input.bookingId ? input.at : client.lastVisit,
              }
            : client,
        )
      : data.clients,
    agendaOps: ops
      ? {
          ...ops,
          products: ops.products.map((product) =>
            sold.has(product.id)
              ? {
                  ...product,
                  stock: roundQty(product.stock - (sold.get(product.id) ?? 0)),
                }
              : product,
          ),
          bundles:
            input.draft.useBundle && input.bundleId
              ? ops.bundles.map((bundle) =>
                  bundle.id === input.bundleId
                    ? {
                        ...bundle,
                        used: bundle.used + 1,
                        moves: [
                          ...bundle.moves,
                          {
                            at: input.at,
                            delta: -1,
                            bookingId: input.bookingId,
                          },
                        ],
                      }
                    : bundle,
                )
              : ops.bundles,
          giftCards:
            input.giftCardId && totals.giftCardCents
              ? ops.giftCards.map((card) =>
                  card.id === input.giftCardId
                    ? {
                        ...card,
                        balanceCents: card.balanceCents - totals.giftCardCents,
                      }
                    : card,
                )
              : ops.giftCards,
        }
      : ops,
  };
}

/** Las fracciones de tubo o de bote se guardan con dos decimales. */
function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Material por servicio: coste y margen                               */
/* ------------------------------------------------------------------ */

export type MaterialLine = {
  product: ProProduct;
  qty: number;
  cents: number;
};

export type ServiceMargin = {
  lines: MaterialLine[];
  costCents: number;
  /** Lo que queda del precio normal después del material. */
  marginCents: number;
  marginPct: number;
  /** Lo mismo con el precio estudiante, si lo tiene. */
  studentMarginCents?: number;
};

/** Líneas de material con su coste, ignorando productos que ya no existen. */
export function materialLines(
  products: ProProduct[],
  materials: ProServiceMaterial[] | undefined,
): MaterialLine[] {
  return (materials ?? []).flatMap((line) => {
    const product = products.find((row) => row.id === line.productId);
    if (!product || line.qty <= 0) return [];
    return [
      {
        product,
        qty: line.qty,
        cents: Math.round(product.costCents * line.qty),
      },
    ];
  });
}

/** Coste de material y margen de un servicio. Null si no gasta nada apuntado. */
export function serviceMargin(
  data: ProData,
  service: Pick<ProService, "priceCents" | "studentPriceCents" | "agenda">,
): ServiceMargin | null {
  const lines = materialLines(
    data.agendaOps?.products ?? [],
    service.agenda?.materials,
  );
  if (!lines.length) return null;
  const costCents = lines.reduce((total, line) => total + line.cents, 0);
  const marginCents = service.priceCents - costCents;
  return {
    lines,
    costCents,
    marginCents,
    marginPct: service.priceCents
      ? Math.round((marginCents / service.priceCents) * 100)
      : 0,
    studentMarginCents: service.studentPriceCents
      ? service.studentPriceCents - costCents
      : undefined,
  };
}

/** Cuántas sesiones más se pueden hacer con el stock que queda. */
export function sessionsLeft(
  products: ProProduct[],
  materials: ProServiceMaterial[] | undefined,
): number | null {
  const lines = materialLines(products, materials);
  if (!lines.length) return null;
  return Math.max(
    0,
    Math.min(...lines.map((line) => Math.floor(line.product.stock / line.qty))),
  );
}

/* ------------------------------------------------------------------ */
/* Bonos                                                               */
/* ------------------------------------------------------------------ */

export function bundleRemaining(bundle: ProAgendaBundle): number {
  return Math.max(0, bundle.sessions - bundle.used);
}

export function bundleActive(bundle: ProAgendaBundle, onDate: string): boolean {
  return (
    bundleRemaining(bundle) > 0 &&
    (!bundle.expiresAt || bundle.expiresAt >= onDate)
  );
}

/** Bono vivo de esa ficha para ese servicio (el que antes caduca primero). */
export function activeBundle(
  data: ProData,
  clientId: string | undefined,
  serviceId: string | undefined,
  onDate: string,
): ProAgendaBundle | undefined {
  if (!clientId || !serviceId) return undefined;
  return (data.agendaOps?.bundles ?? [])
    .filter(
      (bundle) =>
        bundle.clientId === clientId &&
        bundle.serviceId === serviceId &&
        bundleActive(bundle, onDate),
    )
    .sort((a, b) =>
      (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"),
    )[0];
}

/** Vende un bono: entra el dinero hoy y las sesiones quedan en la ficha. */
export function sellBundle(
  data: ProData,
  bundle: ProAgendaBundle,
  input: { paymentId: string; method: Method; staffId?: string },
): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  const payment: ProPayment = {
    id: input.paymentId,
    at: bundle.soldAt,
    clientName: bundle.clientName,
    staffId: input.staffId,
    concept: bundle.label,
    amountCents: bundle.priceCents,
    tipCents: 0,
    method: input.method,
    agenda: {
      kind: "bundle",
      lines: [
        {
          kind: "bundle",
          refId: bundle.id,
          name: bundle.label,
          qty: 1,
          cents: bundle.priceCents,
        },
      ],
      discountCents: 0,
      depositAppliedCents: 0,
      giftCardCents: 0,
    },
  };
  return {
    ...data,
    payments: [...data.payments, payment],
    agendaOps: { ...ops, bundles: [...ops.bundles, bundle] },
  };
}

/** Devuelve una sesión al bono (por error o porque no vino) con su motivo. */
export function returnBundleSession(
  data: ProData,
  bundleId: string,
  input: { at: string; reason: string; bookingId?: string },
): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  return {
    ...data,
    agendaOps: {
      ...ops,
      bundles: ops.bundles.map((bundle) =>
        bundle.id === bundleId && bundle.used > 0
          ? {
              ...bundle,
              used: bundle.used - 1,
              moves: [
                ...bundle.moves,
                {
                  at: input.at,
                  delta: 1,
                  reason: input.reason,
                  bookingId: input.bookingId,
                },
              ],
            }
          : bundle,
      ),
    },
  };
}

/** Clientas que hoy gastan la última sesión de su bono: momento de renovarlo. */
export function lastSessionToday(data: ProData, date: string) {
  const out: { bundle: ProAgendaBundle; bookingId: string }[] = [];
  for (const booking of data.bookings) {
    if (localDate(booking.start) !== date) continue;
    if (["cancelled", "no_show"].includes(booking.status)) continue;
    const bundle = activeBundle(
      data,
      booking.clientId,
      booking.serviceId,
      date,
    );
    if (bundle && bundleRemaining(bundle) === 1)
      out.push({ bundle, bookingId: booking.id });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tarjetas regalo                                                     */
/* ------------------------------------------------------------------ */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Código corto y fácil de dictar: sin 0/O ni 1/I. */
export function giftCode(random: () => number): string {
  let code = "";
  for (let i = 0; i < 6; i++)
    code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function findGiftCard(
  data: ProData,
  code: string,
): ProGiftCard | undefined {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return data.agendaOps?.giftCards.find(
    (card) => card.code.replace(/[^A-Z0-9]/g, "") === clean,
  );
}

export function sellGiftCard(
  data: ProData,
  card: ProGiftCard,
  input: { paymentId: string; method: Method },
): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  const payment: ProPayment = {
    id: input.paymentId,
    at: card.soldAt,
    clientName: card.buyer,
    concept: `Tarjeta regalo ${card.code}`,
    amountCents: card.amountCents,
    tipCents: 0,
    method: input.method,
    agenda: {
      kind: "gift",
      lines: [
        {
          kind: "gift",
          refId: card.id,
          name: `Tarjeta regalo ${card.code}`,
          qty: 1,
          cents: card.amountCents,
        },
      ],
      discountCents: 0,
      depositAppliedCents: 0,
      giftCardCents: 0,
    },
  };
  return {
    ...data,
    payments: [...data.payments, payment],
    agendaOps: { ...ops, giftCards: [...ops.giftCards, card] },
  };
}

/* ------------------------------------------------------------------ */
/* Productos y stock                                                   */
/* ------------------------------------------------------------------ */

export function lowStock(products: ProProduct[]): ProProduct[] {
  return products
    .filter((product) => product.stock <= product.min)
    .sort((a, b) => a.stock - a.min - (b.stock - b.min));
}

/** Cuánto pedir para quedar holgado: el doble del mínimo. */
export function suggestedOrder(product: ProProduct): number {
  return Math.max(1, product.min * 2 - product.stock);
}

/** Productos bajo mínimo agrupados por proveedor. */
export function orderGroups(products: ProProduct[]) {
  const groups = new Map<
    string,
    { supplier: ProProduct["supplier"]; items: ProProduct[] }
  >();
  for (const product of lowStock(products)) {
    const key = product.supplier?.name ?? "Sin proveedor";
    const group = groups.get(key) ?? { supplier: product.supplier, items: [] };
    group.items.push(product);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([name, group]) => ({ name, ...group }));
}

export function orderMessage(
  data: ProData,
  supplierName: string,
  items: ProProduct[],
): string {
  const lines = items
    .map(
      (item) =>
        `${suggestedOrder(item)} x ${item.name}${item.brand ? ` (${item.brand})` : ""}`,
    )
    .join("\n");
  return `Hola, ${supplierName}. Soy ${data.space.owner.firstName || data.space.owner.name} de ${data.space.name}. Os paso el pedido:\n${lines}\nGracias.`;
}

export function saveProduct(data: ProData, product: ProProduct): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  const exists = ops.products.some((row) => row.id === product.id);
  return {
    ...data,
    agendaOps: {
      ...ops,
      products: exists
        ? ops.products.map((row) => (row.id === product.id ? product : row))
        : [...ops.products, product],
    },
  };
}

export function removeProduct(data: ProData, productId: string): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  return {
    ...data,
    agendaOps: {
      ...ops,
      products: ops.products.filter((row) => row.id !== productId),
    },
  };
}

export function adjustStock(
  data: ProData,
  productId: string,
  delta: number,
): ProData {
  const ops = data.agendaOps;
  if (!ops) return data;
  return {
    ...data,
    agendaOps: {
      ...ops,
      products: ops.products.map((row) =>
        row.id === productId
          ? { ...row, stock: Math.max(0, row.stock + delta) }
          : row,
      ),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Cierre del mes                                                      */
/* ------------------------------------------------------------------ */

export type MonthStaffRow = {
  staff: ProStaff;
  serviceCents: number;
  productCents: number;
  tipsCents: number;
  commissionCents: number;
  /** Cuota fija de alquiler de sillón que debe al salón (0 si trabaja a comisión). */
  chairRentCents: number;
  payments: number;
  clockedMinutes: number;
};

export type MonthDayRow = {
  date: string;
  count: number;
  card: number;
  cash: number;
  bizum: number;
  tips: number;
  total: number;
};

export type MonthSummary = {
  month: string;
  days: MonthDayRow[];
  byMethod: Record<Method, number>;
  totalCents: number;
  tipsCents: number;
  serviceCents: number;
  productCents: number;
  /** Bonos y tarjetas regalo vendidos: dinero por adelantado. */
  prepaidCents: number;
  discountCents: number;
  staff: MonthStaffRow[];
};

/** Parte de un cobro que es servicio y parte que es producto. */
export function paymentShares(payment: ProPayment) {
  const agenda = payment.agenda;
  if (agenda?.kind === "bundle" || agenda?.kind === "gift")
    return { service: 0, product: 0, prepaid: payment.amountCents };
  if (!agenda?.lines.length || agenda.kind === "deposit")
    return { service: payment.amountCents, product: 0, prepaid: 0 };
  const service = agenda.bundleId
    ? 0
    : agenda.lines
        .filter((l) => l.kind === "service")
        .reduce((a, l) => a + l.cents, 0);
  const product = agenda.lines
    .filter((l) => l.kind === "product")
    .reduce((a, l) => a + l.cents, 0);
  const total = service + product;
  if (!total) return { service: 0, product: 0, prepaid: 0 };
  const serviceShare = Math.round((payment.amountCents * service) / total);
  return {
    service: serviceShare,
    product: payment.amountCents - serviceShare,
    prepaid: 0,
  };
}

function commissionPct(
  data: ProData,
  payment: ProPayment,
  staff: ProStaff,
): number {
  const serviceId =
    payment.agenda?.lines.find((line) => line.kind === "service")?.refId ??
    data.bookings.find((booking) => booking.id === payment.bookingId)
      ?.serviceId;
  const own = data.services.find((service) => service.id === serviceId)?.agenda
    ?.commissionPct;
  return own ?? staff.commissionPct;
}

/**
 * Resumen de un mes (YYYY-MM) para la gestoría. Con `day` (YYYY-MM-DD) se
 * limita a ese día: la misma cuenta sirve para el cierre diario de Caja.
 */
export function monthSummary(
  data: ProData,
  month: string,
  day?: string,
): MonthSummary {
  const inPeriod = (date: string) =>
    day ? date === day : date.slice(0, 7) === month;
  const payments = data.payments.filter((payment) =>
    inPeriod(localDate(payment.at)),
  );
  const byDay = new Map<string, MonthDayRow>();
  for (const payment of payments) {
    const date = localDate(payment.at);
    const row = byDay.get(date) ?? {
      date,
      count: 0,
      card: 0,
      cash: 0,
      bizum: 0,
      tips: 0,
      total: 0,
    };
    row.count += 1;
    for (const part of paymentSplit(payment)) row[part.method] += part.cents;
    row.tips += payment.tipCents;
    row.total += payment.amountCents + payment.tipCents;
    byDay.set(date, row);
  }
  let serviceCents = 0;
  let productCents = 0;
  let prepaidCents = 0;
  for (const payment of payments) {
    const shares = paymentShares(payment);
    serviceCents += shares.service;
    productCents += shares.product;
    prepaidCents += shares.prepaid;
  }
  const staff = data.staff
    .map((person) => {
      const own = payments.filter((payment) => payment.staffId === person.id);
      let service = 0;
      let product = 0;
      let commission = 0;
      const rent = person.agenda?.chairRentCents ?? 0;
      for (const payment of own) {
        const shares = paymentShares(payment);
        service += shares.service;
        product += shares.product;
        if (!rent) {
          commission += Math.round(
            (shares.service * commissionPct(data, payment, person)) / 100,
          );
          commission += Math.round(
            (shares.product * (person.agenda?.productCommissionPct ?? 0)) / 100,
          );
        }
      }
      const clockedMinutes = data.shifts
        .filter(
          (shift) =>
            shift.staffId === person.id && shift.outAt && inPeriod(shift.date),
        )
        .reduce(
          (total, shift) =>
            total +
            Math.max(
              0,
              (Date.parse(shift.outAt!) - Date.parse(shift.inAt)) / 60000 -
                shift.breakMinutes,
            ),
          0,
        );
      return {
        staff: person,
        serviceCents: service,
        productCents: product,
        tipsCents: own.reduce((total, payment) => total + payment.tipCents, 0),
        commissionCents: commission,
        chairRentCents: rent,
        payments: own.length,
        clockedMinutes: Math.round(clockedMinutes),
      };
    })
    .filter(
      (row) =>
        row.payments > 0 || row.chairRentCents > 0 || row.clockedMinutes > 0,
    );
  return {
    month,
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byMethod: sumByMethod(payments),
    totalCents: payments.reduce(
      (total, payment) => total + payment.amountCents,
      0,
    ),
    tipsCents: payments.reduce((total, payment) => total + payment.tipCents, 0),
    serviceCents,
    productCents,
    prepaidCents,
    discountCents: payments.reduce(
      (total, payment) => total + (payment.agenda?.discountCents ?? 0),
      0,
    ),
    staff,
  };
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** CSV del mes para la gestoría: cobros por día y método, y el equipo. */
export function monthCsv(summary: MonthSummary): string {
  const row = (cells: string[]) => cells.map(proCsvCell).join(";");
  const lines = [
    row([
      "Fecha",
      "Cobros",
      "Tarjeta",
      "Efectivo",
      "Bizum",
      "Propinas",
      "Total",
    ]),
    ...summary.days.map((day) =>
      row([
        day.date,
        String(day.count),
        euros(day.card),
        euros(day.cash),
        euros(day.bizum),
        euros(day.tips),
        euros(day.total),
      ]),
    ),
    row([
      "Total",
      String(summary.days.reduce((a, d) => a + d.count, 0)),
      euros(summary.byMethod.card),
      euros(summary.byMethod.cash),
      euros(summary.byMethod.bizum),
      euros(summary.tipsCents),
      euros(summary.totalCents + summary.tipsCents),
    ]),
    "",
    row([
      "Profesional",
      "Servicios",
      "Productos",
      "Propinas",
      "Comisión",
      "Alquiler de sillón",
      "Horas fichadas",
    ]),
    ...summary.staff.map((person) =>
      row([
        person.staff.name,
        euros(person.serviceCents),
        euros(person.productCents),
        euros(person.tipsCents),
        euros(person.commissionCents),
        euros(person.chairRentCents),
        (person.clockedMinutes / 60).toFixed(1).replace(".", ","),
      ]),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Resumen corto para pegar en un correo o un WhatsApp a la gestoría. */
export function gestoriaText(
  data: ProData,
  summary: MonthSummary,
  monthLabel: string,
): string {
  const staff = summary.staff
    .map((person) =>
      person.chairRentCents
        ? `${person.staff.name}: alquiler de sillón ${money(person.chairRentCents)}, facturado ${money(person.serviceCents + person.productCents)}`
        : `${person.staff.name}: comisión ${money(person.commissionCents)} (servicios ${money(person.serviceCents)}, productos ${money(person.productCents)}, propinas ${money(person.tipsCents)}, ${Math.round(person.clockedMinutes / 60)} h fichadas)`,
    )
    .join("\n");
  return [
    `${data.space.name}, resumen de ${monthLabel}`,
    `Cobrado: ${money(summary.totalCents)} (tarjeta ${money(summary.byMethod.card)}, efectivo ${money(summary.byMethod.cash)}, Bizum ${money(summary.byMethod.bizum)})`,
    `Propinas: ${money(summary.tipsCents)}`,
    `Servicios ${money(summary.serviceCents)}, productos ${money(summary.productCents)}, bonos y tarjetas regalo ${money(summary.prepaidCents)}`,
    "",
    staff,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Rentabilidad por silla                                              */
/* ------------------------------------------------------------------ */

export type ChairRow = {
  staff: ProStaff;
  openMinutes: number;
  bookedMinutes: number;
  occupancyPct: number;
  revenueCents: number;
  revenuePerHourCents: number;
  ticketCents: number;
  visits: number;
  /** Clientes que han repetido con esta persona, sobre los que ha atendido. */
  repeatPct: number;
};

type Visit = {
  at: string;
  serviceId: string;
  staffId?: string;
  clientId: string;
};

function visitsBetween(data: ProData, from: string, to: string): Visit[] {
  return data.clients.flatMap((client) =>
    clientVisits(data, client.id)
      .filter((visit) => {
        const day = localDate(visit.at);
        return day >= from && day <= to;
      })
      .map((visit) => ({ ...visit, clientId: client.id })),
  );
}

/** Ocupación, facturación por hora abierta, ticket medio y repetición de los últimos días. */
export function chairStats(data: ProData, now: Date, days = 28): ChairRow[] {
  const to = addDays(localDate(now), -1);
  const from = addDays(to, -days + 1);
  const visits = visitsBetween(data, from, to);
  const duration = (serviceId: string) =>
    data.services.find((service) => service.id === serviceId)?.durationMin ??
    30;
  return data.staff
    .filter((person) =>
      data.services.some((service) => service.staffIds.includes(person.id)),
    )
    .map((person) => {
      let openMinutes = 0;
      for (let day = from; day <= to; day = addDays(day, 1))
        for (const span of openingIntervals(data, day, person.id))
          openMinutes += span.close - span.open;
      const own = visits.filter((visit) => visit.staffId === person.id);
      const bookedMinutes = own.reduce(
        (total, visit) => total + duration(visit.serviceId),
        0,
      );
      const payments = data.payments.filter((payment) => {
        const day = localDate(payment.at);
        return (
          payment.staffId === person.id &&
          day >= from &&
          day <= to &&
          paymentShares(payment).prepaid === 0
        );
      });
      const revenueCents = payments.reduce(
        (total, payment) => total + payment.amountCents,
        0,
      );
      const clients = new Set(own.map((visit) => visit.clientId));
      const repeat = [...clients].filter(
        (clientId) =>
          clientVisits(data, clientId).filter(
            (visit) => visit.staffId === person.id,
          ).length >= 2,
      ).length;
      return {
        staff: person,
        openMinutes,
        bookedMinutes,
        occupancyPct: openMinutes
          ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100))
          : 0,
        revenueCents,
        revenuePerHourCents: openMinutes
          ? Math.round(revenueCents / (openMinutes / 60))
          : 0,
        ticketCents: own.length ? Math.round(revenueCents / own.length) : 0,
        visits: own.length,
        repeatPct: clients.size ? Math.round((repeat / clients.size) * 100) : 0,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Rentabilidad por cabina o máquina                                   */
/* ------------------------------------------------------------------ */

export type CabinRow = {
  cabin: ProCabin;
  openMinutes: number;
  /** Minutos ocupados, con la preparación posterior incluida. */
  bookedMinutes: number;
  occupancyPct: number;
  sessions: number;
  /** Lo que valen esas sesiones a precio de tarifa. */
  revenueCents: number;
  /** Facturación por cada hora que la cabina está ocupada. */
  perBusyHourCents: number;
  /** Facturación por cada hora que el centro está abierto. */
  perOpenHourCents: number;
  topServiceId?: string;
};

/**
 * Cómo rinde cada cabina y cada máquina en los últimos días. Se calcula con
 * las visitas reales y el precio de tarifa de cada tratamiento: los cobros no
 * siempre dicen qué tratamiento pagaban.
 */
export function cabinStats(data: ProData, now: Date, days = 28): CabinRow[] {
  const cabins = data.agendaOps?.cabins ?? [];
  if (!cabins.length) return [];
  const to = addDays(localDate(now), -1);
  const from = addDays(to, -days + 1);
  const visits = visitsBetween(data, from, to);
  let openMinutes = 0;
  for (let day = from; day <= to; day = addDays(day, 1))
    for (const span of openingIntervals(data, day))
      openMinutes += span.close - span.open;
  return cabins.map((cabin) => {
    const services = data.services.filter(
      (service) => service.agenda?.cabinId === cabin.id,
    );
    const own = visits.filter((visit) =>
      services.some((service) => service.id === visit.serviceId),
    );
    const count = new Map<string, number>();
    let bookedMinutes = 0;
    let revenueCents = 0;
    for (const visit of own) {
      const service = services.find((row) => row.id === visit.serviceId)!;
      bookedMinutes += service.durationMin + (service.agenda?.bufferMin ?? 0);
      revenueCents += service.priceCents;
      count.set(service.id, (count.get(service.id) ?? 0) + 1);
    }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      cabin,
      openMinutes,
      bookedMinutes,
      occupancyPct: openMinutes
        ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100))
        : 0,
      sessions: own.length,
      revenueCents,
      perBusyHourCents: bookedMinutes
        ? Math.round(revenueCents / (bookedMinutes / 60))
        : 0,
      perOpenHourCents: openMinutes
        ? Math.round(revenueCents / (openMinutes / 60))
        : 0,
      topServiceId: top?.[0],
    };
  });
}

export type EmptyHour = { weekday: number; hour: number; freePct: number };

/**
 * Horas de la semana que se quedan vacías con más frecuencia (lunes a las
 * 11, martes a las 16...). Se calculan con las visitas de las últimas semanas.
 */
export function emptyHours(
  data: ProData,
  now: Date,
  weeks = 4,
  limit = 3,
): EmptyHour[] {
  const to = addDays(localDate(now), -1);
  const from = addDays(to, -weeks * 7 + 1);
  const visits = visitsBetween(data, from, to);
  const capacity = new Map<string, number>();
  const booked = new Map<string, number>();
  const staff = data.staff.filter((person) =>
    data.services.some((service) => service.staffIds.includes(person.id)),
  );
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = weekdayIndex(day);
    for (const person of staff)
      for (const span of openingIntervals(data, day, person.id))
        for (
          let hour = Math.ceil(span.open / 60);
          (hour + 1) * 60 <= span.close;
          hour++
        ) {
          const key = `${weekday}:${hour}`;
          capacity.set(key, (capacity.get(key) ?? 0) + 60);
        }
  }
  for (const visit of visits) {
    const start = localMinutes(visit.at);
    const end =
      start +
      (data.services.find((service) => service.id === visit.serviceId)
        ?.durationMin ?? 30);
    const weekday = weekdayIndex(localDate(visit.at));
    for (let hour = Math.floor(start / 60); hour * 60 < end; hour++) {
      const overlap =
        Math.min(end, (hour + 1) * 60) - Math.max(start, hour * 60);
      const key = `${weekday}:${hour}`;
      booked.set(key, (booked.get(key) ?? 0) + Math.max(0, overlap));
    }
  }
  return [...capacity.entries()]
    .map(([key, minutes]) => {
      const [weekday, hour] = key.split(":").map(Number);
      const used = Math.min(minutes, booked.get(key) ?? 0);
      return {
        weekday,
        hour,
        freePct: Math.round(((minutes - used) / minutes) * 100),
      };
    })
    .filter((row) => row.freePct >= 50)
    .sort(
      (a, b) =>
        b.freePct - a.freePct || a.weekday - b.weekday || a.hour - b.hour,
    )
    .slice(0, limit);
}
