import type { ProData, ProStaff, ProUniMetric, ProVerticalId } from "../types";
import type {
  ProUniAppointment,
  ProUniAssocActivity,
  ProUniAudienceSizes,
  ProUniBoardMember,
  ProUniCreditRequest,
  ProUniDeadline,
  ProUniDesk,
  ProUniExtras,
  ProUniFaq,
  ProUniFacultyStat,
  ProUniMarketRoom,
  ProUniMentor,
  ProUniMentorRequest,
  ProUniOfficeSlot,
  ProUniPerk,
  ProUniReadStat,
  UniAssociation,
  UniHousing,
  UniModeration,
  UniPublication,
  UniWelcomeStop,
} from "../university-types";
import { PRIVACY_MIN_GROUP, sealExpiryFor } from "../university";
import { slotTimes } from "../university-office";
import { faqForTopic } from "../university-faq";
import { courseOf } from "../university-renewal";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import {
  clockIn,
  emptyData,
  inbox,
  makeCampaigns,
  makeHistory,
  makeShifts,
  makeSpace,
  personName,
  rng,
  seedFor,
  weekHours,
  type Rng,
} from "./common";

/* ------------------------------------------------------------------ */
/* Tipos del motor (viven en university-types.ts; se reexportan aquí   */
/* porque la web y la app nativa ya los importan desde la demo)        */
/* ------------------------------------------------------------------ */

export type { UniAssociation, UniHousing, UniModeration, UniPublication, UniWelcomeStop };
export { PRIVACY_MIN_GROUP };

export const FACULTIES = [
  "Politécnica",
  "Económicas",
  "Derecho",
  "Ciencias",
  "Educación",
  "Filosofía y Letras",
  "Ciencias de la Salud",
];

export type FacultyIntegration = { faculty: string; firstYear: number; participated: number; activeInFranky: number };

/**
 * Primero por facultad: [facultad, estudiantes, han ido a la bienvenida,
 * activos en Franky a 30 días, apuntados a una asociación]. El último grupo
 * tiene menos de 10 personas y las pantallas lo ocultan.
 */
const FACULTY_ROWS: [string, number, number, number, number][] = [
  ["Politécnica", 1180, 612, 1034, 318],
  ["Económicas", 1320, 834, 1201, 402],
  ["Derecho", 640, 372, 571, 171],
  ["Ciencias", 720, 368, 603, 158],
  ["Educación", 910, 591, 842, 296],
  ["Filosofía y Letras", 860, 517, 781, 243],
  ["Ciencias de la Salud", 780, 402, 702, 167],
  ["Doble grado internacional", 8, 6, 8, 3],
];

/**
 * Integración de primer curso por facultad. Agregado: si un grupo tiene
 * menos de 10 personas, la pantalla lo oculta.
 */
export function facultyIntegration(): FacultyIntegration[] {
  return FACULTY_ROWS.map(([faculty, firstYear, participated, activeInFranky]) => ({
    faculty,
    firstYear,
    participated,
    activeInFranky,
  }));
}

function facultyStats(): ProUniFacultyStat[] {
  return FACULTY_ROWS.map(([faculty, firstYear, participated, active30, joinedAssociation]) => ({
    faculty,
    firstYear,
    participated,
    joinedAssociation,
    active30,
  }));
}

/** Estudiantes activos en Franky de cada público del campus. */
const AUDIENCES: ProUniAudienceSizes = {
  campus: 12640,
  first_year: 5734,
  erasmus: 1120,
  master: 1480,
  residences: 860,
  welcome_absent: 2055,
  faculties: {
    Politécnica: 2480,
    Económicas: 2710,
    Derecho: 1390,
    Ciencias: 1540,
    Educación: 1720,
    "Filosofía y Letras": 1560,
    "Ciencias de la Salud": 1240,
  },
};

/** Lectura confirmada por facultad para un aviso que llegó a `share` de cada una. */
function readsFor(r: Rng, share: number, baseRate: number): ProUniReadStat[] {
  return FACULTIES.map((faculty) => {
    const audience = Math.round((AUDIENCES.faculties[faculty] ?? 0) * share);
    const rate = Math.min(0.95, Math.max(0.2, baseRate + (r.next() - 0.5) * 0.3));
    return { faculty, audience, read: Math.round(audience * rate) };
  });
}

/** Muestra de habitaciones y pisos verificados para el observatorio y el mapa. */
function marketSample(r: Rng): ProUniMarketRoom[] {
  const zones: [string, number, number, number, number, number][] = [
    // zona, habitaciones, precio mín., precio máx., minutos mín., minutos máx.
    ["San Vicente centro", 42, 280, 360, 5, 11],
    ["Tómbola", 36, 265, 340, 9, 15],
    ["Ciudad Jardín", 29, 255, 325, 12, 18],
    ["Alicante centro", 24, 320, 420, 22, 30],
    ["Sant Joan d'Alacant", 7, 300, 380, 24, 32],
  ];
  const rooms: ProUniMarketRoom[] = [];
  for (const [zone, count, minP, maxP, minM, maxM] of zones) {
    for (let i = 0; i < count; i++) {
      rooms.push({ zone, priceCents: r.int(minP, maxP) * 100, minutesToCampus: r.int(minM, maxM), kind: "room" });
    }
    for (let i = 0; i < Math.round(count / 6); i++) {
      rooms.push({ zone, priceCents: r.int(minP + 180, maxP + 260) * 100, minutesToCampus: r.int(minM, maxM), kind: "studio" });
    }
  }
  return rooms;
}

function studentEmail(name: string, i: number): string {
  const plain = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".");
  return `${plain}${i}@alu.campus.es`;
}

/** Solicitudes de créditos con la asistencia registrada por check-in. */
function creditRequests(r: Rng, now: Date): ProUniCreditRequest[] {
  const pending: [string, string, number, number, number][] = [
    // asociación, actividad, horas, sesiones, solicitudes
    ["as1", "Taller de guion", 10, 5, 18],
    ["as3", "Liga interna de debate", 15, 6, 12],
    ["as4", "Hackathon de bienvenida", 20, 4, 26],
    ["as7", "Acompañamiento en el hospital", 12, 6, 9],
  ];
  const done: [string, string, number, number, number][] = [
    ["as1", "Cinefórum de septiembre", 6, 3, 11],
    ["as4", "Curso de impresión 3D", 8, 4, 7],
  ];
  const facultyOf: Record<string, string> = {
    as1: "Filosofía y Letras",
    as3: "Derecho",
    as4: "Politécnica",
    as7: "Ciencias de la Salud",
  };
  const list: ProUniCreditRequest[] = [];
  let i = 0;
  const push = (rows: typeof pending, status: ProUniCreditRequest["status"]) => {
    for (const [associationId, activity, hours, sessions, count] of rows) {
      for (let k = 0; k < count; k++) {
        const student = personName(r);
        // Casi todos cumplen; unos pocos se quedan por debajo del 80 %.
        const attended = status === "pending" && r.chance(0.12) ? Math.max(1, sessions - 2) : sessions;
        list.push({
          id: `cr${++i}`,
          associationId,
          activity,
          student,
          email: studentEmail(student, i),
          faculty: r.chance(0.7) ? facultyOf[associationId] : r.pick(FACULTIES),
          hours,
          attended,
          sessions,
          status,
          decidedAt: status === "validated" ? atLocal(addDays(localDate(now), -10), 11 * 60) : undefined,
        });
      }
    }
  };
  push(pending, "pending");
  push(done, "validated");
  return list;
}

