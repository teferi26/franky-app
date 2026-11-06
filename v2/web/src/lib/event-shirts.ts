/**
 * Tallas de camiseta de un evento (migración 164).
 *
 * Fuente única para web y para el recuento del organizador. 'ninguna' es una
 * respuesta válida: quien no quiere camiseta lo dice, en vez de inventarse una
 * talla o dejar el recuento incompleto.
 */
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "ninguna"] as const;

export type ShirtSize = (typeof SHIRT_SIZES)[number];

/** Solo las tallas de verdad, para pintar el recuento sin el "no quiero". */
export const WEARABLE_SHIRT_SIZES = SHIRT_SIZES.filter((s) => s !== "ninguna");

export function shirtSizeLabel(size: ShirtSize): string {
  return size === "ninguna" ? "No quiere camiseta" : size;
}

export function isShirtSize(value: unknown): value is ShirtSize {
  return typeof value === "string" && (SHIRT_SIZES as readonly string[]).includes(value);
}

/**
 * Recuento por talla de una lista de asistentes REALES (los que están
 * apuntados o tienen entrada). Se pasa la talla de cada asistente, no las filas
 * de event_shirt_sizes: quien eligió talla y luego no se apuntó no cuenta.
 */
export function tallyShirtSizes(sizes: (ShirtSize | null)[]): {
  bySize: { size: ShirtSize; count: number }[];
  answered: number;
  missing: number;
  shirtsNeeded: number;
} {
  const counts = new Map<ShirtSize, number>();
  let answered = 0;
  let missing = 0;
  for (const size of sizes) {
    if (!size) {
      missing++;
      continue;
    }
    answered++;
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  const bySize = SHIRT_SIZES.filter((s) => counts.has(s)).map((size) => ({
    size,
    count: counts.get(size) ?? 0,
  }));
  return {
    bySize,
    answered,
    missing,
    shirtsNeeded: answered - (counts.get("ninguna") ?? 0),
  };
}
