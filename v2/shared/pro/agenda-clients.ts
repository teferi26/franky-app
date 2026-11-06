/**
 * Fichas del motor de agenda: a quién le toca volver, quién se está yendo,
 * cumpleaños, fórmulas de color, prueba de sensibilidad, salud y permisos.
 *
 * El ritmo de cada cliente se calcula con sus visitas reales (las anteriores
 * guardadas en la ficha y las cobradas en la agenda). Si todavía no hay tres
 * visitas, se usa el "vuelve cada" del servicio que se hizo la última vez.
 */
import type { ProClient, ProData, ProService } from "./types";
import type {
  ProAllergy,
  ProClientAgenda,
  ProClientHealth,
  ProClientPhoto,
  ProColorFormula,
  ProConsentKind,
  ProConsentTemplate,
  ProPastVisit,
  ProSignedConsent,
} from "./agenda-types";
import { durationFor, isoFor, startTimes } from "./agenda";
import { firstName, fillTemplate, templateText } from "./agenda-ops";
import {
  addDays,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
} from "./format";

const DAY = 86400000;

function patchClient(
  data: ProData,
  clientId: string,
  fn: (agenda: ProClientAgenda, client: ProClient) => Partial<ProClient>,
): ProData {
  return {
    ...data,
    clients: data.clients.map((client) =>
      client.id === clientId
        ? { ...client, ...fn(client.agenda ?? {}, client) }
        : client,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Visitas y ritmo de vuelta                                           */
/* ------------------------------------------------------------------ */

/** Visitas de una ficha: las guardadas y las atendidas en la agenda, sin repetir. */
export function clientVisits(data: ProData, clientId: string): ProPastVisit[] {
  const client = data.clients.find((row) => row.id === clientId);
  const stored = client?.agenda?.visits ?? [];
  const fromAgenda: ProPastVisit[] = data.bookings
    .filter(
      (booking) =>
        booking.clientId === clientId &&
        booking.status === "done" &&
        booking.serviceId,
    )
    .map((booking) => ({
      at: booking.start,
      serviceId: booking.serviceId!,
      staffId: booking.staffId,
    }));
  const byDay = new Map<string, ProPastVisit>();
  for (const visit of [...stored, ...fromAgenda])
    byDay.set(localDate(visit.at), visit);
  return [...byDay.values()].sort((a, b) => a.at.localeCompare(b.at));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export type Cadence = { days: number; source: "client" | "service" };

/** Cada cuántos días suele venir: su propio ritmo o el del servicio. */
export function cadenceOf(data: ProData, clientId: string): Cadence | null {
  const visits = clientVisits(data, clientId);
  if (visits.length >= 3) {
    const gaps = visits
      .slice(1)
      .map((visit, i) =>
        Math.round((Date.parse(visit.at) - Date.parse(visits[i].at)) / DAY),
      )
      .filter((days) => days > 0);
    if (gaps.length >= 2) return { days: median(gaps), source: "client" };
  }
  const last = visits.at(-1);
  const weeks = data.services.find((row) => row.id === last?.serviceId)?.agenda
    ?.returnWeeks;
  return weeks ? { days: weeks * 7, source: "service" } : null;
}

export type ReturnRow = {
  client: ProClient;
  last: ProPastVisit;
  service?: ProService;
  cadence: Cadence;
  daysSince: number;
  /** Fecha en la que le tocaría volver (YYYY-MM-DD). */
  due: string;
  /** Días de retraso respecto a su ritmo (negativo si aún no le toca). */
  lateDays: number;
};

function hasUpcoming(data: ProData, clientId: string, now: Date): boolean {
  const at = now.toISOString();
  return data.bookings.some(
    (booking) =>
      booking.clientId === clientId &&
      booking.end > at &&
      !["cancelled", "no_show", "done"].includes(booking.status),
  );
}

/** Todas las fichas con ritmo conocido y sin cita pendiente. */
export function returnRows(data: ProData, now: Date): ReturnRow[] {
  const today = localDate(now);
  const rows: ReturnRow[] = [];
  for (const client of data.clients) {
    const visits = clientVisits(data, client.id);
    const last = visits.at(-1);
    if (!last || hasUpcoming(data, client.id, now)) continue;
    const cadence = cadenceOf(data, client.id);
    if (!cadence) continue;
    const lastDay = localDate(last.at);
    const daysSince = Math.round(
      (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastDay}T12:00:00Z`)) /
        DAY,
    );
    const due = addDays(lastDay, cadence.days);
    rows.push({
      client,
      last,
      service: data.services.find((row) => row.id === last.serviceId),
      cadence,
      daysSince,
      due,
      lateDays: daysSince - cadence.days,
    });
  }
  return rows;
}

/**
 * Les toca volver: su fecha cae entre hace una semana y dentro de siete días.
 * Ordenados por quién va más tarde.
 */
export function dueThisWeek(data: ProData, now: Date): ReturnRow[] {
  return returnRows(data, now)
    .filter((row) => row.lateDays >= -6 && row.lateDays <= 7)
    .sort((a, b) => b.lateDays - a.lateDays);
}

export type RiskRow = ReturnRow & {
  visits: number;
  /** Lo que deja al año si mantiene su ritmo. */
  yearlyCents: number;
};

/**
 * Clientes fieles (tres visitas o más) que han roto su ritmo: llevan más de
 * vez y media su frecuencia sin venir. Se ordenan por lo que dejan al año.
 */
export function atRisk(data: ProData, now: Date): RiskRow[] {
  return returnRows(data, now)
    .map((row) => {
      const visits = clientVisits(data, row.client.id).length;
      const ticket = row.service?.priceCents ?? 0;
      return {
        ...row,
        visits,
        yearlyCents: Math.round((365 / Math.max(7, row.cadence.days)) * ticket),
      };
    })
    .filter(
      (row) =>
        row.visits >= 3 &&
        row.daysSince > row.cadence.days * 1.5 &&
        row.daysSince <= Math.max(120, row.cadence.days * 4),
    )
    .sort((a, b) => b.yearlyCents - a.yearlyCents);
}

/** Primer hueco libre de la próxima semana, lo más cerca posible de su hora de siempre. */
export function suggestSlot(
  data: ProData,
  row: Pick<ReturnRow, "last" | "service">,
  now: Date,
): { date: string; minute: number; staffId: string } | null {
  const service = row.service;
  if (!service) return null;
  const usual = localMinutes(row.last.at);
  const staffIds =
    row.last.staffId && service.staffIds.includes(row.last.staffId)
      ? [
          row.last.staffId,
          ...service.staffIds.filter((id) => id !== row.last.staffId),
        ]
      : service.staffIds;
  const today = localDate(now);
  for (let offset = 1; offset <= 8; offset++) {
    const date = addDays(today, offset);
    for (const staffId of staffIds) {
      const times = startTimes(
        data,
        date,
        staffId,
        durationFor(service, staffId),
        0,
        undefined,
        service.id,
      );
      if (!times.length) continue;
      const minute = times.reduce((best, m) =>
        Math.abs(m - usual) < Math.abs(best - usual) ? m : best,
      );
      return { date, minute, staffId };
    }
  }
  return null;
}

export function comebackMessage(
  data: ProData,
  row: ReturnRow,
  slot: { date: string; minute: number; staffId: string } | null,
): string {
  const staff = data.staff.find((s) => s.id === slot?.staffId);
  const text = slot
    ? templateText(data, "comeback")
    : "Hola {nombre}, ya van {semanas} semanas desde tu último {servicio}. ¿Te buscamos hueco esta semana?";
  return fillTemplate(text, {
    nombre: firstName(row.client.name),
    negocio: data.space.name,
    semanas: String(Math.max(1, Math.round(row.daysSince / 7))),
    servicio: row.service?.name.toLowerCase(),
    dia: slot ? dayLabel(isoFor(slot.date, slot.minute)) : undefined,
    hora: slot ? minutesToLabel(slot.minute) : undefined,
    profesional: staff ? firstName(staff.name) : undefined,
  });
}

export function markComebackSent(data: ProData, clientId: string, at: string) {
  return patchClient(data, clientId, (agenda) => ({
    agenda: { ...agenda, comebackSentAt: at },
  }));
}

/* ------------------------------------------------------------------ */
/* Cumpleaños                                                          */
/* ------------------------------------------------------------------ */

/** Mes y día (MM-DD) de una fecha de cumpleaños guardada como YYYY-MM-DD o MM-DD. */
function monthDay(birthday: string): string | null {
  const match = birthday.match(/(\d{2})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

export type BirthdayRow = { client: ProClient; date: string; today: boolean };

/** Cumpleaños de hoy y de los próximos días, en orden. */
export function birthdaysSoon(
  data: ProData,
  now: Date,
  days = 7,
): BirthdayRow[] {
  const today = localDate(now);
  const out: BirthdayRow[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, offset);
    for (const client of data.clients) {
      if (client.birthday && monthDay(client.birthday) === date.slice(5))
        out.push({ client, date, today: offset === 0 });
    }
  }
  return out;
}

export function birthdayMessage(data: ProData, client: ProClient): string {
  return fillTemplate(templateText(data, "birthday"), {
    nombre: firstName(client.name),
    negocio: data.space.name,
  });
}

export function markBirthdaySent(data: ProData, clientId: string, at: string) {
  return patchClient(data, clientId, (agenda) => ({
    agenda: { ...agenda, birthdaySentAt: at },
  }));
}

/* ------------------------------------------------------------------ */
/* Permisos con fecha                                                  */
/* ------------------------------------------------------------------ */

export const CONSENT_LABEL: Record<ProConsentKind, string> = {
  marketing: "Mensajes de ofertas y cumpleaños",
  photos: "Fotos de su trabajo en tu ficha y redes",
  health: "Guardar sus datos de salud",
};

/** Solo se escribe con ofertas o felicitaciones a quien lo ha aceptado. */
export function canPromote(client: ProClient): boolean {
  return client.agenda?.consents?.marketing?.granted ?? client.marketingConsent;
}

export function setConsent(
  data: ProData,
  clientId: string,
  kind: ProConsentKind,
  granted: boolean,
  at: string,
  by?: string,
): ProData {
  return patchClient(data, clientId, (agenda) => ({
    ...(kind === "marketing" ? { marketingConsent: granted } : {}),
    agenda: {
      ...agenda,
      consents: { ...agenda.consents, [kind]: { granted, at, by } },
      // Sin permiso de fotos no se guardan fotos suyas.
      ...(kind === "photos" && !granted ? { photos: undefined } : {}),
    },
  }));
}

/** Consentimiento del tratamiento pendiente de firma, si lo hay. */
export function pendingSignature(
  data: ProData,
  client: ProClient | undefined,
  service: ProService | undefined,
): ProConsentTemplate | null {
  const consentId = service?.agenda?.consentId;
  if (!consentId) return null;
  const template = data.agendaOps?.consentTemplates.find(
    (row) => row.id === consentId,
  );
  if (!template) return null;
  const signed = client?.agenda?.signed?.some(
    (row) => row.consentId === consentId,
  );
  return signed ? null : template;
}

export function signedFor(
  client: ProClient | undefined,
  consentId: string,
): ProSignedConsent | undefined {
  return client?.agenda?.signed
    ?.filter((row) => row.consentId === consentId)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function signConsent(
  data: ProData,
  clientId: string,
  record: ProSignedConsent,
): ProData {
  return patchClient(data, clientId, (agenda) => ({
    agenda: { ...agenda, signed: [...(agenda.signed ?? []), record] },
  }));
}

/* ------------------------------------------------------------------ */
/* Fotos de antes y después                                            */
/* ------------------------------------------------------------------ */

/** Fotos que se guardan por ficha: las más recientes, para no cargarla. */
export const PHOTOS_PER_CLIENT = 12;

export function canTakePhotos(client: ProClient | undefined): boolean {
  return Boolean(client?.agenda?.consents?.photos?.granted);
}

/** Guarda una foto si la ficha tiene permiso; si no, no cambia nada. */
export function addPhoto(
  data: ProData,
  clientId: string,
  photo: ProClientPhoto,
): ProData {
  const client = data.clients.find((row) => row.id === clientId);
  if (!canTakePhotos(client)) return data;
  return patchClient(data, clientId, (agenda) => ({
    agenda: {
      ...agenda,
      photos: [...(agenda.photos ?? []), photo]
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-PHOTOS_PER_CLIENT),
    },
  }));
}

export function removePhoto(
  data: ProData,
  clientId: string,
  photoId: string,
): ProData {
  return patchClient(data, clientId, (agenda) => ({
    agenda: {
      ...agenda,
      photos: (agenda.photos ?? []).filter((photo) => photo.id !== photoId),
    },
  }));
}

/** Marca una foto para el escaparate del negocio (solo con permiso). */
export function setShowcase(
  data: ProData,
  clientId: string,
  photoId: string,
  showcase: boolean,
): ProData {
  const client = data.clients.find((row) => row.id === clientId);
  if (showcase && !canTakePhotos(client)) return data;
  return patchClient(data, clientId, (agenda) => ({
    agenda: {
      ...agenda,
      photos: (agenda.photos ?? []).map((photo) =>
        photo.id === photoId ? { ...photo, showcase } : photo,
      ),
    },
  }));
}

export type PhotoPair = {
  date: string;
  serviceId?: string;
  before?: ProClientPhoto;
  after?: ProClientPhoto;
};

/** Fotos agrupadas por día para compararlas lado a lado, la más reciente primero. */
export function photoPairs(client: ProClient | undefined): PhotoPair[] {
  const byDay = new Map<string, PhotoPair>();
  for (const photo of client?.agenda?.photos ?? []) {
    const date = localDate(photo.at);
    const pair = byDay.get(date) ?? { date };
    // Si hay varias del mismo tipo ese día, se queda la última.
    pair[photo.kind] = photo;
    pair.serviceId = pair.serviceId ?? photo.serviceId;
    byDay.set(date, pair);
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Fotos del escaparate: marcadas y de fichas que mantienen el permiso. */
export function showcasePhotos(
  data: ProData,
): { client: ProClient; photo: ProClientPhoto }[] {
  return data.clients
    .filter((client) => canTakePhotos(client))
    .flatMap((client) =>
      (client.agenda?.photos ?? [])
        .filter((photo) => photo.showcase)
        .map((photo) => ({ client, photo })),
    )
    .sort((a, b) => b.photo.at.localeCompare(a.photo.at));
}

/* ------------------------------------------------------------------ */
/* Fórmulas de color                                                   */
/* ------------------------------------------------------------------ */

export function formulasOf(client: ProClient | undefined): ProColorFormula[] {
  return [...(client?.agenda?.formulas ?? [])].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}

export function lastFormula(
  client: ProClient | undefined,
): ProColorFormula | undefined {
  return formulasOf(client)[0];
}

export function addFormula(
  data: ProData,
  clientId: string,
  formula: ProColorFormula,
): ProData {
  return patchClient(data, clientId, (agenda) => ({
    agenda: { ...agenda, formulas: [...(agenda.formulas ?? []), formula] },
  }));
}

/** ¿Es un servicio en el que importa la ficha de color o de técnica? */
export function isTechnicalService(service: ProService | undefined): boolean {
  if (!service) return false;
  return Boolean(
    service.agenda?.phases ||
    service.agenda?.patchTest ||
    /color|mechas|tinte|balayage|decoloraci/i.test(
      `${service.category} ${service.name}`,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Prueba de sensibilidad                                              */
/* ------------------------------------------------------------------ */

export type PatchTestState =
  | { status: "valid"; at: string; until: string }
  | { status: "expired"; at: string; until: string }
  | { status: "missing" };

export function patchTestState(
  data: ProData,
  client: ProClient | undefined,
  onDate: string,
): PatchTestState {
  const at = client?.agenda?.patchTestAt;
  if (!at) return { status: "missing" };
  const days = data.agendaOps?.settings.patchTestValidDays ?? 180;
  const until = addDays(localDate(at), days);
  return until >= onDate
    ? { status: "valid", at, until }
    : { status: "expired", at, until };
}

/** Hace falta avisar: el servicio pide prueba y no hay una vigente para ese día. */
export function needsPatchTest(
  data: ProData,
  client: ProClient | undefined,
  service: ProService | undefined,
  onDate: string,
): boolean {
  if (!service?.agenda?.patchTest) return false;
  return patchTestState(data, client, onDate).status !== "valid";
}

export function recordPatchTest(data: ProData, clientId: string, at: string) {
  return patchClient(data, clientId, (agenda) => ({
    agenda: { ...agenda, patchTestAt: at },
  }));
}

/* ------------------------------------------------------------------ */
/* Salud                                                               */
/* ------------------------------------------------------------------ */

export const ALLERGY_LABEL: Record<ProAllergy, string> = {
  ppd: "Tintes (PPD)",
  latex: "Látex",
  cyanoacrylate: "Pegamento de pestañas",
  wax: "Cera",
  nickel: "Níquel",
};

/** Avisos cortos que se ven antes de empezar. */
export function healthAlerts(client: ProClient | undefined): string[] {
  const health = client?.agenda?.health;
  if (!health) return [];
  return [
    ...health.allergies.map((allergy) => `Alergia: ${ALLERGY_LABEL[allergy]}`),
    ...(health.pregnancy ? ["Embarazo"] : []),
    ...(health.sensitiveSkin ? ["Piel sensible"] : []),
    ...(health.medication ? [`Medicación: ${health.medication}`] : []),
  ];
}

export function saveHealth(
  data: ProData,
  clientId: string,
  health: ProClientHealth,
): ProData {
  return patchClient(data, clientId, (agenda) => ({
    agenda: { ...agenda, health },
  }));
}