/* ------------------------------------------------------------------ */
/* Atención con cita previa                                            */
/* ------------------------------------------------------------------ */

const OFFICE_SLOTS: ProUniOfficeSlot[] = [
  { id: "o1", weekday: 0, start: 9 * 60 + 30, end: 13 * 60 + 30, minutes: 15, desk: "general", staff: "Pablo Esteve", place: "Mostrador del SAE, Rectorado", online: false },
  { id: "o2", weekday: 1, start: 10 * 60, end: 13 * 60, minutes: 20, desk: "becas", staff: "Lucía Ferrer", place: "Mesa 2 del SAE, Rectorado", online: false },
  { id: "o3", weekday: 1, start: 16 * 60, end: 18 * 60, minutes: 20, desk: "alojamiento", staff: "Pablo Esteve", place: "Mesa 1 del SAE, Rectorado", online: false },
  { id: "o4", weekday: 2, start: 9 * 60 + 30, end: 13 * 60 + 30, minutes: 15, desk: "general", staff: "Pablo Esteve", place: "Mostrador del SAE, Rectorado", online: false },
  { id: "o5", weekday: 2, start: 11 * 60, end: 13 * 60, minutes: 20, desk: "internacional", staff: "Tomás Blasco", place: "Oficina de Movilidad, Germán Bernácer", online: false },
  { id: "o6", weekday: 3, start: 10 * 60, end: 13 * 60, minutes: 20, desk: "becas", staff: "Lucía Ferrer", place: "Mesa 2 del SAE, Rectorado", online: false },
  { id: "o7", weekday: 3, start: 16 * 60, end: 17 * 60 + 30, minutes: 30, desk: "internacional", staff: "Tomás Blasco", place: "Videollamada desde Franky", online: true },
  { id: "o8", weekday: 4, start: 9 * 60 + 30, end: 12 * 60 + 30, minutes: 15, desk: "matricula", staff: "Pablo Esteve", place: "Mostrador del SAE, Rectorado", online: false },
];

/** Lo que escriben los estudiantes al pedir cita, por mesa. */
const TOPICS: Record<ProUniDesk, string[]> = {
  general: [
    "Cambio de grupo de prácticas",
    "Certificado de estar matriculado",
    "Dudas con el carné universitario",
    "Solicitud de compensación de asignaturas",
  ],
  becas: [
    "Me piden el certificado de empadronamiento",
    "Beca del Ministerio: umbral de renta",
    "Ayuda de transporte de la Generalitat",
    "Me han denegado la beca y quiero alegar",
  ],
  alojamiento: [
    "Mi casero no me devuelve la fianza",
    "Busco habitación cerca del campus",
    "Dudas antes de firmar el contrato",
  ],
  internacional: [
    "Learning agreement para febrero",
    "NIE y empadronamiento",
    "Convalidación de asignaturas Erasmus",
  ],
  matricula: [
    "Ampliación de matrícula",
    "Anular una asignatura",
    "Pago fraccionado de la matrícula",
  ],
};

/** Las pasadas casi todas atendidas; alguna no vino o se canceló. */
function appointmentStatus(past: boolean, roll: number): ProUniAppointment["status"] {
  if (!past) return roll < 0.05 ? "cancelled" : "booked";
  if (roll < 0.1) return "no_show";
  if (roll < 0.14) return "cancelled";
  return "done";
}

/**
 * Citas de las dos últimas semanas (atendidas, alguna que no vino) y de la
 * semana que viene (cada vez menos llena cuanto más lejos).
 */
function officeData(r: Rng, now: Date): Pick<ProUniExtras, "officeSlots" | "appointments" | "helpWeeks"> {
  const today = localDate(now);
  const nowMinutes = localMinutes(now);
  const appointments: ProUniAppointment[] = [];
  let n = 0;
  for (let offset = -14; offset <= 8; offset++) {
    const date = addDays(today, offset);
    const weekday = weekdayIndex(date);
    const fill = offset < 0 ? 0.78 : offset === 0 ? 0.72 : Math.max(0.18, 0.68 - offset * 0.07);
    for (const slot of OFFICE_SLOTS.filter((s) => s.weekday === weekday)) {
      for (const start of slotTimes(slot)) {
        if (!r.chance(fill)) continue;
        const past = offset < 0 || (offset === 0 && start < nowMinutes);
        const status = appointmentStatus(past, r.next());
        appointments.push({
          id: `ap${++n}`,
          slotId: slot.id,
          date,
          start,
          desk: slot.desk,
          student: personName(r),
          faculty: r.pick(FACULTIES),
          topic: r.pick(TOPICS[slot.desk]),
          status,
          via: r.chance(0.86) ? "franky" : "desk",
          createdAt: atLocal(addDays(date, -r.int(1, 6)), r.int(9 * 60, 22 * 60)),
        });
      }
    }
  }

  // Pulsaciones de "Pedir ayuda": suben con el arranque del curso y los primeros
  // parciales, como cuentan los servicios de atención psicológica cada otoño.
  const presses = [5, 3, 7, 12, 19, 26, 24, 31, 38, 44];
  const monday = addDays(today, -weekdayIndex(today));
  const helpWeeks = presses.map((p, i) => ({ week: addDays(monday, -7 * (presses.length - 1 - i)), presses: p }));
  return { officeSlots: OFFICE_SLOTS, appointments, helpWeeks };
}

/* ------------------------------------------------------------------ */
/* Preguntas frecuentes                                                */
/* ------------------------------------------------------------------ */

/**
 * Las dudas de cada octubre. Algunos temas de la cita previa ya tienen
 * respuesta (empadronamiento, fianza, certificado de matrícula) y otros no
 * (anular una asignatura, learning agreement): así la pantalla propone
 * preguntas nuevas con datos. La del NIE convence poco y pide reescritura.
 */
