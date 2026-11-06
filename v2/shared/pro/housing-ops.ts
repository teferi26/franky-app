import type { LeadStage, ProData, ProIncident, ProLead, ProProperty, ProRoom, ProStaff, ProTenant, ProVisit } from "./types";
import type {
  ProHousingOps,
  ProInventory,
  ProInventoryItem,
  ProInventoryState,
  ProMoveOut,
  ProPropertyCompliance,
  ProPropertyOwner,
  ProRentPayment,
  ProTenantDocKind,
  ProTenantDocs,
  ProUtilityBill,
} from "./housing-types";
import { addDays, localDate, minutesToLabel, money } from "./format";
import { PORTAL_FEE, addMonths, allRooms, compatibility, currentTenants, daysBetween, findRoom, shortDate, uniShort, visitSlots } from "./housing";
import { proCsvCell } from "./csv";
import { depositRuleFor, propertyRegion, tenantDepositRequired, type DepositDeadlineRule } from "./housing-region";

/**
 * Operación del motor de vivienda: todo lo que una gestora o un propietario
 * hace cada día con sus pisos después de captar al interesado. Son funciones
 * puras sobre `ProData`: las pantallas web y de Expo las comparten, y los
 * tests las comprueban sin montar nada.
 */

/* ------------------------------------------------------------------ */
/* Datos opcionales                                                     */
/* ------------------------------------------------------------------ */

/** Lo que guarda el motor fuera de pisos e inquilinos, con listas vacías si no hay nada. */
export function housingOpsOf(data: ProData): ProHousingOps {
  const ops = data.housingOps;
  return {
    providers: ops?.providers ?? [],
    expenses: ops?.expenses ?? [],
    utilities: ops?.utilities ?? [],
    keys: ops?.keys ?? [],
    owners: ops?.owners ?? [],
    // Opcionales: se conservan tal cual para que withOps no los pierda.
    ...(ops?.lawSeen ? { lawSeen: ops.lawSeen } : {}),
    ...(ops?.sharedAt ? { sharedAt: ops.sharedAt } : {}),
  };
}

/** Aplica un cambio a `housingOps` sin perder lo demás. */
export function withOps(data: ProData, fn: (ops: ProHousingOps) => ProHousingOps): ProData {
  return { ...data, housingOps: fn(housingOpsOf(data)) };
}

/** Cambia un inquilino por id. */
export function patchTenant(data: ProData, id: string, fn: (t: ProTenant) => ProTenant): ProData {
  return { ...data, tenants: data.tenants.map((t) => (t.id === id ? fn(t) : t)) };
}

/** Cambia un piso por id. */
export function patchProperty(data: ProData, id: string, fn: (p: ProProperty) => ProProperty): ProData {
  return { ...data, properties: data.properties.map((p) => (p.id === id ? fn(p) : p)) };
}

/** Cambia una habitación de un piso. */
export function patchRoom(data: ProData, propertyId: string, roomId: string, fields: Partial<ProRoom>): ProData {
  return patchProperty(data, propertyId, (p) => ({
    ...p,
    rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, ...fields } : r)),
  }));
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

/**
 * Enlace de WhatsApp con el texto escrito. Con teléfono español de 9 cifras se
 * añade el prefijo 34; sin teléfono, WhatsApp deja elegir el chat.
 */
