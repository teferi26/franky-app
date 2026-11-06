import type { ProSectionId, ProVerticalId, ProEngine } from "./types";

/**
 * Suscripciones de Franky Pro en la App Store (compra dentro de la app con
 * Apple). Un producto por nivel de precio; cada sector usa el suyo. Todos
 * van en el grupo "Franky Pro" y empiezan con 7 días gratis.
 *
 * Franky tiene que ganar lo mismo por la web que por Apple. El precio de Apple
 * incluye el 21 % de IVA y Apple se queda un 15 % (Small Business Program),
 * así que es el catálogo x 1,21 / 0,85, subido al siguiente punto de precio.
 */
export const PRO_SUBSCRIPTION_GROUP = "Franky Pro";
export const PRO_TRIAL_DAYS = 7;

export type ProIapTier = "m12" | "m19" | "m29" | "m39" | "m49" | "m80";

export const PRO_IAP_TIERS: Record<ProIapTier, { productId: string; catalogEuros: number; appleEuros: number; name: string }> = {
  m12: { productId: "es.franky.app.pro.m12", catalogEuros: 12, appleEuros: 17.49, name: "Franky Pro Comunidades" },
  m19: { productId: "es.franky.app.pro.m19", catalogEuros: 19, appleEuros: 27.49, name: "Franky Pro Esencial" },
  m29: { productId: "es.franky.app.pro.m29", catalogEuros: 29, appleEuros: 41.49, name: "Franky Pro" },
  m39: { productId: "es.franky.app.pro.m39", catalogEuros: 39, appleEuros: 55.9, name: "Franky Pro Plus" },
  m49: { productId: "es.franky.app.pro.m49", catalogEuros: 49, appleEuros: 69.9, name: "Franky Pro Noche" },
  m80: { productId: "es.franky.app.pro.m80", catalogEuros: 80, appleEuros: 113.99, name: "Franky Pro Inmobiliarias" },
};

/** Nivel de cada sector. La universidad va por contrato anual, sin App Store. */
export const PRO_VERTICAL_TIER: Partial<Record<ProVerticalId, ProIapTier>> = {
  community: "m12",
  cafe: "m19",
  bar: "m19",
  landlord: "m19",
  hairdresser: "m29",
  beauty: "m29",
  pub: "m29",
  culture: "m29",
  coworking: "m29",
  restaurant: "m39",
  sports: "m39",
  sports_facility: "m39",
  academy: "m39",
  nightclub: "m49",
  agency: "m80",
};

export const PRO_PRODUCT_IDS: string[] = Object.values(PRO_IAP_TIERS).map((t) => t.productId);

export function tierForProduct(productId: string): ProIapTier | null {
  const found = (Object.keys(PRO_IAP_TIERS) as ProIapTier[]).find((k) => PRO_IAP_TIERS[k].productId === productId);
  return found ?? null;
}

/**
 * Lo que un negocio puede usar gratis: escaparate básico. Su ficha pública
 * (Ajustes), responder a las peticiones que le llegan (Hoy), validar la
 * Franky Card y la guía. Todo lo demás es Pro.
 */
export const PRO_FREE_SECTIONS: ProSectionId[] = ["hoy", "ajustes", "guia", "validar"];

export function isFreeSection(section: ProSectionId): boolean {
  return PRO_FREE_SECTIONS.includes(section);
}

/** Lo que gana cada motor al pasar a Pro, en frases cortas para el paywall. */
export const PRO_ENGINE_GAINS: Record<ProEngine, string[]> = {
  agenda: [
    "Agenda completa por profesional con huecos libres y reservas online",
    "Fichas de clientes con historial, notas técnicas y quién vuelve",
    "Huecos de última hora ofrecidos a estudiantes cercanos en un toque",
    "Caja del día, propinas, comisiones y cierre",
    "Equipo, turnos y permisos",
  ],
  tables: [
    "Libro de reservas por turnos y lista de espera",
    "Plano de sala en directo con mesas libres y por limpiar",
    "Carta con alérgenos, menú del día y QR",
    "Ofertas relámpago para llenar las horas flojas",
    "Grupos, celebraciones y clientes habituales",
  ],
  night: [
    "Eventos con entradas por tramos y aforo",
    "RRPP con enlaces propios, listas y comisiones",
    "Puerta con escáner y aforo en directo",
    "Reservados con consumo mínimo",
    "Lanzamiento de cada noche a estudiantes",
  ],
  classes: [
    "Horario de clases con plazas y lista de espera",
    "Socios, cuotas y bonos",
    "Clases de prueba para estudiantes",
    "Asistencia y ocupación de cada clase",
    "Equipo y monitores",
  ],
  courts: [
    "Calendario por pista y franja",
    "Partidos abiertos para completar jugadores",
    "Bonos, socios y precios valle para estudiantes",
    "Horas libres ofrecidas a estudiantes",
    "Ocupación y cobros del día",
  ],
  housing: [
    "Interesados verificados fase a fase",
    "Cartera de pisos y habitaciones con disponibilidad",
    "Agenda de visitas presenciales y por vídeo",
    "Inquilinos, contratos, cobros e incidencias",
    "Pisos destacados para estudiantes de tu zona",
  ],
  community: [
    "Actividades con inscripciones y check-in",
    "Miembros, cuotas y roles",
    "Avisos a socios y seguidores",
    "Patrocinios y subvenciones con justificación",
    "Junta y traspaso de cada curso",
  ],
  university: [],
};
