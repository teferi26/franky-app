import type {
  ProBooking,
  ProClient,
  ProClientSource,
  ProData,
  ProDailyMenu,
  ProGroupRequest,
  ProLoyalty,
  ProMenuItem,
  ProOffer,
  ProStaff,
  ProTable,
  ProValidation,
  ProVerticalId,
} from "../types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import { TURNS, TURN_ORDER, stayMinutes } from "../tables";
import { buildTablesOps, staffForRota } from "./tables-ops";
import {
  clockIn,
  emptyData,
  inbox,
  makeCampaigns,
  makeClients,
  makeHistory,
  makeReviews,
  makeShifts,
  makeSpace,
  personName,
  rng,
  seedFor,
  UNIVERSITIES,
  type InboxSeed,
  type Rng,
  type SpaceSeed,
} from "./common";

/**
 * Demo del motor de mesas. Tres negocios distintos:
 * - cafe: Café Hilo (San Vicente, a 4 min de la UA). Sin reservas: Card, sellos y sitio para estudiar.
 * - bar: La Tasca del Campus (San Vicente). Reservas de mesa y de grupo, tapas y fidelidad.
 * - restaurant: Casa Marea (Playa de San Juan). Turnos, plano de sala, espera y grupos grandes.
 */

type Seed = {
  space: SpaceSeed;
  staff: Omit<ProStaff, "clockedInAt" | "weekMinutes">[];
  tables: ProTable[];
  menu: ProMenuItem[];
  daily: Omit<ProDailyMenu, "date">;
  loyalty: Omit<ProLoyalty, "stampsToday"> | null;
  reviews: string[];
  /** Reservas de mesa por turno (0 = no reserva). */
  fill: number;
  /** Gasto medio por persona en una reserva. */
  coverCents: number;
  validationsPerDay: [number, number];
  ticketRange: [number, number];
  history: [number, number, number];
};

const t = (
  id: string,
  name: string,
  seats: number,
  zone: string,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: ProTable["shape"] = "square",
): ProTable => ({ id, name, seats, zone, x, y, w, h, shape });

let itemN = 0;
const m = (
  section: string,
  name: string,
  priceCents: number,
  allergens: ProMenuItem["allergens"],
  extra: Partial<Pick<ProMenuItem, "description" | "studentFavorite" | "vegetarian" | "available">> = {},
): ProMenuItem => ({ id: `mi${++itemN}`, section, name, priceCents, allergens, available: extra.available ?? true, ...extra });

/* ------------------------------------------------------------------ */
/* Café Hilo                                                           */
/* ------------------------------------------------------------------ */

function cafeSeed(): Seed {
  itemN = 0;
  return {
    space: {
      name: "Café Hilo",
      city: "San Vicente del Raspeig",
      address: "Calle Ancha 12",
      slug: "cafe-hilo",
      owner: { name: "Nuria Esteve", firstName: "Nuria" },
      hours: [
        { open: 7 * 60 + 30, close: 20 * 60 + 30 },
        { open: 7 * 60 + 30, close: 20 * 60 + 30 },
        { open: 7 * 60 + 30, close: 20 * 60 + 30 },
        { open: 7 * 60 + 30, close: 20 * 60 + 30 },
        { open: 7 * 60 + 30, close: 20 * 60 + 30 },
        { open: 9 * 60, close: 14 * 60 },
        { open: 9 * 60, close: 14 * 60 },
      ],
      campus: "Universidad de Alicante",
      walkMinutesToCampus: 4,
      rating: 4.8,
      reviewsCount: 326,
      publicProfile: {
        description: "Café de especialidad a cuatro minutos del campus. Enchufes en todas las mesas, wifi rápido y tostadas de pan de masa madre.",
        photos: 11,
        bookingEnabled: false,
        cardEnabled: true,
        cardDiscountPct: 10,
      },
    },
    staff: [
      { id: "s1", name: "Nuria Esteve", role: "owner", tone: "amber", title: "Dueña y barista", commissionPct: 0, phone: "600 000 000" },
      { id: "s2", name: "Joel Pastor", role: "staff", tone: "sky", title: "Barista", commissionPct: 0 },
      { id: "s3", name: "Aitana Mora", role: "staff", tone: "emerald", title: "Barra y cocina", commissionPct: 0 },
    ],
    tables: [
      t("c1", "1", 2, "Sala", 0, 0, 2, 2, "round"),
      t("c2", "2", 2, "Sala", 3, 0, 2, 2, "round"),
      t("c3", "3", 4, "Sala", 6, 0, 2, 2),
      t("c4", "4", 2, "Sala", 9, 0, 2, 2, "round"),
      t("c5", "Barra", 6, "Sala", 0, 5, 7, 1, "bar"),
      t("e1", "Estudio 1", 4, "Zona estudio", 0, 0, 3, 2),
      t("e2", "Estudio 2", 4, "Zona estudio", 4, 0, 3, 2),
      t("e3", "Estudio 3", 4, "Zona estudio", 8, 0, 3, 2),
      t("e4", "Mesa larga", 8, "Zona estudio", 1, 4, 9, 2),
      t("te1", "T1", 2, "Terraza", 0, 0, 2, 2, "round"),
      t("te2", "T2", 4, "Terraza", 4, 0, 2, 2),
      t("te3", "T3", 2, "Terraza", 8, 0, 2, 2, "round"),
    ],
    menu: [
      m("Cafés", "Café solo", 130, [], { vegetarian: true }),
      m("Cafés", "Café con leche", 160, ["lacteos"], { studentFavorite: true, vegetarian: true }),
      m("Cafés", "Cortado con bebida de avena", 170, ["gluten"], { description: "Avena no certificada sin gluten.", vegetarian: true }),
      m("Cafés", "Flat white", 240, ["lacteos"], { vegetarian: true }),
      m("Cafés", "Chai latte", 280, ["lacteos"], { vegetarian: true }),
      m("Cafés", "Café bombón", 180, ["lacteos"], { vegetarian: true }),
      m("Desayunos", "Tostada con tomate y aceite", 220, ["gluten"], { description: "Pan de masa madre de la panadería de la esquina.", studentFavorite: true, vegetarian: true }),
      m("Desayunos", "Tostada de aguacate y sésamo", 390, ["gluten", "sesamo"], { vegetarian: true }),
      m("Desayunos", "Croissant de mantequilla", 180, ["gluten", "huevo", "lacteos"], { vegetarian: true }),
      m("Desayunos", "Bowl de yogur con granola", 420, ["lacteos", "gluten", "frutos_cascara"], { vegetarian: true }),
      m("Desayunos", "Bocadillo de tortilla", 380, ["gluten", "huevo"], { vegetarian: true }),
      m("Desayunos", "Sándwich mixto", 350, ["gluten", "lacteos", "mostaza"]),
      m("Dulces", "Tarta de zanahoria", 350, ["gluten", "huevo", "lacteos", "frutos_cascara"], { vegetarian: true }),
      m("Dulces", "Cookie de crema de cacahuete", 250, ["cacahuete", "gluten", "huevo", "lacteos", "soja"], { studentFavorite: true, vegetarian: true }),
      m("Dulces", "Bizcocho de limón sin gluten", 280, ["huevo", "lacteos"], { vegetarian: true, available: false }),
      m("Bebidas", "Zumo de naranja natural", 290, [], { vegetarian: true }),
      m("Bebidas", "Agua mineral", 120, [], { vegetarian: true }),
    ],
    daily: {
      priceCents: 990,
      studentPriceCents: 850,
      starters: ["Crema de calabaza", "Ensalada de pasta con atún", "Hummus con crudités"],
      mains: ["Pollo al curry con arroz basmati", "Lasaña de verduras", "Bocadillo de calamares con alioli"],
      desserts: ["Yogur con miel", "Fruta de temporada"],
      includes: "Pan, bebida y postre o café",
      published: false,
    },
    loyalty: { stampsNeeded: 10, reward: "El 10.º café gratis", activeCards: 214, rewardsThisMonth: 23 },
    reviews: [
      "Mi sitio fijo para estudiar. Enchufes en todas las mesas y te dejan estar horas con un café.",
      "El café con leche con el descuento de la Franky Card sale a precio de cafetería de la uni, pero mil veces mejor.",
      "Las tostadas de masa madre son lo mejor de San Vicente. Nuria es un amor.",
      "En exámenes se llena, pero siempre encuentras hueco en la mesa larga.",
      "Llevo tres tarjetas de sellos completas este curso. El menú del mediodía está muy bien de precio.",
      "Wifi rápido y música bajita. A veces tardan un poco en hora punta.",
    ],
    fill: 0,
    coverCents: 0,
    validationsPerDay: [48, 60],
    ticketRange: [160, 990],
    history: [880, 0.31, 520],
  };
}

