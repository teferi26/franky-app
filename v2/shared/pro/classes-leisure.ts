import type { ProBooking, ProClassSession, ProClassType, ProData } from "./types";
import type { ProCompanyBilling, ProRoomBooking, ProSeatMaterial } from "./classes-types";
import { addDays, localDate, localMinutes, minutesToLabel } from "./format";
import { freeSpots, isRoomMode } from "./classes";
import { extrasOf, firstName, withExtras } from "./classes-care";
import { patchRoomBooking, patchTypeExtra, roomBookingOf, sessionExtra, typeExtra } from "./classes-ops";

/**
 * Lo propio de ocio, talleres y escape room que no es la partida en sí: el
 * pack de cumpleaños y la felicitación del año siguiente, el material que
 * gasta cada plaza de un taller, la factura para empresas y la campaña de
 * bienvenida a los Erasmus con las sesiones en inglés. Funciones puras.
 */

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Pack de cumpleaños                                                  */
/* ------------------------------------------------------------------ */

/** Extras habituales de un cumpleaños. El negocio marca los que ofrece en cada reserva. */
export const BIRTHDAY_EXTRAS = [
  "Tarta propia",
  "Sala de celebración",
  "Foto del grupo impresa",
  "Decoración",
  "Bebidas",
] as const;

export function toggleBookingExtra(d: ProData, bookingId: string, extra: string): ProData {
  const current = roomBookingOf(d, bookingId).extras ?? [];
  const extras = current.includes(extra)
    ? current.filter((e) => e !== extra)
    : [...current, extra];
  return patchRoomBooking(d, bookingId, { extras: extras.length ? extras : undefined });
}

/**
 * Apunta de quién es el cumpleaños y guarda el día y quién reservó, para
 * poder felicitarle al año siguiente. Con el nombre vacío se borra.
 */
export function setBirthday(
  d: ProData,
  booking: Pick<ProBooking, "id" | "clientName">,
  session: Pick<ProClassSession, "start">,
  honoree: string,
): ProData {
  const name = honoree.trim();
  if (!name) {
    return patchRoomBooking(d, booking.id, {
      birthdayOf: undefined,
      partyOn: undefined,
      contactName: undefined,
    });
  }
  return patchRoomBooking(d, booking.id, {
    birthdayOf: name,
    partyOn: localDate(session.start),
    contactName: booking.clientName,
  });
}

export type BirthdayComing = {
  bookingId: string;
  honoree: string;
  contactName: string;
  phone?: string;
  /** Día en que se celebró. */
  partyOn: string;
  /** Día en que se cumple un año más (YYYY-MM-DD). */
  anniversary: string;
  daysLeft: number;
};

/** Días antes del cumpleaños en que conviene escribir. */
export const BIRTHDAY_NOTICE_DAYS = 21;

function anniversaryAfter(partyOn: string, today: string): string {
  const year = Number(today.slice(0, 4));
  const md = partyOn.slice(5);
  // Un 29 de febrero se celebra el 28 los años que no son bisiestos.
  const safe = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return md === "02-29" && !leap ? `${y}-02-28` : `${y}-${md}`;
  };
  const thisYear = safe(year);
  return thisYear >= today ? thisYear : safe(year + 1);
}

/**
 * Cumpleaños celebrados aquí cuyo aniversario cae en las próximas semanas y
 * a los que aún no se ha felicitado este año. Primero los más cercanos.
 */
