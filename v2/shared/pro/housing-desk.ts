import type { ProData, ProIncident, ProProperty, ProTenant } from "./types";
import type { ProProviderTrade, ProTenantDocs } from "./housing-types";
import { addDays, localDate, money } from "./format";
import { currentTenants, daysBetween, shortDate } from "./housing";
import { DOC_KINDS, TRADE_LABEL, rentLedger, rentReminderText, requestDocs } from "./housing-ops";
import { providerBoard, type ProviderRow } from "./housing-tools";
import type { ContractInput } from "./housing-docs";

/**
 * El mostrador del motor de vivienda: lo que el dueño hace con prisa un
 * sábado desde el móvil. Pedir los papeles que faltan, guardar la prueba de
 * que el contrato es de temporada, recordar la renta a quien no ha pagado,
 * llamar al técnico del oficio que toca, comparar habitaciones con piso entero
 * y guardar las fotos de una incidencia. Funciones puras que comparten la web
 * y la app.
 */

function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

/* ------------------------------------------------------------------ */
/* Papeles que faltan                                                   */
/* ------------------------------------------------------------------ */

/** Etiquetas en minúscula para escribirlas dentro de una frase. */
const DOC_PHRASE: Record<string, string> = {
  id: "tu DNI o NIE",
  enrolment: "la matrícula o la carta de admisión",
  guarantor: "el nombre, el teléfono y el DNI de tu avalista",
  insurance: "el seguro (si lo tienes)",
};

/** Los papeles que aún no han llegado, en el orden de la lista. */
export function missingDocs(docs: ProTenantDocs | undefined) {
  return DOC_KINDS.filter((k) => docs?.items[k.id]?.status !== "received");
}