/* ------------------------------------------------------------------ */
/* La Tasca del Campus                                                 */
/* ------------------------------------------------------------------ */

function barSeed(): Seed {
  itemN = 0;
  return {
    space: {
      name: "La Tasca del Campus",
      city: "San Vicente del Raspeig",
      address: "Calle Pérez Galdós 27",
      slug: "tasca-del-campus",
      owner: { name: "Paco Serrano", firstName: "Paco" },
      hours: [
        { open: 12 * 60, close: 24 * 60 },
        { open: 12 * 60, close: 24 * 60 },
        { open: 12 * 60, close: 24 * 60 },
        { open: 12 * 60, close: 24 * 60 },
        { open: 12 * 60, close: 24 * 60 },
        { open: 12 * 60, close: 24 * 60 },
        { open: 12 * 60, close: 17 * 60 },
      ],
      campus: "Universidad de Alicante",
      walkMinutesToCampus: 5,
      rating: 4.6,
      reviewsCount: 488,
      publicProfile: {
        description: "El bar de tapas de toda la vida al lado del campus: bravas, montaditos, partidos en pantalla grande y mesa larga para grupos.",
        photos: 4,
        bookingEnabled: true,
        cardEnabled: true,
        cardDiscountPct: 15,
      },
    },
    staff: [
      { id: "s1", name: "Paco Serrano", role: "owner", tone: "violet", title: "Dueño y barra", commissionPct: 0, phone: "600 000 000" },
      { id: "s2", name: "Lola Ferrer", role: "manager", tone: "rose", title: "Encargada de sala", commissionPct: 0 },
      { id: "s3", name: "Unai Castelló", role: "staff", tone: "sky", title: "Camarero", commissionPct: 0 },
      { id: "s4", name: "Vera Gómez", role: "staff", tone: "teal", title: "Cocina", commissionPct: 0 },
    ],
    tables: [
      t("b1", "Barra", 8, "Barra", 0, 0, 8, 1, "bar"),
      t("b2", "Alta 1", 4, "Barra", 0, 3, 2, 2),
      t("b3", "Alta 2", 4, "Barra", 3, 3, 2, 2),
      t("b4", "Alta 3", 4, "Barra", 6, 3, 2, 2),
      t("b5", "Barril", 3, "Barra", 9, 2, 2, 2, "round"),
      t("s1", "1", 4, "Salón", 0, 0, 2, 2),
      t("s2", "2", 4, "Salón", 3, 0, 2, 2),
      t("s3", "3", 6, "Salón", 6, 0, 3, 2),
      t("s6", "6", 2, "Salón", 10, 0, 2, 2, "round"),
      t("s4", "4", 8, "Salón", 0, 4, 4, 2),
      t("s5", "Mesa larga", 12, "Salón", 5, 4, 6, 3),
      t("te1", "T1", 4, "Terraza", 0, 0, 2, 2),
      t("te2", "T2", 4, "Terraza", 3, 0, 2, 2),
      t("te3", "T3", 4, "Terraza", 6, 0, 2, 2),
      t("te4", "T4", 4, "Terraza", 9, 0, 2, 2),
    ],
    menu: [
      m("Tapas", "Patatas bravas", 550, ["huevo"], { description: "Con alioli casero y salsa brava de la casa.", studentFavorite: true, vegetarian: true }),
      m("Tapas", "Ensaladilla rusa", 600, ["huevo", "pescado"]),
      m("Tapas", "Pincho de tortilla", 320, ["huevo"], { vegetarian: true }),
      m("Tapas", "Calamares a la andaluza", 850, ["moluscos", "gluten"]),
      m("Tapas", "Boquerones en vinagre", 650, ["pescado", "sulfitos"]),
      m("Tapas", "Alitas con salsa barbacoa", 790, ["soja", "mostaza", "apio"], { studentFavorite: true }),
      m("Tapas", "Nachos con queso y guacamole", 750, ["lacteos"], { vegetarian: true }),
      m("Tapas", "Tramussos y olivas", 250, ["altramuces"], { vegetarian: true }),
      m("Montaditos", "Montadito de lomo con queso", 280, ["gluten", "lacteos"], { studentFavorite: true }),
      m("Montaditos", "Montadito de pringá", 300, ["gluten"]),
      m("Montaditos", "Montadito de salmón y queso crema", 320, ["gluten", "pescado", "lacteos"]),
      m("Montaditos", "Serranito", 450, ["gluten"], { available: false }),
      m("Para picar", "Cacahuetes fritos", 200, ["cacahuete"], { vegetarian: true }),
      m("Para picar", "Frutos secos variados", 300, ["frutos_cascara", "cacahuete"], { vegetarian: true }),
      m("Para picar", "Gambas al ajillo", 950, ["crustaceos"]),
      m("Para picar", "Pan con tomate y sésamo", 300, ["gluten", "sesamo"], { vegetarian: true }),
      m("Bebidas", "Caña", 200, ["gluten"], { studentFavorite: true }),
      m("Bebidas", "Tinto de verano", 300, ["sulfitos"]),
      m("Bebidas", "Refresco", 250, []),
    ],
    daily: {
      priceCents: 1150,
      studentPriceCents: 990,
      starters: ["Ensalada mixta", "Gazpacho", "Macarrones con tomate"],
      mains: ["Arroz al horno", "Pechuga a la plancha con patatas", "Merluza a la romana"],
      desserts: ["Flan casero", "Fruta"],
      includes: "Pan, bebida y postre o café",
      published: true,
    },
    loyalty: { stampsNeeded: 8, reward: "Una ración de bravas gratis", activeCards: 167, rewardsThisMonth: 14 },
    reviews: [
      "Hicimos la previa de la fiesta de Teleco con 20 personas y nos lo montaron perfecto en la mesa larga.",
      "Las bravas son de otro planeta y con la Franky Card te sale todo más barato.",
      "Reservé por Franky para ver el partido y nos guardaron la mesa delante de la pantalla.",
      "Menú del día a 9,90 con carnet de estudiante. Abundante y casero.",
      "Buen ambiente, camareros rápidos aunque esté a tope.",
      "Los viernes hay que reservar sí o sí. Un poco de ruido, pero es lo que buscas.",
    ],
    fill: 0.5,
    coverCents: 1400,
    validationsPerDay: [10, 16],
    ticketRange: [650, 4200],
    history: [520, 0.26, 1400],
  };
}