export function birthdaysComing(
  data: ProData,
  now: Date,
  days = BIRTHDAY_NOTICE_DAYS,
): BirthdayComing[] {
  const today = localDate(now);
  const limit = addDays(today, days);
  const out: BirthdayComing[] = [];
  for (const [bookingId, info] of Object.entries(extrasOf(data).roomBookings)) {
    if (!info.birthdayOf || !info.partyOn || !info.contactName) continue;
    const anniversary = anniversaryAfter(info.partyOn, today);
    // Solo desde el año siguiente: el de este año es la propia fiesta.
    if (anniversary.slice(0, 4) <= info.partyOn.slice(0, 4)) continue;
    if (anniversary > limit) continue;
    if (info.greetedAt && daysBetween(localDate(info.greetedAt), today) < 300) continue;
    out.push({
      bookingId,
      honoree: info.birthdayOf,
      contactName: info.contactName,
      phone: info.phone,
      partyOn: info.partyOn,
      anniversary,
      daysLeft: daysBetween(today, anniversary),
    });
  }
  return out.sort((a, b) => a.anniversary.localeCompare(b.anniversary));
}

export function markBirthdayGreeted(d: ProData, bookingId: string, now: Date): ProData {
  return patchRoomBooking(d, bookingId, { greetedAt: now.toISOString() });
}

export function birthdayMessage(b: BirthdayComing, sender: string, place: string): string {
  const who = firstName(b.contactName);
  const same = b.contactName.trim().toLowerCase().startsWith(b.honoree.trim().toLowerCase());
  const whose = same ? "tu cumpleaños" : `el cumpleaños de ${b.honoree}`;
  return `¡Hola ${who}! Soy ${sender} de ${place}. El año pasado celebrasteis aquí ${whose} y ya casi toca otra vez. Si os apetece repetir con la otra sala o un taller, os guardo el día que queráis.`;
}

/* ------------------------------------------------------------------ */
/* Material por plaza en talleres                                      */
/* ------------------------------------------------------------------ */

export const SEAT_UNIT_LABEL: Record<ProSeatMaterial["unit"], string> = {
  kg: "kg",
  ud: "unidades",
  l: "litros",
};

export function setSeatMaterial(
  d: ProData,
  typeId: string,
  material: ProSeatMaterial | undefined,
): ProData {
  if (!material) return patchTypeExtra(d, typeId, { seatMaterial: undefined });
  const clean: ProSeatMaterial = {
    item: material.item.trim(),
    perSeat: Math.max(0, material.perSeat),
    unit: material.unit,
    stock: Math.max(0, material.stock),
  };
  if (!clean.item || !clean.perSeat) return d;
  return patchTypeExtra(d, typeId, { seatMaterial: clean });
}

/** Actualiza lo que hay en el almacén (tras comprar o hacer recuento). */
export function setMaterialStock(d: ProData, typeId: string, stock: number): ProData {
  const current = typeExtra(d, typeId).seatMaterial;
  if (!current) return d;
  return patchTypeExtra(d, typeId, { seatMaterial: { ...current, stock: Math.max(0, stock) } });
}

export type MaterialNeed = {
  classType: ProClassType;
  material: ProSeatMaterial;
  sessions: number;
  /** Plazas reservadas en los próximos días. */
  seats: number;
  /** Lo que gastarán esas plazas. */
  need: number;
  /** Plazas que se quedan sin material con lo que hay en el almacén. */
  shortSeats: number;
};

/**
 * Material que gastarán las reservas de los próximos días en cada taller y
 * cuántas plazas se quedan sin él. Se prepara antes y marca el margen.
 */
export function materialNeeds(data: ProData, now: Date, days = 7): MaterialNeed[] {
  const today = localDate(now);
  const until = addDays(today, days);
  return data.classTypes
    .map((classType) => ({ classType, material: typeExtra(data, classType.id).seatMaterial }))
    .filter((x): x is { classType: ProClassType; material: ProSeatMaterial } => Boolean(x.material))
    .map(({ classType, material }) => {
      const upcoming = data.sessions.filter(
        (s) =>
          s.classTypeId === classType.id &&
          s.status !== "cancelled" &&
          new Date(s.end).getTime() > now.getTime() &&
          localDate(s.start) <= until,
      );
      const seats = upcoming.reduce((a, s) => a + s.booked, 0);
      const need = Math.round(seats * material.perSeat * 100) / 100;
      const missing = Math.max(0, need - material.stock);
      const shortSeats = missing > 0 ? Math.ceil(missing / material.perSeat) : 0;
      return { classType, material, sessions: upcoming.length, seats, need, shortSeats };
    })
    .sort((a, b) => b.shortSeats - a.shortSeats || b.seats - a.seats);
}