/** WhatsApp que pide solo lo que falta, con el nombre ya puesto. Vacío si no falta nada. */
export function docsRequestText(data: ProData, personName: string, docs: ProTenantDocs | undefined): string {
  const missing = missingDocs(docs).map((k) => DOC_PHRASE[k.id] ?? k.label.toLowerCase());
  if (!missing.length) return "";
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} y ${missing[missing.length - 1]}`;
  return `Hola ${firstName(personName)}, soy ${data.space.owner.firstName}. Para dejar listo tu contrato me falta ${list}. Me lo puedes mandar por aquí, con una foto vale. Gracias.`;
}

/** Marca como pedido lo que faltaba (lo recibido no se toca). */
export function markDocsRequested(docs: ProTenantDocs | undefined, nowIso: string): ProTenantDocs {
  return requestDocs(docs, nowIso);
}

/* ------------------------------------------------------------------ */
/* Prueba de la temporada                                               */
/* ------------------------------------------------------------------ */

export type TemporalityProof = {
  /** Solo los contratos de temporada necesitan probar el motivo. */
  needed: boolean;
  ok: boolean;
  receivedAt?: string;
  requestedAt?: string;
};

/**
 * Un contrato de temporada tiene que poder demostrar su causa: para un
 * estudiante, la matrícula o la carta de admisión. Aquí se mira si está
 * guardada con el contrato y desde cuándo.
 */
export function temporalityProof(kind: ProTenant["contractKind"], docs: ProTenantDocs | undefined): TemporalityProof {
  const item = docs?.items.enrolment;
  if (kind !== "temporada") return { needed: false, ok: true };
  if (item?.status === "received") return { needed: true, ok: true, receivedAt: item.at };
  return { needed: true, ok: false, requestedAt: item?.status === "requested" ? item.at : undefined };
}

/** Datos del contrato de un inquilino que ya vive en el piso, para volver a imprimirlo. */
export function tenantContractInput(data: ProData, tenant: ProTenant): ContractInput | null {
  const property = data.properties.find((p) => p.id === tenant.propertyId);
  if (!property) return null;
  const room = property.rooms.find((r) => r.id === tenant.roomId);
  const start = tenant.contractStart.slice(0, 10);
  const end = tenant.contractEnd.slice(0, 10);
  // Meses de contrato redondeados: del 1 de septiembre al 30 de junio son 10.
  const months = Math.max(1, Math.round(daysBetween(start, addDays(end, 1)) / 30.44));
  const lead = data.leads.find((l) => l.name === tenant.name && l.contract);
  return {
    tenantName: tenant.name,
    university: tenant.university,
    property,
    room,
    contract: {
      kind: tenant.contractKind,
      start,
      months,
      rentCents: tenant.rentCents,
      reason: lead?.contract?.reason,
      utilities: lead?.contract?.utilities ?? (property.utilitiesCapCents ? "cap" : "split"),
      utilitiesCapCents: lead?.contract?.utilitiesCapCents ?? property.utilitiesCapCents,
    },
    docs: tenant.docs,
  };
}

/* ------------------------------------------------------------------ */
/* Recordar la renta                                                    */
/* ------------------------------------------------------------------ */

export type ReminderRow = {
  tenant: ProTenant;
  owedCents: number;
  months: number;
  late: boolean;
  text: string;
};

/**
 * Quién debe algo hoy, primero los que van con retraso, con el WhatsApp ya
 * escrito. Sirve para recordar uno a uno sin perder la cuenta.
 */
export function rentReminderQueue(data: ProData, now: Date): ReminderRow[] {
  return currentTenants(data, now)
    .filter((t) => t.rentStatus !== "paid")
    .map((tenant) => {
      const owed = rentLedger(tenant, now).filter((m) => m.status === "pending" || m.status === "late");
      return {
        tenant,
        owedCents: owed.reduce((a, m) => a + m.amountCents, 0) || tenant.rentCents,
        months: Math.max(1, owed.length),
        late: tenant.rentStatus === "late" || owed.some((m) => m.status === "late"),
        text: rentReminderText(data, tenant, now),
      };
    })
    .sort((a, b) => Number(b.late) - Number(a.late) || b.owedCents - a.owedCents || a.tenant.name.localeCompare(b.tenant.name, "es"));
}

/** Apunta que se ha recordado hoy. */
export function markReminded(data: ProData, tenantIds: string[], nowIso: string): ProData {
  const ids = new Set(tenantIds);
  return { ...data, tenants: data.tenants.map((t) => (ids.has(t.id) ? { ...t, remindedAt: nowIso } : t)) };
}

/** Si ya se le ha recordado hoy (para no repetirlo en la misma mañana). */
export function remindedToday(tenant: ProTenant, now: Date): boolean {
  return Boolean(tenant.remindedAt && localDate(tenant.remindedAt) === localDate(now));
}

/* ------------------------------------------------------------------ */
/* Técnicos por oficio                                                  */
/* ------------------------------------------------------------------ */

export type TradeGroup = { trade: ProProviderTrade; label: string; rows: ProviderRow[] };

/** La agenda de proveedores agrupada por oficio, con los que tienen trabajo abierto arriba. */
export function providersByTrade(data: ProData, now: Date): TradeGroup[] {
  const groups = new Map<ProProviderTrade, ProviderRow[]>();
  for (const row of providerBoard(data, now)) groups.set(row.provider.trade, [...(groups.get(row.provider.trade) ?? []), row]);
  return (Object.keys(TRADE_LABEL) as ProProviderTrade[])
    .filter((trade) => groups.has(trade))
    .map((trade) => ({ trade, label: TRADE_LABEL[trade], rows: groups.get(trade) ?? [] }));
}

/** Palabras que delatan el oficio de una incidencia escrita a mano. */
const TRADE_HINTS: [ProProviderTrade, RegExp][] = [
  ["calderas", /caldera|agua caliente|calefacci|termo/],
  ["fontaneria", /agua|grifo|fuga|atasc|desag|cisterna|inodoro|váter|vater|ducha/],
  ["electricidad", /luz|enchufe|electric|diferencial|bombilla|plomos/],
  ["cerrajeria", /llave|cerradura|puerta|bomb[ií]n/],
  ["electrodomesticos", /lavadora|nevera|frigor|horno|vitro|microondas|lavavajillas|secadora/],
  ["limpieza", /limpi|suciedad|olor/],
];

/** El oficio que probablemente necesita una incidencia, por lo que dice el título. */
export function guessTrade(title: string): ProProviderTrade | null {
  const text = title.toLowerCase();
  return TRADE_HINTS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** El técnico que se propone para una incidencia: el del oficio con menos trabajo abierto. */
export function suggestedProvider(data: ProData, incident: Pick<ProIncident, "title">, now: Date): ProviderRow | null {
  const trade = guessTrade(incident.title);
  if (!trade) return null;
  return providerBoard(data, now)
    .filter((r) => r.provider.trade === trade)
    .sort((a, b) => a.open - b.open || b.jobs - a.jobs)[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Fotos de una incidencia                                              */
/* ------------------------------------------------------------------ */

/** Máximo de fotos guardadas por incidencia: bastan para enseñar el problema. */
export const INCIDENT_PHOTO_LIMIT = 4;

/** Añade fotos (ya reducidas) a una incidencia sin pasar del máximo. */
export function addIncidentPhotos(data: ProData, incidentId: string, urls: string[]): ProData {
  return {
    ...data,
    incidents: data.incidents.map((i) => {
      if (i.id !== incidentId) return i;
      const photoUrls = [...(i.photoUrls ?? []), ...urls].slice(0, INCIDENT_PHOTO_LIMIT);
      return { ...i, photoUrls, photos: Math.max(i.photos ?? 0, photoUrls.length) };
    }),
  };
}

export function removeIncidentPhoto(data: ProData, incidentId: string, index: number): ProData {
  return {
    ...data,
    incidents: data.incidents.map((i) => {
      if (i.id !== incidentId) return i;
      const photoUrls = (i.photoUrls ?? []).filter((_, n) => n !== index);
      return { ...i, photoUrls, photos: photoUrls.length };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Habitaciones frente a piso entero                                    */
/* ------------------------------------------------------------------ */

export type RoomsVsWhole = {
  roomsCents: number;
  wholeCents: number;
  /** Lo que se gana al mes por habitaciones (negativo si sale peor). */
  diffCents: number;
  diffPct: number;
  /**
   * Meses de habitación vacía al año que se pueden permitir antes de que
   * alquilar por habitaciones deje menos que el piso entero.
   */
  emptyRoomMonths: number;
};

/**
 * Compara la suma de las rentas de las habitaciones con lo que se pediría por
 * el piso entero. Solo cuentas: qué renta aplicar lo decide el dueño.
 */
export function roomsVsWhole(property: ProProperty): RoomsVsWhole | null {
  const wholeCents = property.wholeFlatReferenceCents ?? property.wholeFlatPriceCents;
  if (!wholeCents || !property.rooms.length) return null;
  const roomsCents = property.rooms.reduce((a, r) => a + r.priceCents, 0);
  const diffCents = roomsCents - wholeCents;
  const avgRoom = roomsCents / property.rooms.length;
  return {
    roomsCents,
    wholeCents,
    diffCents,
    diffPct: Math.round((diffCents / wholeCents) * 100),
    emptyRoomMonths: diffCents > 0 ? Math.floor((diffCents * 12) / avgRoom) : 0,
  };
}

/** Frase corta con la comparación, para la ficha del piso. */
export function roomsVsWholeText(c: RoomsVsWhole): string {
  if (c.diffCents <= 0)
    return `Por habitaciones sumas ${money(c.roomsCents)} al mes, ${money(-c.diffCents)} menos que el piso entero.`;
  return `Por habitaciones sumas ${money(c.roomsCents)} al mes, ${money(c.diffCents)} más que el piso entero. Aguanta ${c.emptyRoomMonths} ${c.emptyRoomMonths === 1 ? "mes" : "meses"} de habitación vacía al año antes de salir peor.`;
}

/** Fecha corta del papel recibido, para la línea de la ficha. */
export function proofLine(proof: TemporalityProof): string {
  if (!proof.needed) return "No hace falta: el contrato no es de temporada.";
  if (proof.ok) return proof.receivedAt ? `Matrícula guardada el ${shortDate(proof.receivedAt)}.` : "Matrícula guardada.";
  return proof.requestedAt ? `Matrícula pedida el ${shortDate(proof.requestedAt)}, aún no ha llegado.` : "Falta la matrícula o la carta de admisión.";
}

/* ------------------------------------------------------------------ */
/* Borrar papeles al acabar                                             */
/* ------------------------------------------------------------------ */

/** Si quedan papeles guardados de alguien que ya se ha ido. */
export function hasStoredDocs(tenant: ProTenant): boolean {
  return Boolean(tenant.docs && (Object.keys(tenant.docs.items).length || tenant.docs.guarantor));
}

/**
 * Vacía el DNI, la matrícula, el seguro y los datos del avalista de un
 * inquilino. Solo cuando la salida está cerrada: mientras vive en el piso,
 * esos papeles hacen falta.
 */
export function purgeTenantDocs(data: ProData, tenantId: string): ProData {
  return {
    ...data,
    tenants: data.tenants.map((t) => (t.id === tenantId && t.moveOut?.closedAt ? { ...t, docs: undefined } : t)),
  };
}