function faqData(now: Date): ProUniFaq[] {
  const updated = (daysAgo: number) => atLocal(addDays(localDate(now), -daysAgo), 10 * 60);
  return [
    {
      id: "fq1",
      desk: "becas",
      question: "¿Cómo consigo el certificado de empadronamiento para la beca?",
      answer:
        "Lo pides en la sede electrónica de tu ayuntamiento con certificado digital o Cl@ve, o en persona en la oficina del padrón. En San Vicente sale en el momento. Para la beca vale el colectivo si vives con tu familia.",
      questionEn: "How do I get the registration certificate (empadronamiento) for my grant?",
      answerEn:
        "Request it on your town hall's website with a digital certificate or Cl@ve, or in person at the census office. In San Vicente you get it on the spot.",
      keywords: ["padrón", "empadronamiento", "certificado"],
      opens: 1284,
      opensWeek: 212,
      helpful: 318,
      unhelpful: 41,
      updatedAt: updated(12),
    },
    {
      id: "fq2",
      desk: "becas",
      question: "¿Qué umbral de renta tiene la beca del Ministerio?",
      answer:
        "Depende de cuántas personas sois en casa. Mira la tabla de umbrales en la convocatoria del curso y usa el simulador del Ministerio antes de pedirla. Si te quedas cerca del límite, pídela igualmente.",
      keywords: ["renta", "umbral", "ministerio", "beca general"],
      opens: 962,
      opensWeek: 188,
      helpful: 204,
      unhelpful: 38,
      updatedAt: updated(20),
    },
    {
      id: "fq3",
      desk: "alojamiento",
      question: "Mi casero no me devuelve la fianza, ¿qué hago?",
      answer:
        "Pídesela por escrito (correo o burofax) con la fecha en que dejaste el piso. Tiene un mes desde que entregas las llaves. Si no responde, ven a la mesa de alojamiento con el contrato: te ayudamos a reclamar en el organismo de tu comunidad.",
      keywords: ["fianza", "casero", "depósito", "devolver"],
      opens: 740,
      opensWeek: 96,
      helpful: 171,
      unhelpful: 22,
      updatedAt: updated(35),
    },
    {
      id: "fq4",
      desk: "general",
      question: "¿Dónde descargo el certificado de estar matriculado?",
      answer:
        "En la secretaría virtual, apartado Expediente, Certificados. Es gratis y lleva código de verificación: vale para el abono de transporte, el banco o el alquiler.",
      questionEn: "Where can I download my enrolment certificate?",
      answerEn: "In the virtual office, under Academic record, Certificates. It is free and has a verification code.",
      keywords: ["certificado", "matrícula", "matriculado", "secretaría"],
      opens: 1102,
      opensWeek: 154,
      helpful: 402,
      unhelpful: 19,
      updatedAt: updated(8),
    },
    {
      id: "fq5",
      desk: "internacional",
      question: "¿Cómo pido el NIE si vengo de Erasmus?",
      answer: "Pide cita en extranjería y lleva el pasaporte.",
      questionEn: "How do I get my NIE as an Erasmus student?",
      answerEn: "Book an appointment at the immigration office and bring your passport.",
      keywords: ["NIE", "extranjería", "Erasmus", "empadronamiento"],
      opens: 530,
      opensWeek: 71,
      helpful: 44,
      unhelpful: 61,
      updatedAt: updated(60),
    },
    {
      id: "fq6",
      desk: "matricula",
      question: "¿Puedo pagar la matrícula a plazos?",
      answer:
        "Sí. Al matricularte eliges pago fraccionado y los plazos se cargan en tu cuenta. Si ya te has matriculado en un solo pago, puedes cambiarlo en la secretaría virtual dentro del plazo que marca el calendario académico.",
      keywords: ["plazos", "fraccionado", "pago", "domiciliación"],
      opens: 688,
      opensWeek: 83,
      helpful: 190,
      unhelpful: 12,
      updatedAt: updated(15),
    },
    {
      id: "fq7",
      desk: "general",
      question: "He perdido el carné universitario, ¿cómo pido otro?",
      answer:
        "Pide el duplicado en la secretaría virtual. Tarda unos días y mientras tanto el carné digital de la app de la universidad vale para la biblioteca y el comedor.",
      keywords: ["carné", "carnet", "tarjeta", "duplicado"],
      opens: 214,
      opensWeek: 18,
      helpful: 58,
      unhelpful: 9,
      updatedAt: updated(40),
      hidden: true,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Mentores de primero                                                 */
/* ------------------------------------------------------------------ */

/** [nombre, facultad, curso, plazas]. Ciencias tiene un solo mentor y ya lleno. */
const MENTOR_ROWS: [string, string, number, number][] = [
  ["Marta Llorens", "Politécnica", 3, 4],
  ["Adrián Beltrán", "Politécnica", 4, 4],
  ["Irene Cano", "Politécnica", 2, 3],
  ["Hugo Tormo", "Politécnica", 3, 3],
  ["Sergio Maestre", "Económicas", 3, 4],
  ["Paula Giner", "Económicas", 4, 4],
  ["Claudia Ramos", "Económicas", 2, 3],
  ["Mario Bernabeu", "Económicas", 3, 3],
  ["Rubén Sala", "Derecho", 4, 4],
  ["Elena Mira", "Derecho", 3, 4],
  ["Sara Poveda", "Derecho", 5, 4],
  ["Julia Ortuño", "Ciencias", 3, 3],
  ["Nacho Sempere", "Educación", 3, 4],
  ["Alba Cerdá", "Educación", 2, 4],
  ["Iván Lillo", "Educación", 4, 3],
  ["Diego Payá", "Filosofía y Letras", 4, 4],
  ["Andrea Maciá", "Filosofía y Letras", 3, 4],
  ["Óscar Gisbert", "Filosofía y Letras", 2, 3],
  ["Noa Ribera", "Ciencias de la Salud", 3, 4],
  ["Candela Pomares", "Ciencias de la Salud", 5, 4],
  ["Joel Asensi", "Ciencias de la Salud", 4, 3],
];

function mentorData(r: Rng, now: Date): Pick<ProUniExtras, "mentors" | "mentorRequests"> {
  const today = localDate(now);
  const mentors: ProUniMentor[] = MENTOR_ROWS.map(([name, faculty, year, capacity], i) => ({
    id: `me${i + 1}`,
    name,
    faculty,
    year,
    capacity,
    active: true,
    since: atLocal(addDays(today, -40 + i), 12 * 60),
  }));
  const requests: ProUniMentorRequest[] = [];
  let n = 0;
  // Cada mentor acompaña a casi todas sus plazas; algunos aún no se han escrito.
  for (const m of mentors) {
    const load = m.faculty === "Ciencias" ? m.capacity : Math.max(1, m.capacity - r.int(0, 1));
    for (let k = 0; k < load; k++) {
      const askedDaysAgo = r.int(6, 24);
      requests.push({
        id: `mr${++n}`,
        faculty: m.faculty,
        at: atLocal(addDays(today, -askedDaysAgo), r.int(10 * 60, 23 * 60)),
        international: r.chance(0.12),
        status: "matched",
        mentorId: m.id,
        matchedAt: atLocal(addDays(today, -askedDaysAgo + 1), 11 * 60),
        talked: r.chance(0.84),
      });
    }
  }
  // Los que esperan: tres de Ciencias sin mentor libre y otros con hueco.
  const waiting: [string, number, boolean][] = [
    ["Ciencias", 4, false],
    ["Ciencias", 2, false],
    ["Ciencias", 1, true],
    ["Politécnica", 1, false],
    ["Derecho", 2, false],
    ["Económicas", 0, true],
  ];
  for (const [faculty, daysAgo, international] of waiting) {
    requests.push({
      id: `mr${++n}`,
      faculty,
      at: atLocal(addDays(today, -daysAgo), r.int(10 * 60, 22 * 60)),
      international,
      status: "waiting",
    });
  }
  return { mentors, mentorRequests: requests };
}

/* ------------------------------------------------------------------ */
/* Juntas y renovación anual                                           */
/* ------------------------------------------------------------------ */

function board(president: string, secretary: string, treasurer?: string): ProUniBoardMember[] {
  const list: ProUniBoardMember[] = [
    { role: "presidencia", name: president },
    { role: "secretaria", name: secretary },
  ];
  if (treasurer) list.push({ role: "tesoreria", name: treasurer });
  return list;
}

/* ------------------------------------------------------------------ */
/* Demo                                                                */
/* ------------------------------------------------------------------ */

export function buildUniversityDemo(vertical: ProVerticalId, now: Date): ProData {
  const r = rng(seedFor(vertical));
  const today = localDate(now);
  const open = 8 * 60 + 30;
  const close = 20 * 60 + 30;
  const monday = addDays(today, -weekdayIndex(today));
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

  const space = makeSpace(vertical, {
    name: "Servicio al Estudiante, campus de Alicante",
    city: "San Vicente del Raspeig",
    address: "Servicio de Atención al Estudiante, edificio de Rectorado",
    slug: "universidad-demo",
    owner: { name: "Carmen Soler", firstName: "Carmen" },
    hours: weekHours(open, close, { saturday: null }),
    campus: "Campus de San Vicente del Raspeig",
    walkMinutesToCampus: 0,
    rating: 4.6,
    reviewsCount: 0,
    publicProfile: {
      description:
        "Espacio oficial del Servicio de Atención al Estudiante: avisos, bienvenida, alojamiento verificado y asociaciones del campus.",
      photos: 12,
      bookingEnabled: false,
      cardEnabled: false,
      cardDiscountPct: 0,
    },
  });

  const staffSeed: Omit<ProStaff, "clockedInAt" | "weekMinutes">[] = [
    { id: "s1", name: "Carmen Soler", role: "owner", tone: "violet", title: "Responsable del servicio", commissionPct: 0 },
    { id: "s2", name: "Javier Pastor", role: "editor", tone: "sky", title: "Comunicación", commissionPct: 0 },
    { id: "s3", name: "Nerea Vidal", role: "manager", tone: "emerald", title: "Moderación del campus", commissionPct: 0 },
    { id: "s4", name: "Tomás Blasco", role: "editor", tone: "amber", title: "Relaciones internacionales, Erasmus", commissionPct: 0 },
  ];
  const staff: ProStaff[] = staffSeed.map((s, i) => ({
    ...s,
    clockedInAt: i < 3 ? clockIn(today, open, i, now) : null,
    weekMinutes: 1800 + i * 120,
  }));

  const metrics: ProUniMetric[] = [
    { key: "active", label: "Estudiantes activos en Franky", value: AUDIENCES.campus, delta: 6.2, hint: "Del campus, últimos 30 días" },
    { key: "welcome", label: "De primero en la bienvenida", value: 58, unit: "%", delta: 12, hint: "Han ido a alguna actividad" },
    { key: "associations", label: "Asociaciones activas", value: 64, delta: 4.9, hint: "Con alguna actividad este mes" },
    { key: "events", label: "Eventos este mes", value: 212, delta: 18.4, hint: "Del campus y alrededores" },
    { key: "housing", label: "Pisos verificados", value: 386, delta: 11.9, hint: "Visibles para quien llega" },
    { key: "reports", label: "Reportes resueltos", value: 94, unit: "%", delta: 3, hint: "De los recibidos este mes" },
    { key: "reach", label: "Alcance medio por publicación", value: 4380, delta: 22.1, hint: "Estudiantes que la vieron" },
  ];

  /* ---------------- Calendario del curso ---------------- */

  const deadlines: ProUniDeadline[] = [
    { id: "d1", title: "Último día para modificar la matrícula", date: addDays(today, 4), kind: "matricula", audience: "first_year" },
    { id: "d2", title: "Becas del Ministerio: fin del plazo", date: addDays(today, 9), kind: "becas", audience: "campus" },
    { id: "d3", title: "Semana del bienestar", date: addDays(today, 14), kind: "bienestar", audience: "campus" },
    { id: "d4", title: "Elecciones a delegados de curso", date: addDays(today, 23), kind: "elecciones", audience: "campus" },
    { id: "d5", title: "Convocatoria Erasmus del curso que viene", date: addDays(today, 41), kind: "erasmus", audience: "campus" },
    { id: "d6", title: "Empiezan los exámenes de enero", date: addDays(today, 102), kind: "examenes", audience: "campus" },
    { id: "d7", title: "Llegan los Erasmus de febrero", date: addDays(today, 128), kind: "erasmus", audience: "erasmus" },
  ];

  /* ---------------- Publicaciones ---------------- */

  const publications: UniPublication[] = [
    {
      id: "p0",
      title: "Aulario II sin luz: las clases pasan al Aulario III hasta nuevo aviso",
      channel: "aviso",
      at: minutesAgo(25),
      reach: 3120,
      reactions: 88,
      status: "published",
      audience: "Todo el campus",
      audienceKey: "campus",
      body: "Hay un corte de luz en el Aulario II. Las clases de hoy se dan en el Aulario III, en el mismo aula por número. Te avisamos aquí en cuanto vuelva la luz.",
      official: true,
      readReceipt: true,
      reads: readsFor(r, 0.62, 0.48),
      urgent: { kind: "other", until: new Date(now.getTime() + 95 * 60000).toISOString() },
      titleEn: "No power in Aulario II: classes move to Aulario III until further notice",
      bodyEn: "There is a power cut in Aulario II. Today's classes take place in Aulario III, same room number. We will update you here as soon as power is back.",
    },
    {
      id: "p1",
      title: "Semana de bienvenida: todo lo que pasa en el campus",
      channel: "fomo",
      at: atLocal(addDays(today, -12), 9 * 60),
      reach: 9840,
      reactions: 1126,
      status: "published",
      audience: "Todo el campus",
      audienceKey: "campus",
      body: "Visitas guiadas, feria de asociaciones y el concierto de bienvenida. Recoge tu pasaporte y consigue sellos.",
      official: true,
    },
    {
      id: "p2",
      title: "Feria de asociaciones: más de 60 stands en la plaza central",
      channel: "evento",
      at: atLocal(addDays(today, -19), 10 * 60),
      reach: 7210,
      reactions: 860,
      status: "published",
      audience: "Primer curso",
      audienceKey: "first_year",
      official: true,
    },
    {
      id: "p3",
      title: "Horario ampliado de la biblioteca general",
      channel: "aviso",
      at: atLocal(addDays(today, -5), 12 * 60),
      reach: 5320,
      reactions: 412,
      status: "published",
      audience: "Todo el campus",
      audienceKey: "campus",
      body: "Desde el lunes, la biblioteca general abre de 8:00 a 23:00 de lunes a viernes, y los sábados de 9:00 a 21:00.",
      official: true,
      readReceipt: true,
      reads: readsFor(r, 0.62, 0.71),
    },
    {
      id: "p4",
      title: "Becas del Ministerio: el plazo cierra pronto",
      channel: "aviso",
      at: atLocal(addDays(today, -3), 9 * 60),
      reach: 6890,
      reactions: 534,
      status: "published",
      audience: "Todo el campus",
      audienceKey: "campus",
      body: "Si todavía no la has pedido, estás a tiempo. Necesitas tu certificado de empadronamiento y los datos de la renta familiar. Dudas: Servicio de Atención al Estudiante.",
      official: true,
      readReceipt: true,
      reads: readsFor(r, 0.62, 0.58),
      reminders: [{ at: atLocal(addDays(today, -1), 18 * 60), sentTo: 3480 }],
      deadlineId: "d2",
    },
    {
      id: "p5",
      title: "Deportes: inscripción en las ligas internas",
      channel: "fomo",
      at: atLocal(addDays(today, -1), 17 * 60),
      reach: 2180,
      reactions: 301,
      status: "published",
      audience: "Todo el campus",
      audienceKey: "campus",
      official: true,
    },
    {
      id: "p6",
      title: "Reunión informativa para Erasmus de febrero",
      channel: "evento",
      at: atLocal(addDays(today, 9), 12 * 60),
      reach: 0,
      reactions: 0,
      status: "scheduled",
      audience: "Erasmus e internacionales",
      audienceKey: "erasmus",
      body: "Trámites de llegada, alojamiento verificado y cómo funciona el pasaporte Erasmus con ESN Alicante.",
      official: true,
      titleEn: "Information session for February Erasmus students",
      bodyEn: "Arrival paperwork, verified housing and how the Erasmus passport works with ESN Alicante.",
    },
    {
      id: "p7",
      title: "Semana de la salud mental: talleres y atención psicológica",
      channel: "fomo",
      at: atLocal(addDays(today, 14), 9 * 60),
      reach: 0,
      reactions: 0,
      status: "draft",
      audience: "Todo el campus",
      audienceKey: "campus",
      body: "Talleres de gestión del estrés, sueño y ansiedad ante los exámenes. Si necesitas hablar con alguien, pulsa \"Pedir ayuda\".",
      official: true,
      help: true,
      deadlineId: "d3",
    },
  ];

  /* ---------------- Bienvenida ---------------- */

  const survey = (a: number, b: number, c: number) => ({
    question: "¿Qué te ha parecido?",
    options: ["Me ha servido mucho", "Está bien", "No me ha servido"] as [string, string, string],
    answers: [a, b, c] as [number, number, number],
  });

  const welcome: UniWelcomeStop[] = [
    { id: "w1", title: "Recogida del pasaporte de bienvenida", date: atLocal(addDays(monday, -14), 10 * 60), place: "Plaza central del campus", checkins: 2140, capacity: 3000, kind: "bienvenida", code: "BIEN-01", survey: survey(612, 488, 71) },
    { id: "w2", title: "Visita guiada al campus", date: atLocal(addDays(monday, -13), 11 * 60), place: "Salida desde el Rectorado", checkins: 684, capacity: 800, kind: "bienvenida", code: "BIEN-02", survey: survey(301, 142, 23) },
    { id: "w3", title: "Feria de asociaciones", date: atLocal(addDays(monday, -12), 11 * 60), place: "Plaza central del campus", checkins: 1860, capacity: 2500, kind: "bienvenida", code: "BIEN-03", survey: survey(702, 390, 58) },
    { id: "w4", title: "Taller de campus virtual y sede electrónica", date: atLocal(addDays(monday, -11), 16 * 60), place: "Aula magna, Politécnica", checkins: 312, capacity: 400, kind: "bienvenida", code: "BIEN-04", survey: survey(96, 104, 41) },
    { id: "w5", title: "Concierto de bienvenida", date: atLocal(addDays(monday, -9), 20 * 60), place: "Explanada del pabellón de deportes", checkins: 2480, capacity: 3500, kind: "bienvenida", code: "BIEN-05", survey: survey(1210, 380, 44) },
    { id: "w6", title: "Jornada de deportes y ligas internas", date: atLocal(addDays(today, 2), 17 * 60), place: "Pabellón de deportes", checkins: 0, capacity: 600, kind: "bienvenida", code: "BIEN-06", survey: survey(0, 0, 0) },
    { id: "w7", title: "Picnic internacional Erasmus", titleEn: "Erasmus international picnic", date: atLocal(addDays(today, 5), 13 * 60), place: "Jardín de la Biblioteca general", checkins: 0, capacity: 350, kind: "erasmus", code: "ERAS-01", survey: survey(0, 0, 0) },
  ];

  const perks: ProUniPerk[] = [
    { id: "k1", business: "Café Hilo", sector: "Cafetería", perk: "Café y tostada a 2 €", walkMinutes: 4, enabled: true, slug: "cafe-hilo", redeemed: 312 },
    { id: "k2", business: "La Tasca del Campus", sector: "Bar", perk: "Caña y tapa a 2,50 €", walkMinutes: 6, enabled: true, slug: "tasca-del-campus", redeemed: 204 },
    { id: "k3", business: "Sala Silencio", sector: "Sala de estudio", perk: "Un día de sala de estudio gratis", walkMinutes: 9, enabled: true, slug: "sala-silencio", redeemed: 141 },
    { id: "k4", business: "Barbería Nómada", sector: "Peluquería", perk: "15 % en el primer corte", walkMinutes: 8, enabled: true, slug: "barberia-nomada", redeemed: 96 },
    { id: "k5", business: "Box Levante", sector: "Gimnasio", perk: "Primera semana gratis", walkMinutes: 11, enabled: false, slug: "box-levante", redeemed: 0 },
    { id: "k6", business: "Pádel Raspeig", sector: "Pádel", perk: "Pista a mitad de precio un día entre semana", walkMinutes: 14, enabled: false, slug: "padel-raspeig", redeemed: 0 },
  ];

  /* ---------------- Alojamiento ---------------- */

  const standardChecks = (ok: boolean[]) =>
    ["Identidad del propietario", "Referencia catastral y cédula de habitabilidad", "Fotos que coinciden con el piso", "Contrato tipo sin cláusulas abusivas", "Precio y gastos claros"].map((label, i) => ({ label, ok: ok[i] ?? false }));
  const allOk = standardChecks([true, true, true, true, true]);
  const H7_TEXT =
    "Habitación exterior con ventana a la calle en piso de cuatro estudiantes. Cama de 135, escritorio, armario empotrado y calefacción. Gastos de luz, agua e internet incluidos. A dos minutos de la parada del tranvía y del Mercadona.";
  const verifiedOn = (daysAgo: number) => {
    const at = atLocal(addDays(today, -daysAgo), 12 * 60);
    return { verifiedAt: at, verifiedUntil: sealExpiryFor(at) };
  };

  const housing: UniHousing[] = [
    { id: "h1", title: "Habitación en piso de 4, calle Alicante", owner: "Habitat Campus", zone: "San Vicente centro", priceCents: 32000, verified: false, complaints: 0, status: "pending", rooms: 4, minutesToCampus: 7, submittedAt: atLocal(addDays(today, -1), 10 * 60), checks: allOk },
    { id: "h2", title: "Estudio junto a la parada del tranvía", owner: "Antonio Pérez", zone: "Tómbola", priceCents: 52000, verified: false, complaints: 0, status: "pending", rooms: 1, minutesToCampus: 12, submittedAt: atLocal(addDays(today, -2), 18 * 60), checks: standardChecks([true, true, false, true, true]) },
    { id: "h3", title: "Habitación con baño, Ciudad Jardín", owner: "María José Soler", zone: "Ciudad Jardín", priceCents: 36000, verified: false, complaints: 0, status: "pending", rooms: 3, minutesToCampus: 15, submittedAt: atLocal(addDays(today, -2), 9 * 60), checks: standardChecks([true, false, true, true, false]) },
    { id: "h4", title: "Piso entero de 3 habitaciones, Alicante centro", owner: "Inmobiliaria Luceros", zone: "Alicante centro", priceCents: 98000, verified: false, complaints: 0, status: "pending", rooms: 3, minutesToCampus: 25, submittedAt: atLocal(addDays(today, -4), 12 * 60), checks: standardChecks([true, true, true, false, true]) },
    { id: "h5", title: "Ático Avenida de la Libertad", owner: "Habitat Campus", zone: "San Vicente centro", priceCents: 34000, verified: true, complaints: 0, status: "verified", rooms: 3, minutesToCampus: 9, submittedAt: atLocal(addDays(today, -40), 12 * 60), checks: allOk, ...verifiedOn(38) },
    {
      id: "h6",
      title: "Habitación en dúplex Río Turia",
      owner: "Habitat Campus",
      zone: "Tómbola",
      priceCents: 30000,
      verified: true,
      complaints: 2,
      status: "verified",
      rooms: 3,
      minutesToCampus: 12,
      submittedAt: atLocal(addDays(today, -60), 12 * 60),
      checks: allOk,
      complaintNote: "Dos inquilinos dicen que la fianza no se ha depositado en la Generalitat.",
      ...verifiedOn(58),
      case: {
        id: "c1",
        openedAt: atLocal(addDays(today, -9), 10 * 60),
        dueAt: atLocal(addDays(today, -2), 10 * 60),
        message: "Dos inquilinos nos dicen que su fianza no está depositada en la Generalitat. Envíanos el justificante del depósito.",
        status: "open",
      },
    },
    {
      id: "h7",
      title: "Habitación exterior, calle Pintor Pérez Gil",
      description: H7_TEXT,
      owner: "Rafael Gomis",
      zone: "Tómbola",
      priceCents: 29000,
      verified: true,
      complaints: 0,
      status: "verified",
      rooms: 4,
      minutesToCampus: 13,
      submittedAt: atLocal(addDays(today, -75), 12 * 60),
      checks: allOk,
      ...verifiedOn(73),
    },
    // Copia del anuncio de h7 con otro propietario y más barato: el patrón de
    // estafa de cada septiembre. Pasa casi todas las comprobaciones de papel.
    {
      id: "h13",
      title: "Habitación exterior en calle Pintor Pérez Gil",
      description: `${H7_TEXT} Para reservarla hay que adelantar la fianza por transferencia, estoy fuera de Alicante.`,
      owner: "Sergio Molina",
      zone: "Tómbola",
      priceCents: 24000,
      verified: false,
      complaints: 0,
      status: "pending",
      rooms: 4,
      minutesToCampus: 13,
      submittedAt: minutesAgo(140),
      checks: standardChecks([true, true, false, true, true]),
    },
    {
      id: "h8",
      title: "Adosado Guadalquivir, 5 habitaciones",
      owner: "Habitat Campus",
      zone: "Ciudad Jardín",
      priceCents: 31000,
      verified: true,
      complaints: 1,
      status: "verified",
      rooms: 5,
      minutesToCampus: 15,
      submittedAt: atLocal(addDays(today, -90), 12 * 60),
      checks: allOk,
      complaintNote: "Una queja por ruido de obras en la finca, ya en seguimiento.",
      ...verifiedOn(88),
      case: {
        id: "c2",
        openedAt: atLocal(addDays(today, -6), 12 * 60),
        dueAt: atLocal(addDays(today, 4), 12 * 60),
        message: "Una inquilina nos cuenta que hay obras en la finca de 8:00 a 20:00 desde hace un mes. ¿Cuándo terminan?",
        status: "answered",
        reply: "Las obras de la fachada acaban el día 15. Hemos ofrecido a la inquilina un descuento en el alquiler de este mes.",
        repliedAt: atLocal(addDays(today, -4), 17 * 60),
      },
    },
    { id: "h9", title: "Habitación en piso compartido, Novelda", owner: "Luis Martí", zone: "Ciudad Jardín", priceCents: 27500, verified: true, complaints: 0, status: "verified", rooms: 4, minutesToCampus: 16, submittedAt: atLocal(addDays(today, -32), 12 * 60), checks: allOk, ...verifiedOn(30) },
    { id: "h10", title: "Habitación sin contrato, pago en efectivo", owner: "Particular sin identificar", zone: "San Vicente centro", priceCents: 25000, verified: false, complaints: 3, status: "rejected", rooms: 5, minutesToCampus: 8, submittedAt: atLocal(addDays(today, -8), 12 * 60), checks: standardChecks([false, false, true, false, false]), reason: "No acredita la identidad ni ofrece contrato. Pide la fianza en efectivo." },
    { id: "h11", title: "Habitación en piso de estudiantes, calle Lillo Juan", owner: "Rafael Gomis", zone: "San Vicente centro", priceCents: 28500, verified: true, complaints: 0, status: "verified", rooms: 4, minutesToCampus: 6, submittedAt: atLocal(addDays(today, -425), 12 * 60), checks: allOk, ...verifiedOn(420) },
    { id: "h12", title: "Piso de 4 habitaciones junto al tranvía", owner: "Habitat Campus", zone: "Tómbola", priceCents: 30500, verified: true, complaints: 0, status: "verified", rooms: 4, minutesToCampus: 11, submittedAt: atLocal(addDays(today, -390), 12 * 60), checks: allOk, ...verifiedOn(385), renewalRequestedAt: atLocal(addDays(today, -20), 10 * 60) },
  ];

  /* ---------------- Asociaciones ---------------- */

  const associations: UniAssociation[] = [
    { id: "as1", name: "Hilo Rojo, cine y cultura", members: 180, activities: 9, registered: true, subsidyStatus: "granted", ectsRequests: 18, faculty: "Filosofía y Letras", ectsHours: 10, lastActivityAt: atLocal(addDays(today, -6), 19 * 60), subsidyCents: 120000 },
    { id: "as2", name: "ESN Alicante", members: 420, activities: 14, registered: true, subsidyStatus: "submitted", ectsRequests: 0, faculty: "Todo el campus", lastActivityAt: atLocal(addDays(today, -2), 22 * 60), subsidyCents: 350000 },
    { id: "as3", name: "Club de Debate", members: 64, activities: 5, registered: true, subsidyStatus: "none", ectsRequests: 12, faculty: "Derecho", ectsHours: 15, lastActivityAt: atLocal(addDays(today, -4), 18 * 60) },
    { id: "as4", name: "Asociación de Estudiantes de Ingeniería", members: 210, activities: 7, registered: true, subsidyStatus: "granted", ectsRequests: 26, faculty: "Politécnica", ectsHours: 20, lastActivityAt: atLocal(addDays(today, -3), 17 * 60), subsidyCents: 280000 },
    { id: "as5", name: "Coro universitario", members: 48, activities: 4, registered: true, subsidyStatus: "submitted", ectsRequests: 0, faculty: "Educación", lastActivityAt: atLocal(addDays(today, -7), 19 * 60), subsidyCents: 90000 },
    { id: "as6", name: "Club de Montaña", members: 132, activities: 6, registered: true, subsidyStatus: "none", ectsRequests: 0, faculty: "Todo el campus", lastActivityAt: atLocal(addDays(today, -9), 8 * 60) },
    { id: "as7", name: "Voluntariado Solidario del campus", members: 96, activities: 8, registered: true, subsidyStatus: "granted", ectsRequests: 9, faculty: "Ciencias de la Salud", ectsHours: 12, lastActivityAt: atLocal(addDays(today, -1), 10 * 60), subsidyCents: 150000 },
    { id: "as8", name: "Asociación de Videojuegos y eSports", members: 158, activities: 5, registered: true, subsidyStatus: "none", ectsRequests: 0, faculty: "Politécnica", lastActivityAt: atLocal(addDays(today, -5), 18 * 60) },
    {
      id: "as9",
      name: "Club de Ajedrez",
      members: 22,
      activities: 2,
      registered: false,
      subsidyStatus: "none",
      ectsRequests: 0,
      faculty: "Ciencias",
      pendingRegistration: true,
      lastActivityAt: atLocal(addDays(today, -11), 17 * 60),
      docs: [
        { key: "statutes", ok: true },
        { key: "founding", ok: true },
        { key: "board", ok: true },
        { key: "members", ok: true },
        { key: "plan", ok: false },
      ],
    },
    {
      id: "as10",
      name: "Teatro Universitario Tramoya",
      members: 37,
      activities: 3,
      registered: false,
      subsidyStatus: "none",
      ectsRequests: 0,
      faculty: "Filosofía y Letras",
      pendingRegistration: true,
      lastActivityAt: atLocal(addDays(today, -15), 20 * 60),
      docs: [
        { key: "statutes", ok: true },
        { key: "founding", ok: false },
        { key: "board", ok: false },
        { key: "members", ok: true },
        { key: "plan", ok: false },
      ],
      docsRequestedAt: atLocal(addDays(today, -3), 11 * 60),
    },
  ];

  /*
   * Juntas y renovación del curso: la mitad ya ha renovado, alguna va a medias,
   * a otras ya se les pidió y quedan tres sin pedir. Hilo Rojo cambió de junta
   * este septiembre y conserva sus créditos y documentos.
   */
  const course = courseOf(now);
  const renewedAt = (daysAgo: number) => atLocal(addDays(today, -daysAgo), 12 * 60);
  const renewal = {
    done: (daysAgo: number) => ({ course, boardConfirmed: true, membersConfirmed: true, requestedAt: renewedAt(daysAgo + 6), completedAt: renewedAt(daysAgo) }),
    partial: (daysAgo: number) => ({ course, boardConfirmed: true, membersConfirmed: false, requestedAt: renewedAt(daysAgo) }),
    requested: (daysAgo: number) => ({ course, boardConfirmed: false, membersConfirmed: false, requestedAt: renewedAt(daysAgo) }),
  };
  const governance: Record<string, Partial<UniAssociation>> = {
    as1: {
      board: board("Lucía Navarro", "Hugo Ferrándiz", "Irene Alberola"),
      renewal: renewal.done(4),
      handovers: [{ at: renewedAt(5), course, from: "Carla Juan", to: "Lucía Navarro" }],
    },
    as2: { board: board("Martina Rossi", "Unai Etxeberria", "Emma Schulz"), renewal: renewal.done(9) },
    as3: { board: board("Gonzalo Iborra", "Vera Candela"), renewal: renewal.partial(7) },
    as4: { board: board("Samuel Ruiz", "Aitana Molina", "Joel Pastor"), renewal: renewal.done(12) },
    as5: { board: board("Inés Carbonell", "Bruno Seva"), renewal: renewal.requested(6) },
    as6: { board: board("Héctor Botella", "Blanca Linares", "Leo Guillén") },
    as7: { board: board("Celia Amorós", "Jorge Vicent", "Lola Esclapez"), renewal: renewal.done(2) },
    as8: { board: board("Víctor Planelles", "Ainhoa Cremades") },
    as9: { board: board("Óscar Peral", "Inés Marco") },
    as10: { board: board("Candela Soriano", "Raúl Picó") },
  };
  for (const a of associations) Object.assign(a, governance[a.id]);
  // Una del registro sin junta ni renovación: la que menos ha usado Franky.
  associations.push({
    id: "as11",
    name: "Asociación de Estudiantes de Farmacia",
    members: 41,
    activities: 1,
    registered: true,
    subsidyStatus: "none",
    ectsRequests: 0,
    faculty: "Ciencias de la Salud",
    lastActivityAt: atLocal(addDays(today, -52), 18 * 60),
  });

  /** Actividades de esta semana y la siguiente; dos coinciden en el mismo aula. */
  const at = (days: number, minutes: number) => atLocal(addDays(monday, days), minutes);
  const assocActivities: ProUniAssocActivity[] = [
    { id: "aa1", associationId: "as1", title: "Cinefórum: El espíritu de la colmena", start: at(3, 18 * 60), end: at(3, 20 * 60 + 30), place: "Aula 12, Filosofía y Letras" },
    { id: "aa2", associationId: "as10", title: "Ensayo abierto de Tramoya", start: at(3, 19 * 60), end: at(3, 21 * 60), place: "Aula 12, Filosofía y Letras" },
    { id: "aa3", associationId: "as2", title: "Tapeo internacional", start: at(2, 21 * 60), end: at(2, 23 * 60 + 30), place: "Plaza central del campus" },
    { id: "aa4", associationId: "as3", title: "Liga interna de debate, jornada 3", start: at(1, 17 * 60), end: at(1, 19 * 60), place: "Seminario 2, Derecho" },
    { id: "aa5", associationId: "as4", title: "Taller de Arduino", start: at(4, 16 * 60), end: at(4, 19 * 60), place: "Laboratorio 0.14, Politécnica" },
    { id: "aa6", associationId: "as6", title: "Salida al Puig Campana", start: at(5, 8 * 60), end: at(5, 16 * 60), place: "Salida desde el aparcamiento norte" },
    { id: "aa7", associationId: "as5", title: "Ensayo del coro", start: at(9, 19 * 60), end: at(9, 21 * 60), place: "Aula magna, Educación" },
    { id: "aa8", associationId: "as8", title: "Torneo de bienvenida de Mario Kart", start: at(10, 17 * 60), end: at(10, 21 * 60), place: "Aula magna, Educación" },
    { id: "aa9", associationId: "as7", title: "Formación de voluntariado", start: at(8, 10 * 60), end: at(8, 13 * 60), place: "Aula 3, Ciencias de la Salud" },
  ];

  /* ---------------- Moderación ---------------- */

  const decided = (daysAgo: number, hour: number, minutesLater: number) => {
    const reportedAt = atLocal(addDays(today, -daysAgo), hour * 60);
    return { at: reportedAt, decidedAt: new Date(new Date(reportedAt).getTime() + minutesLater * 60000).toISOString() };
  };

  const moderation: UniModeration[] = [
    { id: "mo1", content: "Se alquila habitación, fianza de tres meses en efectivo y sin contrato. Escribid por WhatsApp.", reason: "Posible fraude de alquiler", reports: 7, at: minutesAgo(40), status: "pending", where: "Pisos" },
    { id: "mo2", content: "Oferta de trabajo de 25 € la hora desde casa, solo hay que enviar foto del DNI.", reason: "Estafa o suplantación", reports: 12, at: atLocal(addDays(today, -1), 21 * 60), status: "pending", where: "FOMO" },
    { id: "mo3", content: "Comentario con insultos a una estudiante en la publicación de la fiesta de Económicas.", reason: "Acoso", reports: 5, at: atLocal(addDays(today, -1), 23 * 60), status: "pending", where: "Comentario" },
    { id: "mo4", content: "Vendo los apuntes escaneados del libro de un profesor, 40 € el PDF.", reason: "Propiedad intelectual", reports: 3, at: atLocal(addDays(today, -2), 12 * 60), status: "pending", where: "Mercado" },
    { id: "mo8", content: "Habitación en Tómbola, reserva con Bizum de 200 € antes de ver el piso, que hay mucha gente interesada.", reason: "Spam", reports: 2, at: minutesAgo(180), status: "pending", where: "Pisos" },
    { id: "mo5", content: "Perfil que se presenta como la delegación de estudiantes de Derecho y pide datos para un sorteo.", reason: "Suplantación de identidad", reports: 9, ...decided(3, 16, 95), status: "hidden", where: "Perfil", decidedBy: "Nerea", note: "La delegación de Derecho confirma que no es su perfil." },
    { id: "mo6", content: "Crítica al horario de la biblioteca en la publicación oficial.", reason: "No me gusta", reports: 2, ...decided(4, 11, 180), status: "kept", where: "Comentario", decidedBy: "Nerea", note: "Crítica respetuosa. Se mantiene." },
    { id: "mo7", content: "Reventa de entradas del concierto de bienvenida a 30 €.", reason: "Reventa", reports: 6, ...decided(8, 19, 240), status: "hidden", where: "Mercado", decidedBy: "Javier" },
    { id: "mo9", content: "Mensajes repetidos a una estudiante de primero tras decirle que no.", reason: "Acoso", reports: 4, ...decided(12, 22, 70), status: "hidden", where: "Chat", decidedBy: "Nerea", note: "Se deriva a la Unidad de Igualdad con el consentimiento de la estudiante." },
    { id: "mo10", content: "Piso en San Vicente con fianza en efectivo y sin contrato, solo por WhatsApp.", reason: "Posible fraude de alquiler", reports: 8, ...decided(16, 10, 45), status: "hidden", where: "Pisos", decidedBy: "Carmen" },
    { id: "mo11", content: "Opinión sobre la huelga de estudiantes en un comentario.", reason: "Contenido político", reports: 3, ...decided(21, 13, 300), status: "kept", where: "Comentario", decidedBy: "Javier", note: "Opinión dentro de las normas." },
  ];

  const pendingHousing = housing.filter((h) => h.status === "pending").length;
  const pendingReports = moderation.filter((m) => m.status === "pending").length;

  // El curso empieza el 1 de septiembre (o antes, si la bienvenida arrancó antes).
  const year = Number(today.slice(0, 4));
  const courseYear = Number(today.slice(5, 7)) >= 9 ? year : year - 1;
  const firstStop = localDate(welcome[0].date);
  const septFirst = `${courseYear}-09-01`;
  const courseStart = firstStop < septFirst ? firstStop : septFirst;

  // A algunas citas pasadas ya se les envió la pregunta que respondía su duda.
  const faqs = faqData(now);
  const office = officeData(rng(seedFor(vertical) + 101), now);
  let sent = 0;
  const appointments = (office.appointments ?? []).map((a) => {
    if (a.date >= today || a.status === "cancelled") return a;
    const faq = faqForTopic(faqs, a.topic, a.desk);
    if (!faq || ++sent % 3 !== 0) return a;
    return { ...a, faqId: faq.id, faqSentAt: atLocal(addDays(a.date, -1), 18 * 60) };
  });

  const uniExtras: ProUniExtras = {
    audiences: AUDIENCES,
    faculties: facultyStats(),
    deadlines,
    credits: creditRequests(r, now),
    assocActivities,
    market: marketSample(r),
    perks,
    passport: { goal: 5, completed: 1480 },
    help: [
      { label: "Apoyo psicológico del campus", detail: "Sin cita, de lunes a viernes en el Servicio de Atención al Estudiante", href: "/n/universidad-demo" },
      { label: "Línea 024", detail: "Atención a la conducta suicida, gratuita y a cualquier hora", href: "tel:024" },
      { label: "Emergencias 112", detail: "Si hay un peligro inmediato", href: "tel:112" },
    ],
    hoursPerEcts: 25,
    courseStart,
    // Generador aparte: así no cambian las cifras que ya salían de `r`.
    ...office,
    appointments,
    ...mentorData(rng(seedFor(vertical) + 202), now),
    faqs,
  };

  const data = emptyData(space);
  return {
    ...data,
    history: makeHistory(r, now, 12000, 0.62, 0),
    staff,
    shifts: makeShifts(staff, now, open, close),
    uniMetrics: metrics,
    uniPublications: publications,
    uniWelcome: welcome,
    uniHousing: housing,
    uniAssociations: associations,
    uniModeration: moderation,
    uniExtras,
    inbox: inbox(now, [
      { kind: "incident", title: `${pendingReports} reportes esperan revisión`, body: "Arriba del todo: un piso que pide la fianza en efectivo", href: "moderacion", minutesAgo: 22 },
      { kind: "incident", title: "Habitat Campus no ha respondido a tiempo", body: "El plazo del caso de las fianzas venció hace 2 días", href: "alojamiento", minutesAgo: 60 },
      { kind: "lead", title: `${pendingHousing} pisos por verificar`, body: "Habitat Campus ha subido una habitación en la calle Alicante", href: "alojamiento", minutesAgo: 95 },
      { kind: "message", title: "Hilo Rojo pide validar créditos", body: "18 solicitudes del taller de guion, con asistencia verificada", href: "asociaciones", minutesAgo: 240 },
      { kind: "system", title: "Club de Ajedrez pide entrar en el registro", body: "22 socios, falta el plan de actividades", href: "asociaciones", minutesAgo: 480 },
      { kind: "system", title: "Publicación programada", body: "Reunión informativa para Erasmus de febrero", href: "publicaciones", minutesAgo: 1440, read: true },
    ]),
    campaigns: makeCampaigns(now, [
      {
        moment: "Semana de bienvenida",
        title: "Pasaporte de bienvenida para primero",
        when: "Septiembre",
        status: "live",
        audience: "Estudiantes de primer curso",
        idea: "Siete paradas con check-in. Quien completa cinco consigue las ventajas de los comercios del campus y conoce su facultad antes de octubre.",
      },
      {
        moment: "Semana de la salud mental",
        title: "Talleres y atención psicológica sin cita",
        when: "Octubre",
        status: "scheduled",
        audience: "Todo el campus",
        idea: "Publicación oficial en FOMO con el calendario de talleres y el botón fijo \"Pedir ayuda\".",
      },
      {
        moment: "Exámenes de enero",
        title: "Bibliotecas abiertas y salas de estudio",
        when: "Enero",
        status: "suggested",
        audience: "Todo el campus",
        idea: "Aviso con horarios ampliados, plazas libres en salas y consejos de descanso.",
      },
      {
        moment: "Erasmus de febrero",
        title: "Bienvenida del segundo cuatrimestre",
        when: "Febrero",
        status: "suggested",
        audience: "Erasmus e internacionales",
        idea: "Pasaporte Erasmus en inglés con alojamiento verificado, picnic internacional y ESN en la primera parada.",
      },
    ]),
  };
}
