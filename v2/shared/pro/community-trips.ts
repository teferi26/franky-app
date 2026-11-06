import type {
  Attendee,
  CommunityActivity,
  CommunityInstallment,
  CommunityPayMethod,
  CommunityTraveller,
  CommunityTrip,
} from "./community-types";
import { proCsvCell } from "./csv";
import { addDays, dayLabel, localDate, money } from "./format";

/**
 * Viajes pagados a plazos: señal al apuntarse y el resto antes de salir.
 *
 * Hoy esto vive en un Excel del tesorero y en capturas de Bizum. Aquí cada
 * viajero tiene sus plazos con fecha, se ve de un vistazo quién va atrasado,
 * el recordatorio sale por WhatsApp con el importe exacto y la lista para el
 * autobús y el seguro se descarga con los datos que piden.
 *
 * Todo es puro: recibe la actividad y devuelve la actividad cambiada.
 */

/* ------------------------------------------------------------------ */
/* Plazos                                                              */
/* ------------------------------------------------------------------ */

export function tripTotalCents(trip: CommunityTrip): number {
  return trip.installments.reduce((acc, i) => acc + i.cents, 0);
}

/** Plazos ordenados por fecha de vencimiento. */
export function sortedInstallments(trip: CommunityTrip): CommunityInstallment[] {
  return [...trip.installments].sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}

/**
 * Plazos por defecto: una señal de un tercio (redondeada a 5 €) que vence en
 * tres días y el resto una semana antes de salir. Si el viaje está muy cerca,
 * todo vence a la vez el día antes.
 */
export function defaultInstallments(
  priceCents: number,
  tripDate: string,
  today: string,
  idPrefix: string,
): CommunityInstallment[] {
  const total = Math.max(0, Math.round(priceCents));
  if (!total) return [];
  const day = localDate(tripDate);
  const lastDay = addDays(day, -1) < today ? today : addDays(day, -1);
  const signalDue = addDays(today, 3) > lastDay ? lastDay : addDays(today, 3);
  const restDue = addDays(day, -7) < signalDue ? lastDay : addDays(day, -7);
  const signal = Math.min(total, Math.max(500, Math.round(total / 3 / 500) * 500));
  if (signal >= total) {
    return [{ id: `${idPrefix}-i1`, label: "Pago único", cents: total, due: lastDay }];
  }
  return [
    { id: `${idPrefix}-i1`, label: "Señal", cents: signal, due: signalDue },
    { id: `${idPrefix}-i2`, label: "Resto", cents: total - signal, due: restDue },
  ];
}

/** Activa el pago a plazos en una actividad. El precio pasa a ser la suma de los plazos. */
export function enableTrip(a: CommunityActivity, today: string): CommunityActivity {
  if (a.trip) return a;
  const installments = defaultInstallments(a.priceCents, a.date, today, a.id);
  return {
    ...a,
    trip: { installments, payments: [] },
    priceCents: installments.reduce((acc, i) => acc + i.cents, 0),
  };
}

