import type { ProData, ProProperty, ProTenant } from "./types";
import type { ProHousingOps, ProRegion } from "./housing-types";
import { GVA_URL, currentTenants } from "./housing";

/**
 * Lo que cambia según la comunidad autónoma del piso: dónde y en qué plazo se
 * deposita la fianza, y los cambios de normas que le tocan.
 *
 * Los datos los mantiene Franky con su fuente oficial al lado. La app no
 * interpreta normas: enseña el plazo, el organismo y el enlace, y avisa de lo
 * que cambia. Las comunidades sin datos comprobados devuelven `null` y la
 * pantalla se queda en lo común (cuenta atrás con la fecha guardada).
 *
 * Este módulo no importa `housing-ops` para que `housing-ops` pueda usarlo
 * sin crear un ciclo.
 */

/** Franky empezó en Alicante: un piso sin comunidad indicada es de la Comunitat Valenciana. */
export const DEFAULT_REGION: ProRegion = "VC";

export const REGION_LABEL: Record<ProRegion, string> = {
  AN: "Andalucía",
  AR: "Aragón",
  AS: "Asturias",
  IB: "Illes Balears",
  CN: "Canarias",
  CB: "Cantabria",
  CL: "Castilla y León",
  CM: "Castilla-La Mancha",
  CT: "Cataluña",
  VC: "Comunitat Valenciana",
  EX: "Extremadura",
  GA: "Galicia",
  MD: "Comunidad de Madrid",
  MC: "Región de Murcia",
  NC: "Navarra",
  PV: "País Vasco",
  RI: "La Rioja",
  CE: "Ceuta",
  ML: "Melilla",
};

/** Comunidades ordenadas por nombre, para el selector de la ficha del piso. */
export const REGIONS = (Object.keys(REGION_LABEL) as ProRegion[]).sort((a, b) =>
  REGION_LABEL[a].localeCompare(REGION_LABEL[b], "es"),
);

export function propertyRegion(property: Pick<ProProperty, "compliance"> | undefined): ProRegion {
  return property?.compliance?.region ?? DEFAULT_REGION;
}

export function tenantRegion(data: ProData, tenant: Pick<ProTenant, "propertyId">): ProRegion {
  return propertyRegion(data.properties.find((p) => p.id === tenant.propertyId));
}

