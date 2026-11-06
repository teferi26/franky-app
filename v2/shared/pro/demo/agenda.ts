import type {
  ProBooking,
  ProClient,
  ProData,
  ProOffer,
  ProPayment,
  ProService,
  ProShift,
  ProStaff,
  ProVerticalId,
} from "../types";
import type {
  ProAgendaAbsence,
  ProAgendaBlock,
  ProAgendaBundle,
  ProAgendaOps,
  ProAllergy,
  ProCabin,
  ProClientAgenda,
  ProColorFormula,
  ProConsentTemplate,
  ProGiftCard,
  ProPastVisit,
  ProProduct,
  ProWaitlistEntry,
  ProWalkin,
} from "../agenda-types";
import {
  DEFAULT_TEMPLATES,
  defaultAgendaSettings,
  seriesPlan,
} from "../agenda-ops";
import { defaultChecklist } from "../agenda-day";
import { durationFor, freeGaps } from "../agenda";
import { giftCode } from "../agenda-money";
import {
  addDays,
  atLocal,
  localDate,
  localMinutes,
  weekdayIndex,
} from "../format";
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
  weekHours,
  type Rng,
} from "./common";

/**
 * Demo del motor de agenda (barbería y centro de estética).
 *
 * La clientela tiene ritmo propio: cada ficha tiene su servicio de siempre,
 * su profesional y cada cuántos días suele volver. La agenda se simula día a
 * día desde hace cinco meses hasta la semana que viene, así que las visitas
 * pasadas, los cobros del mes, las citas de hoy y la lista de "te toca
 * volver" cuentan la misma historia.
 */

type Mix = { serviceId: string; weight: number }[];

type AgendaSeed = {
  space: Parameters<typeof makeSpace>[1];
  staff: Omit<ProStaff, "clockedInAt" | "weekMinutes">[];
  services: ProService[];
  reviews: string[];
  fillRate: number;
  /** Servicio habitual de la clientela de cada profesional, con su peso. */
  mix: Record<string, Mix>;
  /** Cuántas fichas tiene cada profesional como habituales. */
  pool: Record<string, number>;
  tags: string[];
  products: ProProduct[];
  /** Productos de reventa que se venden a veces al cobrar. */
  retail: string[];
  cabins: ProCabin[];
  consents: ProConsentTemplate[];
  bundles: {
    serviceId: string;
    label: string;
    sessions: number;
    priceCents: number;
  }[];
};

const WEEKDAYS_MORNING = {
  days: [0, 1, 2, 3, 4],
  from: 9 * 60 + 30,
  to: 13 * 60,
};