/* ------------------------------------------------------------------ */
/* Casa Marea                                                          */
/* ------------------------------------------------------------------ */

function restaurantSeed(): Seed {
  itemN = 0;
  return {
    space: {
      name: "Casa Marea",
      city: "Alicante",
      address: "Avenida de Niza 34, Playa de San Juan",
      slug: "casa-marea",
      owner: { name: "Elena Blasco", firstName: "Elena" },
      hours: [
        { open: 13 * 60, close: 23 * 60 + 30 },
        { open: 13 * 60, close: 23 * 60 + 30 },
        { open: 13 * 60, close: 23 * 60 + 30 },
        { open: 13 * 60, close: 23 * 60 + 30 },
        { open: 13 * 60, close: 23 * 60 + 30 },
        { open: 13 * 60, close: 23 * 60 + 30 },
        { open: 13 * 60, close: 17 * 60 },
      ],
      campus: "Universidad de Alicante",
      walkMinutesToCampus: 15,
      rating: 4.7,
      reviewsCount: 1204,
      publicProfile: {
        description: "Arrocería mediterránea frente a la Playa de San Juan. Arroces al momento, pescado de la lonja de Santa Pola y reservado para grupos.",
        photos: 14,
        bookingEnabled: true,
        cardEnabled: true,
        cardDiscountPct: 10,
      },
    },
    staff: [
      { id: "s1", name: "Elena Blasco", role: "owner", tone: "violet", title: "Dueña y sala", commissionPct: 0, phone: "600 000 000" },
      { id: "s2", name: "Raúl Ortega", role: "manager", tone: "amber", title: "Jefe de cocina", commissionPct: 0 },
      { id: "s3", name: "Candela Ruiz", role: "staff", tone: "sky", title: "Camarera", commissionPct: 0 },
      { id: "s4", name: "Bruno Soler", role: "staff", tone: "emerald", title: "Camarero", commissionPct: 0 },
      { id: "s5", name: "Inés Vidal", role: "reception", tone: "rose", title: "Recepción y reservas", commissionPct: 0 },
    ],
    tables: [
      t("m1", "1", 4, "Sala", 0, 0, 2, 2),
      t("m2", "2", 4, "Sala", 3, 0, 2, 2),
      t("m3", "3", 4, "Sala", 6, 0, 2, 2),
      t("m4", "4", 2, "Sala", 9, 0, 2, 2, "round"),
      t("m5", "5", 2, "Sala", 0, 3, 2, 2, "round"),
      t("m6", "6", 6, "Sala", 3, 3, 3, 2),
      t("m7", "7", 6, "Sala", 7, 3, 3, 2),
      t("m9", "9", 2, "Sala", 10, 6, 2, 2, "round"),
      t("m10", "10", 4, "Sala", 7, 6, 2, 2),
      t("m8", "Barra", 4, "Sala", 0, 7, 5, 1, "bar"),
      t("t1", "T1", 2, "Terraza", 0, 0, 2, 2, "round"),
      t("t2", "T2", 4, "Terraza", 3, 0, 2, 2),
      t("t3", "T3", 4, "Terraza", 6, 0, 2, 2),
      t("t4", "T4", 2, "Terraza", 9, 0, 2, 2, "round"),
      t("t5", "T5", 4, "Terraza", 0, 4, 2, 2),
      t("t6", "T6", 6, "Terraza", 3, 4, 3, 2),
      t("t7", "T7", 4, "Terraza", 7, 4, 2, 2),
      t("t8", "T8", 2, "Terraza", 10, 4, 2, 2, "round"),
      t("r1", "R1", 12, "Reservado", 1, 1, 6, 3),
      t("r2", "R2", 8, "Reservado", 1, 5, 4, 2),
      t("r3", "R3", 6, "Reservado", 8, 2, 3, 3, "round"),
    ],
    menu: [
      m("Entrantes", "Tramussos y olivas de la casa", 300, ["altramuces"], { vegetarian: true }),
      m("Entrantes", "Ensalada de tomate con ventresca", 1250, ["pescado", "sulfitos"]),
      m("Entrantes", "Croquetas caseras de jamón (6)", 950, ["gluten", "huevo", "lacteos"], { studentFavorite: true }),
      m("Entrantes", "Calamares a la andaluza", 1350, ["moluscos", "gluten"]),
      m("Entrantes", "Gamba roja a la plancha", 2400, ["crustaceos"], { description: "De la lonja de Santa Pola, según mercado." }),
      m("Entrantes", "Tellinas al ajillo", 1500, ["moluscos"]),
      m("Entrantes", "Mejillones al vapor con vino blanco", 1100, ["moluscos", "sulfitos"]),
      m("Entrantes", "Hummus con crudités", 850, ["sesamo", "apio"], { vegetarian: true }),
      m("Arroces", "Arroz a banda", 1650, ["pescado", "crustaceos", "moluscos", "apio"], { description: "Precio por persona, mínimo dos.", studentFavorite: true }),
      m("Arroces", "Arroz negro con alioli", 1700, ["moluscos", "pescado", "crustaceos", "huevo"], { description: "Precio por persona, mínimo dos." }),
      m("Arroces", "Paella de verduras", 1500, ["apio"], { description: "Precio por persona, mínimo dos.", vegetarian: true }),
      m("Arroces", "Arroz con costra", 1800, ["huevo"], { description: "Receta de Elche. Precio por persona, mínimo dos." }),
      m("Arroces", "Fideuà de marisco", 1700, ["gluten", "pescado", "crustaceos", "moluscos", "huevo"]),
      m("Principales", "Lubina a la sal", 2200, ["pescado"]),
      m("Principales", "Secreto ibérico con salsa de mostaza", 1900, ["mostaza"]),
      m("Principales", "Salmón con soja y sésamo", 1900, ["pescado", "soja", "sesamo", "gluten"]),
      m("Principales", "Hamburguesa de ternera con queso", 1450, ["gluten", "lacteos", "sesamo", "mostaza"], { studentFavorite: true }),
      m("Postres", "Tarta de queso al horno", 650, ["lacteos", "huevo", "gluten"], { studentFavorite: true, vegetarian: true }),
      m("Postres", "Flan de huevo casero", 550, ["huevo", "lacteos"], { vegetarian: true }),
      m("Postres", "Helado de turrón de Jijona", 600, ["frutos_cascara", "lacteos"], { vegetarian: true }),
      m("Postres", "Brownie con cacahuete caramelizado", 650, ["cacahuete", "gluten", "huevo", "lacteos", "soja"], { vegetarian: true }),
      m("Postres", "Fruta de temporada", 450, [], { vegetarian: true }),
      m("Bebidas", "Copa de vino blanco Alicante DOP", 380, ["sulfitos"]),
      m("Bebidas", "Cerveza de barril", 300, ["gluten"]),
      m("Bebidas", "Agua de 1 litro", 280, [], { available: true }),
    ],
    daily: {
      priceCents: 1650,
      studentPriceCents: 1390,
      starters: ["Ensalada de la huerta", "Tellinas al ajillo", "Crema de marisco"],
      mains: ["Arroz del señoret", "Dorada a la espalda", "Pollo de corral al ajillo"],
      desserts: ["Flan de huevo casero", "Helado de turrón"],
      includes: "Pan, bebida y postre o café",
      published: true,
    },
    loyalty: null,
    reviews: [
      "Celebramos la graduación de Derecho en el reservado: 36 personas, menú cerrado y todo salió perfecto.",
      "El arroz a banda, de los mejores de la Playa de San Juan. Reservé por Franky en un minuto.",
      "Menú del día con precio de estudiante entre semana. Merece mucho la pena bajar desde el campus.",
      "Avisé de que soy celíaca y el camarero ya lo sabía al sentarnos. Da mucha tranquilidad.",
      "Terraza preciosa al atardecer. Servicio atento aunque estaba lleno.",
      "Tuvimos que esperar 15 minutos con reserva un sábado, pero nos invitaron a la bebida.",
    ],
    fill: 0.62,
    coverCents: 3200,
    validationsPerDay: [2, 5],
    ticketRange: [2400, 9600],
    history: [410, 0.22, 3300],
  };
}

