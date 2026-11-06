/**
 * Traer los clientes (y sus bonos vivos) desde otra agenda o una hoja de
 * cálculo. Se entiende un CSV con cabecera en español o en inglés, separado
 * por punto y coma, coma o tabulador. Primero se enseña qué va a pasar y
 * después se guarda: nada entra sin que el negocio lo vea antes.
 */
import type { ProClient, ProData, ProService } from "./types";
import type { ProAgendaBundle } from "./agenda-types";

/* ------------------------------------------------------------------ */
/* Lectura del CSV                                                     */
/* ------------------------------------------------------------------ */

/** Separador más probable mirando la primera línea con contenido. */
function delimiterOf(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const counts = [";", ",", "\t"].map((sep) => ({
    sep,
    n: first.split(sep).length,
  }));
  return counts.sort((a, b) => b.n - a.n)[0].sep;
}

/** Filas del CSV respetando comillas (con separadores y saltos dentro). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiterOf(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === sep) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .map((cells) => cells.map((value) => value.trim()))
    .filter((cells) => cells.some(Boolean));
}

/* ------------------------------------------------------------------ */
/* Columnas                                                            */
/* ------------------------------------------------------------------ */

export type ImportField =
  | "name"
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "notes"
  | "birthday"
  | "visits"
  | "lastVisit"
  | "bundle"
  | "sessions";

