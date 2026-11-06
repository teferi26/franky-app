import type { ProData, ProIncident, ProLead, ProProperty, ProRoom, ProTenant } from "./types";
import type { ProHousingProvider, ProRegion } from "./housing-types";
import { addDays, localDate, money } from "./format";
import { STAGE_LABEL, daysBetween, shortDate, uniShort } from "./housing";
import { depositCountdown, housingOpsOf, patchProperty, patchTenant, withOps } from "./housing-ops";
import { DEFAULT_REGION, depositRuleFor } from "./housing-region";

/**
 * Herramientas del día a día del motor de vivienda que no son del embudo ni
 * de las cuentas: buscar a cualquiera desde la cabecera, notas y etiquetas
 * del equipo, el mapa de la cartera por distancia al campus, el historial de
 * cada piso, los proveedores de confianza, el recargo de una fianza fuera de
 * plazo y el enlace público de un piso. Funciones puras que comparten la web
 * y la app.
 */

/* ------------------------------------------------------------------ */
/* Búsqueda global                                                      */
/* ------------------------------------------------------------------ */

export type HousingHitKind = "tenant" | "lead" | "property" | "room";

export type HousingHit = {
  kind: HousingHitKind;
  /** Id del inquilino, del interesado o del piso (también para una habitación). */
  id: string;
  title: string;
  detail: string;
  roomId?: string;
};

/** Minúsculas y sin tildes: "Castaños" encuentra "castanos" y al revés. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function tokens(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean);
}

/** Cada palabra buscada tiene que aparecer en algún campo. */
function matches(words: string[], fields: (string | undefined)[]): boolean {
  const hay = normalizeSearch(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** Primero lo que empieza por lo buscado ("Luc" pone a Lucía antes que a Paula Lucas). */
function rank(words: string[], title: string): number {
  return normalizeSearch(title).startsWith(words[0] ?? "") ? 0 : 1;
}

/**
 * Busca personas, pisos y habitaciones a la vez. Mira nombres, universidad,
 * avalista, dirección, zona, registros del piso, notas y etiquetas.
 */
export function housingSearch(data: ProData, query: string, now: Date, limit = 8): HousingHit[] {
  const words = tokens(query);
  if (!words.length) return [];
  const today = localDate(now);
  const flat = (id?: string) => data.properties.find((p) => p.id === id);
  const hits: (HousingHit & { order: number })[] = [];

  for (const t of data.tenants) {
    const p = flat(t.propertyId);
    const room = p?.rooms.find((r) => r.id === t.roomId);
    const fields = [t.name, t.university, p?.title, room?.name, t.docs?.guarantor?.name, t.docs?.guarantor?.phone, t.note, ...(t.tags ?? [])];
    if (!matches(words, fields)) continue;
    const gone = t.contractEnd.slice(0, 10) < today;
    const where = [p?.title, room?.name.toLowerCase()].filter(Boolean).join(", ");
    hits.push({
      kind: "tenant",
      id: t.id,
      title: t.name,
      detail: gone ? `Vivió en ${where} hasta el ${shortDate(t.contractEnd)}` : `Inquilino en ${where}`,
      order: (gone ? 5 : 0) + rank(words, t.name),
    });
  }

  for (const l of data.leads) {
    const fields = [l.name, l.university, l.studies, flat(l.propertyId)?.title, l.note, ...(l.tags ?? []), ...(l.roomieGroup?.names ?? [])];
    if (!matches(words, fields)) continue;
    hits.push({
      kind: "lead",
      id: l.id,
      title: l.name,
      detail: `Interesado, ${STAGE_LABEL[l.stage].toLowerCase()} · ${uniShort(l.university)}, entra el ${shortDate(l.moveIn)}`,
      order: (l.stage === "lost" || l.stage === "signed" ? 6 : 1) + rank(words, l.name),
    });
  }

  const owners = housingOpsOf(data).owners;
  for (const p of data.properties) {
    const owner = owners.find((o) => o.id === p.ownerId)?.name;
    const c = p.compliance ?? {};
    const fields = [p.title, p.address, p.zone, owner, c.nrua, c.cadastralRef, p.note, ...(p.tags ?? [])];
    if (matches(words, fields)) {
      const free = p.rooms.filter((r) => r.status === "free" || r.status === "leaving").length;
      hits.push({
        kind: "property",
        id: p.id,
        title: p.title,
        detail: `${p.zone} · ${p.rooms.length} habitaciones${free ? `, ${free} libres` : ", lleno"}`,
        order: 2 + rank(words, p.title),
      });
      continue;
    }
    // Una habitación se encuentra por su nombre y su piso: "castaños 3".
    for (const r of p.rooms) {
      if (!matches(words, [r.name, p.title, p.address])) continue;
      const tenant = data.tenants.find((t) => t.id === r.tenantId);
      hits.push({
        kind: "room",
        id: p.id,
        roomId: r.id,
        title: `${r.name}, ${p.title}`,
        detail: roomLine(r, tenant),
        order: 3,
      });
    }
  }

  return hits
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "es"))
    .slice(0, limit)
    .map(({ order: _order, ...hit }) => hit);
}