export function whatsappHref(text: string, phone?: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const number = digits.length === 9 ? `34${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

/* ------------------------------------------------------------------ */
/* Días hábiles y fianza                                               */
/* ------------------------------------------------------------------ */

/** Festivos nacionales de fecha fija. Los autonómicos y locales cambian cada año. */
const FIXED_HOLIDAYS = new Set(["01-01", "01-06", "05-01", "08-15", "10-12", "11-01", "12-06", "12-08", "12-25"]);

export function isBusinessDay(date: string): boolean {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !FIXED_HOLIDAYS.has(date.slice(5, 10));
}

/**
 * Días hábiles que quedan desde `from` (sin contarlo) hasta `to` (contándolo).
 * Negativo si `to` ya ha pasado.
 */
export function businessDaysUntil(from: string, to: string): number {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  const [start, end] = sign > 0 ? [from, to] : [to, from];
  let count = 0;
  for (let d = addDays(start, 1); d <= end; d = addDays(d, 1)) if (isBusinessDay(d)) count++;
  return sign * count;
}

/**
 * Último día para depositar la fianza. Por defecto, un mes desde la firma
 * (Comunitat Valenciana); con la regla de otra comunidad, su plazo en meses o
 * en días hábiles (`depositRuleFor` en housing-region.ts).
 */
export function depositDeadline(contractStart: string, rule: DepositDeadlineRule = { months: 1 }): string {
  const start = contractStart.slice(0, 10);
  if ("months" in rule) return addMonths(start, rule.months);
  let date = start;
  for (let left = rule.businessDays; left > 0; ) {
    date = addDays(date, 1);
    if (isBusinessDay(date)) left--;
  }
  return date;
}

/** Plazo de la fianza de un contrato en un piso concreto, según su comunidad. */
export function depositDeadlineFor(property: ProProperty | undefined, contractStart: string): string {
  return depositDeadline(contractStart, depositRuleFor(propertyRegion(property))?.deadline);
}

/** Mensualidades de fianza según el contrato: dos para temporada, una para vivienda o habitación. */
export function depositMonths(kind: ProTenant["contractKind"]): number {
  return kind === "temporada" ? 2 : 1;
}

export const DEPOSIT_FORMS = "modelo 806 u 816";

/** Curso académico de una fecha: de septiembre a agosto ("2026/27"). */
export function academicYear(date: string) {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
  return `${start}/${String(start + 1).slice(2)}`;
}

/** Motivo de un contrato de temporada para un estudiante: sus estudios de ese curso. */
export function temporalityReason(university: string, start: string) {
  return `Estudios en la ${uniShort(university)} durante el curso ${academicYear(start)}`;
}

export function depositCountdown(tenant: ProTenant, today: string) {
  const dueAt = tenant.deposit.dueAt.slice(0, 10);
  const days = daysBetween(today, dueAt);
  return {
    dueAt,
    days,
    businessDays: businessDaysUntil(today, dueAt),
    overdue: days < 0,
    urgent: days <= 7,
  };
}

/* ------------------------------------------------------------------ */
/* Bandeja: quién encaja con algún piso                                 */
/* ------------------------------------------------------------------ */

/** Días de margen: una habitación que se libera poco después de la entrada también vale. */
export const DATE_SLACK_DAYS = 10;
/** Hasta 20 € por encima del presupuesto se enseña como opción. */
export const BUDGET_SLACK_CENTS = 2000;

export type RoomOption = { property: ProProperty; room: ProRoom; from: string; priceCents: number };

export type LeadFit = {
  fits: boolean;
  best?: RoomOption;
  /** Para grupos: el piso entero que les cabe. */
  wholeFlat?: { property: ProProperty; perPersonCents: number; rooms: number };
  reasons: string[];
  issues: string[];
};

/** Habitaciones que estarán libres para una fecha, contando las que acaban contrato. */
export function roomsFreeFor(data: ProData, moveIn: string): RoomOption[] {
  const by = addDays(moveIn.slice(0, 10), DATE_SLACK_DAYS);
  return allRooms(data)
    .filter(({ room }) => room.status !== "reserved")
    .filter(({ property, room }) => {
      if (room.status === "free" || room.status === "leaving") return true;
      // Ocupada: solo si su inquilino acaba antes y no ha dicho que renueva.
      const tenant = data.tenants.find((t) => t.id === room.tenantId && t.propertyId === property.id);
      return !tenant || tenant.renewal?.answer !== "yes";
    })
    .map(({ property, room }) => ({ property, room, from: room.availableFrom.slice(0, 10), priceCents: room.priceCents }))
    .filter((o) => o.from <= by);
}

function wholeFlatFor(data: ProData, lead: ProLead) {
  const size = lead.roomieGroup?.size ?? 0;
  if (!size) return undefined;
  const options = data.properties
    .map((property) => {
      const rooms = roomsFreeFor(data, lead.moveIn).filter((o) => o.property.id === property.id);
      const total = property.wholeFlatPriceCents ?? property.rooms.reduce((a, r) => a + r.priceCents, 0);
      return { property, rooms: rooms.length, perPersonCents: Math.round(total / Math.max(1, property.rooms.length)) };
    })
    .filter((o) => o.rooms >= size && o.property.rooms.length >= size)
    .sort((a, b) => Number(b.property.id === lead.propertyId) - Number(a.property.id === lead.propertyId) || a.perPersonCents - b.perPersonCents);
  return options[0];
}

/**
 * Si un interesado encaja con algún piso y por qué. No hay IA: fechas, meses,
 * presupuesto y verificación, contados igual para todos.
 */
export function leadFit(data: ProData, lead: ProLead): LeadFit {
  const reasons: string[] = [];
  const issues: string[] = [];
  if (lead.verified) reasons.push(`Verificado por la ${uniShort(lead.university)}`);

  if (lead.roomieGroup) {
    const whole = wholeFlatFor(data, lead);
    if (whole) {
      reasons.push(`${whole.property.title}: ${whole.rooms} habitaciones libres para el ${shortDate(lead.moveIn)}`);
      if (whole.perPersonCents <= lead.budgetCents + BUDGET_SLACK_CENTS) {
        reasons.push(`${money(whole.perPersonCents)} por persona, su presupuesto es ${money(lead.budgetCents)}`);
        return { fits: true, wholeFlat: whole, reasons, issues };
      }
      issues.push(`Sale a ${money(whole.perPersonCents - lead.budgetCents)} más por persona de lo que buscan`);
      return { fits: false, wholeFlat: whole, reasons, issues };
    }
    issues.push(`Ningún piso con ${lead.roomieGroup.size} habitaciones libres para el ${shortDate(lead.moveIn)}`);
    return { fits: false, reasons, issues };
  }

  const byDate = roomsFreeFor(data, lead.moveIn);
  if (!byDate.length) {
    const next = allRooms(data)
      .filter(({ room }) => room.status !== "reserved")
      .map(({ room }) => room.availableFrom.slice(0, 10))
      .sort()[0];
    issues.push(`Ninguna habitación libre para el ${shortDate(lead.moveIn)}${next ? `; la primera, el ${shortDate(next)}` : ""}`);
    return { fits: false, reasons, issues };
  }

  const affordable = byDate.filter((o) => o.priceCents <= lead.budgetCents + BUDGET_SLACK_CENTS);
  if (!affordable.length) {
    const cheapest = [...byDate].sort((a, b) => a.priceCents - b.priceCents)[0];
    issues.push(`La más barata libre cuesta ${money(cheapest.priceCents - lead.budgetCents)} más de su presupuesto`);
    return { fits: false, reasons, issues };
  }

  // La mejor: la que eligió, si encaja; si no, la más cara que entra en su presupuesto.
  const best = [...affordable].sort(
    (a, b) =>
      Number(b.room.id === lead.roomId && b.property.id === lead.propertyId) - Number(a.room.id === lead.roomId && a.property.id === lead.propertyId) ||
      Number(b.property.id === lead.propertyId) - Number(a.property.id === lead.propertyId) ||
      Number(a.priceCents > lead.budgetCents) - Number(b.priceCents > lead.budgetCents) ||
      b.priceCents - a.priceCents,
  )[0];
  reasons.push(`Entra el ${shortDate(lead.moveIn)}: ${best.room.name.toLowerCase()} de ${best.property.title} libre desde el ${shortDate(best.from)}`);
  reasons.push(
    best.priceCents <= lead.budgetCents
      ? `Presupuesto ${money(lead.budgetCents)}, la habitación cuesta ${money(best.priceCents)}`
      : `Cuesta ${money(best.priceCents - lead.budgetCents)} más de su presupuesto`,
  );
  reasons.push(`${lead.months} meses${lead.months >= 9 ? ", el curso entero" : ""}`);
  if (affordable.length > 1) reasons.push(`${affordable.length} habitaciones le encajan`);
  return { fits: true, best, reasons, issues };
}

export type InboxEntry = { lead: ProLead; fit: LeadFit };

/** Interesados por contestar o en conversación, separados en encajan y no encajan. */
export function inboxBuckets(data: ProData) {
  const active = data.leads.filter((l) => l.stage === "new" || l.stage === "contacted");
  const entries = active.map((lead) => ({ lead, fit: leadFit(data, lead) }));
  const order = (a: InboxEntry, b: InboxEntry) =>
    Number(b.lead.stage === "new") - Number(a.lead.stage === "new") ||
    Number(b.lead.verified) - Number(a.lead.verified) ||
    a.lead.createdAt.localeCompare(b.lead.createdAt);
  return {
    fit: entries.filter((e) => e.fit.fits).sort(order),
    out: entries.filter((e) => !e.fit.fits).sort(order),
  };
}

/** Asigna la habitación que propone la bandeja. */
export function assignBest(data: ProData, leadId: string): ProData {
  const lead = data.leads.find((l) => l.id === leadId);
  if (!lead) return data;
  const fit = leadFit(data, lead);
  const propertyId = fit.best?.property.id ?? fit.wholeFlat?.property.id;
  if (!propertyId) return data;
  return {
    ...data,
    leads: data.leads.map((l) => (l.id === leadId ? { ...l, propertyId, roomId: fit.best?.room.id } : l)),
  };
}

/* ------------------------------------------------------------------ */
/* Respuestas rápidas                                                  */
/* ------------------------------------------------------------------ */

export type ReplyId = "visit" | "terms" | "docs" | "full";

export type ReplyTemplate = { id: ReplyId; label: string; text: string; nextStage?: LeadStage };

/** Las tres próximas franjas libres de visita, en palabras. */
export function nextSlotsText(data: ProData, now: Date, count = 3): string {
  const today = localDate(now);
  const picks: string[] = [];
  for (let i = 0; i < 14 && picks.length < count; i++) {
    const date = addDays(today, i);
    const slots = visitSlots(data, date, now);
    // Una franja por día, para dar a elegir entre días distintos.
    const slot = slots.find((m) => m >= 17 * 60) ?? slots[0];
    if (slot === undefined) continue;
    const day =
      i === 0
        ? "hoy"
        : i === 1
          ? "mañana"
          : `el ${new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", timeZone: "UTC" })}`;
    picks.push(`${day} a las ${minutesToLabel(slot)}`);
  }
  if (picks.length <= 1) return picks[0] ?? "cuando te venga bien esta semana";
  return `${picks.slice(0, -1).join(", ")} o ${picks[picks.length - 1]}`;
}

function utilitiesText(property?: ProProperty) {
  if (property?.utilitiesCapCents) return `incluidos hasta ${money(property.utilitiesCapCents)} al mes por persona`;
  return "aparte, repartidos por los días que vive cada uno";
}

