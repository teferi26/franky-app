import type { Allergen, ProDailyMenu } from "./types";

/**
 * Operación diaria de cafeterías, bares y restaurantes (motor de mesas).
 *
 * Todo lo que un hostelero apunta hoy en papel o en cinco aplicaciones
 * distintas: bonos, pedidos para recoger, APPCC, desperdicio, compras,
 * escandallos, cuadrante, cierre de caja, partidos y grupos con menú cerrado.
 *
 * Importes en céntimos, fechas ISO y minutos desde medianoche en hora de
 * Madrid, igual que el resto de Franky Pro. Vive en `ProData.tablesOps`: si no
 * existe (espacio real todavía sin estas tablas), las pantallas se ocultan.
 */

/* ---------- Sitio para estudiar (cafetería) ---------- */

export type ProStudyRule = "none" | "one" | "every2h";

export type ProStudySettings = {
  enabled: boolean;
  seats: number;
  plugs: number;
  wifi: boolean;
  fromMinute: number;
  toMinute: number;
  /** Consumición mínima: ninguna, una al llegar o una cada dos horas. */
  rule: ProStudyRule;
  /** Días sin portátiles (0 = lunes). */
  noLaptopDays: number[];
  /** Contador de barra: personas estudiando ahora mismo. */
  occupied: number;
  occupiedAt?: string;
};

/* ---------- Bonos prepago ---------- */

export type ProBonoTemplate = {
  id: string;
  name: string;
  /** Qué se descuenta en cada uso ("Café con leche"). */
  itemName: string;
  uses: number;
  priceCents: number;
  /** Lo que costaría sin bono, para enseñar el ahorro. */
  regularCents: number;
  active: boolean;
};

export type ProBono = {
  id: string;
  templateId: string;
  clientName: string;
  clientId?: string;
  phone?: string;
  soldAt: string;
  paidCents: number;
  uses: number;
  /** Cada consumo descontado, en orden. Los usos gastados son su longitud. */
  usedAt: string[];
  channel: "barra" | "franky";
  /**
   * Bono compartido de un grupo de estudio: quiénes pueden gastarlo. Si
   * existe, `clientName` es el nombre del grupo.
   */
  members?: string[];
  /** Quién gastó cada uso, en el mismo orden que `usedAt`. */
  usedBy?: string[];
};

/* ---------- Vitrina del día y sobras de última hora ---------- */

export type ProShowcaseItem = {
  menuItemId: string;
  /** Unidades que quedan en la vitrina ahora mismo. */
  left: number;
  /** Unidades vendidas como sobra de última hora. */
  soldLate?: number;
};

export type ProShowcase = {
  date: string;
  items: ProShowcaseItem[];
};

/* ---------- Mesa que se cae ---------- */

export type ProDroppedTable = {
  bookingId: string;
  handledAt: string;
  how: "waitlist" | "flash" | "skip";
};

/* ---------- Pedidos para recoger y encargos ---------- */

export type ProOrderStatus =
  | "new"
  | "preparing"
  | "ready"
  | "collected"
  | "cancelled";

export type ProOrderLine = { name: string; qty: number; priceCents: number };

export type ProPickupOrder = {
  id: string;
  /** Pedido de antes de clase (hoy) o encargo con fecha (tartas, bandejas). */
  kind: "pickup" | "encargo";
  clientName: string;
  clientId?: string;
  phone?: string;
  student?: boolean;
  lines: ProOrderLine[];
  pickupAt: string;
  status: ProOrderStatus;
  note?: string;
  allergens?: Allergen[];
  /** Señal cobrada en el TPV (solo encargos). */
  depositCents?: number;
  createdAt: string;
  readyAt?: string;
  remindedAt?: string;
  source: "franky" | "phone" | "walkin";
};

/* ---------- APPCC: temperaturas y limpieza ---------- */