/** Palabras con las que suele venir cada columna (sin tildes, en minúscula). */
const FIELD_WORDS: [ImportField, RegExp][] = [
  ["firstName", /^(nombre de pila|first ?name|given name)$/],
  ["lastName", /^(apellidos?|last ?name|surname|family name)$/],
  ["name", /^(nombre( completo)?|cliente|clienta|name|full ?name|client)$/],
  ["phone", /(telefono|movil|celular|phone|mobile|whatsapp)/],
  ["email", /(e-?mail|correo)/],
  ["notes", /(notas?|observaciones|comentarios?|notes?)/],
  ["birthday", /(cumpleanos|nacimiento|birthday|birth date|date of birth)/],
  ["visits", /^(visitas|n.? de visitas|visits|total visits)$/],
  ["lastVisit", /(ultima visita|last visit)/],
  ["bundle", /^(bono|bonos|paquete|package|bundle)$/],
  ["sessions", /(sesiones|restantes|sessions)/],
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Qué columna es cada campo. La primera que encaja se queda. */
export function mapColumns(
  header: string[],
): Partial<Record<ImportField, number>> {
  const out: Partial<Record<ImportField, number>> = {};
  header.forEach((raw, index) => {
    const title = normalize(raw);
    const match = FIELD_WORDS.find(
      ([field, words]) => out[field] === undefined && words.test(title),
    );
    if (match) out[match[0]] = index;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Vista previa                                                        */
/* ------------------------------------------------------------------ */

export type ImportRow = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  birthday?: string;
  visits: number;
  lastVisit?: string;
  bundle?: { label: string; sessions: number; serviceId?: string };
};

export type ImportPreview = {
  columns: ImportField[];
  rows: ImportRow[];
  /** Ya estaban en la ficha (mismo teléfono o mismo nombre). */
  duplicates: ImportRow[];
  /** Filas sin nombre: no se pueden guardar. */
  skipped: number;
};

/** Solo cifras: "+34 600 11 22 33" y "600112233" son el mismo teléfono. */
export function phoneKey(phone: string | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** "31/12/1999", "1999-12-31" o "31-12-99" a YYYY-MM-DD; lo demás, nada. */
export function parseDay(text: string | undefined): string | undefined {
  const value = (text ?? "").trim();
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return day(+iso[1], +iso[2], +iso[3]);
  const es = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!es) return undefined;
  const year = +es[3] < 100 ? (+es[3] > 30 ? 1900 : 2000) + +es[3] : +es[3];
  return day(year, +es[2], +es[1]);
}

function day(year: number, month: number, date: number): string | undefined {
  if (month < 1 || month > 12 || date < 1 || date > 31) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(date)}`;
}

/** Servicio cuyo nombre aparece en el nombre del bono ("Bono 6 láser piernas"). */
export function serviceForBundle(
  services: ProService[],
  label: string,
): string | undefined {
  const text = normalize(label);
  const scored = services
    .map((service) => {
      const words = normalize(service.name)
        .split(" ")
        .filter((word) => word.length > 3);
      return {
        id: service.id,
        hits: words.filter((word) => text.includes(word)).length,
      };
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.id;
}

/** Lee el CSV y dice qué entraría, qué está repetido y qué no se puede leer. */
export function importPreview(data: ProData, text: string): ImportPreview {
  const [header = [], ...lines] = parseCsv(text);
  const map = mapColumns(header);
  const cell = (cells: string[], field: ImportField) =>
    map[field] === undefined ? "" : (cells[map[field]!] ?? "").trim();
  const phones = new Set(
    data.clients.map((client) => phoneKey(client.phone)).filter(Boolean),
  );
  const names = new Set(data.clients.map((client) => normalize(client.name)));

  const rows: ImportRow[] = [];
  const duplicates: ImportRow[] = [];
  let skipped = 0;
  for (const cells of lines) {
    const name =
      cell(cells, "name") ||
      [cell(cells, "firstName"), cell(cells, "lastName")]
        .filter(Boolean)
        .join(" ");
    if (!name) {
      skipped++;
      continue;
    }
    const sessions = Number.parseInt(cell(cells, "sessions"), 10);
    const bundleLabel = cell(cells, "bundle");
    const row: ImportRow = {
      name: name.replace(/\s+/g, " "),
      phone: cell(cells, "phone") || undefined,
      email: cell(cells, "email") || undefined,
      notes: cell(cells, "notes") || undefined,
      birthday: parseDay(cell(cells, "birthday")),
      visits: Math.max(0, Number.parseInt(cell(cells, "visits"), 10) || 0),
      lastVisit: parseDay(cell(cells, "lastVisit")),
      bundle:
        bundleLabel && sessions > 0
          ? {
              label: bundleLabel,
              sessions,
              serviceId: serviceForBundle(data.services, bundleLabel),
            }
          : undefined,
    };
    const key = phoneKey(row.phone);
    const seen = key ? phones.has(key) : names.has(normalize(row.name));
    if (seen) {
      duplicates.push(row);
      continue;
    }
    if (key) phones.add(key);
    names.add(normalize(row.name));
    rows.push(row);
  }
  return {
    columns: Object.keys(map) as ImportField[],
    rows,
    duplicates,
    skipped,
  };
}

/* ------------------------------------------------------------------ */
/* Guardar                                                             */
/* ------------------------------------------------------------------ */

/**
 * Añade las fichas nuevas y sus bonos vivos. Los bonos entran sin cobro: ya
 * se pagaron en la agenda anterior. El permiso de comunicaciones se pide de
 * nuevo, así que empieza desactivado.
 */
export function applyImport(
  data: ProData,
  preview: ImportPreview,
  input: { ids: string[]; at: string },
): ProData {
  const clients: ProClient[] = preview.rows.map((row, i) => ({
    id: input.ids[i],
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    birthday: row.birthday,
    tags: [],
    visits: row.visits,
    spentCents: null,
    lastVisit: row.lastVisit ? `${row.lastVisit}T12:00:00.000Z` : undefined,
    noShows: 0,
    source: "unknown",
    marketingConsent: false,
    cardMember: false,
    createdAt: input.at,
  }));
  const ops = data.agendaOps;
  const bundles: ProAgendaBundle[] = ops
    ? preview.rows.flatMap((row, i) =>
        row.bundle?.serviceId
          ? [
              {
                id: `${input.ids[i]}-bono`,
                clientId: input.ids[i],
                clientName: row.name,
                serviceId: row.bundle.serviceId,
                label: row.bundle.label,
                sessions: row.bundle.sessions,
                used: 0,
                priceCents: 0,
                soldAt: input.at,
                moves: [],
              },
            ]
          : [],
      )
    : [];
  return {
    ...data,
    clients: [...clients, ...data.clients],
    ...(ops
      ? { agendaOps: { ...ops, bundles: [...ops.bundles, ...bundles] } }
      : {}),
  };
}

/** Cuántos bonos de la vista previa entrarán (los que casan con un servicio). */
export function importBundles(preview: ImportPreview): {
  matched: number;
  unmatched: number;
} {
  const withBundle = preview.rows.filter((row) => row.bundle);
  const matched = withBundle.filter((row) => row.bundle?.serviceId).length;
  return { matched, unmatched: withBundle.length - matched };
}