/** Plantillas de WhatsApp con el nombre, el piso, el precio y las franjas libres ya escritos. */
export function replyTemplates(data: ProData, lead: ProLead, now: Date, landlord: boolean): ReplyTemplate[] {
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const fit = property ? undefined : leadFit(data, lead);
  const p = property ?? fit?.best?.property ?? fit?.wholeFlat?.property;
  const r = room ?? fit?.best?.room;
  const me = data.space.owner.firstName;
  const hello = `Hola ${firstName(lead.name)}, soy ${me}${landlord ? "" : ` de ${data.space.name}`}. Gracias por escribir por Franky.`;
  const price = r?.priceCents ?? (p ? Math.round((p.wholeFlatPriceCents ?? 0) / Math.max(1, p.rooms.length)) : 0);
  const what = lead.roomieGroup
    ? p
      ? `el ${p.title} entero (${p.rooms.length} habitaciones)`
      : "un piso entero para vuestro grupo"
    : r && p
      ? `la ${r.name.toLowerCase()} del ${p.title} (${money(r.priceCents)} al mes)`
      : "una habitación que te encaje";
  const kind: ProTenant["contractKind"] = lead.months >= 11 ? "habitacion" : "temporada";
  const kindLabel = kind === "habitacion" ? "habitación" : "temporada";
  const deposit = price ? money(price * depositMonths(kind)) : "";

  return [
    {
      id: "visit",
      label: "Proponer visita",
      nextStage: "contacted",
      text: `${hello} Te puedo enseñar ${what} ${nextSlotsText(data, now)}. ¿Qué te va mejor? Si aún no estás en Alicante, la hacemos por videollamada.`,
    },
    {
      id: "terms",
      label: "Enviar condiciones",
      nextStage: "contacted",
      text: [
        `${hello} Te paso las condiciones de ${what}:`,
        price ? `Renta: ${money(price)} al mes${lead.roomieGroup ? " por persona" : ""}.` : "",
        deposit ? `Fianza: ${deposit} (${depositMonths(kind) === 2 ? "dos mensualidades" : "una mensualidad"}).` : "",
        `Contrato de ${kindLabel} de ${lead.months} meses desde el ${shortDate(lead.moveIn)}.`,
        `Gastos: ${utilitiesText(p)}.`,
        p ? `A ${p.minutesToCampus} minutos del campus.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      id: "docs",
      label: "Pedir documentación",
      nextStage: "contacted",
      text: `${hello} Para reservarte ${what} necesito tu DNI o NIE, la matrícula o la carta de admisión y el nombre y el teléfono de tu avalista. Me lo puedes mandar por aquí.`,
    },
    {
      id: "full",
      label: landlord ? "Ya está alquilada" : "No hay hueco",
      text: landlord
        ? `${hello} Lo siento, la habitación ya está alquilada. Si quieres, te escribo en cuanto se libere la próxima.`
        : `${hello} Ahora mismo no tengo nada libre para el ${shortDate(lead.moveIn)} que entre en tu presupuesto. Te apunto y te escribo en cuanto se libere algo que te encaje.`,
    },
  ];
}

/** Guarda que se ha contestado con una plantilla y avanza la fase si toca. */
export function recordReply(data: ProData, leadId: string, reply: ReplyTemplate, nowIso: string): ProData {
  return {
    ...data,
    leads: data.leads.map((l) => {
      if (l.id !== leadId) return l;
      const stage = reply.nextStage && l.stage === "new" ? reply.nextStage : l.stage;
      const docs = reply.id === "docs" ? requestDocs(l.docs, nowIso) : l.docs;
      return { ...l, stage, docs, lastContactAt: nowIso, replies: [...(l.replies ?? []), { id: reply.id, at: nowIso }] };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Documentación                                                       */
/* ------------------------------------------------------------------ */

export const DOC_KINDS: { id: ProTenantDocKind; label: string }[] = [
  { id: "id", label: "DNI o NIE" },
  { id: "enrolment", label: "Matrícula o carta de admisión" },
  { id: "guarantor", label: "Avalista" },
  { id: "insurance", label: "Seguro" },
];

export function requestDocs(docs: ProTenantDocs | undefined, nowIso: string): ProTenantDocs {
  const items = { ...(docs?.items ?? {}) };
  for (const kind of DOC_KINDS) {
    const current = items[kind.id];
    if (!current || current.status === "missing") items[kind.id] = { status: "requested", at: nowIso };
  }
  return { ...docs, items };
}

export function docsProgress(docs: ProTenantDocs | undefined) {
  const received = DOC_KINDS.filter((k) => docs?.items[k.id]?.status === "received").length;
  return { received, total: DOC_KINDS.length, complete: received === DOC_KINDS.length };
}

/* ------------------------------------------------------------------ */
/* Visitas: confirmar la víspera                                        */
/* ------------------------------------------------------------------ */

export function visitsOn(data: ProData, date: string): ProVisit[] {
  return data.visits
    .filter((v) => v.status === "scheduled" && localDate(v.start) === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function tomorrowVisits(data: ProData, now: Date) {
  const date = addDays(localDate(now), 1);
  const list = visitsOn(data, date);
  return { date, list, unconfirmed: list.filter((v) => !v.confirmedAt) };
}

export function visitConfirmText(data: ProData, visit: ProVisit): string {
  const lead = data.leads.find((l) => l.id === visit.leadId);
  const property = data.properties.find((p) => p.id === visit.propertyId);
  const hour = new Date(visit.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  const where = visit.mode === "video" ? "por videollamada (te paso el enlace un rato antes)" : `en ${property?.address ?? "el piso"}`;
  return `Hola ${firstName(lead?.name ?? "")}, soy ${data.space.owner.firstName}. Te recuerdo la visita de mañana a las ${hour} ${where}. ¿Me confirmas que vienes?`;
}

/* ------------------------------------------------------------------ */
/* Calendario del curso                                                */
/* ------------------------------------------------------------------ */

/** El curso que se planifica: desde junio ya se mira el que empieza en septiembre. */
export function courseStartYear(now: Date): number {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 6 ? year : year - 1;
}

export function courseRange(startYear: number) {
  return { from: `${startYear}-09-01`, to: `${startYear + 1}-08-31` };
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  for (let m = `${fromMonth}-01`; m.slice(0, 7) <= toMonth && out.length < 60; m = addMonths(m, 1)) out.push(m.slice(0, 7));
  return out;
}

export function courseMonths(startYear: number): string[] {
  return monthsBetween(`${startYear}-09`, `${startYear + 1}-08`);
}

export function monthLabel(month: string, style: "short" | "long" = "short") {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: style, timeZone: "UTC" }).replace(".", "");
}

export type OccupancySegment = {
  kind: "tenant" | "reserved" | "summer" | "gap";
  from: string;
  to: string;
  label: string;
  tenantId?: string;
  leadId?: string;
};

/** Última noche de un inquilino en su habitación. */
export function tenantUntil(t: ProTenant): string {
  return (t.moveOut?.date ?? t.leavingAt ?? t.contractEnd).slice(0, 10);
}

/** Tramos de una habitación durante un periodo: inquilinos, reservas y huecos. */
export function roomSegments(data: ProData, property: ProProperty, room: ProRoom, range: { from: string; to: string }): OccupancySegment[] {
  const busy: OccupancySegment[] = [];
  for (const t of data.tenants) {
    if (t.propertyId !== property.id || t.roomId !== room.id) continue;
    const from = t.contractStart.slice(0, 10);
    const to = tenantUntil(t);
    if (to < range.from || from > range.to) continue;
    busy.push({ kind: "tenant", from, to, label: t.name, tenantId: t.id });
  }
  for (const l of data.leads) {
    if (l.stage !== "reserved" || l.propertyId !== property.id) continue;
    const mine = l.roomId === room.id || (!l.roomId && l.roomieGroup && room.status === "reserved");
    if (!mine) continue;
    const from = (l.contract?.start ?? l.moveIn).slice(0, 10);
    const to = addDays(addMonths(from, l.contract?.months ?? l.months), -1);
    if (to < range.from || from > range.to) continue;
    busy.push({ kind: "reserved", from, to, label: l.name, leadId: l.id });
  }
  busy.sort((a, b) => a.from.localeCompare(b.from));

  const out: OccupancySegment[] = [];
  let cursor = range.from;
  const pushGap = (from: string, to: string) => {
    if (from > to) return;
    if (!room.summer) {
      out.push({ kind: "gap", from, to, label: "Libre" });
      return;
    }
    // Julio y agosto de una habitación de verano cuentan como estancias cortas.
    const summerFrom = `${range.to.slice(0, 4)}-07-01`;
    const summerTo = `${range.to.slice(0, 4)}-08-31`;
    const pieces: [string, string, OccupancySegment["kind"]][] = [
      [from, to < summerFrom ? to : addDays(summerFrom, -1), "gap"],
      [from > summerFrom ? from : summerFrom, to < summerTo ? to : summerTo, "summer"],
      [from > summerTo ? from : addDays(summerTo, 1), to, "gap"],
    ];
    for (const [a, b, kind] of pieces) if (a <= b) out.push({ kind, from: a, to: b, label: kind === "summer" ? "Verano" : "Libre" });
  };
  for (const seg of busy) {
    const from = seg.from < range.from ? range.from : seg.from;
    const to = seg.to > range.to ? range.to : seg.to;
    if (to < cursor) continue;
    pushGap(cursor, addDays(from, -1));
    out.push({ ...seg, from: from < cursor ? cursor : from, to });
    cursor = addDays(to, 1);
  }
  pushGap(cursor, range.to);
  return out;
}

export function segmentDays(s: { from: string; to: string }) {
  return daysBetween(s.from, s.to) + 1;
}

export type CourseRow = { property: ProProperty; room: ProRoom; segments: OccupancySegment[]; gapDays: number };

export function occupancyGrid(data: ProData, startYear: number): CourseRow[] {
  const range = courseRange(startYear);
  return allRooms(data).map(({ property, room }) => {
    const segments = roomSegments(data, property, room, range);
    return { property, room, segments, gapDays: segments.filter((s) => s.kind === "gap").reduce((a, s) => a + segmentDays(s), 0) };
  });
}

/** Interesados que podrían entrar en un hueco: fecha cercana y presupuesto suficiente. */
export function leadsForGap(data: ProData, room: ProRoom, gap: { from: string; to: string }, limit = 4): ProLead[] {
  return data.leads
    .filter((l) => (l.stage === "new" || l.stage === "contacted" || l.stage === "visit") && !l.roomieGroup)
    .filter((l) => l.moveIn.slice(0, 10) >= addDays(gap.from, -20) && l.moveIn.slice(0, 10) <= gap.to)
    .filter((l) => l.budgetCents + BUDGET_SLACK_CENTS >= room.priceCents)
    .sort((a, b) => Math.abs(daysBetween(gap.from, a.moveIn)) - Math.abs(daysBetween(gap.from, b.moveIn)))
    .slice(0, limit);
}

/** Resultados del curso: lo que una gestora enseña a sus propietarios en junio. */
export function courseResults(data: ProData, startYear: number) {
  const range = courseRange(startYear);
  const grid = occupancyGrid(data, startYear);
  const totalDays = segmentDays(range) * Math.max(1, grid.length);
  const busyDays = grid.reduce((a, row) => a + row.segments.filter((s) => s.kind === "tenant" || s.kind === "reserved").reduce((b, s) => b + segmentDays(s), 0), 0);
  const summerDays = grid.reduce((a, row) => a + row.segments.filter((s) => s.kind === "summer").reduce((b, s) => b + segmentDays(s), 0), 0);
  const signed = data.leads.filter((l) => l.stage === "signed");
  const daysToRent = signed.map((l) => Math.max(0, daysBetween(l.createdAt.slice(0, 10), (l.lastContactAt ?? l.createdAt).slice(0, 10))));
  const courseTenants = data.tenants.filter((t) => t.contractStart.slice(0, 10) <= range.to && tenantUntil(t) >= range.from);
  const fromFranky = signed.filter((l) => l.source !== "manual");
  const contractCents = fromFranky.reduce((a, l) => a + (l.contract?.rentCents ?? l.budgetCents) * (l.contract?.months ?? l.months) * (l.roomieGroup?.size ?? 1), 0);
  return {
    occupancyPct: Math.round((busyDays / totalDays) * 100),
    emptyRoomMonths: Math.round(grid.reduce((a, r) => a + r.gapDays, 0) / 30),
    summerRoomMonths: Math.round(summerDays / 30),
    worstRooms: [...grid].sort((a, b) => b.gapDays - a.gapDays).filter((r) => r.gapDays >= 30).slice(0, 3),
    avgDaysToRent: daysToRent.length ? Math.round(daysToRent.reduce((a, b) => a + b, 0) / daysToRent.length) : null,
    avgRentCents: courseTenants.length ? Math.round(courseTenants.reduce((a, t) => a + t.rentCents, 0) / courseTenants.length) : 0,
    frankyContracts: fromFranky.length,
    frankyContractCents: contractCents,
    savedCents: Math.round(contractCents * PORTAL_FEE),
  };
}

/* ------------------------------------------------------------------ */
/* Temporada: qué publicar y a quién                                    */
/* ------------------------------------------------------------------ */

export type SeasonMoment = { id: "september" | "february"; title: string; audience: string; start: string; offer: string };

/** De marzo a agosto se llena septiembre; de septiembre a enero, febrero. */
export function seasonMoment(now: Date): SeasonMoment {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month >= 3 && month <= 8)
    return {
      id: "september",
      title: "Admitidos de septiembre",
      audience: "Admitidos en la UA y la UMH que vienen de fuera",
      start: `${year}-09-01`,
      offer: "Habitaciones para el curso que empieza en septiembre",
    };
  const febYear = month <= 2 ? year : year + 1;
  return {
    id: "february",
    title: "Erasmus y segundo cuatrimestre",
    audience: "Erasmus y estudiantes que llegan en febrero",
    start: `${febYear}-02-01`,
    offer: "Habitaciones para el segundo cuatrimestre, con visita por vídeo",
  };
}

/** Habitaciones que se quedan libres para esa entrada. */
export function releasingFor(data: ProData, moment: SeasonMoment): RoomOption[] {
  return roomsFreeFor(data, moment.start);
}

/* ------------------------------------------------------------------ */
/* Cobros mes a mes                                                    */
/* ------------------------------------------------------------------ */

export type LedgerStatus = "paid" | "pending" | "late" | "unrecorded" | "upcoming";

export type LedgerMonth = { month: string; status: LedgerStatus; amountCents: number; paidAt?: string; current: boolean };

/** Todas las mensualidades del contrato: pasadas, la del mes y las que faltan. */
export function rentLedger(tenant: ProTenant, now: Date): LedgerMonth[] {
  const today = localDate(now);
  const current = monthKey(today);
  const months = monthsBetween(monthKey(tenant.contractStart), monthKey(tenantUntil(tenant)));
  return months.map((month) => {
    const record = tenant.payments?.find((p) => p.month === month);
    if (month === current && tenant.contractStart.slice(0, 10) <= today) {
      return {
        month,
        status: tenant.rentStatus,
        amountCents: record?.amountCents ?? tenant.rentCents,
        paidAt: tenant.rentStatus === "paid" ? (tenant.paidThisMonthAt ?? record?.paidAt) : undefined,
        current: true,
      };
    }
    if (month > current || tenant.contractStart.slice(0, 10) > today)
      return { month, status: "upcoming", amountCents: tenant.rentCents, current: false };
    return {
      month,
      status: record?.status ?? "unrecorded",
      amountCents: record?.amountCents ?? tenant.rentCents,
      paidAt: record?.paidAt,
      current: false,
    };
  });
}

export function ledgerTotals(ledger: LedgerMonth[]) {
  const sum = (s: LedgerStatus[]) => ledger.filter((m) => s.includes(m.status)).reduce((a, m) => a + m.amountCents, 0);
  return {
    paidCents: sum(["paid"]),
    owedCents: sum(["pending", "late"]),
    unrecordedCents: sum(["unrecorded"]),
    upcomingCents: sum(["upcoming"]),
    owedMonths: ledger.filter((m) => m.status === "pending" || m.status === "late").length,
  };
}

/** Marca una mensualidad como cobrada. La del mes en curso actualiza también `rentStatus`. */
export function markMonthPaid(tenant: ProTenant, month: string, now: Date, method: ProRentPayment["method"] = "transfer"): ProTenant {
  const at = now.toISOString();
  const payment: ProRentPayment = { month, status: "paid", amountCents: tenant.rentCents, paidAt: at, method };
  const payments = [...(tenant.payments ?? []).filter((p) => p.month !== month), payment].sort((a, b) => a.month.localeCompare(b.month));
  const isCurrent = month === monthKey(localDate(now));
  return { ...tenant, payments, ...(isCurrent ? { rentStatus: "paid" as const, paidThisMonthAt: at } : {}) };
}

/** Lo esperado y lo cobrado de todos los inquilinos en un mes. */
export function monthTotals(data: ProData, month: string, now: Date) {
  let expected = 0;
  let paid = 0;
  let owed = 0;
  let people = 0;
  for (const t of data.tenants) {
    const line = rentLedger(t, now).find((m) => m.month === month);
    if (!line || line.status === "upcoming") continue;
    people++;
    expected += line.amountCents;
    if (line.status === "paid") paid += line.amountCents;
    if (line.status === "pending" || line.status === "late") owed += line.amountCents;
  }
  return { expected, paid, owed, people };
}

/** Recordatorio de pago escrito para WhatsApp. */
export function rentReminderText(data: ProData, tenant: ProTenant, now: Date): string {
  const owed = rentLedger(tenant, now).filter((m) => m.status === "pending" || m.status === "late");
  const list = owed.map((m) => monthLabel(m.month, "long")).join(" y ");
  const total = owed.reduce((a, m) => a + m.amountCents, 0) || tenant.rentCents;
  return `Hola ${firstName(tenant.name)}, soy ${data.space.owner.firstName}. Te recuerdo la renta de ${list || "este mes"}: ${money(total)}. Cuando la hagas, me avisas por aquí y te mando el recibo. Gracias.`;
}

/* ------------------------------------------------------------------ */
/* Suministros                                                         */
/* ------------------------------------------------------------------ */

export const UTILITY_LABEL: Record<ProUtilityBill["kind"], string> = { luz: "Luz", agua: "Agua", gas: "Gas", internet: "Internet" };

export type BillShare = { tenant: ProTenant; days: number; cents: number; overCapCents: number };

/**
 * Reparte una factura entre quienes vivían en el piso en ese periodo: por días
 * de estancia o a partes iguales. Con tope pactado, lo que lo supera lo paga
 * el dueño (`overCapCents`).
 */
export function splitBill(data: ProData, bill: ProUtilityBill): BillShare[] {
  const property = data.properties.find((p) => p.id === bill.propertyId);
  const people = data.tenants
    .filter((t) => t.propertyId === bill.propertyId)
    .map((tenant) => {
      const from = tenant.contractStart.slice(0, 10) > bill.from ? tenant.contractStart.slice(0, 10) : bill.from;
      const to = tenantUntil(tenant) < bill.to ? tenantUntil(tenant) : bill.to;
      return { tenant, days: to >= from ? daysBetween(from, to) + 1 : 0 };
    })
    .filter((x) => x.days > 0);
  if (!people.length) return [];
  const weights = people.map((x) => (bill.split === "equal" ? 1 : x.days));
  const total = weights.reduce((a, b) => a + b, 0);
  let assigned = 0;
  const billMonths = Math.max(1, Math.round((daysBetween(bill.from, bill.to) + 1) / 30));
  return people.map((x, i) => {
    const raw = i === people.length - 1 ? bill.amountCents - assigned : Math.round((bill.amountCents * weights[i]) / total);
    assigned += raw;
    const cap = property?.utilitiesCapCents ? property.utilitiesCapCents * billMonths : Infinity;
    const cents = Math.min(raw, cap);
    return { tenant: x.tenant, days: x.days, cents, overCapCents: raw - cents };
  });
}

/** Parte de suministros de un inquilino en las facturas que cierran ese mes. */
export function utilitiesFor(data: ProData, tenant: ProTenant, month: string) {
  return housingOpsOf(data)
    .utilities.filter((b) => b.propertyId === tenant.propertyId && monthKey(b.to) === month)
    .map((bill) => ({ bill, share: splitBill(data, bill).find((s) => s.tenant.id === tenant.id) }))
    .filter((x): x is { bill: ProUtilityBill; share: BillShare } => Boolean(x.share && x.share.cents > 0));
}

/* ------------------------------------------------------------------ */
/* Recibo                                                              */
/* ------------------------------------------------------------------ */

export type Receipt = {
  number: string;
  month: string;
  from: string;
  to: string;
  rentCents: number;
  utilities: { label: string; cents: number; period: string }[];
  totalCents: number;
  status: LedgerStatus;
  paidAt?: string;
};

export function receiptFor(data: ProData, tenant: ProTenant, month: string, now: Date): Receipt {
  const line = rentLedger(tenant, now).find((m) => m.month === month);
  const monthStart = `${month}-01`;
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const from = tenant.contractStart.slice(0, 10) > monthStart ? tenant.contractStart.slice(0, 10) : monthStart;
  const until = tenantUntil(tenant);
  const to = until < monthEnd ? until : monthEnd;
  const utilities = utilitiesFor(data, tenant, month).map(({ bill, share }) => ({
    label: UTILITY_LABEL[bill.kind],
    cents: share.cents,
    period: `${shortDate(bill.from)} a ${shortDate(bill.to)}, ${share.days} días`,
  }));
  const rentCents = line?.amountCents ?? tenant.rentCents;
  return {
    number: `${month.replace("-", "")}-${tenant.id.toUpperCase()}`,
    month,
    from,
    to,
    rentCents,
    utilities,
    totalCents: rentCents + utilities.reduce((a, u) => a + u.cents, 0),
    status: line?.status ?? "unrecorded",
    paidAt: line?.paidAt,
  };
}

/* ------------------------------------------------------------------ */
/* Salida, inventario y liquidación de fianza                           */
/* ------------------------------------------------------------------ */

export const INVENTORY_STATE: Record<ProInventoryState, { label: string; rank: number }> = {
  good: { label: "Bien", rank: 0 },
  worn: { label: "Uso normal", rank: 1 },
  damaged: { label: "Dañado", rank: 2 },
  missing: { label: "Falta", rank: 3 },
};

/** Lo que se revisa en cada habitación al entrar y al salir. */
export function defaultInventory(room?: ProRoom): ProInventoryItem[] {
  const items = ["Cama y colchón", "Escritorio y silla", "Armario", "Paredes y suelo", "Ventana y persiana", "Llave de la habitación"];
  if (room?.privateBath) items.splice(4, 0, "Baño");
  return items.map((label, i) => ({ id: `inv-${i + 1}`, label, in: "good" }));
}

export function inventoryOf(tenant: ProTenant, room?: ProRoom): ProInventory {
  return tenant.inventory ?? { items: defaultInventory(room), inPhotos: 0 };
}

/** Lo que ha empeorado entre la entrada y la salida. El uso normal no cuenta como daño. */
export function inventoryChanges(inventory: ProInventory) {
  return inventory.items
    .filter((i) => i.out && INVENTORY_STATE[i.out].rank > INVENTORY_STATE[i.in].rank && i.out !== "worn")
    .map((i) => ({ item: i, from: INVENTORY_STATE[i.in].label, to: INVENTORY_STATE[i.out!].label }));
}

export function newMoveOut(tenant: ProTenant): ProMoveOut {
  return {
    date: tenantUntil(tenant),
    checks: { keys: false, photos: false, meters: false, room: false },
    deductions: [],
  };
}

export function settlement(tenant: ProTenant, moveOut: ProMoveOut = tenant.moveOut ?? newMoveOut(tenant)) {
  const depositCents = tenant.deposit.amountCents;
  const deductionsCents = moveOut.deductions.reduce((a, d) => a + Math.max(0, d.amountCents), 0);
  // Una mensualidad sin pagar también se descuenta de la fianza.
  return { depositCents, deductionsCents, returnCents: Math.max(0, depositCents - deductionsCents) };
}

export const MOVE_OUT_CHECKS: { id: keyof ProMoveOut["checks"]; label: string }[] = [
  { id: "keys", label: "Llaves devueltas" },
  { id: "photos", label: "Fotos de la habitación hechas" },
  { id: "meters", label: "Contadores apuntados" },
  { id: "room", label: "Habitación revisada con el inventario" },
];

/** Qué falta para cerrar una salida. */
export function moveOutMissing(data: ProData, tenant: ProTenant, moveOut: ProMoveOut): string[] {
  const missing = MOVE_OUT_CHECKS.filter((c) => !moveOut.checks[c.id]).map((c) => c.label);
  const keys = keysHeldBy(data, tenant.id);
  if (keys.length) missing.unshift(`${keys.length === 1 ? "Tiene 1 juego de llaves" : `Tiene ${keys.length} juegos de llaves`} sin devolver`);
  return [...new Set(missing)];
}

/** Cierra la salida: libera la habitación, devuelve las llaves y marca la fianza devuelta. */
export function closeMoveOut(data: ProData, tenantId: string, moveOut: ProMoveOut, now: Date): ProData {
  const tenant = data.tenants.find((t) => t.id === tenantId);
  if (!tenant) return data;
  const today = localDate(now);
  const { returnCents } = settlement(tenant, moveOut);
  const closed: ProMoveOut = { ...moveOut, returnCents, closedAt: now.toISOString() };
  let next = patchTenant(data, tenantId, (t) => ({
    ...t,
    moveOut: closed,
    leavingAt: moveOut.date,
    contractEnd: moveOut.date < t.contractEnd ? moveOut.date : t.contractEnd,
    deposit: { ...t.deposit, status: "returned" },
    returnedAt: today,
  }));
  next = withOps(next, (ops) => ({
    ...ops,
    keys: ops.keys.map((k) => (k.tenantId === tenantId ? { ...k, tenantId: undefined, holder: "Oficina", since: today } : k)),
  }));
  const room = next.properties.find((p) => p.id === tenant.propertyId)?.rooms.find((r) => r.id === tenant.roomId);
  if (room && room.tenantId === tenantId) {
    next = patchRoom(next, tenant.propertyId, tenant.roomId, {
      status: moveOut.date < today ? "free" : "leaving",
      availableFrom: addDays(moveOut.date, 1),
      tenantId: moveOut.date < today ? undefined : room.tenantId,
    });
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Llaves                                                              */
/* ------------------------------------------------------------------ */

export function keysHeldBy(data: ProData, tenantId: string) {
  return housingOpsOf(data).keys.filter((k) => k.tenantId === tenantId);
}

export function keysFor(data: ProData, propertyId: string) {
  return housingOpsOf(data).keys.filter((k) => k.propertyId === propertyId);
}

/* ------------------------------------------------------------------ */
/* Normas y limpieza                                                   */
/* ------------------------------------------------------------------ */

export const CLEANING_ZONES = ["Cocina", "Baño", "Salón y pasillo", "Basura y reciclaje"];

export const DEFAULT_RULES = [
  "Silencio de 23:00 a 8:00 entre semana.",
  "Visitas que se quedan a dormir: avisad antes al resto.",
  "Cada uno friega lo suyo el mismo día.",
  "Nada de fumar dentro del piso.",
];

/** Turno de limpieza rotativo: cada semana, cada zona a una persona distinta. */
export function cleaningRota(names: string[], weekStart: string, weeks = 4) {
  if (!names.length) return [];
  return Array.from({ length: weeks }, (_, w) => ({
    week: addDays(weekStart, w * 7),
    tasks: CLEANING_ZONES.map((zone, z) => ({ zone, name: names[(z + w) % names.length] })),
  }));
}

/* ------------------------------------------------------------------ */
/* Renovaciones                                                        */
/* ------------------------------------------------------------------ */

export type RenewalState = "staying" | "leaving" | "waiting" | "not_asked";

export const RENEWAL_LABEL: Record<RenewalState, string> = {
  staying: "Sigue",
  leaving: "Se va",
  waiting: "Sin contestar",
  not_asked: "Sin avisar",
};

export function renewalState(t: ProTenant): RenewalState {
  if (t.renewal?.answer === "yes") return "staying";
  if (t.renewal?.answer === "no" || t.leavingAt) return "leaving";
  if (t.renewal || t.renewalSentAt) return "waiting";
  return "not_asked";
}

/** Inquilinos cuyo contrato acaba en los próximos meses. */
export function renewalCandidates(data: ProData, now: Date, horizonDays = 150) {
  const today = localDate(now);
  const limit = addDays(today, horizonDays);
  return currentTenants(data, now)
    .filter((t) => !t.moveOut?.closedAt && t.contractEnd.slice(0, 10) <= limit)
    .sort((a, b) => a.contractEnd.localeCompare(b.contractEnd));
}

/** Renta propuesta con una subida en tanto por ciento, redondeada a 5 €. */
export function proposedRent(rentCents: number, pctUp: number) {
  return Math.round((rentCents * (1 + pctUp / 100)) / 500) * 500;
}

export function renewalText(data: ProData, t: ProTenant, newRentCents: number): string {
  const { property, room } = findRoom(data, t.propertyId, t.roomId);
  const next = addDays(t.contractEnd.slice(0, 10), 1);
  const change = newRentCents === t.rentCents ? `a la misma renta, ${money(newRentCents)} al mes` : `por ${money(newRentCents)} al mes (ahora pagas ${money(t.rentCents)})`;
  return `Hola ${firstName(t.name)}, soy ${data.space.owner.firstName}. Tu contrato de ${room?.name.toLowerCase() ?? "la habitación"} en ${property?.title ?? "el piso"} acaba el ${shortDate(t.contractEnd)}. ¿Quieres seguir el curso que viene? Te la guardo desde el ${shortDate(next)} ${change}. Dime algo antes del ${shortDate(addDays(localDate(new Date()), 15))} y la reservo.`;
}

/* ------------------------------------------------------------------ */
/* Compatibilidad con quien ya vive                                     */
/* ------------------------------------------------------------------ */

export function flatCompatibility(data: ProData, personId: string, propertyId: string, now: Date, exceptTenantId?: string) {
  const flatmates = currentTenants(data, now).filter((t) => t.propertyId === propertyId && t.id !== exceptTenantId && !t.leavingAt);
  if (!flatmates.length) return null;
  const scores = flatmates.map((f) => compatibility(personId, f.id));
  return { score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), with: flatmates.length };
}

/* ------------------------------------------------------------------ */
/* Datos obligatorios del piso                                          */
/* ------------------------------------------------------------------ */

export const ENERGY_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

/** Lo que le falta a un piso para anunciarse. */
export function complianceGaps(p: ProProperty): string[] {
  const c: ProPropertyCompliance = p.compliance ?? {};
  const out: string[] = [];
  if (!c.nrua?.trim()) out.push("NRUA");
  if (!c.energyLetter) out.push("letra energética");
  return out;
}

export function canPublish(p: ProProperty) {
  return complianceGaps(p).length === 0;
}

/* ------------------------------------------------------------------ */
/* Gastos, liquidaciones y renta del año                               */
/* ------------------------------------------------------------------ */

export const EXPENSE_LABEL: Record<import("./housing-types").ProExpenseCategory, string> = {
  ibi: "IBI",
  comunidad: "Comunidad",
  seguro: "Seguro",
  reparacion: "Reparaciones",
  muebles: "Muebles y equipamiento",
  suministros: "Suministros",
  limpieza: "Limpieza",
  otros: "Otros",
};

function paidInMonth(t: ProTenant, month: string, now: Date) {
  const line = rentLedger(t, now).find((m) => m.month === month);
  return line?.status === "paid" ? line.amountCents : 0;
}

/** Liquidación mensual a un propietario: rentas cobradas, honorarios, gastos y neto. */
export function ownerStatement(data: ProData, owner: ProPropertyOwner, month: string, now: Date) {
  const ops = housingOpsOf(data);
  const lines = data.properties
    .filter((p) => p.ownerId === owner.id)
    .map((property) => {
      const tenants = data.tenants.filter((t) => t.propertyId === property.id);
      const rentCents = tenants.reduce((a, t) => a + paidInMonth(t, month, now), 0);
      const expensesCents = ops.expenses.filter((e) => e.propertyId === property.id && monthKey(e.date) === month).reduce((a, e) => a + e.amountCents, 0);
      const feeCents = Math.round(rentCents * owner.feePct);
      return { property, rentCents, feeCents, expensesCents, netCents: rentCents - feeCents - expensesCents, paidRents: tenants.filter((t) => paidInMonth(t, month, now) > 0).length };
    });
  const total = (k: "rentCents" | "feeCents" | "expensesCents" | "netCents") => lines.reduce((a, l) => a + l[k], 0);
  return {
    owner,
    month,
    lines,
    rentCents: total("rentCents"),
    feeCents: total("feeCents"),
    expensesCents: total("expensesCents"),
    netCents: total("netCents"),
    settled: Boolean(owner.settled?.includes(month)),
  };
}

function overlapDays(a: { from: string; to: string }, b: { from: string; to: string }) {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return to >= from ? daysBetween(from, to) + 1 : 0;
}

/**
 * La renta de un año por piso, para el asesor: ingresos cobrados, gastos por
 * categoría, días alquilados y tipos de contrato. No calcula impuestos.
 */
export function rentalYear(data: ProData, year: number, now: Date) {
  const ops = housingOpsOf(data);
  const range = { from: `${year}-01-01`, to: `${year}-12-31` };
  const months = monthsBetween(`${year}-01`, `${year}-12`);
  return data.properties.map((property) => {
    const tenants = data.tenants.filter((t) => t.propertyId === property.id);
    const incomeCents = tenants.reduce((a, t) => a + months.reduce((b, m) => b + paidInMonth(t, m, now), 0), 0);
    const expenses = ops.expenses.filter((e) => e.propertyId === property.id && e.date.slice(0, 4) === String(year));
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
    const roomDays = tenants.reduce((a, t) => a + overlapDays({ from: t.contractStart.slice(0, 10), to: tenantUntil(t) }, range), 0);
    const kinds = [...new Set(tenants.filter((t) => overlapDays({ from: t.contractStart.slice(0, 10), to: tenantUntil(t) }, range) > 0).map((t) => t.contractKind))];
    const expensesCents = expenses.reduce((a, e) => a + e.amountCents, 0);
    return {
      property,
      incomeCents,
      expensesCents,
      byCategory: [...byCategory.entries()].map(([category, cents]) => ({ category: category as keyof typeof EXPENSE_LABEL, cents })),
      roomDays,
      occupancyPct: Math.round((roomDays / (Math.max(1, property.rooms.length) * (daysBetween(range.from, range.to) + 1))) * 100),
      kinds,
      netCents: incomeCents - expensesCents,
    };
  });
}

/** Lo que deja de verdad cada piso en el curso: renta prevista, gastos y meses vacíos. */
export function propertyProfit(data: ProData, startYear: number) {
  const range = courseRange(startYear);
  const ops = housingOpsOf(data);
  const grid = occupancyGrid(data, startYear);
  return data.properties.map((property) => {
    const rows = grid.filter((r) => r.property.id === property.id);
    const rentCents = rows.reduce(
      (a, row) =>
        a + row.segments.filter((s) => s.kind === "tenant" || s.kind === "reserved").reduce((b, s) => b + Math.round((row.room.priceCents * segmentDays(s)) / 30), 0),
      0,
    );
    const expensesCents = ops.expenses.filter((e) => e.propertyId === property.id && e.date >= range.from && e.date <= range.to).reduce((a, e) => a + e.amountCents, 0);
    const emptyMonths = Math.round(rows.reduce((a, r) => a + r.gapDays, 0) / 30);
    const lostCents = rows.reduce((a, r) => a + Math.round((r.room.priceCents * r.gapDays) / 30), 0);
    return { property, rentCents, expensesCents, emptyMonths, lostCents, netCents: rentCents - expensesCents, perRoomCents: Math.round((rentCents - expensesCents) / Math.max(1, property.rooms.length)) };
  });
}

/* ------------------------------------------------------------------ */
/* Plazos                                                              */
/* ------------------------------------------------------------------ */

export type HousingDeadline = {
  id: string;
  date: string;
  kind: "deposit" | "contract_end" | "energy" | "insurance" | "ibi" | "nrua";
  title: string;
  detail: string;
  tenantId?: string;
  propertyId?: string;
  tone: "danger" | "warning" | "neutral";
};

/** Fianzas, fines de contrato, certificado, seguro e IBI en orden de fecha. */
export function housingDeadlines(data: ProData, now: Date, horizonDays = 60): HousingDeadline[] {
  const today = localDate(now);
  const limit = addDays(today, horizonDays);
  const out: HousingDeadline[] = [];
  const tone = (date: string): HousingDeadline["tone"] => (daysBetween(today, date) <= 7 ? "danger" : daysBetween(today, date) <= 21 ? "warning" : "neutral");
  const flat = (id: string) => data.properties.find((p) => p.id === id)?.title ?? "";

  for (const t of data.tenants) {
    // Donde ya no se deposita (Andalucía desde 2026), no hay plazo que vigilar.
    if (t.deposit.status === "pending" && tenantDepositRequired(data, t)) {
      const c = depositCountdown(t, today);
      out.push({
        id: `dep-${t.id}`,
        date: c.dueAt,
        kind: "deposit",
        title: `Depositar la fianza de ${t.name}`,
        detail: `${money(t.deposit.amountCents)}, ${c.overdue ? "fuera de plazo" : `quedan ${c.businessDays} días hábiles`}`,
        tenantId: t.id,
        tone: c.overdue ? "danger" : tone(c.dueAt),
      });
    }
    const end = t.contractEnd.slice(0, 10);
    if (end >= today && end <= limit && !t.moveOut?.closedAt && renewalState(t) !== "staying") {
      out.push({
        id: `end-${t.id}`,
        date: end,
        kind: "contract_end",
        title: `Acaba el contrato de ${t.name}`,
        detail: `${flat(t.propertyId)}, ${RENEWAL_LABEL[renewalState(t)].toLowerCase()}`,
        tenantId: t.id,
        tone: tone(end),
      });
    }
  }
  for (const p of data.properties) {
    const c = p.compliance ?? {};
    if (p.published && !c.nrua)
      out.push({ id: `nrua-${p.id}`, date: today, kind: "nrua", title: `${p.title} sin NRUA`, detail: "Pídelo en el Registro de la Propiedad", propertyId: p.id, tone: "warning" });
    const checks: [string | undefined, HousingDeadline["kind"], string, number][] = [
      [c.energyExpiresAt, "energy", "Caduca el certificado energético", 120],
      [c.insuranceRenewsAt, "insurance", "Renueva el seguro", horizonDays],
      [c.ibiDueAt, "ibi", "Se paga el IBI", horizonDays],
    ];
    for (const [date, kind, title, days] of checks) {
      if (!date || date < today || date > addDays(today, days)) continue;
      out.push({ id: `${kind}-${p.id}`, date, kind, title, detail: p.title, propertyId: p.id, tone: tone(date) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Equipo                                                              */
/* ------------------------------------------------------------------ */

/** Rendimiento por agente en los últimos días: lo ve solo quien dirige. */
export function agentStats(data: ProData, now: Date, days = 30) {
  const from = addDays(localDate(now), -days + 1);
  const agents = data.staff.filter((s: ProStaff) => s.role === "agent" || data.leads.some((l) => l.agentId === s.id));
  return agents.map((staff) => {
    const mine = data.leads.filter((l) => l.agentId === staff.id);
    const answered = mine.filter((l) => l.stage !== "new" && (l.replies?.[0]?.at ?? l.lastContactAt));
    const minutes = answered.map((l) => Math.max(0, (new Date(l.replies?.[0]?.at ?? l.lastContactAt!).getTime() - new Date(l.createdAt).getTime()) / 60000));
    const visits = data.visits.filter((v) => v.agentId === staff.id && localDate(v.start) >= from && v.status !== "cancelled");
    return {
      staff,
      active: mine.filter((l) => l.stage !== "lost" && l.stage !== "signed").length,
      waiting: mine.filter((l) => l.stage === "new").length,
      responseMin: minutes.length ? Math.round(minutes.sort((a, b) => a - b)[Math.floor(minutes.length / 2)]) : null,
      visits: visits.length,
      visitsDone: visits.filter((v) => v.status === "done").length,
      signed: mine.filter((l) => l.stage === "signed" && localDate(l.lastContactAt ?? l.createdAt) >= from).length,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Grupos de Roomie: piso entero                                        */
/* ------------------------------------------------------------------ */

/** Reserva todas las habitaciones de un piso para un grupo de Roomie a la vez. */
export function reserveWholeFlat(data: ProData, leadId: string, propertyId: string, start: string, nowIso: string): ProData {
  const lead = data.leads.find((l) => l.id === leadId);
  const property = data.properties.find((p) => p.id === propertyId);
  if (!lead?.roomieGroup || !property) return data;
  const size = lead.roomieGroup.size;
  const free = roomsFreeFor(data, start).filter((o) => o.property.id === propertyId).slice(0, size);
  if (free.length < size) return data;
  const total = property.wholeFlatPriceCents ?? property.rooms.reduce((a, r) => a + r.priceCents, 0);
  const perPerson = Math.round(total / property.rooms.length);
  const ids = new Set(free.map((o) => o.room.id));
  return {
    ...patchProperty(data, propertyId, (p) => ({
      ...p,
      rooms: p.rooms.map((r) => (ids.has(r.id) ? { ...r, status: "reserved" as const, availableFrom: start } : r)),
    })),
    leads: data.leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            stage: "reserved" as LeadStage,
            propertyId,
            roomId: undefined,
            contractSentAt: nowIso,
            lastContactAt: nowIso,
            contract: { kind: l.months >= 11 ? "habitacion" : "temporada", start, months: l.months, rentCents: perPerson },
          }
        : l,
    ),
  };
}

/** Firma del grupo: un inquilino por persona en las habitaciones reservadas. */
export function signGroup(data: ProData, leadId: string, now: Date): ProData {
  const lead = data.leads.find((l) => l.id === leadId);
  const property = data.properties.find((p) => p.id === lead?.propertyId);
  if (!lead?.roomieGroup || !property || !lead.contract) return data;
  const rooms = property.rooms.filter((r) => r.status === "reserved").slice(0, lead.roomieGroup.size);
  const c = lead.contract;
  const end = addDays(addMonths(c.start, c.months), -1);
  const names = lead.roomieGroup.names.map((n, i) => (i === 0 ? lead.name : n));
  const stamp = now.getTime().toString(36);
  const tenants: ProTenant[] = rooms.map((room, i) => ({
    id: `t-${stamp}-${i + 1}`,
    name: names[i] ?? `${firstName(lead.name)} (grupo)`,
    university: lead.university,
    propertyId: property.id,
    roomId: room.id,
    rentCents: c.rentCents,
    contractStart: c.start,
    contractEnd: end,
    contractKind: c.kind,
    deposit: { amountCents: c.rentCents * depositMonths(c.kind), status: "pending", dueAt: depositDeadlineFor(property, c.start) },
    rentStatus: c.start <= localDate(now) ? "pending" : "paid",
    docs: lead.docs,
  }));
  const byRoom = new Map(tenants.map((t) => [t.roomId, t.id]));
  return {
    ...patchProperty(data, property.id, (p) => ({
      ...p,
      rooms: p.rooms.map((r) => (byRoom.has(r.id) ? { ...r, status: "occupied" as const, tenantId: byRoom.get(r.id), availableFrom: addDays(end, 1) } : r)),
    })),
    tenants: [...data.tenants, ...tenants],
    leads: data.leads.map((l) => (l.id === leadId ? { ...l, stage: "signed" as LeadStage, lastContactAt: now.toISOString() } : l)),
  };
}

/* ------------------------------------------------------------------ */
/* Incidencias                                                         */
/* ------------------------------------------------------------------ */

export const TRADE_LABEL: Record<import("./housing-types").ProProviderTrade, string> = {
  fontaneria: "Fontanería",
  electricidad: "Electricidad",
  cerrajeria: "Cerrajería",
  calderas: "Calderas",
  limpieza: "Limpieza",
  electrodomesticos: "Electrodomésticos",
  otros: "Otros",
};

/** Minutos que lleva abierta una incidencia (o que tardó en resolverse). */
export function incidentOpenMinutes(i: ProIncident, now: Date) {
  const end = i.resolvedAt ? new Date(i.resolvedAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - new Date(i.createdAt).getTime()) / 60000));
}

export function providerText(data: ProData, i: ProIncident): string {
  const { property, room } = findRoom(data, i.propertyId, i.roomId);
  return `Hola, soy ${data.space.owner.firstName} de ${data.space.name}. Tengo una incidencia en ${property?.address ?? "un piso"}${room ? ` (${room.name.toLowerCase()})` : ""}: ${i.title.toLowerCase()}. ¿Cuándo podrías pasarte? El inquilino es ${i.tenantName}.`;
}

/* ------------------------------------------------------------------ */
/* Exportar a CSV                                                      */
/* ------------------------------------------------------------------ */

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((row) => row.map((c) => proCsvCell(String(c))).join(";")).join("\n");
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function tenantsCsv(data: ProData): string {
  return toCsv(
    ["Inquilino", "Universidad", "Piso", "Habitación", "Contrato", "Desde", "Hasta", "Renta", "Fianza", "Estado de la fianza"],
    data.tenants.map((t) => {
      const { property, room } = findRoom(data, t.propertyId, t.roomId);
      return [t.name, t.university, property?.title ?? "", room?.name ?? "", t.contractKind, t.contractStart.slice(0, 10), t.contractEnd.slice(0, 10), euros(t.rentCents), euros(t.deposit.amountCents), t.deposit.status];
    }),
  );
}

export function paymentsCsv(data: ProData, now: Date): string {
  const label: Record<LedgerStatus, string> = { paid: "Cobrada", pending: "Pendiente", late: "Con retraso", unrecorded: "Sin apuntar", upcoming: "Por venir" };
  return toCsv(
    ["Mes", "Inquilino", "Piso", "Importe", "Estado", "Fecha de cobro"],
    data.tenants.flatMap((t) =>
      rentLedger(t, now)
        .filter((m) => m.status !== "upcoming")
        .map((m) => [m.month, t.name, data.properties.find((p) => p.id === t.propertyId)?.title ?? "", euros(m.amountCents), label[m.status], m.paidAt ? localDate(m.paidAt) : ""]),
    ),
  );
}

export function leadsCsv(data: ProData): string {
  return toCsv(
    ["Nombre", "Universidad", "Verificado", "Estudios", "Entrada", "Meses", "Presupuesto", "Fase", "Piso"],
    data.leads.map((l) => [l.name, l.university, l.verified ? "Sí" : "No", l.studies, l.moveIn.slice(0, 10), l.months, euros(l.budgetCents), l.stage, data.properties.find((p) => p.id === l.propertyId)?.title ?? ""]),
  );
}

export function expensesCsv(data: ProData, year: number): string {
  return toCsv(
    ["Fecha", "Piso", "Categoría", "Concepto", "Importe"],
    housingOpsOf(data)
      .expenses.filter((e) => e.date.startsWith(String(year)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => [e.date, data.properties.find((p) => p.id === e.propertyId)?.title ?? "", EXPENSE_LABEL[e.category], e.concept, euros(e.amountCents)]),
  );
}

export function rentalYearCsv(data: ProData, year: number, now: Date): string {
  return toCsv(
    ["Piso", "Dirección", "Referencia catastral", "Ingresos", "Gastos", "Neto", "Días alquilados (habitaciones)", "Contratos"],
    rentalYear(data, year, now).map((y) => [
      y.property.title,
      y.property.address,
      y.property.compliance?.cadastralRef ?? "",
      euros(y.incomeCents),
      euros(y.expensesCents),
      euros(y.netCents),
      y.roomDays,
      y.kinds.join(", "),
    ]),
  );
}
