/**
 * Datos del titular de Franky para el aviso legal (art. 10 LSSI) y la
 * política de privacidad (art. 13 RGPD).
 *
 * En el repositorio público los datos identificativos (nombre, NIF y domicilio)
 * no se versionan: se leen de LEGAL_ENTITY_* en el entorno de despliegue.
 *
 * `registry` solo aplica si el titular se inscribe en un registro público
 * (p. ej. Registro Mercantil si se constituye una sociedad). Para una persona
 * física no inscrita se deja vacío.
 */
export const LEGAL_ENTITY = {
  /** Titular del servicio: persona física, fundador de Franky. */
  name: process.env.LEGAL_ENTITY_NAME ?? "",
  /** NIF del titular. */
  nif: process.env.LEGAL_ENTITY_NIF ?? "",
  /** Domicilio a efectos de notificaciones confirmado por el titular. */
  address: process.env.LEGAL_ENTITY_ADDRESS ?? "",
  /** Correo de contacto para privacidad y asuntos legales. */
  email: "privacidad@franky.es",
  /** Datos registrales, si los hubiera. Vacío para persona física no inscrita. */
  registry: "",
};

/** Correo de soporte general (el que ya usan los términos y el contacto). */
export const SUPPORT_EMAIL = "soporte@franky.es";

/** Fecha que muestran las páginas legales revisadas en esta versión. */
export const LEGAL_UPDATED_AT = "24 de septiembre de 2026";

/** Web principal, para las URL canónicas y los textos legales. */
export const LEGAL_SITE = "https://franky.es";

/** Líneas del titular que tienen valor (las vacías no se enseñan). */
export function legalEntityLines(entity: {
  name: string;
  nif: string;
  address: string;
  email: string;
  registry: string;
} = LEGAL_ENTITY): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: "Titular", value: entity.name },
    { label: "NIF", value: entity.nif },
    { label: "Domicilio", value: entity.address },
    { label: "Correo electrónico", value: entity.email },
    { label: "Datos registrales", value: entity.registry },
  ];
  return rows.filter((row) => row.value.trim().length > 0);
}
