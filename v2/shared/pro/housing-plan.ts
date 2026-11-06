import type { ProCampaign, ProData, ProLead, ProProperty, ProRoom, ProTenant } from "./types";
import type { ProHousingExpense, ProPropertyOwner, ProUtilityBill } from "./housing-types";
import { addDays, localDate, money } from "./format";
import { allRooms, daysBetween, shortDate } from "./housing";
import {
  BUDGET_SLACK_CENTS,
  canPublish,
  complianceGaps,
  courseMonths,
  courseResults,
  housingOpsOf,
  monthKey,
  monthTotals,
  occupancyGrid,
  ownerStatement,
  patchRoom,
  patchTenant,
  proposedRent,
  propertyProfit,
  releasingFor,
  renewalCandidates,
  renewalState,
  segmentDays,
  withOps,
  type OccupancySegment,
  type RenewalState,
  type SeasonMoment,
} from "./housing-ops";

/**
 * Planificación y cuentas del motor de vivienda: el curso de un vistazo, la
 * campaña de cada temporada, las renovaciones en bloque, los gastos, los
 * suministros y las liquidaciones a propietarios. Funciones puras sobre
 * `ProData` que comparten la web y la app.
 */

/* ------------------------------------------------------------------ */
/* Curso                                                               */
/* ------------------------------------------------------------------ */

/** "2026/27" a partir del año en que empieza el curso. */
export function courseLabel(startYear: number) {
  return `${startYear}/${String(startYear + 1).slice(2)}`;
}

/** Dónde cae un tramo dentro de la barra del curso, en tanto por ciento. */
export function segmentBox(segment: { from: string; to: string }, range: { from: string; to: string }) {
  const total = segmentDays(range);
  const left = (daysBetween(range.from, segment.from) / total) * 100;
  const width = (segmentDays(segment) / total) * 100;
  return { left: Math.max(0, left), width: Math.max(0.6, Math.min(100 - Math.max(0, left), width)) };
}

/** Días de un tramo que caen dentro de un mes ("2026-10"). */
export function segmentDaysInMonth(segment: { from: string; to: string }, month: string) {
  const monthFrom = `${month}-01`;
  const monthTo = addDays(`${monthKey(addDays(monthFrom, 32))}-01`, -1);
  const from = segment.from > monthFrom ? segment.from : monthFrom;
  const to = segment.to < monthTo ? segment.to : monthTo;
  return to >= from ? daysBetween(from, to) + 1 : 0;
}

/** Habitaciones ocupadas o reservadas cada mes del curso, para la franja de arriba. */
export function monthlyOccupancy(data: ProData, startYear: number) {
  const grid = occupancyGrid(data, startYear);
  return courseMonths(startYear).map((month) => {
    const days = segmentDaysInMonth({ from: `${month}-01`, to: `${month}-31` }, month);
    const busy = grid.reduce(
      (a, row) =>
        a +
        row.segments
          .filter((s) => s.kind === "tenant" || s.kind === "reserved")
          .reduce((b, s) => b + segmentDaysInMonth(s, month), 0),
      0,
    );
    const rooms = Math.max(1, grid.length);
    return { month, pct: Math.round((busy / (days * rooms)) * 100) };
  });
}

/** Resumen del curso para la cabecera: ocupación, huecos y habitaciones de verano. */
export function courseSummary(data: ProData, startYear: number) {
  const grid = occupancyGrid(data, startYear);
  const results = courseResults(data, startYear);
  const withGaps = grid.filter((row) => row.gapDays >= 15);
  const summerRooms = allRooms(data).filter(({ room }) => room.summer).length;
  return {
    rooms: grid.length,
    occupancyPct: results.occupancyPct,
    emptyRoomMonths: results.emptyRoomMonths,
    roomsWithGaps: withGaps.length,
    summerRooms,
    lostCents: grid.reduce((a, row) => a + Math.round((row.room.priceCents * row.gapDays) / 30), 0),
  };
}

/** Hueco más cercano de una habitación que aún se puede llenar. */
export function nextGap(segments: OccupancySegment[], today: string) {
  return segments.find((s) => s.kind === "gap" && s.to >= today && segmentDays(s) >= 7);
}

/** Propone a un interesado la habitación de un hueco. */
export function offerGapToLead(data: ProData, leadId: string, propertyId: string, roomId: string): ProData {
  return {
    ...data,
    leads: data.leads.map((l) => (l.id === leadId ? { ...l, propertyId, roomId } : l)),
  };
}

