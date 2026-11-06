/**
 * Datos de operación del motor de noche (pub y discoteca) que no son eventos
 * ni asistentes: caja, barra, proveedores, turnos, incidencias y vetados.
 *
 * Viven en `ProData.nightOps`, que es opcional: un espacio que no los tenga
 * (datos guardados antes de esta versión o un negocio real sin estas tablas)
 * se lee con `nightOpsOf()`, que devuelve listas vacías. Importes en céntimos.
 */

/** Una línea del consumo de un reservado: botella, cubo o ronda apuntada en barra. */
export type ProZoneTabLine = {
  id: string;
  /** Producto de la carta, si viene de ella. */
  itemId?: string;
  name: string;
  priceCents: number;
  qty: number;
  at: string;
  by?: string;
};

/** La cuenta de un reservado al cerrarla: lo consumido frente al mínimo y la señal. */
export type ProZoneBill = {
  id: string;
  zoneId: string;
  zoneName: string;
  eventId?: string;
  bookedBy: string;
  people: number;
  minimumCents: number;
  consumedCents: number;
  depositCents: number;
  /** Lo que queda por cobrar en el TPV: el mayor entre consumo y mínimo, menos la señal. */
  dueCents: number;
  closedAt: string;
  by: string;
};

export type ProNightCostKind = "dj" | "security" | "staff" | "ads" | "other";

/** Un coste de la noche (caché del DJ, seguridad, extras, publicidad). */
export type ProNightCost = {
  id: string;
  kind: ProNightCostKind;
  label: string;
  cents: number;
};

/** Límites de un RRPP: cuántos puede apuntar por noche y hasta qué hora. */
export type ProPromoterCap = {
  maxPerNight: number | null;
  /** Minutos desde medianoche; si es menor que la apertura, es de madrugada. */
  cutoffMinute?: number | null;
  /** Personas que se espera que traiga cada noche (apuntadas o con entrada). */
  targetPerNight?: number | null;
};

/** Datos de Crush Live medidos en la noche (quién juega y cuántos matches). */
export type ProCrushTotals = {
  players: number;
  matches: number;
};

export type ProPayMethod = "cash" | "card";

/** Entrada vendida en la puerta, con su forma de pago para cuadrar la caja. */
export type ProDoorSale = {
  id: string;
  eventId: string;
  at: string;
  cents: number;
  method: ProPayMethod;
  tierName: string;
  guestName?: string;
  /** Venía en lista pero llegó después de la hora de corte. */
  afterCutoff?: boolean;
};

/** Una pulsación de Entra o Sale en puerta (personas sin entrada ni lista). */
export type ProDoorMove = {
  id: string;
  eventId: string;
  at: string;
  delta: 1 | -1;
};

/** Cierre de caja de una noche, firmado por quien lo hace. */
export type ProNightClose = {
  id: string;
  /** Fecha de la noche (YYYY-MM-DD), aunque se cierre de madrugada. */
  night: string;
  eventId?: string;
  closedBy: string;
  closedAt: string;
  /** Fondo de caja con el que se abrió. */
  floatCents: number;
  /** Ventas de barra en efectivo según el ticket Z del TPV. */
  tpvCashCents: number;
  /** Ventas de barra con tarjeta según el ticket Z del TPV. */
  tpvCardCents: number;
  /** Efectivo contado en el cajón al cerrar, fondo incluido. */
  cashCountedCents: number;
  /** Total del cierre del datáfono. */
  cardCountedCents: number;
  /** Copas invitadas (equipo, DJ, clientes habituales). */
  invitations: number;
  invitationsCents: number;
  note?: string;
};

export type ProStockUnit = "botella" | "barril" | "caja" | "unidad";

/** Un producto de la barra que se cuenta: una botella, un barril, una caja. */
export type ProStockItem = {
  id: string;
  name: string;
  /** Estantería o nevera donde está, para contar en orden. */
  shelf: string;
  unit: ProStockUnit;
  /** Por debajo de este nivel hay que pedir. */
  par: number;
  /** Nivel al que se quiere volver con el pedido. */
  target: number;
  /** El proveedor lo sirve de tantas en tantas (caja de 6 botellas = 6). */
  packSize: number;
  supplierId: string;
  costCents: number;
};

/** Un recuento de la barra: cuánto había de cada producto a esa hora. */
export type ProStockCount = {
  id: string;
  at: string;
  by: string;
  night: string;
  counts: Record<string, number>;
};

export type ProSupplier = {
  id: string;
  name: string;
  /** Persona con la que se habla. */
  contact: string;
  phone: string;
  /** Qué sirve, en pocas palabras. */
  supplies: string;
};

