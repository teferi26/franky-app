import type {
  ProBooking,
  ProClassSession,
  ProClassType,
  ProClient,
  ProClientSource,
  ProData,
  ProGroupRequest,
  ProMember,
  ProMembershipPlan,
  ProOffer,
  ProPayment,
  ProStaff,
  ProVerticalId,
} from "../types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import { addMonths, deriveRoster, memberPrice } from "../classes";
import { seedClassExtras, welcomeCohort } from "./classes-extras";
import { seedClassGrowth } from "./classes-growth";
import { seedClassStudy } from "./classes-study";
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
  type InboxSeed,
  type Rng,
  type SpaceSeed,
} from "./common";

/** Una clase fija del horario semanal. `fill` es la demanda típica (1 = llena). */
type Slot = { days: number[]; at: number; type: string; room: string; fill: number };

type ClassesSeed = {
  space: SpaceSeed;
  staff: Omit<ProStaff, "clockedInAt" | "weekMinutes">[];
  classTypes: ProClassType[];
  schedule: Slot[];
  plans: ProMembershipPlan[];
  /** Reparto de socios por plan (mismo orden que `plans`). */
  planWeights: number[];
  members: number;
  studentShare: number;
  studies: string[];
  clients: number;
  clientTags: string[];
  reviews: string[];
  offers: (today: string, nowMin: number) => ProOffer[];
  campaigns: Parameters<typeof makeCampaigns>[1];
  groups: (today: string, now: Date) => ProGroupRequest[];
  inbox: InboxSeed[];
  history: [number, number, number];
};

const WEEKDAYS = [0, 1, 2, 3, 4];

/* ------------------------------------------------------------------ */
/* Box Levante (gimnasio y box)                                        */
/* ------------------------------------------------------------------ */

