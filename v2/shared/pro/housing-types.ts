/**
 * Datos de operación del motor de vivienda (inmobiliaria y propietario) que
 * van más allá del embudo de interesados: cobros mes a mes, documentación,
 * salidas con liquidación de fianza, suministros, gastos, llaves, proveedores
 * y propietarios de la cartera.
 *
 * Todo es opcional en los tipos de siempre (`ProTenant.payments`,
 * `ProProperty.compliance`...) y en `ProData.housingOps`: un espacio guardado
 * antes de esta versión, o un negocio real sin estas tablas, se lee con
 * `housingOpsOf()` y con listas vacías. Importes en céntimos, fechas en ISO.
 */

/** Letra del certificado de eficiencia energética. */
export type ProEnergyLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";

/**
 * Comunidad autónoma del piso, con el código ISO 3166-2:ES sin el prefijo.
 * Decide dónde y en qué plazo se deposita la fianza y qué cambios de normas
 * le tocan. Si no se indica, es la Comunitat Valenciana (VC).
 */
export type ProRegion =
  | "AN"
  | "AR"
  | "AS"
  | "IB"
  | "CN"
  | "CB"
  | "CL"
  | "CM"
  | "CT"
  | "VC"
  | "EX"
  | "GA"
  | "MD"
  | "MC"
  | "NC"
  | "PV"
  | "RI"
  | "CE"
  | "ML";

/** Lo que hay que tener de cada piso antes de anunciarlo. */
export type ProPropertyCompliance = {
  /** Comunidad autónoma del piso (VC si no se indica). */
  region?: ProRegion;
  /** Número de registro único de arrendamientos (temporada y habitaciones). */
  nrua?: string;
  energyLetter?: ProEnergyLetter;
  /** El certificado energético caduca a los 10 años de emitirse. */
  energyExpiresAt?: string;
  cadastralRef?: string;
  /** Cuándo renueva el seguro del piso. */
  insuranceRenewsAt?: string;
  /** Cuándo se paga el IBI. */
  ibiDueAt?: string;
};

/** Una mensualidad de un inquilino. El mes en curso manda `ProTenant.rentStatus`. */
export type ProRentPayment = {
  /** Mes al que corresponde, en formato "2026-09". */
  month: string;
  status: "paid" | "pending" | "late";
  amountCents: number;
  paidAt?: string;
  method?: "transfer" | "franky" | "cash";
};

export type ProTenantDocKind = "id" | "enrolment" | "guarantor" | "insurance";

export type ProTenantDocState = {
  status: "missing" | "requested" | "received";
  at?: string;
};

/** Papeles del inquilino. Solo los ve el equipo. */
export type ProTenantDocs = {
  items: Partial<Record<ProTenantDocKind, ProTenantDocState>>;
  guarantor?: { name: string; phone?: string; relation?: string };
};

export type ProInventoryState = "good" | "worn" | "damaged" | "missing";

/** Una línea del inventario de la habitación: cómo estaba al entrar y al salir. */
export type ProInventoryItem = {
  id: string;
  label: string;
  in: ProInventoryState;
  out?: ProInventoryState;
  /** Foto de ese elemento al entrar y al salir, reducida a JPEG (data URL o URL de Storage). */
  inPhoto?: string;
  outPhoto?: string;
};

export type ProInventory = {
  items: ProInventoryItem[];
  /** Fotos hechas al entrar y al salir. */
  inPhotos: number;
  outPhotos?: number;
  checkedInAt?: string;
};

export type ProMoveOutDeduction = { id: string; label: string; amountCents: number };

/** La salida de un inquilino y la liquidación de su fianza. */
export type ProMoveOut = {
  date: string;
  checks: { keys: boolean; photos: boolean; meters: boolean; room: boolean };
  deductions: ProMoveOutDeduction[];
  /** Lo que se devuelve, calculado al cerrar la salida. */
  returnCents?: number;
  closedAt?: string;
  note?: string;
  /** Cuándo se le pidió su opinión del piso al cerrar la salida. */
  reviewAskedAt?: string;
};

/** Oferta de renovación para el curso siguiente. */
export type ProRenewal = {
  sentAt: string;
  newRentCents: number;
  answer?: "yes" | "no";
  answeredAt?: string;
};

export type ProProviderTrade =
  | "fontaneria"
  | "electricidad"
  | "cerrajeria"
  | "calderas"
  | "limpieza"
  | "electrodomesticos"
  | "otros";

/** Técnico o empresa de confianza para las incidencias. */
export type ProHousingProvider = {
  id: string;
  name: string;
  trade: ProProviderTrade;
  phone: string;
  note?: string;
};

export type ProExpenseCategory =
  | "ibi"
  | "comunidad"
  | "seguro"
  | "reparacion"
  | "muebles"
  | "suministros"
  | "limpieza"
  | "otros";

/** Un gasto de un piso: lo que resta de la renta. */
export type ProHousingExpense = {
  id: string;
  propertyId: string;
  date: string;
  category: ProExpenseCategory;
  concept: string;
  amountCents: number;
  incidentId?: string;
  providerId?: string;
};

export type ProUtilityKind = "luz" | "agua" | "gas" | "internet";

/** Una factura de suministros de un piso, para repartir entre quienes viven. */
export type ProUtilityBill = {
  id: string;
  propertyId: string;
  kind: ProUtilityKind;
  from: string;
  to: string;
  amountCents: number;
  /** Por días de estancia de cada uno o a partes iguales. */
  split: "days" | "equal";
};

/** Un juego de llaves y quién lo tiene. */
export type ProKeySet = {
  id: string;
  propertyId: string;
  label: string;
  /** Inquilino que lo tiene; si no hay, está en la oficina o con quien diga `holder`. */
  tenantId?: string;
  holder: string;
  since: string;
};

/** Propietario de pisos que gestiona la inmobiliaria. */
export type ProPropertyOwner = {
  id: string;
  name: string;
  phone?: string;
  /** Honorarios de gestión sobre la renta cobrada, en tanto por uno. */
  feePct: number;
  /** Meses ya liquidados ("2026-09"). */
  settled?: string[];
};

/** Lo que el motor de vivienda guarda fuera de pisos, interesados e inquilinos. */
export type ProHousingOps = {
  providers: ProHousingProvider[];
  expenses: ProHousingExpense[];
  utilities: ProUtilityBill[];
  keys: ProKeySet[];
  owners: ProPropertyOwner[];
  /** Avisos de cambios de normas que el equipo ya ha leído (id del aviso). */
  lawSeen?: string[];
  /** Cuándo se compartió por primera vez la ficha de cada piso (por id de piso). */
  sharedAt?: Record<string, string>;
};
