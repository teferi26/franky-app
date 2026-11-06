/**
 * Las 13 características que un local marca al darse de alta en
 * /negocio/registro (columnas booleanas de leisure_spots, migración 029).
 *
 * Vive en un único sitio para que el listado, los filtros y la ficha no se
 * desincronicen. Los iconos los pone cada pantalla: aquí solo clave y etiqueta.
 */
export const LEISURE_FEATURES: { key: string; label: string }[] = [
  { key: "has_wifi", label: "Wifi" },
  { key: "has_terrace", label: "Terraza" },
  { key: "has_outdoor_seating", label: "Mesas fuera" },
  { key: "has_food", label: "Comida" },
  { key: "has_live_music", label: "Música en vivo" },
  { key: "has_billiards", label: "Billar" },
  { key: "has_air_conditioning", label: "Aire acondicionado" },
  { key: "has_parking", label: "Parking" },
  { key: "accepts_groups", label: "Acepta grupos" },
  { key: "accepts_pets", label: "Pet-friendly" },
  { key: "student_discount", label: "Descuento estudiantes" },
  { key: "reservations", label: "Admite reservas" },
  { key: "card_payment", label: "Pago con tarjeta" },
];

/** Columnas que hay que pedirle a PostgREST. */
export const FEATURE_COLUMNS = LEISURE_FEATURES.map((f) => f.key);

/**
 * `card_payment` se creó con DEFAULT true, así que TODAS las filas del catálogo
 * curado (parques, museos…) la tienen a true sin que nadie lo haya comprobado.
 * Solo es un dato real cuando lo ha contestado el dueño del local, así que no
 * se pinta en el catálogo curado ni se puede filtrar por ella.
 */
export const UNRELIABLE_WITHOUT_OWNER = new Set(["card_payment"]);

/** Las que de verdad ayudan a elegir sitio; salen como filtros en el listado. */
export const LEISURE_FILTER_KEYS = [
  "has_wifi",
  "has_terrace",
  "has_food",
  "has_live_music",
  "student_discount",
  "accepts_groups",
  "accepts_pets",
  "reservations",
];

export const LEISURE_FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  LEISURE_FEATURES.map((f) => [f.key, f.label])
);