const SPORTS: ClassesSeed = {
  space: {
    name: "Box Levante",
    city: "San Vicente del Raspeig",
    address: "Calle Lillo Juan 88",
    slug: "box-levante",
    owner: { name: "Rubén Llorca", firstName: "Rubén" },
    hours: weekHours(6 * 60 + 30, 22 * 60, { saturday: [9 * 60, 14 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 9,
    rating: 4.8,
    reviewsCount: 173,
    publicProfile: {
      description: "Box de CrossFit, halterofilia, Hyrox y yoga a nueve minutos del campus. Coaches titulados y grupos de máximo 16.",
      photos: 11,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  },
  staff: [
    { id: "s1", name: "Rubén Llorca", role: "owner", tone: "violet", title: "Head coach y dueño", commissionPct: 0, phone: "600 000 000" },
    { id: "s2", name: "Marta Soler", role: "staff", tone: "rose", title: "Coach CrossFit y Hyrox", commissionPct: 0 },
    { id: "s3", name: "Iván Pastor", role: "staff", tone: "amber", title: "Coach de halterofilia", commissionPct: 0 },
    { id: "s4", name: "Nerea Blasco", role: "staff", tone: "emerald", title: "Profesora de yoga", commissionPct: 0 },
    { id: "s5", name: "Sara Mora", role: "reception", tone: "sky", title: "Recepción", commissionPct: 0 },
  ],
  classTypes: [
    { id: "ct1", name: "CrossFit", category: "Fuerza y metcon", durationMin: 60, capacity: 16, coachId: "s1", tone: "violet", level: "Todos los niveles" },
    { id: "ct2", name: "Halterofilia", category: "Técnica", durationMin: 60, capacity: 10, coachId: "s3", tone: "amber", level: "Intermedio" },
    { id: "ct3", name: "Open Box", category: "Entreno libre", durationMin: 90, capacity: 20, coachId: "s2", tone: "slate", level: "Socios con base" },
    { id: "ct4", name: "Yoga", category: "Movilidad", durationMin: 60, capacity: 14, coachId: "s4", tone: "emerald", level: "Todos los niveles" },
    { id: "ct5", name: "Hyrox", category: "Resistencia", durationMin: 60, capacity: 14, coachId: "s2", tone: "rose", level: "Todos los niveles" },
  ],
  schedule: [
    { days: WEEKDAYS, at: 7 * 60, type: "ct1", room: "Sala principal", fill: 0.95 },
    { days: WEEKDAYS, at: 10 * 60, type: "ct1", room: "Sala principal", fill: 0.45 },
    { days: [0, 2, 4], at: 12 * 60, type: "ct4", room: "Sala 2", fill: 0.5 },
    { days: [1, 3], at: 12 * 60, type: "ct2", room: "Plataformas", fill: 0.55 },
    { days: WEEKDAYS, at: 14 * 60, type: "ct1", room: "Sala principal", fill: 0.6 },
    { days: [0, 2], at: 17 * 60, type: "ct5", room: "Sala 2", fill: 0.85 },
    { days: [1, 3, 4], at: 17 * 60, type: "ct2", room: "Plataformas", fill: 0.8 },
    { days: WEEKDAYS, at: 18 * 60, type: "ct1", room: "Sala principal", fill: 1.15 },
    { days: WEEKDAYS, at: 19 * 60, type: "ct1", room: "Sala principal", fill: 1.25 },
    { days: [1, 3], at: 19 * 60, type: "ct4", room: "Sala 2", fill: 0.9 },
    { days: WEEKDAYS, at: 20 * 60, type: "ct1", room: "Sala principal", fill: 0.95 },
    { days: [0, 2], at: 20 * 60 + 30, type: "ct3", room: "Sala 2", fill: 0.6 },
    { days: [5], at: 10 * 60, type: "ct1", room: "Sala principal", fill: 1.1 },
    { days: [5], at: 11 * 60 + 30, type: "ct3", room: "Sala principal", fill: 0.7 },
  ],
  plans: [
    { id: "pl1", name: "Ilimitado", priceCents: 6900, period: "month", sessions: null, studentPriceCents: 5900, members: 0 },
    { id: "pl2", name: "3 días por semana", priceCents: 4900, period: "month", sessions: 12, studentPriceCents: 4400, members: 0 },
    { id: "pl3", name: "Bono 10 clases", priceCents: 9000, period: "pack", sessions: 10, members: 0 },
    { id: "pl4", name: "Universitario valle (10 a 14 h)", priceCents: 3900, period: "month", sessions: null, studentPriceCents: 3900, members: 0 },
  ],
  planWeights: [0.38, 0.27, 0.13, 0.22],
  members: 68,
  studentShare: 0.62,
  studies: ["ADE", "Ingeniería Informática", "Enfermería", "Derecho", "Ciencias del Deporte", "Arquitectura", "Biología", "Psicología"],
  clients: 26,
  clientTags: ["Clase de prueba"],
  reviews: [
    "Entré con la clase de prueba de Franky recién llegado a Alicante y me quedé. El ambiente es brutal.",
    "La tarifa universitaria de mediodía me salva: entreno entre clases y pago 39 €.",
    "Rubén y Marta corrigen técnica de verdad, no es un gimnasio de apuntarse y ya.",
    "Me encanta que puedo reservar y ver la lista de espera desde el móvil.",
    "Hicimos el reto entre facultades con los de Enfermería y fue la mejor tarde del cuatrimestre.",
    "A las 19:00 se llena mucho, pero la lista de espera funciona bien.",
  ],
  offers: (today, nowMin) => [
    {
      id: "o1",
      kind: "valley",
      title: "Tarifa universitaria de mediodía",
      detail: "Ilimitado de 10 a 14 h por 39 € al mes con carné de estudiante",
      discountPct: 43,
      days: WEEKDAYS,
      fromMinute: 10 * 60,
      toMinute: 14 * 60,
      slots: 40,
      claimed: 15,
      audience: { studentsOnly: true, radiusKm: 3, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 3180,
      views: 942,
      bookings: 15,
      revenueCents: 58500,
      createdAt: atLocal(addDays(today, -34), 11 * 60),
    },
    {
      id: "o2",
      kind: "first_visit",
      title: "Clase de prueba para quien llega",
      detail: "Primera clase gratis para estudiantes nuevos en Alicante",
      discountPct: 100,
      slots: 60,
      claimed: 41,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0], UNIVERSITIES[1]] },
      status: "live",
      reach: 5200,
      views: 1610,
      bookings: 41,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -26), 10 * 60),
    },
    {
      id: "o3",
      kind: "group",
      title: "Reto entre facultades",
      detail: "Equipos de 4 por facultad, sábado 11:30, final con ranking en Franky",
      discountPct: 0,
      startsAt: atLocal(addDays(today, 16), 11 * 60 + 30),
      endsAt: atLocal(addDays(today, 16), 13 * 60 + 30),
      slots: 12,
      claimed: 7,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0]] },
      status: "scheduled",
      reach: 4100,
      views: 890,
      bookings: 7,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -5), 12 * 60),
    },
    {
      id: "o4",
      kind: "flash",
      title: "Plazas libres a mediodía",
      detail: "CrossFit de las 14:00 a 6 € hoy",
      discountPct: 50,
      startsAt: atLocal(today, 14 * 60),
      endsAt: atLocal(today, 15 * 60),
      slots: 5,
      claimed: 2,
      audience: { studentsOnly: true, radiusKm: 2, universities: [UNIVERSITIES[0]] },
      status: nowMin < 14 * 60 ? "live" : "ended",
      reach: 870,
      views: 233,
      bookings: 2,
      revenueCents: 1200,
      createdAt: atLocal(today, Math.max(8 * 60, nowMin - 90)),
    },
  ],
  campaigns: [
    { moment: "Semana de bienvenida", title: "Clase de prueba para primero", when: "Hecho en septiembre", status: "done", audience: "Primer curso y recién llegados", idea: "Primera clase gratis: 41 pruebas y 14 altas." },
    { moment: "Fiestas de facultad", title: "Reto entre facultades", when: "Dentro de 16 días", status: "scheduled", audience: "Toda la UA", idea: "Equipos de 4, final el sábado con ranking en Franky." },
    { moment: "Exámenes de enero", title: "Bono antiestrés de exámenes", when: "Enero", status: "suggested", audience: "Toda la UA", idea: "Bono de 8 clases de 45 min a 35 € para desconectar entre exámenes." },
    { moment: "Erasmus de febrero", title: "Welcome Erasmus", when: "Febrero", status: "suggested", audience: "Erasmus recién llegados", idea: "Mes de prueba a 29 € con clases en inglés los martes." },
  ],
  groups: (today, now) => [
    {
      id: "g1",
      organizer: "Álex Ortega",
      organization: "Club de Rugby UA",
      kind: "Pretemporada de fuerza",
      people: 22,
      date: atLocal(addDays(today, 6), 16 * 60),
      budgetPerPersonCents: 500,
      message: "Queremos dos sesiones de fuerza por semana para el equipo durante octubre. ¿Tenéis hueco a las 16:00?",
      status: "new",
      createdAt: new Date(now.getTime() - 5 * 3600000).toISOString(),
    },
  ],
  inbox: [
    { kind: "lead", title: "Clase de prueba reservada", body: "Una estudiante de Enfermería viene hoy a las 19:00", href: "clientes", minutesAgo: 25 },
    { kind: "payment", title: "Cuotas pendientes", body: "6 socios con el cobro devuelto este mes", href: "socios", minutesAgo: 140 },
    { kind: "group", title: "Petición de grupo", body: "Club de Rugby UA: 22 personas para pretemporada", href: "estudiantes", minutesAgo: 300 },
    { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Entré con la clase de prueba de Franky…”", href: "estudiantes", minutesAgo: 600, read: true },
  ],
  history: [120, 0.27, 900],
};