function roomLine(room: ProRoom, tenant?: ProTenant): string {
  const price = `${money(room.priceCents, { round: true })} al mes`;
  if (room.status === "free") return `Libre desde el ${shortDate(room.availableFrom)} · ${price}`;
  if (room.status === "reserved") return `Reservada · ${price}`;
  if (room.status === "leaving") return `${tenant ? `${tenant.name.split(" ")[0]} se va` : "Se libera"} el ${shortDate(room.availableFrom)} · ${price}`;
  return tenant ? `${tenant.name} · ${price}` : price;
}

/* ------------------------------------------------------------------ */
/* Notas y etiquetas                                                    */
/* ------------------------------------------------------------------ */

export type NoteTarget = "lead" | "tenant" | "property";

/** Etiquetas que se proponen con un toque. Se puede escribir cualquier otra. */
export const TAG_SUGGESTIONS: Record<NoteTarget, string[]> = {
  lead: ["Prefiere exterior", "Quiere baño propio", "Padres llaman mucho", "Solo por videollamada", "Viene con amigos"],
  tenant: ["Paga siempre puntual", "Pagan los padres", "Quiere renovar", "Quejas de ruido", "Avisar antes de entrar"],
  property: ["Reforma pendiente", "Llaves en oficina", "Comunidad estricta", "Caldera antigua", "Sin ascensor"],
};