export function formatQuantity(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

/* ------------------------------------------------------------------ */
/* Factura para empresas                                               */
/* ------------------------------------------------------------------ */

/**
 * Tipo general de IVA en España, el que aplica a una actividad de ocio. Si
 * un taller va exento, la factura se hace fuera de aquí.
 */
export const LEISURE_VAT_PCT = 21;

/** NIF, NIE o CIF con forma válida (sin comprobar la letra de control). */
export function validTaxId(text: string): boolean {
  const t = text.replace(/[\s-]/g, "").toUpperCase();
  return /^\d{8}[A-Z]$/.test(t) || /^[XYZ]\d{7}[A-Z]$/.test(t) || /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/.test(t);
}

export function cleanTaxId(text: string): string {
  return text.replace(/[\s-]/g, "").toUpperCase();
}

export function setCompany(d: ProData, bookingId: string, company: ProCompanyBilling | undefined): ProData {
  if (!company) return patchRoomBooking(d, bookingId, { company: undefined });
  return patchRoomBooking(d, bookingId, {
    company: {
      name: company.name.trim(),
      taxId: cleanTaxId(company.taxId),
      address: company.address.trim(),
    },
  });
}

export function companyComplete(company: ProCompanyBilling | undefined): boolean {
  return Boolean(company && company.name && company.address && validTaxId(company.taxId));
}

/**
 * Emite el número de factura de la reserva (serie del año: F2026-0001...).
 * Si ya tenía, lo conserva: una reserva no tiene dos facturas.
 */
export function issueInvoice(d: ProData, bookingId: string, now: Date): ProData {
  const info = roomBookingOf(d, bookingId);
  if (info.invoiceNo || !companyComplete(info.company)) return d;
  const year = localDate(now).slice(0, 4);
  const seq = (extrasOf(d).invoiceSeq ?? 0) + 1;
  const withSeq = withExtras(d, (x) => ({ ...x, invoiceSeq: seq }));
  return patchRoomBooking(withSeq, bookingId, {
    invoiceNo: `F${year}-${String(seq).padStart(4, "0")}`,
    invoicedAt: now.toISOString(),
  });
}

export type InvoiceTotals = { totalCents: number; baseCents: number; vatCents: number; vatPct: number };

/** Desglose del precio con IVA incluido: base y cuota. */
export function invoiceTotals(totalCents: number, vatPct = LEISURE_VAT_PCT): InvoiceTotals {
  const baseCents = Math.round(totalCents / (1 + vatPct / 100));
  return { totalCents, baseCents, vatCents: totalCents - baseCents, vatPct };
}

/** Lo que se factura de una reserva: lo cobrado o, si no, el precio. */
export function invoiceAmount(info: ProRoomBooking, booking: Pick<ProBooking, "priceCents">): number {
  return info.paidCents ?? booking.priceCents;
}

/* ------------------------------------------------------------------ */
/* Bienvenida a los Erasmus                                            */
/* ------------------------------------------------------------------ */

/**
 * Las dos llegadas de Erasmus del curso: septiembre hasta mediados de
 * octubre, y febrero hasta primeros de marzo.
 */
export function inErasmusWindow(now: Date): boolean {
  const md = localDate(now).slice(5);
  return (md >= "09-01" && md <= "10-15") || (md >= "02-01" && md <= "03-10");
}

export type ErasmusSuggestion = {
  sessions: ClassSessionLite[];
  /** Plazas libres (o salas enteras, en escape) en esas sesiones. */
  free: number;
};

export type ClassSessionLite = {
  session: ProClassSession;
  typeName: string;
  label: string;
};

/**
 * Sesiones en inglés de las próximas semanas con sitio: lo que se ofrece a
 * los Erasmus que acaban de llegar. Null si no es temporada o no hay nada.
 */
export function erasmusSuggestion(data: ProData, now: Date, days = 21): ErasmusSuggestion | null {
  if (!inErasmusWindow(now)) return null;
  const until = addDays(localDate(now), days);
  // Una sala de escape se reserva entera: libre si nadie la tiene.
  const freeOf = (s: ProClassSession) =>
    isRoomMode(data, data.classTypes.find((c) => c.id === s.classTypeId))
      ? s.booked > 0
        ? 0
        : 1
      : freeSpots(s);
  const sessions = data.sessions
    .filter(
      (s) =>
        s.status !== "cancelled" &&
        new Date(s.start).getTime() > now.getTime() &&
        localDate(s.start) <= until &&
        sessionExtra(data, s.id).language === "en" &&
        freeOf(s) > 0,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!sessions.length) return null;
  const lite = sessions.map((session) => {
    const typeName = data.classTypes.find((c) => c.id === session.classTypeId)?.name ?? "Sesión";
    const day = new Date(session.start).toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      timeZone: "Europe/Madrid",
    });
    return { session, typeName, label: `${day}, ${minutesToLabel(localMinutes(session.start))}` };
  });
  return { sessions: lite, free: sessions.reduce((a, s) => a + freeOf(s), 0) };
}