/** Cambia los plazos. Los pagos de plazos que desaparecen se descartan. */
export function setInstallments(
  a: CommunityActivity,
  installments: CommunityInstallment[],
): CommunityActivity {
  const clean = installments
    .map((i) => ({ ...i, label: i.label.trim() || "Plazo", cents: Math.max(0, Math.round(i.cents)) }))
    .filter((i) => i.cents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(i.due));
  const ids = new Set(clean.map((i) => i.id));
  const trip = a.trip ?? { installments: [], payments: [] };
  return {
    ...a,
    trip: {
      ...trip,
      installments: clean,
      payments: trip.payments.filter((p) => ids.has(p.installmentId)),
    },
    priceCents: clean.reduce((acc, i) => acc + i.cents, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Cuentas de cada viajero                                             */
/* ------------------------------------------------------------------ */

export type TravellerState = "pagado" | "al_dia" | "atrasado";

export type TravellerMoney = {
  attendeeId: string;
  paidCents: number;
  totalCents: number;
  pendingCents: number;
  /** Lo vencido que aún no ha pagado. */
  overdueCents: number;
  overdue: CommunityInstallment[];
  /** Próximo plazo sin pagar. */
  next?: CommunityInstallment;
  paidIds: Set<string>;
  state: TravellerState;
};

export function travellerMoney(
  trip: CommunityTrip,
  attendeeId: string,
  today: string,
): TravellerMoney {
  const paidIds = new Set(
    trip.payments.filter((p) => p.attendeeId === attendeeId).map((p) => p.installmentId),
  );
  const list = sortedInstallments(trip);
  const unpaid = list.filter((i) => !paidIds.has(i.id));
  const overdue = unpaid.filter((i) => i.due < today);
  const totalCents = tripTotalCents(trip);
  const paidCents = list.filter((i) => paidIds.has(i.id)).reduce((acc, i) => acc + i.cents, 0);
  return {
    attendeeId,
    paidCents,
    totalCents,
    pendingCents: totalCents - paidCents,
    overdueCents: overdue.reduce((acc, i) => acc + i.cents, 0),
    overdue,
    next: unpaid[0],
    paidIds,
    state: !unpaid.length ? "pagado" : overdue.length ? "atrasado" : "al_dia",
  };
}

export type TripSummary = {
  perPersonCents: number;
  travellers: number;
  collectedCents: number;
  expectedCents: number;
  pendingCents: number;
  overdueCents: number;
  /** Viajeros con algún plazo vencido sin pagar. */
  late: number;
  paidInFull: number;
  byInstallment: {
    installment: CommunityInstallment;
    paid: number;
    /** Ya ha vencido. */
    due: boolean;
  }[];
};

/** Estado del viaje para los viajeros apuntados ahora mismo. */
export function tripSummary(
  trip: CommunityTrip,
  attendeeIds: string[],
  today: string,
): TripSummary {
  const rows = attendeeIds.map((id) => travellerMoney(trip, id, today));
  const perPersonCents = tripTotalCents(trip);
  const collectedCents = rows.reduce((acc, r) => acc + r.paidCents, 0);
  return {
    perPersonCents,
    travellers: attendeeIds.length,
    collectedCents,
    expectedCents: perPersonCents * attendeeIds.length,
    pendingCents: perPersonCents * attendeeIds.length - collectedCents,
    overdueCents: rows.reduce((acc, r) => acc + r.overdueCents, 0),
    late: rows.filter((r) => r.state === "atrasado").length,
    paidInFull: rows.filter((r) => r.state === "pagado").length,
    byInstallment: sortedInstallments(trip).map((installment) => ({
      installment,
      paid: rows.filter((r) => r.paidIds.has(installment.id)).length,
      due: installment.due < today,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Cobros                                                              */
/* ------------------------------------------------------------------ */

function withTrip(a: CommunityActivity, fn: (t: CommunityTrip) => CommunityTrip): CommunityActivity {
  return a.trip ? { ...a, trip: fn(a.trip) } : a;
}

/** Apunta el pago de un plazo. Si ya estaba pagado, no cambia nada. */
export function payInstallment(
  a: CommunityActivity,
  attendeeId: string,
  installmentId: string,
  via: CommunityPayMethod,
  at: string,
): CommunityActivity {
  return withTrip(a, (t) => {
    if (!t.installments.some((i) => i.id === installmentId)) return t;
    if (t.payments.some((p) => p.attendeeId === attendeeId && p.installmentId === installmentId)) return t;
    return { ...t, payments: [...t.payments, { attendeeId, installmentId, at, via }] };
  });
}

/** Paga de una vez todo lo que le queda. */
export function payEverything(
  a: CommunityActivity,
  attendeeId: string,
  via: CommunityPayMethod,
  at: string,
): CommunityActivity {
  if (!a.trip) return a;
  return a.trip.installments.reduce(
    (acc, i) => payInstallment(acc, attendeeId, i.id, via, at),
    a,
  );
}

/** Deshace un pago apuntado por error. */
export function undoInstallment(
  a: CommunityActivity,
  attendeeId: string,
  installmentId: string,
): CommunityActivity {
  return withTrip(a, (t) => ({
    ...t,
    payments: t.payments.filter(
      (p) => !(p.attendeeId === attendeeId && p.installmentId === installmentId),
    ),
  }));
}

export function setTraveller(
  a: CommunityActivity,
  attendeeId: string,
  patch: CommunityTraveller,
): CommunityActivity {
  return withTrip(a, (t) => {
    const merged = { ...(t.travellers?.[attendeeId] ?? {}), ...patch };
    const clean: CommunityTraveller = {};
    if (merged.idDoc?.trim()) clean.idDoc = merged.idDoc.trim().toUpperCase();
    if (merged.phone?.trim()) clean.phone = merged.phone.trim();
    if (merged.emergency?.trim()) clean.emergency = merged.emergency.trim();
    return { ...t, travellers: { ...(t.travellers ?? {}), [attendeeId]: clean } };
  });
}

export function markTripReminded(
  a: CommunityActivity,
  attendeeIds: string[],
  at: string,
): CommunityActivity {
  return withTrip(a, (t) => ({
    ...t,
    remindedAt: {
      ...(t.remindedAt ?? {}),
      ...Object.fromEntries(attendeeIds.map((id) => [id, at])),
    },
  }));
}

/**
 * Lo cobrado de un viaje, separado por dónde entró: por Franky (paga comisión
 * y se suma solo a la caja) o a mano (Bizum, efectivo, transferencia).
 * null si la actividad no es un viaje a plazos.
 */
export function tripIncome(a: CommunityActivity): { frankyCents: number; handCents: number } | null {
  if (!a.trip) return null;
  const cents = new Map(a.trip.installments.map((i) => [i.id, i.cents]));
  let frankyCents = 0;
  let handCents = 0;
  for (const p of a.trip.payments) {
    const value = cents.get(p.installmentId) ?? 0;
    if (p.via === "franky") frankyCents += value;
    else handCents += value;
  }
  return { frankyCents, handCents };
}

/* ------------------------------------------------------------------ */
/* Mensajes y listas                                                   */
/* ------------------------------------------------------------------ */

function first(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Recordatorio con lo que debe y hasta cuándo, listo para WhatsApp. */
export function tripReminderMessage(opts: {
  name: string;
  activity: CommunityActivity;
  money: TravellerMoney;
  spaceName: string;
  howToPay: string;
}): string {
  const { activity: a, money: m } = opts;
  const hello = `Hola ${first(opts.name)}, te escribimos de ${opts.spaceName} por ${a.title} (${dayLabel(a.date)}).`;
  if (m.overdue.length) {
    const what = m.overdue.map((i) => `${i.label.toLowerCase()} de ${money(i.cents)}`).join(" y ");
    return `${hello} Te queda pendiente ${what}, que vencía el ${dayLabel(`${m.overdue[0].due}T12:00:00Z`, { weekday: false })}. ${opts.howToPay} Si ya lo has pagado, avísanos y lo apuntamos.`;
  }
  if (m.next) {
    return `${hello} El ${dayLabel(`${m.next.due}T12:00:00Z`, { weekday: false })} vence ${m.next.label.toLowerCase()}: ${money(m.next.cents)}. ${opts.howToPay} Gracias.`;
  }
  return `${hello} Ya lo tienes todo pagado. Nos vemos en la salida.`;
}

const STATE_LABEL: Record<TravellerState, string> = {
  pagado: "Pagado",
  al_dia: "Al día",
  atrasado: "Atrasado",
};

/** Lista de viajeros para la empresa de autobuses y el seguro (CSV para Excel). */
export function travellersCsv(a: CommunityActivity, attendees: Attendee[], today: string): string {
  const trip = a.trip ?? { installments: [], payments: [] };
  const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const header = [
    "N.º",
    "Nombre",
    "DNI, NIE o pasaporte",
    "Teléfono",
    "Contacto de emergencia",
    "Estudios",
    "Universidad",
    "Pagado",
    "Pendiente",
    "Estado",
  ];
  const rows = attendees.map((p, i) => {
    const t = trip.travellers?.[p.id] ?? {};
    const m = travellerMoney(trip, p.id, today);
    return [
      String(i + 1),
      p.name,
      t.idDoc ?? "",
      t.phone ?? "",
      t.emergency ?? "",
      p.studies,
      p.university,
      euros(m.paidCents),
      euros(m.pendingCents),
      STATE_LABEL[m.state],
    ];
  });
  return [header, ...rows].map((r) => r.map(proCsvCell).join(";")).join("\n");
}

/** Viajeros a los que les falta algún dato para el seguro. */
export function missingTravellerData(a: CommunityActivity, attendees: Attendee[]): Attendee[] {
  const t = a.trip?.travellers ?? {};
  return attendees.filter((p) => !t[p.id]?.idDoc);
}

/** Aviso para el grupo del viaje: el próximo plazo, sin señalar a nadie. */
export function tripGroupMessage(a: CommunityActivity, today: string, howToPay: string): string {
  const trip = a.trip;
  const next = trip ? sortedInstallments(trip).find((i) => i.due >= today) : undefined;
  const head = `*${a.title}*, ${dayLabel(a.date)}.`;
  if (!next) return `${head} Si te queda algo por pagar, hazlo antes de salir. ${howToPay}`;
  return (
    `${head} El ${dayLabel(`${next.due}T12:00:00Z`, { weekday: false })} vence ${next.label.toLowerCase()}: ` +
    `${money(next.cents)}. ${howToPay} Si ya lo has pagado, no hace falta que hagas nada.`
  );
}