/* ------------------------------------------------------------------ */
/* Academia Vértice                                                    */
/* ------------------------------------------------------------------ */

const ACADEMY: ClassesSeed = {
  space: {
    name: "Academia Vértice",
    city: "San Vicente del Raspeig",
    address: "Calle Ancha de Castelar 31",
    slug: "academia-vertice",
    owner: { name: "Elena Ferrer", firstName: "Elena" },
    hours: weekHours(10 * 60, 21 * 60 + 30, { saturday: [10 * 60, 14 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 5,
    rating: 4.9,
    reviewsCount: 96,
    publicProfile: {
      description: "Clases de apoyo por asignatura para la UA en grupos de máximo 10: Cálculo, Estadística, Química, Contabilidad e Inglés B2.",
      photos: 7,
      bookingEnabled: true,
      cardEnabled: false,
      cardDiscountPct: 0,
    },
  },
  staff: [
    { id: "s1", name: "Elena Ferrer", role: "owner", tone: "violet", title: "Directora, Matemáticas", commissionPct: 0, phone: "600 000 000" },
    { id: "s2", name: "Jorge Castelló", role: "staff", tone: "teal", title: "Profesor de Química", commissionPct: 0 },
    { id: "s3", name: "Paula Ortega", role: "staff", tone: "amber", title: "Profesora de Economía", commissionPct: 0 },
    { id: "s4", name: "Emma Vidal", role: "staff", tone: "sky", title: "Profesora de Inglés", commissionPct: 0 },
  ],
  classTypes: [
    { id: "ct1", name: "Cálculo I", category: "Ingenierías (EPS)", durationMin: 90, capacity: 8, coachId: "s1", tone: "violet", level: "1.º curso" },
    { id: "ct2", name: "Estadística", category: "ADE", durationMin: 90, capacity: 10, coachId: "s3", tone: "amber", level: "2.º curso" },
    { id: "ct3", name: "Química General", category: "Química y Biología", durationMin: 90, capacity: 8, coachId: "s2", tone: "teal", level: "1.º curso" },
    { id: "ct4", name: "Contabilidad Financiera", category: "ADE y Economía", durationMin: 90, capacity: 10, coachId: "s3", tone: "rose", level: "1.º curso" },
    { id: "ct5", name: "Inglés B2", category: "Acreditación, todas las carreras", durationMin: 60, capacity: 8, coachId: "s4", tone: "sky", level: "B1 a B2" },
  ],
  schedule: [
    { days: [0, 2], at: 16 * 60, type: "ct1", room: "Aula 1", fill: 0.9 },
    { days: [1, 3], at: 16 * 60, type: "ct3", room: "Aula 1", fill: 0.75 },
    { days: [0, 2], at: 17 * 60 + 45, type: "ct2", room: "Aula 2", fill: 0.8 },
    { days: [1, 3], at: 17 * 60 + 45, type: "ct4", room: "Aula 2", fill: 0.85 },
    { days: [0, 1, 2, 3], at: 19 * 60 + 30, type: "ct5", room: "Aula 3", fill: 0.7 },
    { days: [1, 3], at: 19 * 60 + 30, type: "ct1", room: "Aula 1", fill: 1.1 },
    { days: [4], at: 16 * 60, type: "ct2", room: "Aula 2", fill: 0.55 },
    { days: [4], at: 11 * 60, type: "ct5", room: "Aula 3", fill: 0.5 },
    { days: [5], at: 10 * 60 + 30, type: "ct1", room: "Aula 1", fill: 0.65 },
  ],
  plans: [
    { id: "pl1", name: "Mensual, 2 h por semana", priceCents: 8500, period: "month", sessions: 8, members: 0 },
    { id: "pl2", name: "Mensual, 4 h por semana", priceCents: 15000, period: "month", sessions: 16, members: 0 },
    { id: "pl3", name: "Intensivo de enero (20 h)", priceCents: 12000, period: "pack", sessions: 13, members: 0 },
    { id: "pl4", name: "Clase suelta", priceCents: 1800, period: "pack", sessions: 1, members: 0 },
  ],
  planWeights: [0.55, 0.2, 0.15, 0.1],
  members: 46,
  studentShare: 1,
  studies: ["Ingeniería Informática", "Ingeniería Civil", "ADE", "Economía", "Química", "Biología", "Ingeniería Química", "Turismo"],
  clients: 22,
  clientTags: ["Cálculo I", "Estadística", "Química General", "Contabilidad Financiera", "Inglés B2"],
  reviews: [
    "Aprobé Cálculo I en enero después de dos suspensos. Elena explica como nadie.",
    "Los grupos son pequeños y te conocen por tu nombre. Nada que ver con una academia grande.",
    "Me llegó el intensivo de Estadística por Franky justo tres semanas antes del examen. Perfecto.",
    "Jorge hace que la Química tenga sentido. Muy recomendable para primero.",
    "Buen ambiente y horario pensado para salir de clase y venir andando.",
  ],
  offers: (today) => [
    {
      id: "o1",
      kind: "exam",
      title: "Intensivo de Cálculo I para enero",
      detail: "20 horas del 22 de diciembre al 12 de enero, 120 €. Solo alumnos de 1.º de ingenierías de la UA",
      discountPct: 0,
      startsAt: atLocal(addDays(today, 60), 10 * 60),
      endsAt: atLocal(addDays(today, 80), 14 * 60),
      slots: 16,
      claimed: 4,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0]] },
      status: "scheduled",
      reach: 1240,
      views: 318,
      bookings: 4,
      revenueCents: 48000,
      createdAt: atLocal(addDays(today, -3), 10 * 60),
    },
    {
      id: "o2",
      kind: "first_visit",
      title: "Clase de prueba gratis",
      detail: "Ven a un grupo de tu asignatura y decide después",
      discountPct: 100,
      slots: 40,
      claimed: 23,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 2900,
      views: 810,
      bookings: 23,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -20), 10 * 60),
    },
    {
      id: "o3",
      kind: "exam",
      title: "Repaso de Estadística",
      detail: "4 sesiones antes del parcial de noviembre para 2.º de ADE, 60 €",
      discountPct: 0,
      startsAt: atLocal(addDays(today, 35), 17 * 60),
      endsAt: atLocal(addDays(today, 45), 19 * 60),
      slots: 10,
      claimed: 6,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 640,
      views: 212,
      bookings: 6,
      revenueCents: 36000,
      createdAt: atLocal(addDays(today, -8), 12 * 60),
    },
  ],
  campaigns: [
    { moment: "Semana de bienvenida", title: "Clase de prueba para primero", when: "Hecho en septiembre", status: "done", audience: "1.º de ingenierías, ADE y Química", idea: "23 pruebas y 11 alumnos nuevos." },
    { moment: "Exámenes de enero", title: "Intensivos por asignatura", when: "Desde el 1 de diciembre", status: "scheduled", audience: "1.º de ingenierías de la UA", idea: "Cálculo I y Química General, 20 h en las tres semanas antes del examen." },
    { moment: "Exámenes de junio", title: "Segunda oportunidad", when: "Mayo", status: "suggested", audience: "Quien suspendió en enero", idea: "Grupos de repaso de 8 personas para la convocatoria de junio." },
    { moment: "Erasmus de febrero", title: "Inglés B2 para irte de Erasmus", when: "Febrero", status: "suggested", audience: "2.º y 3.º curso", idea: "Preparación de la acreditación B2 antes de pedir la beca." },
  ],
  groups: () => [],
  inbox: [
    { kind: "lead", title: "3 interesados en Cálculo I", body: "Piden clase de prueba esta semana", href: "clientes", minutesAgo: 40 },
    { kind: "booking", title: "Intensivo de enero", body: "4 plazas de 16 ya reservadas", href: "estudiantes", minutesAgo: 220 },
    { kind: "payment", title: "Cuotas pendientes", body: "4 alumnos con la cuota del mes sin pagar", href: "socios", minutesAgo: 380 },
    { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Aprobé Cálculo I en enero…”", href: "estudiantes", minutesAgo: 900, read: true },
  ],
  history: [64, 0.34, 2100],
};