/** La comunidad de la mayoría de los pisos: la que manda en los textos generales. */
export function mainRegion(data: ProData): ProRegion {
  const count = new Map<ProRegion, number>();
  for (const p of data.properties) count.set(propertyRegion(p), (count.get(propertyRegion(p)) ?? 0) + 1);
  let best: ProRegion = DEFAULT_REGION;
  let max = 0;
  for (const [region, n] of count) {
    if (n > max) {
      best = region;
      max = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Fianza por comunidad                                                 */
/* ------------------------------------------------------------------ */

export type DepositDeadlineRule = { months: number } | { businessDays: number };

export type DepositRule = {
  /** Quién la recibe, para escribirlo en una frase: "en la Generalitat". */
  office: string;
  /** Nombre completo del organismo, para el contrato. */
  contractOffice: string;
  deadline: DepositDeadlineRule;
  /** El plazo dicho en palabras: "un mes desde la firma". */
  deadlineLabel: string;
  /** Modelo o impreso, si lo hay. */
  forms?: string;
  /** Página oficial del trámite. */
  url: string;
  /** Recargo por depositarla tarde, en tanto por uno. Sin él, no se enseña cifra. */
  surcharge?: { minPct: number; maxPct: number };
  /** Contratos firmados desde esta fecha ya no la depositan. */
  notRequiredFrom?: string;
};

/**
 * Solo las comunidades comprobadas en su web oficial (28-sep-2026):
 * - VC: Tesorería de la GVA (plazo de un mes, recargo del 5 al 20 %).
 * - MD: comunidad.madrid/vivienda/fianzas-arrendamiento (30 días hábiles,
 *   recargo del 2 %, o del 5 % pasado un año).
 * - CT: incasol.gencat.cat, Llei 13/1996, art. 3 (dos meses).
 * - AN: AVRA, Ley 5/2025 de Vivienda de Andalucía, disp. adicional sexta
 *   (sin depósito para contratos desde el 24-ene-2026).
 */
const DEPOSIT_RULES: Partial<Record<ProRegion, DepositRule>> = {
  VC: {
    office: "la Generalitat",
    contractOffice: "la Generalitat Valenciana",
    deadline: { months: 1 },
    deadlineLabel: "un mes desde la firma",
    forms: "modelo 806 u 816",
    url: GVA_URL,
    surcharge: { minPct: 0.05, maxPct: 0.2 },
  },
  MD: {
    office: "la Agencia de Vivienda Social",
    contractOffice: "la Agencia de Vivienda Social de la Comunidad de Madrid",
    deadline: { businessDays: 30 },
    deadlineLabel: "30 días hábiles desde la firma",
    url: "https://www.comunidad.madrid/vivienda/fianzas-arrendamiento",
    surcharge: { minPct: 0.02, maxPct: 0.05 },
  },
  CT: {
    office: "el Incasòl",
    contractOffice: "el Institut Català del Sòl (Incasòl)",
    deadline: { months: 2 },
    deadlineLabel: "dos meses desde la firma",
    url: "https://incasol.gencat.cat/ca/serveis-i-tramits/fiances-de-lloguers/informacio/diposit-de-fiances",
  },
  AN: {
    office: "la Junta de Andalucía",
    contractOffice: "la Agencia de Vivienda y Rehabilitación de Andalucía",
    deadline: { months: 1 },
    deadlineLabel: "un mes desde la firma",
    url: "https://www.juntadeandalucia.es/organismos/avra/areas/fianzas/notas-ley-vivienda-andalucia-2025.html",
    notRequiredFrom: "2026-01-24",
  },
};

/** La regla de fianza de una comunidad, o `null` si Franky aún no la tiene comprobada. */
export function depositRuleFor(region: ProRegion): DepositRule | null {
  return DEPOSIT_RULES[region] ?? null;
}

/** Si un contrato de esa comunidad y esa fecha tiene que depositar la fianza. */
export function depositRequired(region: ProRegion, contractStart: string): boolean {
  const from = depositRuleFor(region)?.notRequiredFrom;
  return !from || contractStart.slice(0, 10) < from;
}

/** Si la fianza de este inquilino hay que depositarla en algún organismo. */
export function tenantDepositRequired(data: ProData, tenant: ProTenant): boolean {
  return depositRequired(tenantRegion(data, tenant), tenant.contractStart);
}

/** Dónde se deposita, para escribirlo en frases. Sin regla, se dice sin nombre. */
export function depositOffice(region: ProRegion): string {
  return depositRuleFor(region)?.office ?? "el organismo de tu comunidad";
}

/* ------------------------------------------------------------------ */
/* Cambios de normas                                                    */
/* ------------------------------------------------------------------ */

export type LawNoteStatus = "vigor" | "tramitacion" | "previsto";

export const LAW_STATUS_LABEL: Record<LawNoteStatus, string> = {
  vigor: "En vigor",
  tramitacion: "En el Congreso",
  previsto: "Previsto",
};

export type LawNote = {
  id: string;
  /** Comunidades a las que toca, o todas. */
  regions: ProRegion[] | "all";
  /** Tipos de contrato a los que toca. */
  affects: ProTenant["contractKind"][];
  status: LawNoteStatus;
  /** Fecha de la noticia o de entrada en vigor (ISO). */
  date: string;
  title: string;
  /** Una o dos frases, sin interpretar. */
  body: string;
  source: { label: string; url: string };
  /** Compara la suma de las habitaciones con el piso entero en los pisos afectados. */
  roomsCapCheck?: boolean;
};

/**
 * Avisos que mantiene Franky. Solo cuentan lo que dice la fuente enlazada.
 * Al añadir uno nuevo, usa un id nuevo: los leídos se guardan por id.
 */
export const LAW_NOTES: LawNote[] = [
  {
    id: "decreto-vivienda-2026-09",
    regions: "all",
    affects: ["temporada", "habitacion"],
    status: "previsto",
    date: "2026-09-27",
    title: "Decreto de vivienda en el Consejo de Ministros",
    body:
      "El Gobierno quiere aprobar el 29 de septiembre un decreto que regula la temporada y las habitaciones " +
      "y prorroga contratos hasta 2028. Aún no tiene los apoyos cerrados.",
    source: {
      label: "Infobae, 27 de septiembre de 2026",
      url: "https://www.infobae.com/america/agencias/2026/09/27/del-control-de-los-alquileres-a-desahucios-las-diferencias-entre-grupos-que-retrasan-el-decreto-de-vivienda/",
    },
  },
  {
    id: "ley-temporada-congreso",
    regions: "all",
    affects: ["temporada", "habitacion"],
    status: "tramitacion",
    date: "2025-12-11",
    title: "Ley de temporada y habitaciones",
    body:
      "Metería las habitaciones en la ley de arrendamientos, limitaría la temporada a 12 meses y las garantías " +
      "extra a una mensualidad. Está aprobada en ponencia, sin votación final.",
    source: {
      label: "Sepin, diciembre de 2025",
      url: "https://blog.sepin.es/blog/2025/12/11/regulacion-alquileres-temporales-habitaciones/",
    },
  },
  {
    id: "cataluna-topes-2026",
    regions: ["CT"],
    affects: ["temporada", "habitacion"],
    status: "vigor",
    date: "2026-01-01",
    title: "Topes en temporada y habitaciones",
    body:
      "Desde el 1 de enero siguen los topes de la vivienda habitual, y la suma de las habitaciones " +
      "no puede pasar de la renta del piso entero.",
    source: {
      label: "idealista/news, enero de 2026",
      url: "https://www.idealista.com/news/inmobiliario/vivienda/2026/01/02/878458-entra-en-vigor-la-regulacion-del-alquiler-de-temporada-y-de-habitaciones-en",
    },
    roomsCapCheck: true,
  },
  {
    id: "andalucia-fianza-2026",
    regions: ["AN"],
    affects: ["temporada", "habitacion", "vivienda"],
    status: "vigor",
    date: "2026-01-24",
    title: "La fianza ya no se deposita",
    body: "Los contratos firmados desde el 24 de enero de 2026 no depositan la fianza en la Junta: la guardas tú hasta la salida.",
    source: {
      label: "Junta de Andalucía, AVRA",
      url: "https://www.juntadeandalucia.es/organismos/avra/areas/fianzas/notas-ley-vivienda-andalucia-2025.html",
    },
  },
];

function noteTouches(note: LawNote, region: ProRegion) {
  return note.regions === "all" || note.regions.includes(region);
}

/** Si las habitaciones suman al mes más que el piso entero (sin renta de referencia, no). */
function roomsOverWhole(property: ProProperty): boolean {
  const whole = property.wholeFlatReferenceCents ?? property.wholeFlatPriceCents;
  if (!whole || !property.rooms.length) return false;
  return property.rooms.reduce((a, r) => a + r.priceCents, 0) > whole;
}

export type LawNoteMatch = {
  note: LawNote;
  /** Contratos en vigor a los que toca. */
  contracts: number;
  /** Pisos a los que toca. */
  properties: ProProperty[];
  /** Pisos afectados en los que las habitaciones suman más que el piso entero. */
  overCap: ProProperty[];
};

/**
 * Los avisos que tocan a esta cartera: por la comunidad de sus pisos y por
 * los contratos que tiene. Si aún no hay inquilinos, basta con tener pisos
 * en esa comunidad. Los ya leídos no salen, salvo con `includeSeen`.
 */
export function lawNotesFor(data: ProData, now: Date, includeSeen = false): LawNoteMatch[] {
  const seen = new Set(data.housingOps?.lawSeen ?? []);
  const tenants = currentTenants(data, now);
  const out: LawNoteMatch[] = [];
  for (const note of LAW_NOTES) {
    if (!includeSeen && seen.has(note.id)) continue;
    const properties = data.properties.filter((p) => noteTouches(note, propertyRegion(p)));
    if (!properties.length) continue;
    const ids = new Set(properties.map((p) => p.id));
    const contracts = tenants.filter((t) => ids.has(t.propertyId) && note.affects.includes(t.contractKind)).length;
    if (tenants.length && !contracts) continue;
    out.push({
      note,
      contracts,
      properties,
      overCap: note.roomsCapCheck ? properties.filter(roomsOverWhole) : [],
    });
  }
  // Primero lo que ya está en vigor, luego lo más reciente.
  const rank: Record<LawNoteStatus, number> = { vigor: 0, previsto: 1, tramitacion: 2 };
  return out.sort((a, b) => rank[a.note.status] - rank[b.note.status] || b.note.date.localeCompare(a.note.date));
}

/** Los avisos que tocan a un contrato concreto, leídos o no: se enseñan al prepararlo. */
export function lawNotesForContract(data: ProData, propertyId: string | undefined, kind: ProTenant["contractKind"]): LawNote[] {
  const region = propertyRegion(data.properties.find((p) => p.id === propertyId));
  return LAW_NOTES.filter((n) => noteTouches(n, region) && n.affects.includes(kind));
}

/** Operación del motor con las listas de siempre, para escribir sin depender de housing-ops. */
function withHousingOps(data: ProData, fields: Partial<ProHousingOps>): ProData {
  const o = data.housingOps;
  return {
    ...data,
    housingOps: {
      providers: o?.providers ?? [],
      expenses: o?.expenses ?? [],
      utilities: o?.utilities ?? [],
      keys: o?.keys ?? [],
      owners: o?.owners ?? [],
      ...(o?.lawSeen ? { lawSeen: o.lawSeen } : {}),
      ...(o?.sharedAt ? { sharedAt: o.sharedAt } : {}),
      ...fields,
    },
  };
}

/** Marca un aviso como leído: deja de salir en el Resumen. */
export function markLawSeen(data: ProData, noteId: string): ProData {
  const seen = data.housingOps?.lawSeen ?? [];
  if (seen.includes(noteId)) return data;
  return withHousingOps(data, { lawSeen: [...seen, noteId] });
}

/** Apunta la primera vez que se comparte la ficha de un piso (para la lista de arranque). */
export function markPropertyShared(data: ProData, propertyId: string, nowIso: string): ProData {
  const shared = data.housingOps?.sharedAt ?? {};
  if (shared[propertyId]) return data;
  return withHousingOps(data, { sharedAt: { ...shared, [propertyId]: nowIso } });
}

/** Si algún piso ya se ha compartido o ha recibido una visita desde su ficha. */
export function anyPropertyShared(data: ProData): boolean {
  return Object.keys(data.housingOps?.sharedAt ?? {}).length > 0 || data.visits.some((v) => v.source === "public");
}
