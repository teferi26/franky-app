/**
 * Conversores de lo que escribe un usuario a lo que aguanta la base de datos.
 *
 * Viven aquí y no dentro de una ruta porque el problema que arreglan no es de
 * una ruta: el alta de negocios (`/api/negocio/registro`) metía en Postgres el
 * texto tal cual llegaba del formulario, y cualquier cosa que la columna no
 * admitiera (una fecha escrita "30/06/2027", una universidad que no es un UUID,
 * unos m² con un cero de más) tumbaba el alta entera con un 500 mudo: "No se
 * pudo crear el anuncio", sin decir qué campo era.
 *
 * La regla es la misma para todos: un campo OPCIONAL que no se entiende se
 * queda vacío, nunca hace fracasar la operación. Los obligatorios se validan
 * aparte, en quien los usa, para poder dar un mensaje concreto.
 */

/** Texto con contenido, o null. */
export function nullableText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Entero positivo dentro de un techo. Fuera de rango devuelve null (campo sin
 * rellenar) en vez de dejar que Postgres lance `integer out of range`.
 * El techo por defecto es el máximo de una columna INTEGER con margen.
 */
export function nullableInt(v: unknown, max = 2_000_000_000): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const i = Math.floor(n);
  return i <= max ? i : null;
}

/** Número decimal >= 0 dentro de un techo, o null. */
export function nullableNum(v: unknown, max = 99_999_999): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

/** Techo real de una columna NUMERIC(10,2), como price. */
export const MAX_NUMERIC_10_2 = 99_999_999.99;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID bien formado o null. Una columna UUID rechaza cualquier otra cosa con
 * un 22P02, así que un slug o un nombre de universidad colado en el campo no
 * puede llegar a la consulta.
 */
export function nullableUuid(v: unknown): string | null {
  const raw = nullableText(v);
  return raw && UUID_RE.test(raw) ? raw : null;
}

/**
 * Fecha normalizada a `YYYY-MM-DD` para una columna DATE.
 *
 * Acepta ISO (lo que manda `<input type="date">`) y el formato de aquí,
 * DD/MM/AAAA: cuando el navegador no soporta el input de fecha (pasa en varios
 * webviews) el campo degrada a texto libre y la gente escribe la fecha como la
 * escribe siempre. Lo que no se entienda, o no exista en el calendario, se
 * ignora: es un dato opcional y no merece costar el anuncio entero.
 */
export function nullableDate(v: unknown): string | null {
  const raw = nullableText(v);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  const es = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  let y: number, m: number, d: number;
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (es) {
    d = Number(es[1]);
    m = Number(es[2]);
    y = Number(es[3]);
  } else {
    return null;
  }

  // Que la fecha exista de verdad: un 31 de febrero también revienta el insert.
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