/**
 * Lista de espera: interesados a los que se contestó que no había hueco y
 * siguen activos. Con habitación, solo los que llegan a su precio.
 */
export function waitlist(data: ProData, room?: ProRoom) {
  const askedAt = (l: ProLead) => l.replies?.filter((r) => r.id === "full").at(-1)?.at ?? "";
  return data.leads
    .filter((l) => (l.stage === "new" || l.stage === "contacted") && askedAt(l))
    .filter((l) => !room || l.budgetCents + BUDGET_SLACK_CENTS >= room.priceCents)
    .sort((a, b) => askedAt(a).localeCompare(askedAt(b)));
}

/** WhatsApp para avisar a quien estaba en lista de espera de que se libera una habitación. */
export function freedRoomText(data: ProData, lead: ProLead, property: ProProperty, room: ProRoom, from: string) {
  const first = lead.name.split(" ")[0];
  return [
    `Hola ${first}, soy ${data.space.owner.firstName}. Te escribo porque me pediste aviso:`,
    `se libera la ${room.name.toLowerCase()} del ${property.title} desde el ${shortDate(from)},`,
    `por ${money(room.priceCents)} al mes. ¿Te interesa verla?`,
  ].join(" ");
}

/** Apunta que se ha avisado a alguien de la lista de espera. */
export function markWaitlistNotified(data: ProData, leadId: string, nowIso: string): ProData {
  return { ...data, leads: data.leads.map((l) => (l.id === leadId ? { ...l, lastContactAt: nowIso } : l)) };
}

/** Abre o cierra una habitación para estancias cortas en julio y agosto. */
export function setSummer(data: ProData, propertyId: string, roomId: string, summer: boolean): ProData {
  return patchRoom(data, propertyId, roomId, { summer });
}

/* ------------------------------------------------------------------ */
/* Campaña de temporada                                                */
/* ------------------------------------------------------------------ */

/** Interesados activos que buscan entrar cerca de esa fecha. */
export function seasonDemand(data: ProData, moment: SeasonMoment) {
  return data.leads.filter(
    (l) =>
      (l.stage === "new" || l.stage === "contacted" || l.stage === "visit") &&
      Math.abs(daysBetween(moment.start, l.moveIn)) <= 45,
  );
}

function seasonCampaignId(moment: SeasonMoment) {
  return `season-${moment.start}`;
}

/** Lo que hay para la próxima temporada: habitaciones, pisos que se pueden anunciar y los que no. */
export function seasonPlan(data: ProData, moment: SeasonMoment) {
  const rooms = releasingFor(data, moment);
  const propertyIds = [...new Set(rooms.map((o) => o.property.id))];
  const properties = data.properties.filter((p) => propertyIds.includes(p.id));
  const campaign = data.campaigns.find(
    (c) => c.id === seasonCampaignId(moment) || (c.moment === moment.title && c.status === "live"),
  );
  return {
    rooms,
    ready: properties.filter((p) => canPublish(p)),
    blocked: properties.filter((p) => !canPublish(p)).map((p) => ({ property: p, gaps: complianceGaps(p) })),
    unpublished: properties.filter((p) => canPublish(p) && !p.published),
    demand: seasonDemand(data, moment),
    launched: campaign?.status === "live" ? campaign : undefined,
  };
}

/**
 * Publica los pisos con habitaciones para esa entrada (solo los que tienen los
 * datos obligatorios) y deja la campaña en marcha para los estudiantes de esa
 * temporada. Si ya había una campaña sugerida o programada, se reutiliza.
 */
export function launchSeason(data: ProData, moment: SeasonMoment, now: Date): ProData {
  const plan = seasonPlan(data, moment);
  const ready = new Set(plan.ready.map((p) => p.id));
  const rooms = plan.rooms.filter((o) => ready.has(o.property.id));
  if (!rooms.length) return data;
  const campaign: ProCampaign = {
    id: seasonCampaignId(moment),
    moment: moment.title,
    title: moment.offer,
    when: `Desde el ${shortDate(localDate(now))}`,
    status: "live",
    audience: moment.audience,
    idea: `${rooms.length === 1 ? "1 habitación libre" : `${rooms.length} habitaciones libres`} para el ${shortDate(moment.start)}, desde ${money(Math.min(...rooms.map((o) => o.priceCents)))} al mes.`,
  };
  const existing = data.campaigns.findIndex((c) => c.id === campaign.id || c.moment === moment.title);
  const campaigns =
    existing >= 0
      ? data.campaigns.map((c, i) => (i === existing ? { ...campaign, id: c.id } : c))
      : [...data.campaigns, campaign];
  return {
    ...data,
    campaigns,
    properties: data.properties.map((p) => (ready.has(p.id) ? { ...p, published: true } : p)),
  };
}