const NOTES = [
  "Celíaca: sin gluten, por favor",
  "Alergia a los frutos secos",
  "Intolerante a la lactosa",
  "Alergia al marisco",
  "Uno es vegano",
  "Cumpleaños: traen tarta",
  "Con trona para un bebé",
  "Si puede ser, en terraza",
  "Llegan 10 minutos tarde",
];

/* ------------------------------------------------------------------ */
/* Construcción                                                        */
/* ------------------------------------------------------------------ */

export function buildTablesDemo(vertical: ProVerticalId, now: Date): ProData {
  const seed = vertical === "restaurant" ? restaurantSeed() : vertical === "bar" ? barSeed() : cafeSeed();
  const r = rng(seedFor(vertical));
  const space = makeSpace(vertical, seed.space);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const todayHours = space.hours[weekdayIndex(today)] ?? { open: 13 * 60, close: 23 * 60 };

  const staff: ProStaff[] = seed.staff.map((s, i) => ({
    ...s,
    clockedInAt: nowMin < todayHours.close ? clockIn(today, todayHours.open, i, now) : null,
    weekMinutes: 38 * 60 - i * 90,
  }));

  const clients = makeClients(r, now, vertical === "cafe" ? 90 : 72, {
    studentShare: vertical === "restaurant" ? 0.45 : 0.72,
    spendRange: vertical === "cafe" ? [300, 1600] : vertical === "bar" ? [1200, 5200] : [3000, 12000],
  }).map((c) => (c.student?.verified && r.chance(0.55) ? { ...c, cardMember: true } : c));
  // Los habituales de la cafetería vienen casi a diario.
  if (vertical === "cafe") {
    clients.slice(0, 18).forEach((c, i) => {
      if (c.student) clients[i] = { ...c, visits: 20 + r.int(0, 60), cardMember: true, student: { ...c.student, verified: true } };
    });
  }
  // Estudiantes que han llegado estas tres semanas (radar de septiembre). Sin
  // usar el generador: así el resto de la demo no cambia.
  clients
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.student)
    .slice(-12)
    .forEach(({ c, i }, k) => {
      const since = 2 + k;
      clients[i] = {
        ...c,
        createdAt: atLocal(addDays(today, -since), 10 * 60 + k * 17),
        lastVisit: atLocal(addDays(today, -Math.min(since, k % 3)), 11 * 60),
        visits: k % 3 === 0 ? 1 : 2 + (k % 4),
        cardMember: k % 2 === 0,
      };
    });

  let bookings = seed.fill > 0 ? makeBookings(r, vertical, seed, space.hours, clients, now) : makeStudySeats(r, seed.tables, now, todayHours);
  // Las mesas de los grupos quedan guardadas para ellos.
  const held = vertical === "restaurant" ? { table: "r2", date: today } : vertical === "bar" ? { table: "s5", date: addDays(today, 2) } : null;
  if (held) bookings = bookings.filter((b) => !(b.resourceId === held.table && localDate(b.start) === held.date && localMinutes(b.start) >= 17 * 60));
  // El reservado grande queda para la comida de grupo de hoy (rg3).
  if (vertical === "restaurant") {
    bookings = bookings.filter((b) => {
      const minute = localMinutes(b.start);
      return !(b.resourceId === "r1" && localDate(b.start) === today && minute >= 13 * 60 && minute < 17 * 60);
    });
  }
  const validations = makeValidations(r, seed, clients, staff, now, space.hours, space.publicProfile.cardDiscountPct);
  const loyalty: ProLoyalty | null = seed.loyalty
    ? { ...seed.loyalty, stampsToday: validations.filter((v) => localDate(v.at) === today && v.kind !== "reward").length }
    : null;

  const { offers, groupRequests, inboxItems, campaigns } = extras(vertical, now, today, nowMin, bookings);
  if (vertical === "restaurant") bookings.push(...restaurantGroupBookings(now, today, clients));
  if (vertical === "bar") bookings.push(...barGroupBookings(now, today));

  // Cumpleaños de dos habituales de la cafetería: hoy y dentro de dos días.
  if (vertical === "cafe") {
    const regular = clients.filter((c) => c.cardMember);
    [0, 2].forEach((inDays, i) => {
      const target = regular[3 + i * 2];
      if (!target) return;
      const index = clients.indexOf(target);
      clients[index] = { ...target, birthday: `2005-${addDays(today, inDays).slice(5)}`, marketingConsent: true };
    });
  }

  // Operación diaria: APPCC, compras, escandallo, cuadrante, cierre, grupos.
  const studyTables = seed.tables.filter((tb) => tb.zone === "Zona estudio").map((tb) => tb.id);
  const tablesOps = buildTablesOps({
    vertical,
    now,
    hours: space.hours,
    staff,
    clients,
    menu: seed.menu,
    bookings,
    groupRequests,
    studyOccupied: bookings
      .filter((b) => b.status === "arrived" && localDate(b.start) === today && studyTables.includes(b.resourceId ?? ""))
      .reduce((a, b) => a + b.partySize, 0),
  });
  const rostered = staffForRota(staff, tablesOps.rota, now);

  const data = emptyData(space);
  return {
    ...data,
    history: makeHistory(r, now, seed.history[0], seed.history[1], seed.history[2]),
    staff: rostered,
    tablesOps,
    clients,
    bookings: bookings.sort((a, b) => a.start.localeCompare(b.start)),
    tables: seed.tables,
    menu: seed.menu,
    dailyMenu: { ...seed.daily, date: today },
    loyalty,
    validations,
    offers,
    groupRequests,
    reviews: makeReviews(r, now, seed.reviews),
    shifts: makeShifts(rostered, now, todayHours.open, Math.min(todayHours.close, 23 * 60 + 45)),
    inbox: inbox(now, inboxItems),
    campaigns,
  };
}

