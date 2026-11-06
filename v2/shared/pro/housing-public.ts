import type { ProData, ProInboxItem, ProLead, ProProperty, ProRoom, ProVisit } from "./types";
import { addDays, atLocal, localDate, localMinutes, minutesToLabel, money } from "./format";
import { VISIT_MINUTES, findRoom, shortDate, uniShort, visitSlots } from "./housing";
import { BUDGET_SLACK_CENTS } from "./housing-ops";
import { posterRooms } from "./housing-tools";

/**
 * La ficha pública de un piso (/n/<slug>?piso=<id>) y la visita que el
 * estudiante, o sus padres, reservan desde ella sin escribir a nadie. Lo que
 * se reserva aquí entra en Visitas como pedida desde la ficha y el interesado
 * pasa directamente a la fase Visita. Funciones puras: las usa la ficha
 * pública de la web y las comprueban los tests.
 */

/* ------------------------------------------------------------------ */
/* Lo que ve el estudiante                                              */
/* ------------------------------------------------------------------ */

export type PublicListing = {
  property: ProProperty;
  /** Habitaciones libres o que se liberan, por fecha. */
  rooms: ProRoom[];
  fromPriceCents: number | null;
  /** Primera fecha en la que se puede entrar. */
  firstFree: string | null;
  /** Precio por persona si se alquila entero a un grupo. */
  wholeFlatPerPersonCents: number | null;
  full: boolean;
};

/** El piso tal y como se enseña en la ficha. Nada si no existe o está oculto. */
export function publicListing(data: ProData, propertyId: string | null | undefined): PublicListing | null {
  const property = data.properties.find((p) => p.id === propertyId);
  if (!property || !property.published) return null;
  const rooms = posterRooms(property);
  const whole = property.wholeFlatPriceCents;
  return {
    property,
    rooms,
    fromPriceCents: rooms.length ? Math.min(...rooms.map((r) => r.priceCents)) : null,
    firstFree: rooms[0]?.availableFrom.slice(0, 10) ?? null,
    wholeFlatPerPersonCents: whole ? Math.round(whole / Math.max(1, property.rooms.length)) : null,
    full: rooms.length === 0,
  };
}

/** Los otros pisos publicados del negocio, para enlazarlos al pie de la ficha. */
export function otherListings(data: ProData, propertyId: string, limit = 3): PublicListing[] {
  return data.properties
    .filter((p) => p.id !== propertyId)
    .map((p) => publicListing(data, p.id))
    .filter((l): l is PublicListing => Boolean(l && !l.full))
    .slice(0, limit);
}

export type PublicVisitDay = { date: string; slots: number[] };

/**
 * Días con franjas libres para visitar el piso, según el horario de visitas
 * del negocio y lo que ya está citado con el agente que lleva ese piso.
 */
export function publicVisitDays(data: ProData, propertyId: string, now: Date, count = 6): PublicVisitDay[] {
  const property = data.properties.find((p) => p.id === propertyId);
  if (!property) return [];
  const today = localDate(now);
  const out: PublicVisitDay[] = [];
  for (let i = 0; i < 21 && out.length < count; i++) {
    const date = addDays(today, i);
    const slots = visitSlots(data, date, now, property.agentId);
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reservar la visita                                                   */
/* ------------------------------------------------------------------ */

export type PublicVisitRequest = {
  name: string;
  university: string;
  studies?: string;
  /** Fecha en la que quiere entrar a vivir. */
  moveIn: string;
  months: number;
  budgetCents: number;
  /** Habitación que le interesa; sin ella, la más barata que encaje. */
  roomId?: string;
  date: string;
  minute: number;
  mode: ProVisit["mode"];
  /** Quien reserva: el estudiante o su madre o padre. */
  bookedBy?: "student" | "parent";
  message?: string;
};

export type PublicVisitIds = { lead: string; visit: string; inbox: string };

export type PublicVisitResult =
  | { ok: true; data: ProData; lead: ProLead; visit: ProVisit }
  | { ok: false; reason: "missing" | "slot_taken" | "invalid" };

/** La habitación que se le asigna: la elegida o la más barata libre para su fecha. */
function roomFor(property: ProProperty, req: PublicVisitRequest): ProRoom | undefined {
  const rooms = posterRooms(property);
  const chosen = rooms.find((r) => r.id === req.roomId);
  if (chosen) return chosen;
  const by = addDays(req.moveIn.slice(0, 10), 10);
  const fitting = rooms.filter((r) => r.availableFrom.slice(0, 10) <= by && r.priceCents <= req.budgetCents + BUDGET_SLACK_CENTS);
  return (fitting.length ? fitting : rooms).sort((a, b) => a.priceCents - b.priceCents)[0];
}

/**
 * Reserva una visita desde la ficha. Si la franja ya no está libre no hace
 * nada. Si la persona ya era interesada en ese piso se reutiliza su ficha;
 * si no, se crea con lo que ha contado. La visita queda confirmada (la ha
 * elegido ella) y el negocio recibe un aviso en su bandeja.
 */
export function bookPublicVisit(
  data: ProData,
  propertyId: string,
  req: PublicVisitRequest,
  now: Date,
  ids: PublicVisitIds,
): PublicVisitResult {
  const listing = publicListing(data, propertyId);
  if (!listing) return { ok: false, reason: "missing" };
  const name = req.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || !req.date || !Number.isFinite(req.minute)) return { ok: false, reason: "invalid" };
  const property = listing.property;
  if (!visitSlots(data, req.date, now, property.agentId).includes(req.minute)) return { ok: false, reason: "slot_taken" };

  const nowIso = now.toISOString();
  const room = roomFor(property, req);
  const who = req.bookedBy === "parent" ? "Su familia ha pedido" : "Ha pedido";
  const existing = data.leads.find(
    (l) => l.propertyId === propertyId && l.stage !== "lost" && l.stage !== "signed" && l.name.toLowerCase() === name.toLowerCase(),
  );

  const lead: ProLead = existing
    ? {
        ...existing,
        roomId: existing.roomId ?? room?.id,
        stage: existing.stage === "new" || existing.stage === "contacted" ? "visit" : existing.stage,
        lastContactAt: nowIso,
      }
    : {
        id: ids.lead,
        name,
        university: req.university,
        studies: req.studies?.trim() || "Sin indicar",
        verified: true,
        erasmus: false,
        budgetCents: Math.max(0, Math.round(req.budgetCents)),
        moveIn: req.moveIn.slice(0, 10),
        months: Math.max(1, Math.round(req.months)),
        propertyId,
        roomId: room?.id,
        stage: "visit",
        message: req.message?.trim() || `${who} visita desde la ficha del ${property.title}.`,
        createdAt: nowIso,
        lastContactAt: nowIso,
        agentId: property.agentId,
        guarantor: req.bookedBy === "parent",
      };

  const visit: ProVisit = {
    id: ids.visit,
    leadId: lead.id,
    propertyId,
    start: atLocal(req.date, req.minute),
    mode: req.mode,
    status: "scheduled",
    agentId: property.agentId,
    confirmedAt: nowIso,
    source: "public",
  };

  const inbox: ProInboxItem = {
    id: ids.inbox,
    at: nowIso,
    kind: "booking",
    title: "Visita reservada desde la ficha",
    body: `${name} (${uniShort(req.university)}) · ${property.title} · ${shortDate(req.date)} a las ${minutesToLabel(req.minute)}${req.mode === "video" ? " por vídeo" : ""}`,
    href: "visitas",
    read: false,
  };

  return {
    ok: true,
    lead,
    visit,
    data: {
      ...data,
      leads: existing ? data.leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...data.leads],
      visits: [...data.visits, visit],
      inbox: [inbox, ...data.inbox],
    },
  };
}