export type ProColdUnit = {
  id: string;
  name: string;
  kind: "nevera" | "congelador" | "camara" | "vitrina";
  /** Rango correcto en grados. */
  min: number;
  max: number;
};

export type ProHaccpMoment = "apertura" | "cierre";

export type ProHaccpTask = {
  id: string;
  name: string;
  zone: string;
  moment: ProHaccpMoment | "semanal";
};

export type ProHaccpEntry = {
  id: string;
  at: string;
  date: string;
  moment: ProHaccpMoment;
  staffId?: string;
  /** Lectura de temperatura. */
  unitId?: string;
  value?: number;
  /** Tarea de limpieza hecha. */
  taskId?: string;
  ok: boolean;
  /** Acción correctora si la lectura se sale de rango. */
  action?: string;
};

/* ---------- Desperdicio alimentario ---------- */

export type ProWasteFate = "vendido" | "donado" | "aprovechado" | "tirado";

export type ProWasteEntry = {
  id: string;
  date: string;
  at: string;
  item: string;
  qty: number;
  unit: "ud" | "kg" | "raciones";
  fate: ProWasteFate;
  /** Valor de coste aproximado de lo registrado. */
  valueCents: number;
  reason?: string;
};

/* ---------- Compras, proveedores e inventario ---------- */

export type ProSupplier = {
  id: string;
  name: string;
  category: string;
  phone?: string;
  /** Días de reparto (0 = lunes). */
  deliveryDays: number[];
  /** Hasta qué hora se le puede pedir para el siguiente reparto. */
  orderBefore?: number;
};

export type ProStockItem = {
  id: string;
  name: string;
  category: string;
  supplierId: string;
  unit: string;
  min: number;
  current: number;
  /** Coste por unidad, para valorar el inventario. */
  costCents: number;
  countedAt?: string;
  previousCount?: number;
};

export type ProShoppingLine = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  supplierId: string;
  itemId?: string;
  addedAt: string;
  addedBy?: string;
};

export type ProPurchaseOrder = {
  id: string;
  supplierId: string;
  sentAt: string;
  lines: { name: string; qty: number; unit: string }[];
  received: boolean;
};

/* ---------- Escandallo ---------- */

export type ProIngredient = {
  id: string;
  name: string;
  /** Unidad de compra: el coste es por esta unidad. */
  unit: "kg" | "l" | "ud";
  costCents: number;
  previousCostCents?: number;
  updatedAt: string;
  supplierId?: string;
};

export type ProRecipeLine = { ingredientId: string; qty: number };

export type ProRecipe = {
  menuItemId: string;
  lines: ProRecipeLine[];
  /** Cómo se prepara: sirve de ficha para el camarero nuevo. */
  method?: string;
};

/* ---------- Cuadrante ---------- */

export type ProRotaShift = {
  id: string;
  staffId: string;
  date: string;
  from: number;
  to: number;
  label?: string;
};

/* ---------- Cierre de caja ---------- */

export type ProCashClosing = {
  id: string;
  date: string;
  closedAt: string;
  staffId?: string;
  cashCents: number;
  cardCents: number;
  bizumCents: number;
  /** Fondo de caja que se deja para mañana. */
  floatCents: number;
  /** Efectivo que debería haber según el TPV (opcional). */
  expectedCashCents: number | null;
  tipsCents: number;
  covers?: number;
  nextDayNote?: string;
};

/* ---------- Partidos y eventos del bar ---------- */

export type ProVenueEventBooking = {
  id: string;
  name: string;
  phone?: string;
  people: number;
  depositCents: number;
  depositPaid: boolean;
  arrived?: boolean;
};

export type ProVenueEvent = {
  id: string;
  /**
   * Partido en pantalla, otra noche especial o la previa de una fiesta
   * universitaria (el bar como punto de encuentro antes de ir).
   */
  kind: "partido" | "evento" | "previa";
  /** Solo previas: la fiesta a la que se va después. */
  party?: string;
  title: string;
  start: string;
  end: string;
  capacity: number;
  minimumSpendCents: number;
  menu?: string;
  published: boolean;
  bookings: ProVenueEventBooking[];
};