function makeBookings(
  r: Rng,
  vertical: ProVerticalId,
  seed: Seed,
  hours: ({ open: number; close: number } | null)[],
  clients: ProClient[],
  now: Date,
): ProBooking[] {
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const list: ProBooking[] = [];
  const reservable = seed.tables.filter((tb) => tb.shape !== "bar");
  const sources: ProClientSource[] = ["franky", "franky", "franky", "phone", "phone", "instagram", "google", "card"];
  let n = 0;
  let requested = 0;

  for (let d = -3; d <= 6; d++) {
    const date = addDays(today, d);
    const h = hours[weekdayIndex(date)];
    if (!h) continue;
    const weekend = weekdayIndex(date) >= 4;
    for (const turn of TURN_ORDER) {
      const T = TURNS[turn];
      if (T.from < h.open || T.lastSeat >= h.close) continue;
      const stay = stayMinutes(vertical, turn);
      const fill = Math.min(0.92, seed.fill * (weekend ? 1.3 : 1) * (turn === "cena" ? 1.1 : 0.85) * (d > 2 ? 0.6 : 1));
      const slots = Math.floor((T.lastSeat - T.from) / 15);
      for (const table of reservable) {
        if (!r.chance(fill)) continue;
        // Los reservados solo se llenan con grupos.
        if (table.zone === "Reservado" && !r.chance(0.35)) continue;
        let start = T.from + 15 * r.int(0, Math.max(0, slots - 3));
        const seatings = turn === "cena" && start <= T.from + 30 && r.chance(0.35) ? 2 : 1;
        for (let s = 0; s < seatings; s++) {
          if (start > T.lastSeat) break;
          const end = start + stay;
          const client = r.pick(clients);
          const source = client.student ? r.pick(sources) : r.pick(["phone", "google", "instagram", "franky"] as ProClientSource[]);
          const party = Math.max(1, table.seats - (table.seats > 2 && r.chance(0.45) ? r.int(1, Math.min(2, table.seats - 2)) : 0));
          let status: ProBooking["status"] = "confirmed";
          if (d < 0) status = r.chance(0.05) ? "no_show" : "done";
          else if (d === 0) {
            if (end <= nowMin) status = r.chance(0.05) ? "no_show" : "done";
            else if (start <= nowMin) status = "arrived";
            else if (fromFrankySource(source) && requested < 3 && r.chance(0.3)) {
              status = "requested";
              requested++;
            }
          } else if (d <= 2 && fromFrankySource(source) && requested < 4 && r.chance(0.18)) {
            status = "requested";
            requested++;
          }
          n++;
          // Las mesas que ya se fueron no duran justo lo reservado: entre 25
          // minutos menos y 10 más (hoy nunca más tarde de ahora). Sin tirar
          // del generador para no mover el resto de la demo.
          const drift = ((n * 37) % 36) - 25;
          const left = status === "done" ? end + (d < 0 ? drift : Math.min(0, drift)) : end;
          list.push({
            id: `rb${n}`,
            kind: "table",
            clientId: client.id,
            clientName: client.name,
            resourceId: table.id,
            start: atLocal(date, start),
            end: atLocal(date, left),
            partySize: party,
            status,
            priceCents: party * seed.coverCents,
            paidCents: status === "done" ? party * seed.coverCents : 0,
            source,
            note: r.chance(0.2) ? r.pick(NOTES) : undefined,
            student: Boolean(client.student?.verified),
          });
          start = end + 15;
        }
      }
    }
  }

  // Lista de espera: solo si ahora estamos en un servicio.
  for (const turn of TURN_ORDER) {
    const T = TURNS[turn];
    const h = hours[weekdayIndex(today)];
    if (!h || T.from < h.open || T.lastSeat >= h.close) continue;
    if (nowMin >= T.from - 30 && nowMin <= T.lastSeat) {
      const names = [personName(r), personName(r)];
      names.forEach((name, i) => {
        const at = new Date(now.getTime() - (i === 0 ? 14 : 4) * 60000);
        n++;
        list.push({
          id: `rw${n}`,
          kind: "table",
          clientName: name,
          start: at.toISOString(),
          end: new Date(at.getTime() + stayMinutes(vertical, turn) * 60000).toISOString(),
          partySize: i === 0 ? 2 : 4,
          status: "requested",
          priceCents: 0,
          paidCents: 0,
          source: "walkin",
          note: i === 0 ? "Esperan en la barra. Tel. 611 204 377" : "Prefieren terraza. Tel. 678 552 190",
          student: i === 0,
        });
      });
    }
  }
  return list;
}

function fromFrankySource(s: ProClientSource) {
  return s === "franky" || s === "card";
}