/** Quita espacios de más y deja la etiqueta como se escribe una frase. */
export function cleanTag(tag: string): string {
  const t = tag.trim().replace(/\s+/g, " ").slice(0, 40);
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** Pone o quita una etiqueta sin repetirla (sin importar mayúsculas ni tildes). */
export function toggleTag(tags: string[] | undefined, tag: string): string[] {
  const clean = cleanTag(tag);
  const list = tags ?? [];
  if (!clean) return list;
  const key = normalizeSearch(clean);
  return list.some((t) => normalizeSearch(t) === key) ? list.filter((t) => normalizeSearch(t) !== key) : [...list, clean];
}

export type NotesPatch = { note?: string; tags?: string[] };

/** Guarda la nota y las etiquetas de un interesado, inquilino o piso. */
export function saveNotes(data: ProData, target: NoteTarget, id: string, patch: NotesPatch): ProData {
  const apply = <T extends { note?: string; tags?: string[] }>(item: T): T => {
    const next = { ...item };
    if (patch.note !== undefined) next.note = patch.note.trim() || undefined;
    if (patch.tags !== undefined) next.tags = patch.tags.length ? patch.tags : undefined;
    return next;
  };
  if (target === "tenant") return patchTenant(data, id, apply);
  if (target === "property") return patchProperty(data, id, apply);
  return { ...data, leads: data.leads.map((l: ProLead) => (l.id === id ? apply(l) : l)) };
}

/* ------------------------------------------------------------------ */
/* Mapa de la cartera                                                   */
/* ------------------------------------------------------------------ */

export type MapPin = {
  property: ProProperty;
  minutes: number;
  free: number;
  total: number;
  occupied: number;
};

export type MapZone = { zone: string; avgMinutes: number; free: number; total: number; pins: MapPin[] };

/** Tramos de distancia al campus para leer el mapa de un vistazo. */
export const DISTANCE_BANDS = [
  { id: "near", label: "Hasta 10 min", max: 10 },
  { id: "mid", label: "De 11 a 20 min", max: 20 },
  { id: "far", label: "Más de 20 min", max: Infinity },
] as const;

export function distanceBand(minutes: number) {
  return DISTANCE_BANDS.find((b) => minutes <= b.max) ?? DISTANCE_BANDS[DISTANCE_BANDS.length - 1];
}

/**
 * La cartera ordenada por zonas y por minutos al campus, con las habitaciones
 * libres de cada piso. `scaleMax` redondea la distancia mayor a 5 minutos
 * para dibujar la regla.
 */
export function portfolioMap(data: ProData) {
  const byZone = new Map<string, MapPin[]>();
  for (const p of data.properties) {
    const free = p.rooms.filter((r) => r.status === "free" || r.status === "leaving").length;
    const occupied = p.rooms.filter((r) => r.status === "occupied" || r.status === "leaving").length;
    const pin: MapPin = { property: p, minutes: Math.max(0, p.minutesToCampus), free, total: p.rooms.length, occupied };
    byZone.set(p.zone, [...(byZone.get(p.zone) ?? []), pin]);
  }
  const zones: MapZone[] = [...byZone.entries()]
    .map(([zone, pins]) => ({
      zone,
      pins: pins.sort((a, b) => a.minutes - b.minutes),
      avgMinutes: Math.round(pins.reduce((a, x) => a + x.minutes, 0) / pins.length),
      free: pins.reduce((a, x) => a + x.free, 0),
      total: pins.reduce((a, x) => a + x.total, 0),
    }))
    .sort((a, b) => a.avgMinutes - b.avgMinutes);
  const longest = Math.max(10, ...data.properties.map((p) => p.minutesToCampus));
  const bands = DISTANCE_BANDS.map((b) => {
    const pins = zones.flatMap((z) => z.pins).filter((pin) => distanceBand(pin.minutes).id === b.id);
    return { ...b, flats: pins.length, free: pins.reduce((a, x) => a + x.free, 0) };
  });
  return { zones, bands, scaleMax: Math.ceil(longest / 5) * 5 };
}

/* ------------------------------------------------------------------ */
/* Historial del piso                                                   */
/* ------------------------------------------------------------------ */

export type HistoryEvent = {
  id: string;
  date: string;
  kind: "move_in" | "move_out" | "incident" | "expense";
  title: string;
  detail: string;
  amountCents?: number;
  tenantId?: string;
  incidentId?: string;
};

export type HistoryCourse = {
  startYear: number;
  label: string;
  events: HistoryEvent[];
  tenants: number;
  incidents: number;
  expensesCents: number;
};

/** El curso al que pertenece una fecha: de septiembre a agosto. */
export function courseOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 9 ? year : year - 1;
}

/** Gastos que merece la pena ver en el historial: no las cuotas de cada mes. */
const HISTORY_EXPENSES = new Set(["reparacion", "muebles", "limpieza", "otros"]);

/**
 * Lo que ha pasado en un piso, curso a curso: quién entró y salió, las
 * incidencias y las reparaciones o muebles. Solo hasta hoy.
 */