/* ---------- Grupos con menú cerrado ---------- */

export type ProGroupMenuCourse = { label: string; options: string[] };

export type ProGroupMenu = {
  id: string;
  name: string;
  /** Previa, cena de clase, cumpleaños, partido, graduación. */
  occasion: string;
  priceCents: number;
  courses: ProGroupMenuCourse[];
  includes: string;
  minPeople: number;
  depositPct: number;
};

export type ProGroupStage = "quoted" | "deposit" | "closed" | "served";

export type ProGroupChoice = {
  id: string;
  name: string;
  /** Plato elegido de cada curso, en el mismo orden que el menú. */
  dishes: string[];
  allergies?: string;
};

export type ProGroupDeal = {
  requestId: string;
  menuId?: string;
  perPersonCents: number;
  depositCents: number;
  depositPaidAt?: string;
  depositMethod?: "bizum" | "efectivo" | "transferencia";
  /** Fecha para cerrar el número de personas. */
  closeBy?: string;
  finalPeople?: number;
  minimumSpendCents?: number;
  stage: ProGroupStage;
  sentAt?: string;
  choices: ProGroupChoice[];
};

/* ---------- Confirmaciones y reseñas por WhatsApp ---------- */

export type ProBookingContact = {
  bookingId: string;
  remindedAt?: string;
  confirmedAt?: string;
  reviewAskedAt?: string;
};

/* ---------- Todo junto ---------- */

export type ProTablesOps = {
  study?: ProStudySettings;
  bonoTemplates: ProBonoTemplate[];
  bonos: ProBono[];
  orders: ProPickupOrder[];
  /** Desde qué hora se ofrecen las sobras del día (cafetería). */
  leftoversFrom?: number;
  coldUnits: ProColdUnit[];
  haccpTasks: ProHaccpTask[];
  haccpLog: ProHaccpEntry[];
  waste: ProWasteEntry[];
  suppliers: ProSupplier[];
  stock: ProStockItem[];
  shopping: ProShoppingLine[];
  purchaseOrders: ProPurchaseOrder[];
  ingredients: ProIngredient[];
  recipes: ProRecipe[];
  /** Coste de materia prima objetivo sobre el precio sin IVA (%). */
  targetFoodCostPct: number;
  rota: ProRotaShift[];
  closings: ProCashClosing[];
  events: ProVenueEvent[];
  groupMenus: ProGroupMenu[];
  groupDeals: ProGroupDeal[];
  contacts: ProBookingContact[];
  /** Lo de siempre de cada habitual, apuntado a mano. */
  usuals: { clientName: string; order: string }[];
  /** Enlace para pedir reseña (Google u otro). */
  reviewLink?: string;
  /** Lo que hay hoy en la vitrina (tartas, bollería, bocadillos). */
  showcase?: ProShowcase;
  /** Menús del día anteriores, para no escribirlos desde cero. */
  dailyMenuHistory?: ProDailyMenu[];
  /** Mesas caídas (no vino o cancelada) que ya se han intentado llenar. */
  dropped?: ProDroppedTable[];
  /** Teléfono del dueño para mandarle el resumen del cierre. */
  ownerPhone?: string;
  /**
   * Pedidos para recoger que la barra saca cada 10 minutos. Sin valor, no
   * hay límite: llena una franja, se propone la siguiente libre.
   */
  pickupCapacity?: number;
  /** Coste aproximado de cada plato del menú del día (escandallo rápido). */
  dailyMenuCosts?: ProDailyDishCost[];
  /** Coste de lo que incluye el menú aparte de los platos (pan, bebida, café). */
  dailyMenuExtrasCents?: number;
};

/** Coste por ración de un plato del menú del día, apuntado a mano. */
export type ProDailyDishCost = { dish: string; costCents: number };