/** Cafetería: quién está estudiando ahora en la zona de enchufes. */
function makeStudySeats(r: Rng, tables: ProTable[], now: Date, hours: { open: number; close: number }): ProBooking[] {
  const nowMin = localMinutes(now);
  if (nowMin < hours.open + 30 || nowMin > hours.close - 20) return [];
  const today = localDate(now);
  return tables
    .filter((tb) => tb.zone === "Zona estudio")
    .map((tb, i) => {
      const since = Math.max(hours.open, nowMin - r.int(20, 160));
      return {
        id: `st${i + 1}`,
        kind: "table" as const,
        clientName: personName(r),
        resourceId: tb.id,
        start: atLocal(today, since),
        end: atLocal(today, Math.min(hours.close, since + 180)),
        partySize: Math.max(1, tb.seats - r.int(0, Math.ceil(tb.seats / 2))),
        status: "arrived" as const,
        priceCents: 0,
        paidCents: 0,
        source: "walkin" as const,
        student: true,
      };
    });
}

function makeValidations(
  r: Rng,
  seed: Seed,
  clients: ProClient[],
  staff: ProStaff[],
  now: Date,
  hours: ({ open: number; close: number } | null)[],
  pct: number,
): ProValidation[] {
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const members = clients.filter((c) => c.cardMember && c.student);
  const regulars = members.slice(0, 18);
  const out: ProValidation[] = [];
  let n = 0;
  for (let d = -13; d <= 0; d++) {
    const date = addDays(today, d);
    const h = hours[weekdayIndex(date)];
    if (!h) continue;
    const until = d === 0 ? Math.min(nowMin, h.close) : h.close;
    if (until <= h.open) continue;
    const share = (until - h.open) / (h.close - h.open);
    const count = Math.round(r.int(seed.validationsPerDay[0], seed.validationsPerDay[1]) * share * (weekdayIndex(date) >= 5 ? 0.6 : 1));
    for (let i = 0; i < count; i++) {
      const c = r.chance(0.6) && regulars.length ? r.pick(regulars) : r.pick(members.length ? members : clients);
      const minute = h.open + Math.floor(r.next() * (until - h.open));
      const amount = Math.round(r.int(seed.ticketRange[0], seed.ticketRange[1]) / 10) * 10;
      const kind: ProValidation["kind"] = seed.loyalty ? (r.chance(0.07) ? "reward" : r.chance(0.2) ? "stamp" : "discount") : "discount";
      n++;
      out.push({
        id: `v${n}`,
        at: atLocal(date, minute),
        clientName: c.name,
        university: c.student?.university,
        kind,
        amountCents: kind === "reward" ? 160 : amount,
        discountCents: kind === "reward" ? 160 : kind === "discount" ? Math.round((amount * pct) / 100) : 0,
        staffId: r.pick(staff).id,
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function restaurantGroupBookings(now: Date, today: string, clients: ProClient[]): ProBooking[] {
  const nowMin = localMinutes(now);
  const cumple = 21 * 60 + 30;
  const lunch = 14 * 60;
  return [
    {
      id: "rg1",
      kind: "table",
      clientName: "Graduación de Derecho (Álex Molina)",
      resourceId: "r1",
      start: atLocal(addDays(today, 19), 21 * 60),
      end: atLocal(addDays(today, 19), 23 * 60 + 30),
      partySize: 38,
      status: "confirmed",
      priceCents: 38 * 3200,
      paidCents: 38 * 1000,
      source: "grupo",
      note: "Menú cerrado de 32 €. Reservado completo más mesas 6 y 7. 2 celíacos y 1 vegano. Señal de 380 € pagada.",
      student: true,
    },
    {
      id: "rg2",
      kind: "table",
      clientId: clients[3]?.id,
      clientName: "Cumpleaños de Irene (Enfermería)",
      resourceId: "r2",
      start: atLocal(today, cumple),
      end: atLocal(today, cumple + 150),
      partySize: 8,
      status: nowMin >= cumple + 150 ? "done" : nowMin >= cumple ? "arrived" : "confirmed",
      priceCents: 8 * 2800,
      paidCents: 0,
      source: "grupo",
      note: "Cumpleaños: traen tarta. Una alergia a los frutos secos.",
      student: true,
    },
    {
      id: "rg3",
      kind: "table",
      clientName: "Fin de prácticas de Enfermería (Nuria Sempere)",
      resourceId: "r1",
      start: atLocal(today, lunch),
      end: atLocal(today, lunch + 120),
      partySize: 12,
      status: nowMin >= lunch + 120 ? "done" : nowMin >= lunch ? "arrived" : "confirmed",
      priceCents: 12 * 2200,
      paidCents: 12 * 500,
      source: "grupo",
      note: "Comida Erasmus de 22 €. Una celíaca y una persona sin lactosa.",
      student: true,
    },
  ];
}

function barGroupBookings(now: Date, today: string): ProBooking[] {
  void now;
  return [
    {
      id: "bg1",
      kind: "table",
      clientName: "Previa ESN Alicante (Erasmus)",
      resourceId: "s5",
      start: atLocal(addDays(today, 2), 21 * 60),
      end: atLocal(addDays(today, 2), 23 * 60),
      partySize: 22,
      status: "confirmed",
      priceCents: 22 * 1200,
      paidCents: 22 * 300,
      source: "grupo",
      note: "Menú previa de 12 €: 2 tapas y 2 bebidas. Mesa larga y altas. Dos vegetarianos.",
      student: true,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Ofertas, grupos, avisos y temporada                                 */
/* ------------------------------------------------------------------ */

function offer(o: Omit<ProOffer, "claimed" | "views" | "bookings" | "revenueCents" | "status"> & Partial<ProOffer>): ProOffer {
  return { claimed: 0, views: 0, bookings: 0, revenueCents: 0, status: "live", ...o };
}

function extras(vertical: ProVerticalId, now: Date, today: string, nowMin: number, bookings: ProBooking[]) {
  const ago = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
  const requested = bookings.find((b) => b.status === "requested" && b.kind === "table");
  const ua = UNIVERSITIES[0];
  const umh = UNIVERSITIES[1];

  if (vertical === "cafe") {
    const offers: ProOffer[] = [
      offer({ id: "o1", kind: "valley", title: "Desayuno de estudiante", detail: "Café y tostada a 2,50 € de 8:00 a 10:30", discountPct: 30, days: [0, 1, 2, 3, 4], fromMinute: 8 * 60, toMinute: 10 * 60 + 30, slots: 60, claimed: 41, audience: { studentsOnly: true, radiusKm: 2, universities: [ua] }, reach: 1240, views: 820, bookings: 212, revenueCents: 53000, createdAt: atLocal(addDays(today, -35), 9 * 60) }),
      offer({ id: "o2", kind: "card", title: "Franky Card", detail: "-10 % en toda la carta, todos los días", discountPct: 10, slots: 0, audience: { studentsOnly: false, radiusKm: 50, universities: [] }, reach: 5400, views: 2210, bookings: 590, revenueCents: 206000, createdAt: atLocal(addDays(today, -90), 9 * 60) }),
      offer({ id: "o3", kind: "flash", title: "Después de clase", detail: "Café y dulce a 3 € hoy de 17:00 a 19:00", discountPct: 35, startsAt: atLocal(today, 17 * 60), endsAt: atLocal(today, 19 * 60), slots: 20, claimed: nowMin > 17 * 60 ? 7 : 2, audience: { studentsOnly: true, radiusKm: 1, universities: [ua] }, status: nowMin < 19 * 60 ? "live" : "ended", reach: 420, views: 188, bookings: 7, revenueCents: 2100, createdAt: atLocal(today, Math.max(8 * 60, Math.min(nowMin, 16 * 60) - 60)) }),
      offer({ id: "o4", kind: "exam", title: "Sitio para estudiar", detail: "Enchufe, wifi y café rellenable a mitad de precio en exámenes", discountPct: 50, slots: 20, audience: { studentsOnly: true, radiusKm: 2, universities: [ua, umh] }, status: "scheduled", reach: 0, createdAt: atLocal(addDays(today, -3), 12 * 60) }),
    ];
    const campaigns = makeCampaigns(now, [
      { moment: "Semana de bienvenida", title: "Primer café gratis para los de primero", when: "Hecho en septiembre", status: "done", audience: "Primer curso UA", idea: "Café gratis al activar la tarjeta de sellos: 96 tarjetas nuevas." },
      { moment: "Exámenes de enero", title: "Sitio para estudiar", when: "Del 8 al 30 de enero", status: "scheduled", audience: "UA y UMH", idea: "Apareces en el mapa de sitios para estudiar con enchufes y wifi." },
      { moment: "Erasmus de febrero", title: "Welcome coffee Erasmus", when: "Febrero", status: "suggested", audience: "Erasmus recién llegados", idea: "Café y croissant a 2 € la primera semana del semestre." },
      { moment: "Exámenes de junio", title: "Maratón de estudio", when: "Junio", status: "suggested", audience: "Toda la UA", idea: "Café rellenable y abrir una hora antes." },
    ]);
    const inboxItems: InboxSeed[] = [
      { kind: "system", title: "Menú del día sin publicar", body: "Publícalo y lo verán los estudiantes de cerca antes de comer", href: "carta", minutesAgo: 25 },
      { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Mi sitio fijo para estudiar…”", href: "estudiantes", minutesAgo: 140 },
      { kind: "payment", title: "Premio canjeado", body: "Lucía completó su tarjeta de sellos", href: "validar", minutesAgo: 60 },
      { kind: "message", title: "Consulta", body: "¿Tenéis leche sin lactosa y bebida de soja?", minutesAgo: 300, read: true },
    ];
    const groupRequests: ProGroupRequest[] = [
      { id: "g1", organizer: "Lucía Pomares", organization: "Delegación de 1.º de Magisterio", kind: "Desayuno de clase", people: 24, date: atLocal(addDays(today, 4), 9 * 60 + 30), budgetPerPersonCents: 450, message: "Queremos hacer un desayuno de bienvenida con la clase antes de la primera práctica. Somos 24. ¿Nos juntáis mesas en la zona de estudio?", status: "new", createdAt: ago(5) },
      { id: "g2", organizer: "Álvaro Richart", organization: "Grupo de estudio de Derecho Civil", kind: "Merienda de estudio", people: 8, date: atLocal(addDays(today, 6), 17 * 60), budgetPerPersonCents: 400, message: "Somos 8 preparando el parcial. ¿Nos guardáis la mesa larga de 17:00 a 19:00?", status: "quoted", quoteCents: 390, createdAt: ago(28) },
    ];
    return { offers, groupRequests, inboxItems, campaigns };
  }

  if (vertical === "bar") {
    const offers: ProOffer[] = [
      offer({ id: "o1", kind: "valley", title: "Caña y tapa de estudiante", detail: "Caña y tapa a 2,50 € de lunes a jueves de 18:00 a 20:30", discountPct: 35, days: [0, 1, 2, 3], fromMinute: 18 * 60, toMinute: 20 * 60 + 30, slots: 80, claimed: 52, audience: { studentsOnly: true, radiusKm: 2, universities: [ua] }, reach: 1240, views: 930, bookings: 188, revenueCents: 47000, createdAt: atLocal(addDays(today, -30), 12 * 60) }),
      offer({ id: "o2", kind: "card", title: "Franky Card", detail: "-15 % en consumiciones, todos los días", discountPct: 15, slots: 0, audience: { studentsOnly: false, radiusKm: 50, universities: [] }, reach: 5400, views: 1810, bookings: 240, revenueCents: 184000, createdAt: atLocal(addDays(today, -80), 12 * 60) }),
      offer({ id: "o3", kind: "group", title: "Menú previa", detail: "12 € por persona: 2 tapas y 2 bebidas, desde 10 personas", discountPct: 0, slots: 6, claimed: 3, audience: { studentsOnly: true, radiusKm: 5, universities: [ua, umh] }, reach: 2100, views: 640, bookings: 3, revenueCents: 63600, createdAt: atLocal(addDays(today, -14), 12 * 60) }),
    ];
    const groupRequests: ProGroupRequest[] = [
      { id: "g1", organizer: "Marta Soler", organization: "Delegación de Económicas", kind: "Previa de la fiesta de Económicas", people: 45, date: atLocal(addDays(today, 8), 21 * 60), budgetPerPersonCents: 1000, message: "Somos unos 45 de ADE y Economía. Queremos hacer la previa antes de la fiesta de la facultad, de 21:00 a 23:30. ¿Nos guardáis la mesa larga y las altas?", status: "new", createdAt: ago(2) },
      { id: "g2", organizer: "Hugo Pérez", organization: "2.º de Enfermería UA", kind: "Cena de Navidad de clase", people: 28, date: atLocal(addDays(today, 78), 21 * 60), budgetPerPersonCents: 1500, message: "Cena de Navidad de la clase. Hay dos celíacos y una persona vegana. ¿Tenéis menú cerrado?", status: "new", createdAt: ago(20) },
      { id: "g3", organizer: "Claudia Navarro", organization: "Cumpleaños", kind: "Cumpleaños de 20 años", people: 14, date: atLocal(addDays(today, 3), 22 * 60), budgetPerPersonCents: 1200, message: "Cumple de una amiga, somos 14. Nos gustaría tapas para compartir y que pongáis una vela.", status: "quoted", quoteCents: 1200, createdAt: ago(30) },
      { id: "g4", organizer: "Inés Llorca", organization: "ESN Alicante", kind: "Previa Erasmus", people: 22, date: atLocal(addDays(today, 2), 21 * 60), budgetPerPersonCents: 1200, message: "Previa de bienvenida para los Erasmus del semestre.", status: "accepted", quoteCents: 1200, createdAt: ago(96) },
    ];
    const campaigns = makeCampaigns(now, [
      { moment: "Fiestas de facultad", title: "Previa de la fiesta de Económicas", when: "Dentro de 8 días", status: "suggested", audience: "Facultad de Económicas", idea: "Menú previa a 12 € y mesa larga guardada para la delegación." },
      { moment: "Semana de bienvenida", title: "Caña y tapa de bienvenida", when: "Hecho en septiembre", status: "done", audience: "Primer curso", idea: "Caña y tapa a 2 €: 140 estudiantes nuevos en dos semanas." },
      { moment: "Exámenes de enero", title: "Menú del día para estudiar", when: "Enero", status: "scheduled", audience: "Toda la UA", idea: "Menú de estudiante a 8,90 € y táper para llevar." },
      { moment: "Erasmus de febrero", title: "Noche Erasmus", when: "Febrero", status: "suggested", audience: "ESN Alicante", idea: "Jueves de intercambio de idiomas con tapa incluida." },
      { moment: "Graduaciones", title: "Previas de graduación", when: "Mayo y junio", status: "suggested", audience: "Último curso", idea: "Menú de grupo con reserva de la mesa larga." },
    ]);
    const inboxItems: InboxSeed[] = [
      ...(requested ? [{ kind: "booking" as const, title: "Reserva por confirmar", body: `${requested.clientName}, ${requested.partySize} personas`, href: "reservas", minutesAgo: 9 }] : []),
      { kind: "group", title: "Petición de grupo", body: "Delegación de Económicas: 45 personas para la previa", href: "grupos", minutesAgo: 120 },
      { kind: "group", title: "Cena de Navidad", body: "2.º de Enfermería: 28 personas", href: "grupos", minutesAgo: 1200 },
      { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Hicimos la previa de la fiesta de Teleco…”", href: "estudiantes", minutesAgo: 400, read: true },
    ];
    return { offers, groupRequests, inboxItems, campaigns };
  }

  const offers: ProOffer[] = [
    offer({ id: "o1", kind: "valley", title: "Menú del día de estudiante", detail: "Menú del día a 13,90 € de lunes a viernes a mediodía", discountPct: 15, days: [0, 1, 2, 3, 4], fromMinute: 13 * 60, toMinute: 15 * 60 + 30, slots: 40, claimed: 26, audience: { studentsOnly: true, radiusKm: 5, universities: [ua] }, reach: 2100, views: 780, bookings: 96, revenueCents: 133400, createdAt: atLocal(addDays(today, -28), 12 * 60) }),
    offer({ id: "o2", kind: "card", title: "Franky Card", detail: "-10 % en carta, de domingo a jueves", discountPct: 10, slots: 0, audience: { studentsOnly: false, radiusKm: 50, universities: [] }, reach: 5400, views: 1320, bookings: 71, revenueCents: 204000, createdAt: atLocal(addDays(today, -70), 12 * 60) }),
    offer({ id: "o3", kind: "group", title: "Menús de graduación", detail: "Menú cerrado desde 32 € con reservado para 20 a 40 personas", discountPct: 0, slots: 8, claimed: 3, audience: { studentsOnly: true, radiusKm: 10, universities: [ua, umh] }, reach: 2900, views: 610, bookings: 3, revenueCents: 312000, createdAt: atLocal(addDays(today, -20), 12 * 60) }),
    offer({ id: "o4", kind: "first_visit", title: "Primera visita", detail: "Postre de la casa gratis en tu primera reserva", discountPct: 0, slots: 50, claimed: 31, audience: { studentsOnly: true, radiusKm: 10, universities: [ua] }, reach: 2400, views: 702, bookings: 31, revenueCents: 99200, createdAt: atLocal(addDays(today, -40), 12 * 60) }),
  ];
  const groupRequests: ProGroupRequest[] = [
    { id: "g1", organizer: "Álex Molina", organization: "4.º de Derecho UA", kind: "Cena de graduación", people: 38, date: atLocal(addDays(today, 19), 21 * 60), budgetPerPersonCents: 3500, message: "Cena de graduación de la promoción. Somos 38, dos celíacos y una persona vegana.", status: "accepted", quoteCents: 3200, createdAt: ago(240) },
    { id: "g2", organizer: "Paula Gómez", organization: "4.º de Nutrición UMH", kind: "Comida de fin de prácticas", people: 16, date: atLocal(addDays(today, 6), 14 * 60), budgetPerPersonCents: 2500, message: "Somos 16 y queremos comer arroz en la playa al terminar las prácticas. ¿Tenéis menú de grupo?", status: "new", createdAt: ago(3) },
    { id: "g3", organizer: "Sergio Mora", organization: "ESN Alicante", kind: "Comida Erasmus", people: 24, date: atLocal(addDays(today, 12), 14 * 60), budgetPerPersonCents: 2200, message: "Comida de bienvenida para Erasmus: queremos que prueben un arroz alicantino de verdad.", status: "quoted", quoteCents: 2400, createdAt: ago(50) },
    { id: "g4", organizer: "Nuria Sempere", organization: "3.º de Enfermería UA", kind: "Comida de fin de prácticas", people: 12, date: atLocal(today, 14 * 60), budgetPerPersonCents: 2200, message: "Terminamos las prácticas del hospital y queremos celebrarlo comiendo arroz. Somos 12.", status: "accepted", quoteCents: 2200, createdAt: ago(170) },
  ];
  const campaigns = makeCampaigns(now, [
    { moment: "Semana de bienvenida", title: "Arroz de bienvenida", when: "Hecho en septiembre", status: "done", audience: "Primer curso", idea: "Menú de estudiante con arroz: 96 comensales nuevos." },
    { moment: "Fiestas de facultad", title: "Cenas de Navidad de clase", when: "Noviembre y diciembre", status: "scheduled", audience: "Delegados de curso UA y UMH", idea: "Tres menús cerrados de 25, 30 y 35 € con señal." },
    { moment: "Erasmus de febrero", title: "Paella Erasmus", when: "Febrero", status: "suggested", audience: "ESN Alicante", idea: "Comida de grupo a 22 € para los recién llegados." },
    { moment: "Graduaciones", title: "Temporada de graduaciones", when: "Mayo y junio", status: "suggested", audience: "Último curso", idea: "Reservado para 40 con menú cerrado y señal online." },
  ]);
  const inboxItems: InboxSeed[] = [
    ...(requested ? [{ kind: "booking" as const, title: "Reserva por confirmar", body: `${requested.clientName}, ${requested.partySize} personas a las ${new Date(requested.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}`, href: "reservas", minutesAgo: 7 }] : []),
    { kind: "group", title: "Petición de grupo", body: "4.º de Nutrición UMH: 16 personas, comida de fin de prácticas", href: "grupos", minutesAgo: 180 },
    { kind: "payment", title: "Señal recibida", body: "Graduación de Derecho: 380 € de señal", href: "grupos", minutesAgo: 600, read: true },
    { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Avisé de que soy celíaca y el camarero ya lo sabía…”", href: "estudiantes", minutesAgo: 900, read: true },
  ];
  return { offers, groupRequests, inboxItems, campaigns };
}