/* ------------------------------------------------------------------ */
/* Laberinto Escape Alicante (escape room y talleres)                  */
/* ------------------------------------------------------------------ */

const escapeTimes = [16 * 60, 17 * 60 + 15, 18 * 60 + 30, 19 * 60 + 45, 21 * 60];
const weekendTimes = [11 * 60, 12 * 60 + 15, 17 * 60, 18 * 60 + 15, 19 * 60 + 30, 20 * 60 + 45];

const CULTURE: ClassesSeed = {
  space: {
    name: "Laberinto Escape Alicante",
    city: "Alicante",
    address: "Avenida de Alcoy 12",
    slug: "laberinto-escape",
    owner: { name: "Álex Navarro", firstName: "Álex" },
    hours: [
      { open: 16 * 60, close: 22 * 60 + 30 },
      { open: 16 * 60, close: 22 * 60 + 30 },
      { open: 16 * 60, close: 22 * 60 + 30 },
      { open: 16 * 60, close: 22 * 60 + 30 },
      { open: 16 * 60, close: 23 * 60 },
      { open: 11 * 60, close: 22 * 60 },
      { open: 11 * 60, close: 21 * 60 },
    ],
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 14,
    rating: 4.9,
    reviewsCount: 388,
    publicProfile: {
      description: "Dos salas de escape de 60 minutos para grupos de 2 a 6 y taller de cerámica. Packs para asociaciones, Erasmus y cumpleaños.",
      photos: 14,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 15,
    },
  },
  staff: [
    { id: "s1", name: "Álex Navarro", role: "owner", tone: "violet", title: "Dueño y game master", commissionPct: 0, phone: "600 000 000" },
    { id: "s2", name: "Candela Ruiz", role: "staff", tone: "rose", title: "Game master", commissionPct: 0 },
    { id: "s3", name: "Bruno Serrano", role: "staff", tone: "sky", title: "Game master", commissionPct: 0 },
    { id: "s4", name: "Irene Molina", role: "staff", tone: "teal", title: "Ceramista", commissionPct: 0 },
  ],
  classTypes: [
    { id: "ct1", name: "La Biblioteca Maldita", category: "Escape room", durationMin: 60, capacity: 6, coachId: "s2", tone: "violet", level: "Grupos de 2 a 6" },
    { id: "ct2", name: "Fuga del Campus", category: "Escape room", durationMin: 60, capacity: 6, coachId: "s3", tone: "rose", level: "Grupos de 2 a 6" },
    { id: "ct3", name: "Taller de cerámica", category: "Taller", durationMin: 120, capacity: 10, coachId: "s4", tone: "teal", level: "Sin experiencia" },
  ],
  schedule: [
    ...escapeTimes.map((at, i) => ({ days: WEEKDAYS, at, type: "ct1", room: "Sala 1", fill: i >= 2 ? 0.85 : 0.5 })),
    ...escapeTimes.map((at, i) => ({ days: WEEKDAYS, at, type: "ct2", room: "Sala 2", fill: i >= 2 ? 0.8 : 0.45 })),
    ...weekendTimes.map((at) => ({ days: [5, 6], at, type: "ct1", room: "Sala 1", fill: 0.9 })),
    ...weekendTimes.map((at) => ({ days: [5, 6], at, type: "ct2", room: "Sala 2", fill: 0.85 })),
    { days: [1, 3], at: 18 * 60, type: "ct3", room: "Taller", fill: 0.8 },
    { days: [5], at: 11 * 60, type: "ct3", room: "Taller", fill: 1.05 },
  ],
  plans: [
    { id: "pl1", name: "Sala para el grupo (2 a 6)", priceCents: 7200, period: "pack", sessions: 1, studentPriceCents: 6000, members: 0 },
    { id: "pl2", name: "Taller de cerámica", priceCents: 3500, period: "pack", sessions: 1, studentPriceCents: 2900, members: 0 },
    { id: "pl3", name: "Pack cumpleaños", priceCents: 11000, period: "pack", sessions: 1, members: 0 },
  ],
  planWeights: [],
  members: 0,
  studentShare: 0.7,
  studies: [],
  clients: 58,
  clientTags: [],
  reviews: [
    "Fuimos con la asociación Erasmus y lo pasamos genial. Nos atendieron en inglés sin problema.",
    "Fuga del Campus tiene guiños a la UA que nos hicieron reír todo el rato.",
    "Precio de estudiante entre semana y la sala impecable. Repetiremos con la Biblioteca.",
    "El taller de cerámica es un plan de martes perfecto para desconectar.",
    "Celebramos un cumpleaños de 12 con las dos salas a la vez y el pack de tarta. Muy bien organizado.",
    "Las pistas llegan un poco tarde en la segunda sala, pero muy divertida.",
  ],
  offers: (today) => [
    {
      id: "o1",
      kind: "valley",
      title: "Tardes de estudiante",
      detail: "Sala a 10 € por persona de lunes a jueves antes de las 18:30",
      discountPct: 17,
      days: [0, 1, 2, 3],
      fromMinute: 16 * 60,
      toMinute: 18 * 60 + 30,
      slots: 20,
      claimed: 12,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0], UNIVERSITIES[1]] },
      status: "live",
      reach: 4300,
      views: 1180,
      bookings: 12,
      revenueCents: 54000,
      createdAt: atLocal(addDays(today, -30), 11 * 60),
    },
    {
      id: "o2",
      kind: "group",
      title: "Pack asociaciones y Erasmus",
      detail: "Las dos salas a la vez para grupos de 8 a 12, con ranking y foto",
      discountPct: 15,
      slots: 10,
      claimed: 4,
      audience: { studentsOnly: true, radiusKm: 10, universities: [UNIVERSITIES[0], UNIVERSITIES[1]] },
      status: "live",
      reach: 2100,
      views: 540,
      bookings: 4,
      revenueCents: 38400,
      createdAt: atLocal(addDays(today, -14), 11 * 60),
    },
  ],
  campaigns: [
    { moment: "Erasmus de febrero", title: "Welcome Erasmus en inglés", when: "Febrero", status: "suggested", audience: "Erasmus recién llegados", idea: "Sesiones en inglés los jueves con precio de grupo." },
    { moment: "Fiestas de facultad", title: "Torneo de salas entre delegaciones", when: "Octubre", status: "scheduled", audience: "Delegaciones de alumnos", idea: "Ranking por facultad, la ganadora se lleva la fiesta de fin de temporada." },
    { moment: "Exámenes de enero", title: "Plan para después del último examen", when: "Final de enero", status: "suggested", audience: "Toda la UA", idea: "2x1 la semana que acaban los exámenes." },
    { moment: "Semana de bienvenida", title: "Primera visita para nuevos", when: "Hecho en septiembre", status: "done", audience: "Primer curso", idea: "8 € por persona: 31 grupos nuevos." },
  ],
  groups: (today, now) => [
    {
      id: "g1",
      organizer: "Martina Esteve",
      organization: "AEGEE Alicante (Erasmus)",
      kind: "Las dos salas a la vez",
      people: 12,
      date: atLocal(addDays(today, 8), 19 * 60 + 45),
      budgetPerPersonCents: 1200,
      message: "Somos 12 Erasmus recién llegados. ¿Podéis hacer las dos salas a la vez y en inglés?",
      status: "new",
      createdAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
    },
    {
      id: "g2",
      organizer: "Diego Pérez",
      organization: "Delegación de Informática",
      kind: "Team building de la delegación",
      people: 18,
      date: atLocal(addDays(today, 12), 17 * 60),
      budgetPerPersonCents: 1000,
      message: "Queremos hacer las dos salas y el taller con toda la delegación nueva.",
      status: "quoted",
      quoteCents: 1100,
      createdAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
    },
    {
      id: "g3",
      organizer: "Aitana Gómez",
      organization: "Cumpleaños",
      kind: "Pack cumpleaños",
      people: 6,
      date: atLocal(addDays(today, 3), 18 * 60 + 30),
      budgetPerPersonCents: 1500,
      message: "Es el cumple de mi compañera de piso, ¿podemos llevar tarta?",
      status: "new",
      createdAt: new Date(now.getTime() - 20 * 60000).toISOString(),
    },
  ],
  inbox: [
    { kind: "group", title: "Petición de grupo", body: "AEGEE Alicante: 12 Erasmus, las dos salas a la vez", href: "grupos", minutesAgo: 120 },
    { kind: "group", title: "Cumpleaños", body: "6 personas este fin de semana, quieren traer tarta", href: "grupos", minutesAgo: 20 },
    { kind: "booking", title: "Sala reservada por Franky", body: "Grupo de 5 para la Biblioteca Maldita a las 19:45", href: "horario", minutesAgo: 55 },
    { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Fuimos con la asociación Erasmus…”", href: "estudiantes", minutesAgo: 700, read: true },
  ],
  history: [150, 0.31, 1250],
};