const HAIR: AgendaSeed = {
  space: {
    name: "Barbería Nómada",
    city: "San Vicente del Raspeig",
    address: "Calle Alicante 42",
    slug: "barberia-nomada",
    owner: { name: "Dani Ferrer", firstName: "Dani" },
    hours: weekHours(9 * 60 + 30, 20 * 60 + 30, {
      saturday: [9 * 60, 14 * 60],
      closedMonday: false,
    }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 6,
    rating: 4.8,
    reviewsCount: 212,
    publicProfile: {
      description:
        "Barbería de barrio a seis minutos del campus. Degradados, barba con toalla caliente y color.",
      photos: 9,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  },
  staff: [
    {
      id: "s1",
      name: "Dani Ferrer",
      role: "owner",
      tone: "violet",
      title: "Barbero y dueño",
      commissionPct: 0,
      phone: "600 000 000",
    },
    {
      id: "s2",
      name: "Lucía Pastor",
      role: "staff",
      tone: "sky",
      title: "Estilista y color",
      commissionPct: 35,
      agenda: { productCommissionPct: 10 },
    },
    {
      id: "s3",
      name: "Marcos Vidal",
      role: "staff",
      tone: "emerald",
      title: "Barbero",
      commissionPct: 30,
      agenda: { productCommissionPct: 10 },
    },
  ],
  services: [
    {
      id: "sv1",
      name: "Corte caballero",
      category: "Corte",
      durationMin: 30,
      priceCents: 1400,
      studentPriceCents: 1100,
      staffIds: ["s1", "s3"],
      online: true,
      popular: true,
      agenda: { returnWeeks: 4, valley: WEEKDAYS_MORNING },
    },
    {
      id: "sv2",
      name: "Degradado",
      category: "Corte",
      durationMin: 30,
      priceCents: 1500,
      studentPriceCents: 1200,
      staffIds: ["s1", "s3"],
      online: true,
      popular: true,
      agenda: { returnWeeks: 3, valley: WEEKDAYS_MORNING },
    },
    {
      id: "sv3",
      name: "Corte y barba",
      category: "Corte",
      durationMin: 45,
      priceCents: 2000,
      studentPriceCents: 1600,
      staffIds: ["s1", "s3"],
      online: true,
      agenda: {
        returnWeeks: 4,
        valley: WEEKDAYS_MORNING,
        // Marcos se toma su tiempo con la barba.
        staffMin: { s3: 50 },
      },
    },
    {
      id: "sv4",
      name: "Arreglo de barba",
      category: "Barba",
      durationMin: 20,
      priceCents: 900,
      staffIds: ["s1", "s3"],
      online: true,
      agenda: { returnWeeks: 2 },
    },
    {
      id: "sv5",
      name: "Corte mujer",
      category: "Corte",
      durationMin: 45,
      priceCents: 2400,
      studentPriceCents: 1900,
      staffIds: ["s2"],
      online: true,
      popular: true,
      agenda: { returnWeeks: 8, valley: WEEKDAYS_MORNING },
    },
    {
      id: "sv6",
      name: "Color raíz",
      category: "Color",
      durationMin: 75,
      priceCents: 3800,
      staffIds: ["s2"],
      online: false,
      agenda: {
        returnWeeks: 6,
        patchTest: true,
        phases: { applyMin: 25, processMin: 35, finishMin: 15 },
        materials: [
          { productId: "pr5", qty: 0.5 },
          { productId: "pr6", qty: 0.25 },
        ],
      },
    },
    {
      id: "sv7",
      name: "Mechas balayage",
      category: "Color",
      durationMin: 150,
      priceCents: 7500,
      staffIds: ["s2"],
      online: false,
      agenda: {
        returnWeeks: 12,
        patchTest: true,
        depositCents: 1500,
        commissionPct: 40,
        phases: { applyMin: 60, processMin: 45, finishMin: 45 },
        materials: [
          { productId: "pr7", qty: 0.5 },
          { productId: "pr6", qty: 0.5 },
        ],
      },
    },
    {
      id: "sv8",
      name: "Peinado evento",
      category: "Peinado",
      durationMin: 45,
      priceCents: 2500,
      staffIds: ["s2"],
      online: true,
    },
    {
      id: "sv10",
      name: "Arreglo de flequillo",
      category: "Corte",
      durationMin: 15,
      priceCents: 600,
      staffIds: ["s2"],
      online: true,
    },
    {
      id: "sv9",
      name: "Prueba de sensibilidad",
      category: "Color",
      durationMin: 15,
      priceCents: 0,
      staffIds: ["s2"],
      online: false,
    },
  ],
  reviews: [
    "El mejor degradado que me han hecho en Alicante. Reservé por Franky entre dos clases y sin esperar.",
    "Lucía me clavó el color. Súper atenta y me explicó cómo cuidarlo.",
    "Precio de estudiante los martes y te atienden igual de bien. Repetiré.",
    "Buen ambiente, puntuales y la barba con toalla caliente es un lujo.",
    "Fui con el Hueco de última hora y salí encantado. Ya soy cliente fijo.",
    "Me costó un poco aparcar, pero el corte de diez.",
  ],
  fillRate: 0.72,
  mix: {
    s1: [
      { serviceId: "sv2", weight: 40 },
      { serviceId: "sv1", weight: 25 },
      { serviceId: "sv3", weight: 25 },
      { serviceId: "sv4", weight: 10 },
    ],
    s3: [
      { serviceId: "sv2", weight: 45 },
      { serviceId: "sv1", weight: 25 },
      { serviceId: "sv3", weight: 20 },
      { serviceId: "sv4", weight: 10 },
    ],
    s2: [
      { serviceId: "sv5", weight: 45 },
      { serviceId: "sv6", weight: 35 },
      { serviceId: "sv7", weight: 10 },
      { serviceId: "sv8", weight: 10 },
    ],
  },
  pool: { s1: 230, s2: 160, s3: 230 },
  tags: [
    "Poca conversación",
    "Café con leche",
    "Degradado bajo",
    "Siempre con prisa",
    "Le gusta hablar de fútbol",
    "Raya a la izquierda",
  ],
  products: [
    {
      id: "pr1",
      name: "Cera mate",
      brand: "Reuzel",
      kind: "retail",
      priceCents: 1800,
      costCents: 900,
      stock: 3,
      min: 4,
      supplier: { name: "Distribuciones Levante", phone: "611 234 567" },
    },
    {
      id: "pr2",
      name: "Aceite para barba",
      brand: "Proraso",
      kind: "retail",
      priceCents: 1400,
      costCents: 650,
      stock: 9,
      min: 4,
      supplier: { name: "Distribuciones Levante", phone: "611 234 567" },
    },
    {
      id: "pr3",
      name: "Champú anticaspa",
      brand: "Kérastase",
      kind: "retail",
      priceCents: 2600,
      costCents: 1350,
      stock: 6,
      min: 3,
      supplier: { name: "Beauty Pro Alicante", phone: "622 345 678" },
    },
    {
      id: "pr4",
      name: "Laca fijación fuerte",
      brand: "Schwarzkopf",
      kind: "retail",
      priceCents: 1200,
      costCents: 550,
      stock: 7,
      min: 3,
      supplier: { name: "Beauty Pro Alicante", phone: "622 345 678" },
    },
    {
      id: "pr5",
      name: "Tinte 7.1",
      brand: "Majirel",
      kind: "tech",
      priceCents: 0,
      costCents: 720,
      stock: 2,
      min: 4,
      supplier: { name: "Beauty Pro Alicante", phone: "622 345 678" },
    },
    {
      id: "pr6",
      name: "Oxidante 20 vol",
      brand: "Majirel",
      kind: "tech",
      priceCents: 0,
      costCents: 900,
      stock: 5,
      min: 2,
      supplier: { name: "Beauty Pro Alicante", phone: "622 345 678" },
    },
    {
      id: "pr7",
      name: "Decolorante",
      brand: "Blond Studio",
      kind: "tech",
      priceCents: 0,
      costCents: 2100,
      stock: 1,
      min: 2,
      supplier: { name: "Beauty Pro Alicante", phone: "622 345 678" },
    },
    {
      id: "pr8",
      name: "Cuchillas de afeitar",
      brand: "Derby",
      kind: "tech",
      priceCents: 0,
      costCents: 800,
      stock: 12,
      min: 5,
      supplier: { name: "Distribuciones Levante", phone: "611 234 567" },
    },
  ],
  retail: ["pr1", "pr2", "pr3", "pr4"],
  cabins: [],
  consents: [],
  bundles: [
    {
      serviceId: "sv2",
      label: "Bono 5 degradados",
      sessions: 5,
      priceCents: 6500,
    },
    {
      serviceId: "sv3",
      label: "Bono 5 cortes y barba",
      sessions: 5,
      priceCents: 8500,
    },
  ],
};

const BEAUTY_VALLEY = { days: [0, 1, 2, 3], from: 10 * 60, to: 13 * 60 };

const BEAUTY: AgendaSeed = {
  space: {
    name: "Estudio Lía",
    city: "San Vicente del Raspeig",
    address: "Calle Pintor Picasso 7",
    slug: "estudio-lia",
    owner: { name: "Lía Carbonell", firstName: "Lía" },
    hours: weekHours(10 * 60, 20 * 60, { saturday: [10 * 60, 14 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 8,
    rating: 4.9,
    reviewsCount: 148,
    publicProfile: {
      description:
        "Estética y bienestar sin prisas: uñas, cejas, pestañas y tratamientos faciales.",
      photos: 12,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  },
  staff: [
    {
      id: "s1",
      name: "Lía Carbonell",
      role: "owner",
      tone: "rose",
      title: "Esteticista y dueña",
      commissionPct: 0,
    },
    {
      id: "s2",
      name: "Noa Esteve",
      role: "staff",
      tone: "violet",
      title: "Uñas y pestañas",
      commissionPct: 30,
      agenda: { productCommissionPct: 10 },
    },
    {
      id: "s3",
      name: "Inés Molina",
      role: "staff",
      tone: "teal",
      title: "Facial y cejas, cabina alquilada",
      commissionPct: 0,
      agenda: { chairRentCents: 35000 },
    },
  ],
  services: [
    {
      id: "sv1",
      name: "Manicura semipermanente",
      category: "Uñas",
      durationMin: 45,
      priceCents: 2200,
      studentPriceCents: 1800,
      staffIds: ["s2"],
      online: true,
      popular: true,
      agenda: {
        returnWeeks: 3,
        valley: BEAUTY_VALLEY,
        materials: [{ productId: "pr5", qty: 0.25 }],
      },
    },
    {
      id: "sv2",
      name: "Uñas acrílicas",
      category: "Uñas",
      durationMin: 90,
      priceCents: 3800,
      staffIds: ["s2"],
      online: true,
      agenda: { returnWeeks: 3 },
    },
    {
      id: "sv3",
      name: "Lifting de pestañas",
      category: "Pestañas",
      durationMin: 60,
      priceCents: 3500,
      studentPriceCents: 2900,
      staffIds: ["s2", "s1"],
      online: true,
      popular: true,
      agenda: {
        returnWeeks: 6,
        patchTest: true,
        cabinId: "cb2",
        bufferMin: 5,
        consentId: "cs-lash",
        valley: BEAUTY_VALLEY,
        materials: [{ productId: "pr6", qty: 0.25 }],
        // Lía hace el lifting con tinte incluido: le lleva un cuarto de hora más.
        staffMin: { s1: 75 },
        aftercare:
          "no mojes las pestañas en 24 horas, nada de rímel ni vapor hasta mañana y péinalas cada día con el cepillo.",
      },
    },
    {
      id: "sv4",
      name: "Diseño de cejas",
      category: "Cejas",
      durationMin: 30,
      priceCents: 1500,
      studentPriceCents: 1200,
      staffIds: ["s3", "s1"],
      online: true,
      agenda: { returnWeeks: 4, valley: BEAUTY_VALLEY },
    },
    {
      id: "sv5",
      name: "Limpieza facial",
      category: "Facial",
      durationMin: 60,
      priceCents: 4500,
      staffIds: ["s3", "s1"],
      online: true,
      agenda: {
        returnWeeks: 6,
        cabinId: "cb1",
        bufferMin: 10,
        aftercare:
          "evita el maquillaje y el sol directo durante 24 horas y usa protector solar cada mañana.",
      },
    },
    {
      id: "sv6",
      name: "Depilación piernas",
      category: "Depilación",
      durationMin: 45,
      priceCents: 2500,
      staffIds: ["s1", "s3"],
      online: true,
      agenda: { returnWeeks: 4, cabinId: "cb1", bufferMin: 5 },
    },
    {
      id: "sv7",
      name: "Láser de diodo piernas",
      category: "Depilación",
      durationMin: 45,
      priceCents: 6000,
      studentPriceCents: 4800,
      staffIds: ["s1"],
      online: true,
      agenda: {
        returnWeeks: 6,
        cabinId: "mq1",
        bufferMin: 10,
        depositCents: 1000,
        consentId: "cs-laser",
        valley: BEAUTY_VALLEY,
        materials: [{ productId: "pr7", qty: 0.25 }],
        aftercare:
          "nada de sol ni rayos UVA en siete días, crema hidratante sin alcohol y no uses cera entre sesiones.",
      },
    },
    {
      id: "sv8",
      name: "Tinte de pestañas y cejas",
      category: "Pestañas",
      durationMin: 30,
      priceCents: 1800,
      staffIds: ["s2", "s3"],
      online: true,
      agenda: { returnWeeks: 5, patchTest: true },
    },
    {
      id: "sv9",
      name: "Prueba de sensibilidad",
      category: "Pestañas",
      durationMin: 15,
      priceCents: 0,
      staffIds: ["s1", "s2", "s3"],
      online: false,
    },
  ],
  reviews: [
    "Me hice las uñas antes de la graduación con el pack de estudiante y quedaron perfectas.",
    "Noa es una artista con las pestañas. Súper limpio todo.",
    "La limpieza facial me dejó la piel nueva. Muy profesionales.",
    "Reservé un hueco de última hora a mitad de precio. Genial.",
    "Trato cercano y puntuales. Recomendado.",
  ],
  fillRate: 0.66,
  mix: {
    s1: [
      { serviceId: "sv7", weight: 35 },
      { serviceId: "sv3", weight: 25 },
      { serviceId: "sv6", weight: 25 },
      { serviceId: "sv5", weight: 15 },
    ],
    s2: [
      { serviceId: "sv1", weight: 55 },
      { serviceId: "sv3", weight: 20 },
      { serviceId: "sv2", weight: 15 },
      { serviceId: "sv8", weight: 10 },
    ],
    s3: [
      { serviceId: "sv5", weight: 40 },
      { serviceId: "sv4", weight: 40 },
      { serviceId: "sv8", weight: 10 },
      { serviceId: "sv6", weight: 10 },
    ],
  },
  pool: { s1: 150, s2: 130, s3: 140 },
  tags: [
    "Piel sensible",
    "Prefiere a Noa",
    "Música tranquila",
    "Viene con su hermana",
    "Uñas cortas",
  ],
  products: [
    {
      id: "pr1",
      name: "Crema posdepilación",
      brand: "Byly",
      kind: "retail",
      priceCents: 1200,
      costCents: 480,
      stock: 8,
      min: 4,
      supplier: { name: "Estética Suministros", phone: "644 567 890" },
    },
    {
      id: "pr2",
      name: "Sérum vitamina C",
      brand: "Martiderm",
      kind: "retail",
      priceCents: 3200,
      costCents: 1700,
      stock: 2,
      min: 3,
      supplier: { name: "Estética Suministros", phone: "644 567 890" },
    },
    {
      id: "pr3",
      name: "Aceite de cutículas",
      brand: "OPI",
      kind: "retail",
      priceCents: 1100,
      costCents: 450,
      stock: 10,
      min: 4,
      supplier: { name: "Nails Levante", phone: "655 678 901" },
    },
    {
      id: "pr4",
      name: "Protector solar facial",
      brand: "ISDIN",
      kind: "retail",
      priceCents: 2400,
      costCents: 1300,
      stock: 5,
      min: 3,
      supplier: { name: "Estética Suministros", phone: "644 567 890" },
    },
    {
      id: "pr5",
      name: "Esmalte semipermanente",
      brand: "OPI",
      kind: "tech",
      priceCents: 0,
      costCents: 1200,
      stock: 14,
      min: 10,
      supplier: { name: "Nails Levante", phone: "655 678 901" },
    },
    {
      id: "pr6",
      name: "Adhesivo de lifting",
      brand: "Yumi Lashes",
      kind: "tech",
      priceCents: 0,
      costCents: 1900,
      stock: 1,
      min: 2,
      supplier: { name: "Estética Suministros", phone: "644 567 890" },
    },
    {
      id: "pr7",
      name: "Gel conductor láser",
      brand: "Beauty Line",
      kind: "tech",
      priceCents: 0,
      costCents: 1500,
      stock: 3,
      min: 2,
      supplier: { name: "Estética Suministros", phone: "644 567 890" },
    },
  ],
  retail: ["pr1", "pr2", "pr3", "pr4"],
  cabins: [
    { id: "cb1", name: "Cabina 1", kind: "room" },
    { id: "cb2", name: "Cabina 2", kind: "room" },
    { id: "mq1", name: "Láser de diodo", kind: "machine" },
  ],
  consents: [
    {
      id: "cs-lash",
      title: "Lifting y tinte de pestañas",
      body: "Me han explicado el tratamiento y los cuidados posteriores. He contado mis alergias, si llevo lentillas y si he tenido irritación en los ojos. Acepto que me hagan el lifting hoy.",
    },
    {
      id: "cs-laser",
      title: "Depilación láser",
      body: "Me han explicado cómo funciona el láser, el número de sesiones y los cuidados. He contado si tomo medicación, si estoy embarazada y si me he expuesto al sol en los últimos días. Acepto empezar el tratamiento.",
    },
  ],
  bundles: [
    {
      serviceId: "sv7",
      label: "Bono 6 sesiones láser piernas",
      sessions: 6,
      priceCents: 30000,
    },
    {
      serviceId: "sv5",
      label: "Bono 5 limpiezas faciales",
      sessions: 5,
      priceCents: 19500,
    },
  ],
};

const SEEDS: Partial<Record<ProVerticalId, AgendaSeed>> = {
  hairdresser: HAIR,
  beauty: BEAUTY,
};

const HISTORY_DAYS = 150;
const PAYMENT_DAYS = 35;

/** Perfil de una ficha: su servicio de siempre, con quién y cada cuánto vuelve. */
type Profile = {
  client: ProClient;
  staffId: string;
  serviceId: string;
  cadence: number;
  /** Día (relativo a hoy) en que le toca volver. */
  nextDue: number;
  /** Primer día que viene (fichas nuevas). */
  firstDay: number;
  /** Día a partir del cual deja de venir (se está yendo). */
  dropDay: number | null;
  visits: ProPastVisit[];
  spent: number;
};

function weighted(r: Rng, mix: Mix): string {
  const total = mix.reduce((sum, item) => sum + item.weight, 0);
  let roll = r.next() * total;
  for (const item of mix) {
    roll -= item.weight;
    if (roll <= 0) return item.serviceId;
  }
  return mix[mix.length - 1].serviceId;
}

function inValley(service: ProService, date: string, minute: number): boolean {
  const valley = service.agenda?.valley;
  if (!valley) return true;
  return (
    valley.days.includes(weekdayIndex(date)) &&
    minute >= valley.from &&
    minute < valley.to
  );
}

/** Firma dibujada como SVG pequeño, para que la ficha la enseñe como imagen. */
function signature(r: Rng): string {
  let path = `M10 ${30 + r.int(-6, 6)}`;
  for (let x = 30; x <= 190; x += 20)
    path += ` Q${x - 10} ${r.int(5, 55)} ${x} ${r.int(18, 42)}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 60'><path d='${path}' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const FORMULA_BRANDS = ["Majirel", "Koleston Perfect", "Igora Royal"];
const FORMULA_MIXES = [
  "7.1 + 8.1 (1:1)",
  "6.0 + 6.3 (2:1)",
  "5.35",
  "8.13 + 9.1 (1:1)",
  "6.34",
];
const FORMULA_RESULTS = [
  "Cubre bien las canas.",
  "Quedó algo cálido. La próxima, bajar un punto el dorado.",
  "Perfecto. Repetir igual.",
  "Pidió un tono más claro para verano.",
];

/* ---------- Nombres y servicios con género ---------- */

const MALE_FIRST = [
  "Hugo",
  "Pablo",
  "Adrián",
  "Sergio",
  "Javier",
  "Iván",
  "Rubén",
  "Mario",
  "Nacho",
  "Diego",
  "Raúl",
  "Óscar",
  "Víctor",
  "Samuel",
  "Jorge",
  "Bruno",
  "Gonzalo",
  "Héctor",
  "Tomás",
  "Joel",
  "Leo",
  "Unai",
  "Pau",
  "Álex",
];
const FEMALE_FIRST = [
  "Olivia",
  "Marta",
  "Carla",
  "Paula",
  "Irene",
  "Nerea",
  "Claudia",
  "Sara",
  "Andrea",
  "Elena",
  "Julia",
  "Laura",
  "Noa",
  "Alba",
  "Inés",
  "Aitana",
  "Celia",
  "Lola",
  "Emma",
  "Vera",
  "Candela",
  "Martina",
  "Ainhoa",
  "Blanca",
];

/** "m" si el servicio es de hombre (barba, caballero, degradado), "f" si es de mujer. */
function serviceGender(name: string): "m" | "f" | null {
  if (/barba|caballero|degradado/i.test(name)) return "m";
  if (/mujer/i.test(name)) return "f";
  return null;
}

function firstNameGender(first: string): "m" | "f" | null {
  // Marcos y Lucía no se usan de repuesto porque así se llama el equipo.
  if (first === "Marcos" || MALE_FIRST.includes(first)) return "m";
  if (first === "Lucía" || FEMALE_FIRST.includes(first)) return "f";
  return null;
}

/** Cambia el nombre de pila si no encaja con el servicio (sin tocar el apellido). */
function withGender(name: string, gender: "m" | "f" | null): string {
  const [first, ...rest] = name.split(" ");
  const current = firstNameGender(first);
  if (!gender || !current || current === gender) return name;
  const names = gender === "m" ? MALE_FIRST : FEMALE_FIRST;
  const index = [...first].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return [names[index % names.length], ...rest].join(" ");
}

/** Servicios que encajan con quien reserva (a un Mario no se le da un corte de mujer). */
function fitting(services: ProService[], clientName: string): ProService[] {
  const gender = firstNameGender(clientName.split(" ")[0]);
  const fit = services.filter((sv) => {
    const g = serviceGender(sv.name);
    return !g || !gender || g === gender;
  });
  return fit.length ? fit : services;
}

export function buildAgendaDemo(vertical: ProVerticalId, now: Date): ProData {
  const seed = SEEDS[vertical] ?? HAIR;
  const r = rng(seedFor(vertical));
  const space = makeSpace(vertical, seed.space);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const todayHours = space.hours[weekdayIndex(today)] ?? {
    open: 9 * 60 + 30,
    close: 20 * 60,
  };
  const services = seed.services;
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const iso = (offset: number, minute: number) =>
    atLocal(addDays(today, offset), minute);

  const staff: ProStaff[] = seed.staff.map((s, i) => ({
    ...s,
    clockedInAt: clockIn(today, todayHours.open, i, now),
    weekMinutes: 0,
  }));

  /* ---------- Fichas con ritmo propio ---------- */

  const poolSize = Object.values(seed.pool).reduce((sum, n) => sum + n, 0);
  const clients = makeClients(r, now, poolSize);
  const profiles: Profile[] = [];
  let cursorClient = 0;
  for (const s of staff) {
    for (let i = 0; i < (seed.pool[s.id] ?? 0); i++) {
      const client = clients[cursorClient++];
      const serviceId = weighted(r, seed.mix[s.id]);
      const weeks = serviceById.get(serviceId)?.agenda?.returnWeeks ?? 5;
      const cadence = Math.max(10, weeks * 7 + r.int(-4, 6));
      // Un 6 % son fichas nuevas y un 10 % se están yendo.
      const isNew = r.chance(0.06);
      const firstDay = isNew ? r.int(-25, 3) : -HISTORY_DAYS - 200;
      profiles.push({
        client,
        staffId: s.id,
        serviceId,
        cadence,
        nextDue: isNew ? firstDay : -HISTORY_DAYS + r.int(0, cadence),
        firstDay,
        dropDay: !isNew && r.chance(0.1) ? r.int(-110, -35) : null,
        visits: [],
        spent: 0,
      });
      if (isNew) {
        client.source = r.pick([
          "franky",
          "franky",
          "hueco",
          "card",
          "instagram",
        ] as const);
        client.createdAt = iso(Math.min(0, firstDay), 12 * 60);
      }
    }
  }
  // Nombres acordes a lo que se hacen: nadie llamada Lola se arregla la barba.
  const usedNames = new Set(clients.map((client) => client.name));
  profiles.forEach((profile, i) => {
    const own = services.filter((sv) => sv.staffIds.includes(profile.staffId));
    const main = serviceById.get(profile.serviceId);
    const wanted =
      main && serviceGender(main.name)
        ? serviceGender(main.name)
        : own.length && own.every((sv) => serviceGender(sv.name) === "m")
          ? "m"
          : null;
    const [first, ...rest] = profile.client.name.split(" ");
    if (!wanted || firstNameGender(first) === wanted) return;
    const names = wanted === "m" ? MALE_FIRST : FEMALE_FIRST;
    for (let k = 0; k < names.length; k++) {
      const name = [names[(i + k) % names.length], ...rest].join(" ");
      if (usedNames.has(name)) continue;
      usedNames.delete(profile.client.name);
      usedNames.add(name);
      profile.client.name = name;
      return;
    }
  });
  const byStaff = new Map<string, Profile[]>();
  for (const profile of profiles)
    byStaff.set(profile.staffId, [
      ...(byStaff.get(profile.staffId) ?? []),
      profile,
    ]);

  /* ---------- Bloqueos, ausencias y cabinas ---------- */

  const blocks: ProAgendaBlock[] = [];
  const absences: ProAgendaAbsence[] = [];
  for (let d = -3; d <= 6; d++) {
    const date = addDays(today, d);
    const hours = space.hours[weekdayIndex(date)];
    if (!hours || hours.close - hours.open <= 7 * 60) continue;
    for (const s of staff)
      blocks.push({
        id: `bl-${s.id}-${date}`,
        staffId: s.id,
        date,
        from: 14 * 60,
        to: 15 * 60 + 30,
        reason: "Comida",
      });
  }
  const tomorrow = addDays(today, 1);
  if (space.hours[weekdayIndex(tomorrow)])
    blocks.push({
      id: "bl-training",
      staffId: "s3",
      date: tomorrow,
      from: 10 * 60 + 30,
      to: 12 * 60,
      reason: "Formación",
    });
  // Dos días de diario seguidos esta semana o la que viene: unas vacaciones
  // en sábado y domingo, con el local cerrado, no se notan en la agenda.
  const openOn = (offset: number) =>
    Boolean(space.hours[weekdayIndex(addDays(today, offset))]);
  const awayFrom = [3, 4, 5].find((d) => openOn(d) && openOn(d + 1)) ?? 5;
  absences.push({
    id: "ab1",
    staffId: "s3",
    from: addDays(today, awayFrom),
    to: addDays(today, awayFrom + 1),
    reason: vertical === "beauty" ? "Asuntos propios" : "Vacaciones",
  });
  const blockedAt = (staffId: string, date: string, minute: number) =>
    blocks.find(
      (block) =>
        block.staffId === staffId &&
        block.date === date &&
        minute >= block.from &&
        minute < block.to,
    );
  const absent = (staffId: string, date: string) =>
    absences.some(
      (absence) =>
        absence.staffId === staffId &&
        absence.from <= date &&
        absence.to >= date,
    );

  /* ---------- Simulación día a día ---------- */

  const bookings: ProBooking[] = [];
  const payments: ProPayment[] = [];
  let n = 0;
  let requestedCount = 0;
  const retail = seed.products.filter((product) =>
    seed.retail.includes(product.id),
  );

  for (let d = -HISTORY_DAYS; d <= 6; d++) {
    const date = addDays(today, d);
    const hours = space.hours[weekdayIndex(date)];
    if (!hours) continue;
    const cabinUse: { cabin: string; from: number; to: number }[] = [];
    for (const s of staff) {
      if (absent(s.id, date)) continue;
      const pool = byStaff.get(s.id) ?? [];
      const own = services.filter(
        (sv) => sv.staffIds.includes(s.id) && sv.priceCents > 0,
      );
      if (!own.length) continue;
      let cursor = hours.open;
      while (cursor < hours.close - 20) {
        const block = blockedAt(s.id, date, cursor);
        if (block) {
          cursor = block.to;
          continue;
        }
        // Hoy dejamos más huecos por la tarde; los días lejanos aún se están llenando.
        const fill =
          d === 0 && cursor > 16 * 60
            ? seed.fillRate - 0.25
            : d <= 1
              ? seed.fillRate
              : d <= 3
                ? seed.fillRate * 0.8
                : seed.fillRate * 0.6;
        if (!r.chance(fill)) {
          cursor += 30;
          continue;
        }
        // Viene quien más tiempo lleva esperando su vuelta (se adelanta como mucho unos días).
        const early = 3;
        let pick: Profile | null = null;
        for (const profile of pool) {
          if (
            profile.firstDay > d ||
            (profile.dropDay !== null && d >= profile.dropDay)
          )
            continue;
          if (profile.nextDue > d + early) continue;
          if (!pick || profile.nextDue < pick.nextDue) pick = profile;
        }
        if (!pick) {
          cursor += 30;
          continue;
        }
        const sv =
          (r.chance(0.82)
            ? serviceById.get(pick.serviceId)
            : r.pick(fitting(own, pick.client.name))) ?? own[0];
        const end = cursor + durationFor(sv, s.id);
        const buffer = sv.agenda?.bufferMin ?? 0;
        const crossesBlock = blocks.some(
          (b) =>
            b.staffId === s.id &&
            b.date === date &&
            cursor < b.to &&
            end > b.from,
        );
        const cabin = sv.agenda?.cabinId;
        const cabinBusy =
          cabin &&
          cabinUse.some(
            (u) => u.cabin === cabin && cursor < u.to && end + buffer > u.from,
          );
        if (end > hours.close || crossesBlock || cabinBusy) {
          cursor += 15;
          continue;
        }
        if (cabin) cabinUse.push({ cabin, from: cursor, to: end + buffer });
        const client = pick.client;
        const student = Boolean(client.student?.verified);
        const price =
          student &&
          sv.studentPriceCents &&
          inValley(sv, date, cursor) &&
          r.chance(0.6)
            ? sv.studentPriceCents
            : sv.priceCents;
        pick.nextDue = d + pick.cadence + r.int(-3, 4);
        pick.spent += price;

        if (d <= -4) {
          // Visita pasada: queda en la ficha y, si es de este último mes, en caja.
          pick.visits.push({
            at: atLocal(date, cursor),
            serviceId: sv.id,
            staffId: s.id,
          });
          if (d >= -PAYMENT_DAYS) {
            n++;
            const product =
              retail.length && r.chance(0.12) ? r.pick(retail) : null;
            payments.push({
              id: `p${n}`,
              at: atLocal(date, end),
              clientName: client.name,
              staffId: s.id,
              concept: product ? `${sv.name}, ${product.name}` : sv.name,
              amountCents: price + (product?.priceCents ?? 0),
              tipCents: r.chance(0.2) ? r.int(1, 3) * 100 : 0,
              method: r.pick(["card", "card", "cash", "bizum"] as const),
              agenda: product
                ? {
                    lines: [
                      {
                        kind: "service",
                        refId: sv.id,
                        name: sv.name,
                        qty: 1,
                        cents: price,
                      },
                      {
                        kind: "product",
                        refId: product.id,
                        name: product.name,
                        qty: 1,
                        cents: product.priceCents,
                      },
                    ],
                    discountCents: 0,
                    depositAppliedCents: 0,
                    giftCardCents: 0,
                  }
                : undefined,
            });
          }
          cursor = end + buffer + (r.chance(0.2) ? 15 : 0);
          continue;
        }

        const start = atLocal(date, cursor);
        const finish = atLocal(date, end);
        let status: ProBooking["status"] = "confirmed";
        if (d < 0) status = r.chance(0.06) ? "no_show" : "done";
        else if (d === 0) {
          if (end <= nowMin) status = r.chance(0.05) ? "no_show" : "done";
          else if (cursor <= nowMin) status = "in_service";
          else if (cursor - nowMin < 25)
            status = r.chance(0.5) ? "arrived" : "confirmed";
        } else if (d <= 2 && requestedCount < 3 && r.chance(0.12)) {
          status = "requested";
          requestedCount++;
        }
        const source =
          client.source === "hueco" && d >= 0 ? "hueco" : client.source;
        n++;
        const booking: ProBooking = {
          id: `b${n}`,
          kind: "appointment",
          clientId: client.id,
          clientName: client.name,
          staffId: s.id,
          serviceId: sv.id,
          start,
          end: finish,
          partySize: 1,
          status,
          priceCents: price,
          paidCents: status === "done" ? price : 0,
          source,
          student,
        };
        bookings.push(booking);
        if (status === "done") {
          payments.push({
            id: `p${n}`,
            at: finish,
            bookingId: booking.id,
            clientName: client.name,
            staffId: s.id,
            concept: sv.name,
            amountCents: price,
            tipCents: r.chance(0.2) ? r.int(1, 3) * 100 : 0,
            method: r.pick(["card", "card", "cash", "bizum"] as const),
          });
        }
        cursor = end + buffer + (r.chance(0.2) ? 15 : 0);
      }
    }
  }

  /* ---------- Fichas: visitas, gasto, fórmulas, salud y permisos ---------- */

  const doneBy = new Map<string, number>();
  for (const booking of bookings)
    if (booking.status === "done" && booking.clientId)
      doneBy.set(booking.clientId, (doneBy.get(booking.clientId) ?? 0) + 1);
  const hasColor = (profile: Profile) =>
    Boolean(serviceById.get(profile.serviceId)?.agenda?.patchTest);

  for (const profile of profiles) {
    const client = profile.client;
    const older = profile.firstDay > -HISTORY_DAYS ? 0 : r.int(1, 9);
    const agenda: ProClientAgenda = { visits: profile.visits.slice(-5) };
    const lastDone = bookings
      .filter((b) => b.clientId === client.id && b.status === "done")
      .map((b) => b.start)
      .sort()
      .at(-1);
    const lastVisit = lastDone ?? profile.visits.at(-1)?.at;
    client.visits =
      profile.visits.length + (doneBy.get(client.id) ?? 0) + older;
    client.lastVisit = lastVisit;
    client.spentCents =
      profile.spent +
      older * (serviceById.get(profile.serviceId)?.priceCents ?? 1500);
    const first = profile.visits[0]?.at;
    if (first && client.createdAt > first)
      client.createdAt = addMinutesIso(first, -60 * 24 * 7 * older);
    if (!client.visits) client.lastVisit = undefined;

    if (r.chance(0.12)) client.tags = [r.pick(seed.tags)];
    if (r.chance(0.35)) {
      const young = Boolean(client.student);
      const year = young ? r.int(2000, 2007) : r.int(1972, 1999);
      client.birthday = `${year}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`;
    }
    agenda.consents = {
      marketing: {
        granted: client.marketingConsent,
        at: client.createdAt,
        by: space.owner.firstName,
      },
      ...(r.chance(0.3)
        ? {
            photos: {
              granted: true,
              at: client.createdAt,
              by: space.owner.firstName,
            },
          }
        : {}),
    };

    // Color: fórmulas con fecha y prueba de sensibilidad (algunas caducadas o sin hacer).
    if (hasColor(profile)) {
      const colorVisits = profile.visits.filter(
        (v) => serviceById.get(v.serviceId)?.agenda?.patchTest,
      );
      if (vertical === "hairdresser") {
        agenda.formulas = colorVisits.slice(-3).map(
          (visit, i): ProColorFormula => ({
            id: `f-${client.id}-${i}`,
            at: visit.at,
            staffId: visit.staffId,
            brand:
              FORMULA_BRANDS[(client.id.length + i) % FORMULA_BRANDS.length],
            mix: r.pick(FORMULA_MIXES),
            oxidant: r.pick(["20 vol", "20 vol", "30 vol", "10 vol"]),
            processMin: r.pick([30, 35, 35, 40]),
            zone: r.pick(["Raíz", "Raíz", "Medios y puntas", "Todo"]),
            result: r.pick(FORMULA_RESULTS),
          }),
        );
      }
      const roll = r.next();
      if (roll < 0.62) agenda.patchTestAt = iso(-r.int(20, 150), 11 * 60);
      else if (roll < 0.8) agenda.patchTestAt = iso(-r.int(200, 320), 11 * 60);
    }

    // Estética: salud y consentimientos firmados.
    if (vertical === "beauty") {
      if (r.chance(0.2)) {
        const allergies: ProAllergy[] = [
          r.pick(["latex", "cyanoacrylate", "wax", "ppd"] as const),
        ];
        agenda.health = {
          allergies,
          sensitiveSkin: r.chance(0.4),
          pregnancy: r.chance(0.08),
          medication: r.chance(0.12) ? "Isotretinoína" : undefined,
          updatedAt: client.createdAt,
          updatedBy: space.owner.firstName,
        };
        agenda.consents.health = {
          granted: true,
          at: client.createdAt,
          by: space.owner.firstName,
        };
      }
      const consentId = serviceById.get(profile.serviceId)?.agenda?.consentId;
      if (consentId && profile.visits.length && r.chance(0.8))
        agenda.signed = [
          {
            id: `sg-${client.id}`,
            consentId,
            at: profile.visits[0].at,
            signature: signature(r),
            by: staff.find((s) => s.id === profile.staffId)?.name.split(" ")[0],
          },
        ];
    }
    client.agenda = agenda;
  }

  // Tres cumpleaños esta semana, siempre con permiso para felicitar.
  const withConsent = profiles.filter(
    (p) => p.client.marketingConsent && p.client.visits > 2,
  );
  for (let i = 0; i < 3 && i < withConsent.length; i++) {
    const client = withConsent[(i * 37) % withConsent.length].client;
    const day = addDays(today, i * 2);
    client.birthday = `${client.student ? 2003 : 1991}-${day.slice(5)}`;
  }

  /* ---------- Pose, confirmaciones y señales ---------- */

  // Un color de hoy con un arreglo rápido durante la pose: la agenda lo permite.
  const colorToday = bookings.find(
    (b) =>
      localDate(b.start) === today &&
      b.serviceId === "sv6" &&
      b.status !== "no_show",
  );
  const quick = serviceById.get("sv10");
  if (vertical === "hairdresser" && colorToday && quick) {
    const startMin = localMinutes(colorToday.start) + 30;
    const guest = (byStaff.get("s2") ?? []).find(
      (p) => p.client.id !== colorToday.clientId,
    )?.client;
    if (guest) {
      n++;
      bookings.push({
        id: `b${n}`,
        kind: "appointment",
        clientId: guest.id,
        clientName: guest.name,
        staffId: "s2",
        serviceId: quick.id,
        start: atLocal(today, startMin),
        end: atLocal(today, startMin + quick.durationMin),
        partySize: 1,
        status:
          startMin + quick.durationMin <= nowMin
            ? "done"
            : startMin <= nowMin
              ? "in_service"
              : "confirmed",
        priceCents: quick.priceCents,
        paidCents:
          startMin + quick.durationMin <= nowMin ? quick.priceCents : 0,
        source: guest.source,
      });
    }
  }

  const clientById = new Map(clients.map((client) => [client.id, client]));
  for (const booking of bookings) {
    const date = localDate(booking.start);
    if (
      date < today ||
      booking.status === "done" ||
      booking.status === "no_show"
    )
      continue;
    const client = clientById.get(booking.clientId ?? "");
    const service = serviceById.get(booking.serviceId ?? "");
    const agenda: ProBooking["agenda"] = {};
    if (date === today && r.chance(0.8)) {
      agenda.remindedAt = iso(-1, 17 * 60 + r.int(0, 50));
      agenda.confirmedAt = iso(-1, 18 * 60 + r.int(0, 90));
    } else if (date === tomorrow && nowMin > 11 * 60 && r.chance(0.35)) {
      agenda.remindedAt = new Date(
        now.getTime() - r.int(10, 90) * 60000,
      ).toISOString();
      if (r.chance(0.6))
        agenda.confirmedAt = new Date(
          now.getTime() - r.int(1, 9) * 60000,
        ).toISOString();
    }
    const depositCents =
      service?.agenda?.depositCents ??
      (client && client.noShows >= 2 ? 500 : 0);
    if (depositCents && date > today) {
      if (r.chance(0.5)) {
        const at = iso(-1, 12 * 60 + r.int(0, 300));
        agenda.deposit = {
          cents: depositCents,
          status: "paid",
          method: "bizum",
          at,
        };
        booking.paidCents = depositCents;
        payments.push({
          id: `pd-${booking.id}`,
          at,
          bookingId: booking.id,
          clientName: booking.clientName,
          staffId: booking.staffId,
          concept: `Señal · ${service?.name ?? "Cita"}`,
          amountCents: depositCents,
          tipCents: 0,
          method: "bizum",
          agenda: {
            kind: "deposit",
            lines: [
              {
                kind: "service",
                refId: service?.id,
                name: `Señal · ${service?.name ?? "Cita"}`,
                qty: 1,
                cents: depositCents,
              },
            ],
            discountCents: 0,
            depositAppliedCents: 0,
            giftCardCents: 0,
          },
        });
      } else agenda.deposit = { cents: depositCents, status: "pending" };
    }
    if (Object.keys(agenda).length) booking.agenda = agenda;
  }

  staff.forEach((s) => {
    s.weekMinutes = bookings
      .filter((b) => b.staffId === s.id && b.status !== "cancelled")
      .reduce(
        (acc, b) =>
          acc +
          (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000,
        0,
      );
  });

  /* ---------- Lista de espera, sin cita, bonos y tarjetas regalo ---------- */

  const pickProfile = (staffId: string, skip: number, serviceId: string) => {
    const gender = serviceGender(serviceById.get(serviceId)?.name ?? "");
    return (byStaff.get(staffId) ?? []).filter(
      (p) =>
        p.client.phone &&
        p.client.visits > 1 &&
        (!gender ||
          firstNameGender(p.client.name.split(" ")[0]) !==
            (gender === "m" ? "f" : "m")),
    )[skip]?.client;
  };
  const waitlist: ProWaitlistEntry[] = [];
  const addWait = (
    id: string,
    staffPool: string,
    skip: number,
    serviceId: string,
    extra: Partial<ProWaitlistEntry>,
  ) => {
    const client = pickProfile(staffPool, skip, serviceId);
    if (!client) return;
    waitlist.push({
      id,
      clientId: client.id,
      name: client.name,
      phone: client.phone,
      serviceId,
      from: todayHours.open,
      to: todayHours.close,
      createdAt: new Date(
        now.getTime() - (skip + 1) * 47 * 60000,
      ).toISOString(),
      status: "waiting",
      ...extra,
    });
  };
  const lateFrom = Math.max(16 * 60, Math.ceil((nowMin + 30) / 15) * 15);
  if (vertical === "hairdresser") {
    addWait("w1", "s1", 3, "sv2", {
      date: today,
      from: lateFrom,
      to: 20 * 60 + 30,
    });
    addWait("w2", "s2", 4, "sv6", {
      date: tomorrow,
      staffId: "s2",
      from: 10 * 60,
      to: 14 * 60,
    });
    addWait("w3", "s1", 8, "sv3", {
      staffId: "s1",
      from: 18 * 60,
      to: 20 * 60 + 30,
    });
    addWait("w4", "s2", 9, "sv5", {
      date: today,
      from: Math.max(17 * 60, lateFrom),
      to: 20 * 60,
      status: "offered",
      offeredAt: new Date(now.getTime() - 20 * 60000).toISOString(),
    });
  } else {
    addWait("w1", "s2", 3, "sv1", { date: today, from: lateFrom, to: 20 * 60 });
    addWait("w2", "s2", 5, "sv3", {
      date: tomorrow,
      staffId: "s2",
      from: 10 * 60,
      to: 13 * 60,
    });
    addWait("w3", "s3", 6, "sv5", { from: 17 * 60, to: 20 * 60 });
    addWait("w4", "s1", 7, "sv7", { from: 10 * 60, to: 14 * 60 });
  }

  // La cola de sin cita se rellena más abajo, con los huecos reales de hoy.
  const walkins: ProWalkin[] = [];

  const bundles: ProAgendaBundle[] = [];
  seed.bundles.forEach((template, index) => {
    const owners = profiles
      .filter((p) => p.serviceId === template.serviceId && p.visits.length >= 2)
      .slice(0, 4);
    owners.forEach((profile, i) => {
      const soldDay = -r.int(20, 80);
      const used = Math.min(
        template.sessions - 1,
        1 + ((i + index) % (template.sessions - 1)),
      );
      bundles.push({
        id: `bn-${index}-${i}`,
        clientId: profile.client.id,
        clientName: profile.client.name,
        serviceId: template.serviceId,
        label: template.label,
        sessions: template.sessions,
        used,
        priceCents: template.priceCents,
        soldAt: iso(soldDay, 12 * 60),
        expiresAt: addDays(today, 365 + soldDay),
        moves: Array.from({ length: used }, (_, k) => ({
          at: iso(soldDay + 7 + k * 21, 12 * 60),
          delta: -1,
        })),
      });
    });
  });
  // Alguien gasta hoy la última sesión: Hoy lo avisa para renovar.
  const bundleServices = seed.bundles.map((b) => b.serviceId);
  const lastToday = bookings.find(
    (b) =>
      localDate(b.start) === today &&
      b.clientId &&
      bundleServices.includes(b.serviceId ?? "") &&
      !["done", "no_show", "cancelled"].includes(b.status),
  );
  if (lastToday) {
    const template = seed.bundles.find(
      (b) => b.serviceId === lastToday.serviceId,
    )!;
    bundles.push({
      id: "bn-last",
      clientId: lastToday.clientId!,
      clientName: lastToday.clientName,
      serviceId: template.serviceId,
      label: template.label,
      sessions: template.sessions,
      used: template.sessions - 1,
      priceCents: template.priceCents,
      soldAt: iso(-120, 12 * 60),
      expiresAt: addDays(today, 245),
      moves: Array.from({ length: template.sessions - 1 }, (_, k) => ({
        at: iso(-110 + k * 21, 12 * 60),
        delta: -1,
      })),
    });
  }

  const giftCards: ProGiftCard[] = [
    {
      id: "gc1",
      code: giftCode(r.next),
      amountCents: 3000,
      balanceCents: 3000,
      buyer: personName(r),
      recipient: personName(r),
      soldAt: iso(-6, 18 * 60),
      expiresAt: addDays(today, 359),
    },
    {
      id: "gc2",
      code: giftCode(r.next),
      amountCents: 5000,
      balanceCents: 1500,
      buyer: personName(r),
      recipient: personName(r),
      soldAt: iso(-33, 12 * 60),
      expiresAt: addDays(today, 332),
    },
    {
      id: "gc3",
      code: giftCode(r.next),
      amountCents: 2500,
      balanceCents: 0,
      buyer: personName(r),
      soldAt: iso(-70, 12 * 60),
      expiresAt: addDays(today, 295),
    },
  ];

  // Apertura de hoy: ya está casi todo marcado por quien abrió.
  const checklist = defaultChecklist(vertical);
  const opener = staff.find((s) => s.clockedInAt) ?? staff[0];
  const checklistLog =
    nowMin > todayHours.open + 20
      ? checklist
          .filter((item) => item.moment === "open")
          .slice(0, -1)
          .map((item, i) => ({
            itemId: item.id,
            date: today,
            at: iso(0, todayHours.open - 10 + i * 4),
            staffId: opener.id,
          }))
      : [];

  const agendaOps: ProAgendaOps = {
    settings: defaultAgendaSettings(space),
    checklist,
    checklistLog,
    templates: { ...DEFAULT_TEMPLATES },
    waitlist,
    blocks,
    absences,
    products: seed.products.map((product) => ({ ...product })),
    bundles,
    giftCards,
    walkins,
    cabins: seed.cabins,
    consentTemplates: seed.consents,
  };

  /* ---------- Ofertas, grupos, avisos y campañas (como siempre) ---------- */

  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "valley",
      title:
        vertical === "beauty"
          ? "Miércoles de estudiante"
          : "Martes universitario",
      detail:
        vertical === "beauty"
          ? "-20 % en manicura y cejas de 10:00 a 13:00"
          : "-20 % en cortes de 10:00 a 13:00",
      discountPct: 20,
      days: vertical === "beauty" ? [2] : [1],
      fromMinute: 10 * 60,
      toMinute: 13 * 60,
      slots: 12,
      claimed: 9,
      audience: {
        studentsOnly: true,
        radiusKm: 3,
        universities: [UNIVERSITIES[0]],
      },
      status: "live",
      reach: 2140,
      views: 612,
      bookings: 37,
      revenueCents: 41800,
      createdAt: atLocal(addDays(today, -40), 11 * 60),
    },
    {
      id: "o2",
      kind: "flash",
      title: "Hueco de última hora",
      detail: "Corte a 9 € hoy entre 17:00 y 19:00",
      discountPct: 35,
      startsAt: atLocal(today, 17 * 60),
      endsAt: atLocal(today, 19 * 60),
      slots: 3,
      claimed: 1,
      audience: {
        studentsOnly: true,
        radiusKm: 2,
        universities: [UNIVERSITIES[0]],
      },
      status: nowMin < 19 * 60 ? "live" : "ended",
      reach: 860,
      views: 214,
      bookings: 1,
      revenueCents: 900,
      createdAt: atLocal(today, Math.max(9 * 60, nowMin - 55)),
    },
    {
      id: "o3",
      kind: "card",
      title: "Franky Card",
      detail: "-10 % en cualquier servicio, todos los días",
      discountPct: 10,
      slots: 0,
      claimed: 0,
      audience: { studentsOnly: false, radiusKm: 50, universities: [] },
      status: "live",
      reach: 5400,
      views: 1320,
      bookings: 58,
      revenueCents: 91600,
      createdAt: atLocal(addDays(today, -60), 11 * 60),
    },
    {
      id: "o4",
      kind: "first_visit",
      title: "Primera visita",
      detail: "Barba gratis con tu primer corte",
      discountPct: 0,
      slots: 30,
      claimed: 22,
      audience: {
        studentsOnly: true,
        radiusKm: 5,
        universities: [UNIVERSITIES[0], UNIVERSITIES[1]],
      },
      status: "live",
      reach: 3100,
      views: 804,
      bookings: 22,
      revenueCents: 30800,
      createdAt: atLocal(addDays(today, -21), 11 * 60),
    },
    {
      id: "o5",
      kind: "flash",
      title: "Hueco de ayer",
      detail: "Corte y barba a 12 € de 11:00 a 13:00",
      discountPct: 40,
      startsAt: atLocal(addDays(today, -1), 11 * 60),
      endsAt: atLocal(addDays(today, -1), 13 * 60),
      slots: 3,
      claimed: 3,
      audience: {
        studentsOnly: true,
        radiusKm: 2,
        universities: [UNIVERSITIES[0]],
      },
      status: "ended",
      reach: 910,
      views: 301,
      bookings: 3,
      revenueCents: 3600,
      createdAt: atLocal(addDays(today, -1), 9 * 60 + 40),
    },
  ];

  const data = emptyData(space);
  const firstRequested = bookings.find((b) => b.status === "requested");
  // Barbería: dos personas esperan sin cita, con servicios que caben en los
  // próximos huecos reales, para que la espera calculada sea creíble.
  const open = space.hours[weekdayIndex(today)];
  if (
    vertical === "hairdresser" &&
    open &&
    nowMin > open.open + 20 &&
    nowMin < open.close - 60
  ) {
    const probe = { ...data, services, staff, bookings, agendaOps } as ProData;
    const soon = freeGaps(probe, today, nowMin, 20)
      .filter((gap) => gap.staffId !== "s2" && gap.from <= nowMin + 150)
      .slice(0, 2);
    soon.forEach((gap, i) => {
      const fit = ["sv2", "sv1", "sv4"].find(
        (id) => (serviceById.get(id)?.durationMin ?? 999) <= gap.to - gap.from,
      );
      if (!fit) return;
      walkins.push({
        id: `wk${i + 1}`,
        name: withGender(
          personName(r),
          serviceGender(serviceById.get(fit)?.name ?? ""),
        ),
        serviceId: fit,
        arrivedAt: new Date(now.getTime() - (14 - i * 8) * 60000).toISOString(),
        status: "waiting",
      });
    });
  }
  // Estética: una clienta con bono de láser tiene sus sesiones en un plan,
  // cada 6 semanas desde el martes que viene.
  const laser = bundles.find(
    (b) => b.serviceId === "sv7" && b.id !== "bn-last",
  );
  const laserService = serviceById.get("sv7");
  if (vertical === "beauty" && laser && laserService) {
    const probe = { ...data, services, staff, bookings, agendaOps } as ProData;
    const plan = seriesPlan(probe, {
      serviceId: laserService.id,
      staffId: "s1",
      date: addDays(today, 8 - weekdayIndex(today)),
      minute: 11 * 60,
      everyWeeks: 6,
      count: Math.min(4, laser.sessions - laser.used),
      shiftMin: 120,
    });
    const client = clients.find((c) => c.id === laser.clientId);
    plan
      .filter((step) => step.free)
      .forEach((step, i) =>
        bookings.push({
          id: `plan-${i + 1}`,
          kind: "appointment",
          clientId: laser.clientId,
          clientName: laser.clientName,
          staffId: "s1",
          serviceId: laserService.id,
          start: atLocal(step.date, step.minute),
          end: atLocal(step.date, step.minute + laserService.durationMin),
          partySize: 1,
          status: "confirmed",
          priceCents: laserService.priceCents,
          paidCents: 0,
          source: "phone",
          student: Boolean(client?.student?.verified),
          agenda: { seriesId: "sr-laser" },
        }),
      );
  }
  const lowItems = agendaOps.products.filter((p) => p.stock <= p.min);
  return {
    ...data,
    agendaOps,
    history: makeHistory(
      r,
      now,
      vertical === "beauty" ? 62 : 118,
      0.24,
      vertical === "beauty" ? 3100 : 1650,
    ),
    staff,
    clients,
    services,
    bookings,
    payments,
    offers,
    // La reseña del degradado o la barba la firma un chico.
    reviews: makeReviews(r, now, seed.reviews).map((review) =>
      /degradado|barba/i.test(review.text)
        ? { ...review, clientName: withGender(review.clientName, "m") }
        : review,
    ),
    shifts: [
      ...monthShifts(staff, now, space.hours),
      ...makeShifts(staff, now, todayHours.open, todayHours.close),
    ],
    groupRequests: [
      {
        id: "g1",
        organizer: "Carla Soler",
        organization: "Delegación de Arquitectura",
        kind:
          vertical === "beauty"
            ? "Uñas para la graduación"
            : "Peinados para la graduación",
        people: 14,
        date: atLocal(addDays(today, 23), 10 * 60),
        budgetPerPersonCents: 1800,
        message:
          "Somos 14 de la promoción y queremos ir juntas la mañana de la graduación. ¿Podéis a partir de las 10?",
        status: "new",
        createdAt: new Date(now.getTime() - 3 * 3600000).toISOString(),
      },
      vertical === "beauty"
        ? {
            id: "g2",
            organizer: "Grupo de Danza UA",
            organization: "Asociación de danza",
            kind: "Manicura antes de la gala",
            people: 12,
            date: atLocal(addDays(today, 9), 16 * 60),
            budgetPerPersonCents: 1500,
            message:
              "Somos 12 bailarinas y queremos las uñas iguales para la gala de fin de curso. Buscamos precio de grupo.",
            status: "quoted",
            quoteCents: 1600,
            createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
          }
        : {
            id: "g2",
            organizer: "Club de Rugby UA",
            organization: "Club deportivo",
            kind: "Cortes antes del torneo",
            people: 18,
            date: atLocal(addDays(today, 9), 16 * 60),
            budgetPerPersonCents: 1000,
            message:
              "Todo el equipo antes del torneo universitario. Buscamos precio de grupo.",
            status: "quoted",
            quoteCents: 1100,
            createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
          },
    ],
    inbox: inbox(now, [
      ...(firstRequested
        ? [
            {
              kind: "booking" as const,
              title: "Cita por confirmar",
              body: `${firstRequested.clientName} pide cita online`,
              href: "agenda",
              minutesAgo: 12,
            },
          ]
        : []),
      {
        kind: "group",
        title: "Petición de grupo",
        body: "Delegación de Arquitectura: 14 personas para la graduación",
        href: "estudiantes",
        minutesAgo: 180,
      },
      {
        kind: "review",
        title: "Nueva reseña de 5 estrellas",
        body: "“El mejor degradado que me han hecho en Alicante…”",
        href: "estudiantes",
        minutesAgo: 320,
      },
      {
        kind: "booking",
        title: "Hueco relámpago reservado",
        body: "1 de 3 plazas del hueco de las 17:00",
        href: "estudiantes",
        minutesAgo: 40,
      },
      ...(lowItems.length
        ? [
            {
              kind: "system" as const,
              title: "Stock bajo",
              body: `${lowItems.map((p) => p.name).join(", ")} por debajo del mínimo`,
              href: "servicios",
              minutesAgo: 95,
            },
          ]
        : []),
      {
        kind: "payment",
        title: "Cierre de ayer",
        body: "Caja cuadrada con 3 profesionales",
        href: "caja",
        minutesAgo: 900,
        read: true,
      },
    ]),
    campaigns: makeCampaigns(now, [
      {
        moment: "Fiestas de facultad",
        title: "Pack antes de la fiesta de Económicas",
        when: "Dentro de 9 días",
        status: "suggested",
        audience: "Facultad de Económicas",
        idea: "Corte y barba a 16 € el jueves por la tarde.",
      },
      {
        moment: "Exámenes de enero",
        title: "Corte exprés en exámenes",
        when: "Enero",
        status: "scheduled",
        audience: "Toda la UA",
        idea: "Citas de 20 minutos de 8:30 a 10:00 para ir antes del examen.",
      },
      {
        moment: "Graduaciones",
        title: "Temporada de graduaciones",
        when: "Mayo y junio",
        status: "suggested",
        audience: "Último curso",
        idea: "Paquetes de grupo con reserva por delegación.",
      },
      {
        moment: "Semana de bienvenida",
        title: "Primera visita para nuevos",
        when: "Hecho en septiembre",
        status: "done",
        audience: "Primer curso",
        idea: "Barba gratis con el primer corte: 22 clientes nuevos.",
      },
    ]),
  };
}

function addMinutesIso(isoValue: string, minutes: number): string {
  return new Date(Date.parse(isoValue) + minutes * 60000).toISOString();
}

/** Fichajes cerrados del último mes (de hace 35 a 7 días) para el resumen de la gestoría. */
function monthShifts(
  staff: ProStaff[],
  now: Date,
  hours: ({ open: number; close: number } | null)[],
): ProShift[] {
  const today = localDate(now);
  const shifts: ProShift[] = [];
  for (let d = 35; d >= 7; d--) {
    const date = addDays(today, -d);
    const day = hours[weekdayIndex(date)];
    if (!day) continue;
    staff.forEach((s, i) => {
      // Cada persona libra un día entre semana.
      if (weekdayIndex(date) === (i + 1) % 5) return;
      const long = day.close - day.open > 8 * 60;
      const start = day.open - 8 + i * 3;
      const end = long
        ? Math.min(day.close + 5, start + 8 * 60 + 35)
        : day.close + 5;
      shifts.push({
        id: `sh-${s.id}-${date}`,
        staffId: s.id,
        date,
        inAt: atLocal(date, start),
        outAt: atLocal(date, end),
        breakMinutes: long ? 30 : 0,
      });
    });
  }
  return shifts;
}