export type ProSupplierOrder = {
  id: string;
  supplierId: string;
  at: string;
  lines: { itemId: string; qty: number }[];
  status: "sent" | "received";
  receivedAt?: string;
};

export type ProRotaRole =
  | "barra"
  | "puerta"
  | "taquilla"
  | "karaoke"
  | "cabina"
  | "guardarropa"
  | "encargado";

/** Turno planificado de una noche (el fichaje real va aparte, en Equipo). */
export type ProPlannedShift = {
  id: string;
  staffId: string;
  night: string;
  role: ProRotaRole;
  fromMinute: number;
  /** Si es menor o igual que `fromMinute`, acaba de madrugada. */
  toMinute: number;
};

export type ProIncidentKind =
  | "pelea"
  | "expulsion"
  | "sanitaria"
  | "objeto"
  | "vecinos"
  | "policia"
  | "reclamacion"
  | "otro";

export type ProNightIncident = {
  id: string;
  night: string;
  eventId?: string;
  at: string;
  kind: ProIncidentKind;
  description: string;
  by: string;
};

/** Persona con el acceso denegado por el derecho de admisión del local. */
export type ProBan = {
  id: string;
  name: string;
  /** Condición de acceso del local en la que encaja el veto, si se eligió una. */
  condition?: string;
  reason: string;
  since: string;
  /** Fecha (YYYY-MM-DD) hasta la que dura, o null si no tiene fin. */
  until: string | null;
  by: string;
};

/** Petición de opinión mandada al día siguiente a un cliente que vino esa noche. */
export type ProReviewAsk = {
  id: string;
  clientId: string;
  /** Fecha de la noche (YYYY-MM-DD). */
  night: string;
  eventId?: string;
  at: string;
};

/** Una canción en la cola del karaoke de una noche. */
export type ProKaraokeSong = {
  id: string;
  eventId: string;
  /** Quién canta (una persona o un grupo). */
  singer: string;
  song: string;
  at: string;
  status: "waiting" | "singing" | "done";
};

export type ProNightSettings = {
  /** Regla del dueño para la previsión: una persona en barra por cada N clientes. */
  peoplePerBartender: number;
  /** Copas que puede invitar cada persona del equipo por noche; null o ausente, sin cupo. */
  invitesPerPerson?: number | null;
  /** Condiciones de acceso del local, las que tiene expuestas en la puerta. */
  accessConditions?: string[];
  /** Número de habilitación de controlador de acceso por persona del equipo (id). */
  doorLicenses?: Record<string, string>;
  /** Si el local necesita un controlador habilitado en puerta cada noche. */
  licenseRequired?: boolean;
};

export type ProInviteReason =
  | "equipo"
  | "dj"
  | "habitual"
  | "cumple"
  | "compensacion"
  | "promo"
  | "otro";

/** Una invitación de la barra con nombre: quién invita, a quién, por qué y cuánto vale. */
export type ProInvite = {
  id: string;
  /** Fecha de la noche (YYYY-MM-DD). */
  night: string;
  eventId?: string;
  at: string;
  /** Quién invita (nombre de la persona del equipo). */
  by: string;
  /** A quién se invita: un nombre, "Mesa 4" o "DJ". */
  to: string;
  reason: ProInviteReason;
  drinks: number;
  /** Valor de carta de lo invitado. */
  cents: number;
  /** Producto de la carta, si viene de ella. */
  itemName?: string;
};

/** Un reservado que no se presentó: sirve para pedir señal la próxima vez. */
export type ProZoneNoShow = {
  id: string;
  night: string;
  eventId?: string;
  zoneName: string;
  bookedBy: string;
  phone?: string;
  people?: number;
  /** Señal que se quedó el local (0 si no había). */
  depositKeptCents: number;
  at: string;
};

export type ProNightOps = {
  zoneBills: ProZoneBill[];
  doorSales: ProDoorSale[];
  doorMoves: ProDoorMove[];
  closes: ProNightClose[];
  stockItems: ProStockItem[];
  stockCounts: ProStockCount[];
  suppliers: ProSupplier[];
  orders: ProSupplierOrder[];
  rota: ProPlannedShift[];
  incidents: ProNightIncident[];
  bans: ProBan[];
  /** Opcional: los datos guardados antes de esta versión no la traen. */
  reviewAsks?: ProReviewAsk[];
  /** Opcional por la misma razón: cola del karaoke de cada noche. */
  karaoke?: ProKaraokeSong[];
  /** Opcional: invitaciones con nombre y motivo. */
  invites?: ProInvite[];
  /** Opcional: reservados que no se presentaron. */
  noShows?: ProZoneNoShow[];
  settings: ProNightSettings;
};