const SEEDS: Partial<Record<ProVerticalId, ClassesSeed>> = { sports: SPORTS, academy: ACADEMY, culture: CULTURE };

/* ------------------------------------------------------------------ */

function pickWeighted(r: Rng, weights: number[]): number {
  const x = r.next();
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (x < acc) return i;
  }
  return weights.length - 1;
}

function makeMembers(r: Rng, now: Date, seed: ClassesSeed, plans: ProMembershipPlan[]): ProMember[] {
  const today = localDate(now);
  const used = new Set<string>();
  const list: ProMember[] = [];
  const statusPlan: ProMember["status"][] = [];
  // Reparto realista: la mayoría al día, algunos con el cobro devuelto, en prueba, pausados y alguna baja.
  const n = seed.members;
  const overdue = Math.max(2, Math.round(n * 0.09));
  const trial = Math.max(2, Math.round(n * 0.06));
  const paused = Math.max(1, Math.round(n * 0.05));
  const cancelled = Math.max(1, Math.round(n * 0.04));
  for (let i = 0; i < n; i++) {
    if (i < overdue) statusPlan.push("overdue");
    else if (i < overdue + trial) statusPlan.push("trial");
    else if (i < overdue + trial + paused) statusPlan.push("paused");
    else if (i < overdue + trial + paused + cancelled) statusPlan.push("cancelled");
    else statusPlan.push("active");
  }
  const sources: ProClientSource[] = ["franky", "franky", "franky", "instagram", "walkin", "google", "phone", "hueco"];
  for (let i = 0; i < n; i++) {
    let name = personName(r);
    while (used.has(name)) name = personName(r);
    used.add(name);
    const status = statusPlan[(i * 7) % n];
    const plan = plans[pickWeighted(r, seed.planWeights)];
    const student = r.chance(seed.studentShare);
    const sinceDays = status === "trial" ? r.int(1, 6) : r.int(15, 420);
    const since = atLocal(addDays(today, -sinceDays), 12 * 60);
    let nextChargeAt: string | null = null;
    if (status === "active") nextChargeAt = atLocal(addDays(today, r.int(1, 29)), 9 * 60);
    if (status === "overdue") nextChargeAt = atLocal(addDays(today, -r.int(1, 9)), 9 * 60);
    if (status === "trial") nextChargeAt = atLocal(addDays(today, 7 - sinceDays), 9 * 60);
    const sessionsLeft = plan.sessions && plan.period === "pack" ? r.int(0, plan.sessions) : plan.sessions ? r.int(1, plan.sessions) : null;
    const attendance = status === "paused" || status === "cancelled" ? r.int(0, 2) : status === "trial" ? r.int(1, 2) : r.int(3, plan.sessions ? Math.min(14, plan.sessions) : 20);
    list.push({
      id: `m${i + 1}`,
      clientId: `m${i + 1}`,
      name,
      planId: plan.id,
      status,
      nextChargeAt,
      sessionsLeft,
      since,
      attendanceLast30: attendance,
      student: student ? { university: r.chance(0.85) ? UNIVERSITIES[0] : r.pick(UNIVERSITIES), verified: r.chance(0.9) } : undefined,
      studies: student ? r.pick(seed.studies) : undefined,
      phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
      source: student ? r.pick(sources) : r.pick(["instagram", "walkin", "google", "phone"] as ProClientSource[]),
      changedAt: status === "cancelled" || status === "paused" ? atLocal(addDays(today, -r.int(1, 18)), 12 * 60) : undefined,
    });
  }
  return list;
}