/* ------------------------------------------------------------------ */
/* Renovaciones en bloque                                              */
/* ------------------------------------------------------------------ */

export const RENEWAL_ORDER: RenewalState[] = ["not_asked", "waiting", "staying", "leaving"];

/** Quién sigue, quién se va, quién no contesta y a quién no se le ha preguntado. */
export function renewalBoard(data: ProData, now: Date, horizonDays = 330) {
  const list = renewalCandidates(data, now, horizonDays);
  const by = (state: RenewalState) => list.filter((t) => renewalState(t) === state);
  return {
    all: list,
    not_asked: by("not_asked"),
    waiting: by("waiting"),
    staying: by("staying"),
    leaving: by("leaving"),
  };
}

/** Manda la oferta de renovación a varios inquilinos a la vez, con la subida elegida. */
export function sendRenewalOffers(data: ProData, tenantIds: string[], pctUp: number, now: Date): ProData {
  const at = now.toISOString();
  const ids = new Set(tenantIds);
  return {
    ...data,
    tenants: data.tenants.map((t) =>
      ids.has(t.id) && renewalState(t) === "not_asked"
        ? { ...t, renewalSentAt: at, renewal: { sentAt: at, newRentCents: proposedRent(t.rentCents, pctUp) } }
        : t,
    ),
  };
}

/** Apunta la respuesta del inquilino. Si no sigue, su habitación sale como libre al acabar. */
export function answerRenewal(data: ProData, tenantId: string, answer: "yes" | "no", now: Date): ProData {
  const at = now.toISOString();
  let next = patchTenant(data, tenantId, (t) => ({
    ...t,
    renewal: {
      sentAt: t.renewal?.sentAt ?? at,
      newRentCents: t.renewal?.newRentCents ?? t.rentCents,
      answer,
      answeredAt: at,
    },
    leavingAt: answer === "no" ? (t.leavingAt ?? t.contractEnd.slice(0, 10)) : t.leavingAt,
  }));
  const tenant = next.tenants.find((t) => t.id === tenantId);
  if (answer === "no" && tenant) {
    const room = next.properties.find((p) => p.id === tenant.propertyId)?.rooms.find((r) => r.id === tenant.roomId);
    if (room && room.tenantId === tenantId && room.status === "occupied") {
      next = patchRoom(next, tenant.propertyId, tenant.roomId, {
        status: "leaving",
        availableFrom: addDays(tenant.contractEnd.slice(0, 10), 1),
      });
    }
  }
  return next;
}

/** Renta del curso que viene si todos los que siguen aceptan lo propuesto. */
export function renewalRentCents(tenants: ProTenant[]) {
  return tenants.reduce((a, t) => a + (t.renewal?.newRentCents ?? t.rentCents), 0);
}

/* ------------------------------------------------------------------ */
/* Gastos y suministros                                                */
/* ------------------------------------------------------------------ */

export function addExpense(data: ProData, expense: Omit<ProHousingExpense, "id">, id: string): ProData {
  return withOps(data, (ops) => ({
    ...ops,
    expenses: [...ops.expenses, { ...expense, id }].sort((a, b) => b.date.localeCompare(a.date)),
  }));
}

export function removeExpense(data: ProData, id: string): ProData {
  return withOps(data, (ops) => ({ ...ops, expenses: ops.expenses.filter((e) => e.id !== id) }));
}

export function addUtilityBill(data: ProData, bill: Omit<ProUtilityBill, "id">, id: string): ProData {
  return withOps(data, (ops) => ({ ...ops, utilities: [...ops.utilities, { ...bill, id }] }));
}

export function removeUtilityBill(data: ProData, id: string): ProData {
  return withOps(data, (ops) => ({ ...ops, utilities: ops.utilities.filter((u) => u.id !== id) }));
}

