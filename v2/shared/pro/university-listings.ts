/**
 * Detección de anuncios de piso copiados.
 *
 * El patrón de estafa que describe la Policía Nacional cada septiembre: alguien
 * copia el anuncio de un piso real (título, texto, fotos, precio), lo publica
 * como propio y cobra la fianza y el primer mes sin tener el piso. Al revisar
 * un piso avisamos si otro propietario tiene un anuncio que se le parece.
 *
 * Varios pisos del mismo propietario con el mismo texto son normales (una
 * inmobiliaria con habitaciones iguales): solo cuenta si el propietario es otro.
 */

import type { UniHousing } from "./university-types";

export type CopyReason = "title" | "description" | "price_zone";

export const COPY_REASON_LABEL: Record<CopyReason, string> = {
  title: "Mismo título",
  description: "Mismo texto del anuncio",
  price_zone: "Mismo precio, zona y habitaciones",
};

export type CopyMatch = {
  listing: UniHousing;
  reasons: CopyReason[];
  /** 0 a 100: cuánto se parece el texto (título y descripción). */
  similarity: number;
  /** Solo coincide en precio y zona: señal débil, conviene mirar las fotos. */
  weak: boolean;
};

/** Parecido mínimo para dar un título por copiado. */
export const TITLE_SIMILARITY = 0.8;
/** Parecido mínimo para dar una descripción por copiada. */
export const DESCRIPTION_SIMILARITY = 0.6;
/** Por debajo de estas palabras una descripción no se compara (demasiado corta). */
const MIN_DESCRIPTION_WORDS = 8;

// Palabras que aparecen en casi todos los anuncios y no distinguen nada.
const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "el", "en", "es", "la", "las", "lo", "los",
  "para", "por", "que", "se", "su", "un", "una", "y", "o", "muy", "mas",
]);

/** Palabras significativas, sin tildes, mayúsculas ni signos. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Parecido de Jaccard entre dos textos (0 a 1). */
export function textSimilarity(a: string, b: string): number {
  const x = new Set(words(a));
  const y = new Set(words(b));
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common += 1;
  return common / (x.size + y.size - common);
}

function sameOwner(a: UniHousing, b: UniHousing): boolean {
  return a.owner.trim().toLowerCase() === b.owner.trim().toLowerCase();
}

/** Anuncios de otros propietarios que se parecen a `h`, los más parecidos primero. */
export function copyMatches(all: UniHousing[], h: UniHousing): CopyMatch[] {
  const matches: CopyMatch[] = [];
  for (const other of all) {
    if (other.id === h.id || sameOwner(other, h)) continue;
    const reasons: CopyReason[] = [];
    const title = textSimilarity(h.title, other.title);
    if (title >= TITLE_SIMILARITY) reasons.push("title");
    let description = 0;
    if (
      h.description &&
      other.description &&
      words(h.description).length >= MIN_DESCRIPTION_WORDS &&
      words(other.description).length >= MIN_DESCRIPTION_WORDS
    ) {
      description = textSimilarity(h.description, other.description);
      if (description >= DESCRIPTION_SIMILARITY) reasons.push("description");
    }
    const priceZone =
      h.priceCents === other.priceCents &&
      h.zone === other.zone &&
      (h.rooms ?? 0) === (other.rooms ?? 0);
    if (priceZone) reasons.push("price_zone");
    if (!reasons.length) continue;
    matches.push({
      listing: other,
      reasons,
      similarity: Math.round(Math.max(title, description) * 100),
      weak: reasons.length === 1 && reasons[0] === "price_zone",
    });
  }
  return matches.sort(
    (a, b) => Number(a.weak) - Number(b.weak) || b.similarity - a.similarity,
  );
}

/** ¿Tiene alguna coincidencia fuerte (título o texto)? */
export function looksCopied(all: UniHousing[], h: UniHousing): boolean {
  return copyMatches(all, h).some((m) => !m.weak);
}

/** Pisos en cola que parecen copiados de otro propietario. */
export function suspectedCopies(all: UniHousing[]): UniHousing[] {
  return all.filter((h) => h.status === "pending" && looksCopied(all, h));
}