/**
 * Cuando el piso está lleno: la persona se apunta a la lista de espera. Queda
 * como interesada con la respuesta "no hay hueco" ya dada, que es lo que lee
 * la lista de espera de Curso para avisarla cuando se libere algo.
 */
export function joinPublicWaitlist(
  data: ProData,
  propertyId: string,
  req: Pick<PublicVisitRequest, "name" | "university" | "moveIn" | "months" | "budgetCents">,
  now: Date,
  ids: Omit<PublicVisitIds, "visit">,
): { ok: true; data: ProData; lead: ProLead } | { ok: false; reason: "missing" | "invalid" } {
  const property = data.properties.find((p) => p.id === propertyId && p.published);
  const name = req.name.trim().replace(/\s+/g, " ");
  if (!property) return { ok: false, reason: "missing" };
  if (name.length < 2) return { ok: false, reason: "invalid" };
  const nowIso = now.toISOString();
  const lead: ProLead = {
    id: ids.lead,
    name,
    university: req.university,
    studies: "Sin indicar",
    verified: true,
    erasmus: false,
    budgetCents: Math.max(0, Math.round(req.budgetCents)),
    moveIn: req.moveIn.slice(0, 10),
    months: Math.max(1, Math.round(req.months)),
    propertyId,
    stage: "new",
    message: `Quiere que le avises cuando se libere una habitación en el ${property.title}.`,
    createdAt: nowIso,
    agentId: property.agentId,
    guarantor: false,
    replies: [{ id: "full", at: nowIso }],
  };
  const inbox: ProInboxItem = {
    id: ids.inbox,
    at: nowIso,
    kind: "lead",
    title: "Lista de espera",
    body: `${name} quiere entrar en el ${property.title} desde el ${shortDate(lead.moveIn)}`,
    href: "curso",
    read: false,
  };
  return { ok: true, lead, data: { ...data, leads: [lead, ...data.leads], inbox: [inbox, ...data.inbox] } };
}

/** Texto de confirmación para quien ha reservado. */
export function publicVisitSummary(data: ProData, visit: ProVisit): string {
  const { property } = findRoom(data, visit.propertyId);
  const when = `${shortDate(localDate(visit.start))} a las ${minutesToLabel(localMinutes(visit.start))}`;
  if (visit.mode === "video") return `Videollamada el ${when}. Te llega el enlace en Franky el mismo día.`;
  return `Te esperan en ${property?.address ?? "el piso"} el ${when}. Son ${VISIT_MINUTES} minutos.`;
}

/** "Desde 320 €" o "Lleno ahora" para tarjetas y enlaces. */
export function listingPriceLabel(listing: PublicListing): string {
  return listing.fromPriceCents !== null ? `Desde ${money(listing.fromPriceCents, { round: true })} al mes` : "Lleno ahora";
}