export function propertyHistory(data: ProData, propertyId: string, now: Date): HistoryCourse[] {
  const today = localDate(now);
  const p = data.properties.find((x) => x.id === propertyId);
  if (!p) return [];
  const roomName = (id?: string) => p.rooms.find((r) => r.id === id)?.name.toLowerCase();
  const events: HistoryEvent[] = [];

  for (const t of data.tenants.filter((x) => x.propertyId === propertyId)) {
    const start = t.contractStart.slice(0, 10);
    const end = (t.moveOut?.date ?? t.contractEnd).slice(0, 10);
    const where = roomName(t.roomId) ?? "una habitación";
    if (start <= today)
      events.push({ id: `in-${t.id}`, date: start, kind: "move_in", title: `Entra ${t.name}`, detail: `${cap(where)}, ${uniShort(t.university)}`, tenantId: t.id });
    if (end < today) {
      const back = t.moveOut?.returnCents;
      events.push({
        id: `out-${t.id}`,
        date: end,
        kind: "move_out",
        title: `Sale ${t.name}`,
        detail: back !== undefined ? `Fianza devuelta: ${money(back)}` : t.deposit.status === "returned" ? "Fianza devuelta" : "Fianza por liquidar",
        tenantId: t.id,
      });
    }
  }

  for (const i of data.incidents.filter((x: ProIncident) => x.propertyId === propertyId)) {
    const date = localDate(i.createdAt);
    if (date > today) continue;
    events.push({
      id: `inc-${i.id}`,
      date,
      kind: "incident",
      title: i.title,
      detail: [i.tenantName, i.status === "resolved" ? "resuelta" : "sin resolver", i.assignee].filter(Boolean).join(" · "),
      amountCents: i.costCents,
      incidentId: i.id,
    });
  }

  const expenses = housingOpsOf(data).expenses.filter((e) => e.propertyId === propertyId && e.date <= today);
  for (const e of expenses) {
    // La reparación de una incidencia ya aparece con la incidencia.
    if (!HISTORY_EXPENSES.has(e.category) || e.incidentId) continue;
    events.push({ id: `exp-${e.id}`, date: e.date, kind: "expense", title: e.concept, detail: "Gasto del piso", amountCents: e.amountCents });
  }

  const courses = new Map<number, HistoryEvent[]>();
  for (const ev of events) courses.set(courseOf(ev.date), [...(courses.get(courseOf(ev.date)) ?? []), ev]);
  return [...courses.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([startYear, list]) => ({
      startYear,
      label: `Curso ${startYear}/${String(startYear + 1).slice(2)}`,
      events: list.sort((a, b) => b.date.localeCompare(a.date)),
      tenants: new Set(list.filter((x) => x.kind === "move_in").map((x) => x.tenantId)).size,
      incidents: list.filter((x) => x.kind === "incident").length,
      expensesCents: expenses.filter((e) => courseOf(e.date) === startYear).reduce((a, e) => a + e.amountCents, 0),
    }));
}

function cap(text: string) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/* ------------------------------------------------------------------ */
/* Proveedores de confianza                                             */
/* ------------------------------------------------------------------ */

export type ProviderRow = {
  provider: ProHousingProvider;
  /** Incidencias que se le han asignado. */
  jobs: number;
  open: number;
  /** Lo pagado en los últimos 12 meses (gastos con su nombre). */
  paidYearCents: number;
  lastJobAt?: string;
};

/** Cada proveedor con sus trabajos y lo que se le ha pagado en el último año. */
export function providerBoard(data: ProData, now: Date): ProviderRow[] {
  const from = addDays(localDate(now), -365);
  const ops = housingOpsOf(data);
  return ops.providers
    .map((provider) => {
      const jobs = data.incidents.filter((i) => i.providerId === provider.id);
      const paid = ops.expenses.filter((e) => e.providerId === provider.id && e.date >= from);
      const last = [...jobs.map((i) => localDate(i.createdAt)), ...paid.map((e) => e.date)].sort().pop();
      return {
        provider,
        jobs: jobs.length,
        open: jobs.filter((i) => i.status !== "resolved").length,
        paidYearCents: paid.reduce((a, e) => a + e.amountCents, 0),
        lastJobAt: last,
      };
    })
    .sort((a, b) => b.open - a.open || b.jobs - a.jobs || a.provider.name.localeCompare(b.provider.name, "es"));
}