function makeSessions(r: Rng, now: Date, seed: ClassesSeed, space: ProData["space"], culture: boolean): ProClassSession[] {
  const today = localDate(now);
  const monday = addDays(today, -weekdayIndex(today));
  const nowT = now.getTime();
  const list: ProClassSession[] = [];
  let n = 0;
  for (let w = 0; w < 2; w++) {
    for (let day = 0; day < 7; day++) {
      const date = addDays(monday, w * 7 + day);
      if (!space.hours[day]) continue;
      for (const slot of seed.schedule) {
        if (!slot.days.includes(day)) continue;
        const ct = seed.classTypes.find((c) => c.id === slot.type)!;
        const start = atLocal(date, slot.at);
        const end = atLocal(date, slot.at + ct.durationMin);
        const daysAhead = Math.max(0, (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
        const decay = Math.max(0.35, 1 - daysAhead * 0.07);
        let booked = 0;
        let waitlist = 0;
        if (culture && ct.capacity <= 8) {
          booked = r.chance(Math.min(0.95, slot.fill * decay)) ? r.int(3, 6) : 0;
        } else {
          const demand = Math.round(ct.capacity * (slot.fill + (r.next() - 0.5) * 0.25) * decay);
          booked = Math.max(0, Math.min(ct.capacity, demand));
          waitlist = demand > ct.capacity ? Math.min(6, demand - ct.capacity) : 0;
        }
        const s = new Date(start).getTime();
        const e = new Date(end).getTime();
        let checkedIn = 0;
        if (e <= nowT) {
          waitlist = 0;
          checkedIn = culture && ct.capacity <= 8 ? (booked && r.chance(0.96) ? booked : 0) : Math.max(0, booked - r.int(0, Math.min(2, booked)));
        } else if (s <= nowT) {
          checkedIn = culture && ct.capacity <= 8 ? booked : Math.max(0, booked - r.int(1, 3));
        }
        n++;
        list.push({ id: `ss${n}`, classTypeId: ct.id, start, end, capacity: ct.capacity, booked, waitlist, checkedIn, room: slot.room, coachId: ct.coachId });
      }
    }
  }
  return list;
}

export function buildClassesDemo(vertical: ProVerticalId, now: Date): ProData {
  const seed = SEEDS[vertical] ?? SPORTS;
  const culture = vertical === "culture";
  const r = rng(seedFor(vertical));
  const space = makeSpace(vertical, seed.space);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const todayHours = space.hours[weekdayIndex(today)] ?? { open: 9 * 60, close: 21 * 60 };

  const staff: ProStaff[] = seed.staff.map((s, i) => ({
    ...s,
    clockedInAt: s.role === "reception" || i < 2 ? clockIn(today, todayHours.open, i, now) : null,
    weekMinutes: 0,
  }));

  const plans = seed.plans.map((p) => ({ ...p }));
  const members = seed.members ? welcomeCohort(makeMembers(r, now, seed, plans), now) : [];
  plans.forEach((p) => {
    p.members = members.filter((m) => m.planId === p.id && m.status !== "cancelled").length || (culture ? r.int(8, 40) : 0);
  });

  // Interesados (clase de prueba, por asignatura) o clientes del escape room.
  const clients: ProClient[] = makeClients(r, now, seed.clients, { studentShare: culture ? 0.7 : 0.85, spendRange: culture ? [1200, 7200] : [0, 1800] }).map((c, i) => {
    if (culture) return c;
    const tag = seed.clientTags[i % seed.clientTags.length];
    return {
      ...c,
      id: `c${i + 1}`,
      tags: [tag],
      visits: i % 4 === 0 ? 1 : 0,
      spentCents: 0,
      source: c.student ? (i % 5 === 4 ? "instagram" : "franky") : c.source,
      createdAt: atLocal(addDays(today, -(i % 12)), 11 * 60),
      notes: vertical === "academy" ? `Quiere preparar ${tag} para el examen de enero.` : "Recién llegado a Alicante, busca box cerca del campus.",
    };
  });

  const sessions = makeSessions(r, now, seed, space, culture);
  staff.forEach((s) => {
    s.weekMinutes = sessions
      .filter((x) => x.coachId === s.id && x.start >= atLocal(addDays(today, -weekdayIndex(today)), 0) && x.start < atLocal(addDays(today, 7 - weekdayIndex(today)), 0))
      .reduce((a, x) => a + (new Date(x.end).getTime() - new Date(x.start).getTime()) / 60000, 0);
  });

  const base: ProData = { ...emptyData(space), members, clients, sessions, classTypes: seed.classTypes, plans };

  // Las listas de hoy se guardan ya como reservas, con las clases de prueba dentro.
  const bookings: ProBooking[] = [];
  const todays = sessions.filter((s) => localDate(s.start) === today);
  const trials = clients.filter((c) => c.tags.includes(seed.clientTags[0] ?? "") || vertical === "academy").slice(0, 4);
  let t = 0;
  todays.forEach((s, idx) => {
    const roster = deriveRoster(base, s, now);
    if (!culture && t < trials.length && idx % 2 === 1 && s.booked > 2) {
      const i = roster.findIndex((b) => b.status !== "requested");
      const c = trials[t++];
      if (i >= 0) {
        roster[i] = {
          ...roster[i],
          clientId: c.id,
          clientName: c.name,
          trial: true,
          source: "franky",
          student: Boolean(c.student?.verified),
        };
      }
    }
    bookings.push(...roster);
  });

  // Cobros: la última cuota de cada socio y lo cobrado hoy.
  const payments: ProPayment[] = [];
  members.forEach((m, i) => {
    const plan = plans.find((p) => p.id === m.planId);
    if (!plan || m.status === "trial") return;
    const amount = memberPrice(m, plan);
    const last = m.nextChargeAt ? addMonths(m.nextChargeAt, -1) : m.changedAt ?? m.since;
    if (new Date(last).getTime() < new Date(m.since).getTime()) return;
    const at = m.status === "overdue" ? addMonths(last, -1) : last;
    payments.push({ id: `p${i + 1}`, at, clientName: m.name, concept: `Cuota ${plan.name}`, amountCents: amount, tipCents: 0, method: r.pick(["card", "card", "bizum"] as const) });
    payments.push({ id: `p${i + 1}b`, at: addMonths(at, -1), clientName: m.name, concept: `Cuota ${plan.name}`, amountCents: amount, tipCents: 0, method: "card" });
  });
  if (culture) {
    bookings
      .filter((b) => b.status === "arrived" && b.priceCents)
      .forEach((b, i) => payments.push({ id: `pt${i}`, at: b.start, bookingId: b.id, clientName: b.clientName, concept: "Sala para el grupo", amountCents: b.priceCents, tipCents: 0, method: "card" }));
  }

  const data: ProData = {
    ...base,
    history: makeHistory(r, now, seed.history[0], seed.history[1], seed.history[2]),
    staff,
    bookings,
    payments,
    offers: seed.offers(today, nowMin),
    reviews: makeReviews(r, now, seed.reviews),
    shifts: makeShifts(staff, now, todayHours.open, todayHours.close),
    groupRequests: seed.groups(today, now),
    inbox: inbox(now, seed.inbox),
    campaigns: makeCampaigns(now, seed.campaigns),
  };
  const grown = seedClassGrowth(vertical, seedClassExtras(vertical, data, now), now);
  return seedClassStudy(vertical, grown, now);
}