/* ------------------------------------------------------------------ */
/* Game masters: salas e idiomas de cada persona                       */
/* ------------------------------------------------------------------ */

/** Salas que aparecen en el horario, para marcar cuáles lleva cada persona. */
export function knownRooms(data: ProData): string[] {
  const rooms = new Set<string>();
  for (const s of data.sessions) if (s.room.trim()) rooms.add(s.room.trim());
  return [...rooms].sort((a, b) => a.localeCompare(b, "es"));
}

export function setStaffSkills(
  d: ProData,
  staffId: string,
  skills: { languages: string[]; rooms: string[] },
): ProData {
  return withExtras(d, (x) => ({
    ...x,
    staff: {
      ...x.staff,
      [staffId]: { languages: [...new Set(skills.languages)], rooms: [...new Set(skills.rooms)] },
    },
  }));
}

export type StaffGap = {
  session: ProClassSession;
  typeName: string;
  coachName: string;
  why: string;
};

/**
 * Sesiones de los próximos días cuyo game master no puede llevarlas: no
 * conoce la sala, no la lleva en inglés o tiene otra partida a la vez.
 */
export function staffGaps(data: ProData, now: Date, days = 7): StaffGap[] {
  const until = addDays(localDate(now), days);
  const skills = extrasOf(data).staff;
  return data.sessions
    .filter(
      (s) =>
        s.status !== "cancelled" &&
        new Date(s.start).getTime() > now.getTime() &&
        localDate(s.start) <= until,
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .flatMap((s) => {
      const coach = data.staff.find((x) => x.id === s.coachId);
      const typeName = data.classTypes.find((c) => c.id === s.classTypeId)?.name ?? "Sesión";
      if (!coach) return [{ session: s, typeName, coachName: "", why: "Sin nadie asignado" }];
      const k = skills[coach.id];
      const english = sessionExtra(data, s.id).language === "en";
      const from = new Date(s.start).getTime();
      const to = new Date(s.end).getTime();
      const busy = data.sessions.some(
        (x) =>
          x.id !== s.id &&
          x.coachId === coach.id &&
          x.status !== "cancelled" &&
          new Date(x.start).getTime() < to &&
          from < new Date(x.end).getTime(),
      );
      const speaks = !english || Boolean(k?.languages.includes("en"));
      const knows = !k || !k.rooms.length || k.rooms.some((r) => r.toLowerCase() === s.room.trim().toLowerCase());
      const why = busy
        ? "Tiene otra partida a la vez"
        : !speaks
          ? "No lleva partidas en inglés"
          : !knows
            ? `No conoce ${s.room}`
            : "";
      return why ? [{ session: s, typeName, coachName: coach.name, why }] : [];
    });
}