/** Da de alta o cambia un proveedor (mismo id). */
export function saveProvider(data: ProData, provider: ProHousingProvider): ProData {
  const clean: ProHousingProvider = {
    ...provider,
    name: provider.name.trim(),
    phone: provider.phone.trim(),
    note: provider.note?.trim() || undefined,
  };
  return withOps(data, (ops) => ({
    ...ops,
    providers: ops.providers.some((p) => p.id === clean.id)
      ? ops.providers.map((p) => (p.id === clean.id ? clean : p))
      : [...ops.providers, clean],
  }));
}

/** Lo quita de la lista. Las incidencias y gastos antiguos conservan su nombre. */
export function removeProvider(data: ProData, id: string): ProData {
  const name = housingOpsOf(data).providers.find((p) => p.id === id)?.name;
  const next = withOps(data, (ops) => ({ ...ops, providers: ops.providers.filter((p) => p.id !== id) }));
  return {
    ...next,
    incidents: next.incidents.map((i) => (i.providerId === id ? { ...i, providerId: undefined, assignee: i.assignee ?? name } : i)),
  };
}

/* ------------------------------------------------------------------ */
/* Fianza fuera de plazo                                                */
/* ------------------------------------------------------------------ */

/**
 * Recargo de la Generalitat por depositar la fianza tarde: del 5 % al 20 %
 * según el retraso (FAQ de fianzas de la Tesorería de la GVA). Como el tramo
 * exacto lo fija la Generalitat, se enseña la horquilla, no una cifra cerrada.
 */
export const DEPOSIT_SURCHARGE = { minPct: 0.05, maxPct: 0.2 };

/**
 * Con `region`, se usa el recargo de esa comunidad (Madrid: del 2 al 5 %); si
 * Franky no lo tiene comprobado, no se enseña ninguna cifra.
 */
export function depositSurcharge(tenant: ProTenant, today: string, region: ProRegion = DEFAULT_REGION) {
  if (tenant.deposit.status !== "pending") return null;
  const rule = region === DEFAULT_REGION ? DEPOSIT_SURCHARGE : depositRuleFor(region)?.surcharge;
  if (!rule) return null;
  const c = depositCountdown(tenant, today);
  if (!c.overdue) return null;
  const base = tenant.deposit.amountCents;
  return {
    lateDays: daysBetween(c.dueAt, today),
    minCents: Math.round(base * rule.minPct),
    maxCents: Math.round(base * rule.maxPct),
  };
}

/* ------------------------------------------------------------------ */
/* Enlace público del piso                                              */
/* ------------------------------------------------------------------ */

/** Ficha del negocio en Franky con el piso marcado, para el QR del cartel. */
export function propertyPublicUrl(slug: string, propertyId: string, origin = "https://franky.es"): string {
  return `${origin.replace(/\/$/, "")}/n/${encodeURIComponent(slug)}?piso=${encodeURIComponent(propertyId)}`;
}

/** Habitaciones que se anuncian en el cartel: libres o que se liberan, por fecha. */
export function posterRooms(property: ProProperty): ProRoom[] {
  return property.rooms
    .filter((r) => r.status === "free" || r.status === "leaving")
    .sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
}

/** Texto para compartir el piso por WhatsApp o redes. */
export function propertyShareText(data: ProData, property: ProProperty): string {
  const rooms = posterRooms(property);
  const from = rooms.length ? Math.min(...rooms.map((r) => r.priceCents)) : 0;
  const lines = [
    `${property.title}, a ${property.minutesToCampus} min del campus.`,
    rooms.length
      ? `${rooms.length === 1 ? "1 habitación libre" : `${rooms.length} habitaciones libres`} desde ${money(from, { round: true })} al mes.`
      : "Ahora mismo está lleno: apúntate para cuando se libere algo.",
    property.compliance?.energyLetter ? `Certificado energético: ${property.compliance.energyLetter}.` : "",
    `Pide visita en Franky: ${propertyPublicUrl(data.space.slug, property.id)}`,
  ];
  return lines.filter(Boolean).join("\n");
}