/** Gastos de un año por mes (enero a diciembre), para la gráfica. */
export function expensesByMonth(data: ProData, year: number) {
  const out = Array.from({ length: 12 }, () => 0);
  for (const e of housingOpsOf(data).expenses) {
    if (e.date.slice(0, 4) !== String(year)) continue;
    out[Number(e.date.slice(5, 7)) - 1] += e.amountCents;
  }
  return out;
}

/** Cifras de la cabecera de Cuentas: lo cobrado este mes y cómo va el año. */
export function accountsSummary(data: ProData, now: Date) {
  const today = localDate(now);
  const month = monthKey(today);
  const year = Number(today.slice(0, 4));
  const totals = monthTotals(data, month, now);
  const yearExpenses = housingOpsOf(data)
    .expenses.filter((e) => e.date.slice(0, 4) === String(year))
    .reduce((a, e) => a + e.amountCents, 0);
  const course = propertyProfit(data, courseStartYearOf(today));
  return {
    month,
    year,
    paidCents: totals.paid,
    expectedCents: totals.expected,
    owedCents: totals.owed,
    yearExpensesCents: yearExpenses,
    courseNetCents: course.reduce((a, p) => a + p.netCents, 0),
    courseLostCents: course.reduce((a, p) => a + p.lostCents, 0),
  };
}

function courseStartYearOf(today: string) {
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 6 ? year : year - 1;
}

/** Facturas de suministros de los últimos meses, de la más reciente a la más antigua. */
export function recentBills(data: ProData, propertyId?: string) {
  return housingOpsOf(data)
    .utilities.filter((b) => !propertyId || b.propertyId === propertyId)
    .sort((a, b) => b.to.localeCompare(a.to) || a.kind.localeCompare(b.kind));
}

/* ------------------------------------------------------------------ */
/* Propietarios de la cartera                                          */
/* ------------------------------------------------------------------ */

/** Liquidaciones del mes de todos los propietarios, con los pisos de cada uno. */
export function ownerStatements(data: ProData, month: string, now: Date) {
  return housingOpsOf(data)
    .owners.map((owner) => ownerStatement(data, owner, month, now))
    .filter((s) => s.lines.length > 0);
}

type OwnerStatement = ReturnType<typeof ownerStatements>[number];

/** Lo que sale de la liquidación: a transferir o, si los gastos superan las rentas, a cargo del dueño. */
export function statementBalance(s: OwnerStatement) {
  return s.netCents >= 0
    ? { label: "A transferir", cents: s.netCents, owes: false }
    : { label: "A su cargo", cents: -s.netCents, owes: true };
}

/** Mensaje de WhatsApp con la liquidación del mes. */
export function statementMessage(s: OwnerStatement, monthText: string) {
  const first = s.owner.name.split(" ")[0];
  const base = `Hola ${first}, te paso la liquidación de ${monthText}: rentas ${money(s.rentCents)}, honorarios ${money(s.feeCents)}, gastos ${money(s.expensesCents)}.`;
  const b = statementBalance(s);
  return b.owes
    ? `${base} Este mes los gastos superan las rentas cobradas: quedan ${money(b.cents)} a tu cargo.`
    : `${base} Te transferimos ${money(b.cents)}.`;
}

/** Marca el mes como liquidado (transferencia hecha al propietario). */
export function settleOwner(data: ProData, ownerId: string, month: string): ProData {
  return withOps(data, (ops) => ({
    ...ops,
    owners: ops.owners.map((o: ProPropertyOwner) =>
      o.id === ownerId ? { ...o, settled: [...new Set([...(o.settled ?? []), month])].sort() } : o,
    ),
  }));
}

/** El último mes cerrado: la liquidación se hace a mes vencido. */
export function lastClosedMonth(now: Date) {
  const today = localDate(now);
  return monthKey(addDays(`${monthKey(today)}-01`, -1));
}

/**
 * Mes que se abre al entrar en las liquidaciones: el último cerrado. Si ese
 * mes no se cobró ninguna renta (agosto en un piso de estudiantes), el mes en
 * curso, que es el que de verdad hay que preparar.
 */
export function statementMonth(data: ProData, now: Date) {
  const closed = lastClosedMonth(now);
  const rents = (month: string) => ownerStatements(data, month, now).reduce((a, s) => a + s.rentCents, 0);
  if (rents(closed) > 0) return closed;
  const current = monthKey(localDate(now));
  return rents(current) > 0 ? current : closed;
}
