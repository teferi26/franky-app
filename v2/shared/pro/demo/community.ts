import type {
  ProAnnouncement,
  ProBoardSeat,
  ProData,
  ProOffer,
  ProStaff,
  ProSubsidy,
  ProVerticalId,
} from "../types";
import type {
  CommunityActivity,
  CommunityArchiveDoc,
  CommunityAssembly,
  CommunityItem,
  CommunityMember,
  CommunityMerchOrder,
  CommunityMovement,
  CommunityRating,
  CommunitySponsor,
  CommunityTask,
  CommunityTraveller,
  CommunityTripPayment,
  CommunityWaitEntry,
  ProCommunityOps,
} from "../community-types";
import { addDays, atLocal, localDate, weekdayIndex } from "../format";
import {
  DEFAULT_COMMUNITY_SETTINGS,
  EVENTBRITE_FEE,
  FRANKY_FEE,
  assemblyMinutesText,
  courseLabel,
  courseStart,
  defaultPeriods,
  memberFeeCents,
  prepFor,
  activityAttendees,
} from "../community";
import { ratingAskAt } from "../community-feedback";
import { HANDOVER_TEMPLATE } from "../community-handover";
import { syncMerchCash } from "../community-merch";
import {
  emptyData,
  inbox,
  makeCampaigns,
  makeHistory,
  makeReviews,
  makeSpace,
  personName,
  rng,
  seedFor,
  STUDIES,
  UNIVERSITIES,
} from "./common";

/* ------------------------------------------------------------------ */
/* Tipos y reglas (viven en community-types.ts y community.ts)          */
/* ------------------------------------------------------------------ */

export type { Attendee, CommunityActivity, CommunityMember } from "../community-types";
export {
  EVENTBRITE_FEE,
  FRANKY_FEE,
  MEMBER_FEE_CENTS,
  activityAttendees,
  checkedInSet,
} from "../community";

/** Documento del archivo tal y como lo pinta la app nativa. */
export type CommunityDocument = {
  id: string;
  title: string;
  kind: "estatutos" | "acta" | "cuentas" | "registro" | "otro";
  at: string;
  by: string;
};

/** Ventanas de solicitud de la convocatoria del Consejo de Estudiantes (mes 1-12, día). */
export const COUNCIL_WINDOWS: { month: number; day: number }[] = [
  { month: 11, day: 7 },
  { month: 1, day: 23 },
  { month: 3, day: 6 },
  { month: 5, day: 8 },
  { month: 6, day: 26 },
];
export const COUNCIL_TOTAL_CENTS = 1_100_000;
export const COUNCIL_MAX_CENTS = 400_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Próximas ventanas de solicitud a partir de hoy (YYYY-MM-DD), en orden. */
export function councilWindows(now: Date, count = 5): string[] {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const all: string[] = [];
  for (const y of [year, year + 1]) {
    for (const w of COUNCIL_WINDOWS) all.push(`${y}-${pad(w.month)}-${pad(w.day)}`);
  }
  return all
    .filter((d) => d >= today)
    .sort()
    .slice(0, count);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function windowLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** El mandato de la junta termina el 30 de junio del curso en marcha. */
export function mandateEnd(now: Date): string {
  const today = localDate(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return `${m >= 7 ? y + 1 : y}-06-30`;
}

/** Negocios de Franky Pro cerca del campus que suelen patrocinar asociaciones. */
export const SPONSOR_SUGGESTIONS: {
  business: string;
  vertical: ProVerticalId;
  sector: string;
  distance: string;
  usual: string;
  students: number;
}[] = [
  { business: "Gimnasio Raspeig Fit", vertical: "sports", sector: "Gimnasio", distance: "a 6 min del campus", usual: "Matrícula gratis y 15 % para tus socios", students: 412 },
  { business: "Pádel Tómbola", vertical: "sports_facility", sector: "Pádel", distance: "a 9 min", usual: "Torneo para la asociación y pistas en hora valle", students: 268 },
  { business: "Academia Pitágoras", vertical: "academy", sector: "Academia", distance: "a 4 min", usual: "Premios para concursos y 150 € por actividad", students: 530 },
  { business: "Pizzería Il Forno", vertical: "restaurant", sector: "Restaurante", distance: "a 7 min", usual: "Cena de fin de actividad a precio de grupo", students: 344 },
  { business: "Bar La Cantonada", vertical: "bar", sector: "Bar", distance: "a 5 min", usual: "Local para la tertulia y primera caña a 1 €", students: 297 },
  { business: "Estudio Belleza Aurora", vertical: "beauty", sector: "Estética", distance: "a 8 min", usual: "Sorteos y 20 % con la Franky Card", students: 189 },
];

/** Documentos del archivo en la forma antigua (la usa la app nativa). */
export function communityDocuments(now: Date): CommunityDocument[] {
  return archiveDocuments(now, "").map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind === "certificado" || d.kind === "memoria" ? "otro" : d.kind,
    at: d.at,
    by: d.by,
  }));
}

/* ------------------------------------------------------------------ */
/* Archivo de la asociación                                            */
/* ------------------------------------------------------------------ */

function archiveDocuments(now: Date, boardMinutes: string): CommunityArchiveDoc[] {
  const today = localDate(now);
  const prev = courseLabel(now, -1);
  return [
    {
      id: "d1",
      title: "Estatutos de la asociación",
      kind: "estatutos",
      at: atLocal("2019-03-14", 12 * 60),
      by: "Junta fundadora",
      body: [
        "Artículo 1. Con el nombre de Hilo Rojo se constituye una asociación de estudiantes de la Universidad de Alicante, sin ánimo de lucro, al amparo de la Ley Orgánica 1/2002, de 22 de marzo, reguladora del Derecho de Asociación.",
        "Artículo 2. Sus fines son difundir el cine y la cultura audiovisual entre la comunidad universitaria mediante proyecciones, talleres, viajes y un festival de cortometrajes.",
        "Artículo 3. El domicilio social está en el Club Social del campus de San Vicente del Raspeig, local 3.",
        "Artículo 10. La Asamblea General se reúne con carácter ordinario al menos una vez al año para aprobar las cuentas y el presupuesto. Queda válidamente constituida en primera convocatoria con la mitad de los socios con derecho a voto y en segunda, media hora después, con los presentes.",
        "Artículo 14. Son socios con derecho a voto quienes están al corriente de la cuota del curso.",
        "Artículo 18. La Junta Directiva la forman la presidencia, la tesorería, la secretaría y las vocalías, elegidas por la Asamblea para un curso académico.",
      ].join("\n\n"),
    },
    {
      id: "d2",
      title: "Inscripción en el Registro de Asociaciones Universitarias",
      kind: "registro",
      at: atLocal(addDays(today, -212), 12 * 60),
      by: "Secretaría",
      body: [
        "Resolución de inscripción de Hilo Rojo en el Registro de Asociaciones de Estudiantes de la Universidad de Alicante.",
        "Datos inscritos: denominación, fines, domicilio social y composición de la junta directiva. La asociación debe comunicar cada cambio de junta en el plazo de un mes desde la asamblea que lo acuerde.",
      ].join("\n\n"),
    },
    {
      id: "d3",
      title: "Acta de la asamblea de elección de junta",
      kind: "acta",
      at: atLocal(addDays(today, -96), 19 * 60),
      by: "Secretaría",
      body: [
        "Acta de la asamblea general extraordinaria de Hilo Rojo.",
        "Se reúne la asamblea en segunda convocatoria con 41 socios presentes, todos con derecho a voto.",
        "Orden del día: 1. Elección de la junta directiva para el nuevo curso. 2. Ruegos y preguntas.",
        "Se presenta una única candidatura, encabezada por Lucía Carbonell. Votación: 38 a favor, 0 en contra y 3 abstenciones. Se aprueba.",
        "La nueva junta queda formada por Lucía Carbonell (presidenta), Pablo Esteve (tesorero), Irene Castelló (secretaria) y Marcos Llorca (vocal de actividades), con mandato hasta el 30 de junio.",
      ].join("\n\n"),
    },
    {
      id: "d4",
      title: `Cuentas del curso ${prev}`,
      kind: "cuentas",
      at: atLocal(addDays(today, -80), 12 * 60),
      by: "Tesorería",
      body: [
        `Estado de ingresos y gastos del curso ${prev}, aprobado en asamblea.`,
        "Ingresos: cuotas de socio 2.160,00 €; entradas de actividades 612,50 €; subvención del Consejo de Estudiantes 600,00 €; ventas en la feria 40,00 €. Total: 3.412,50 €.",
        "Gastos: transporte del viaje a Sitges 1.380,00 €; derechos de proyección 810,00 €; imprenta y carteles 296,40 €; premios del festival 300,00 €; comida y bebida 171,75 €; banco y trámites 42,00 €. Total: 3.000,15 €.",
        "Saldo que pasa al curso siguiente: 412,35 €.",
      ].join("\n\n"),
    },
    {
      id: "d5",
      title: "Acta de la reunión de junta de septiembre",
      kind: "acta",
      at: atLocal(addDays(today, -9), 22 * 60),
      by: "Secretaría",
      body: boardMinutes || undefined,
    },
    {
      id: "d6",
      title: "Certificados de Hacienda y Seguridad Social",
      kind: "otro",
      at: atLocal(addDays(today, -21), 12 * 60),
      by: "Tesorería",
      body: [
        "Certificado de estar al corriente de las obligaciones tributarias, expedido por la Agencia Tributaria a nombre del CIF de la asociación.",
        "Pendiente: certificado de estar al corriente con la Seguridad Social (se pide en la sede electrónica con el certificado digital de la asociación).",
      ].join("\n\n"),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Demo: Hilo Rojo, asociación de cine y cultura                       */
/* ------------------------------------------------------------------ */

const EXTRA_STUDIES = ["Humanidades", "Estudios Ingleses", "Filología Hispánica", "Historia", "Sociología", "Geografía"];

const WAITING = [
  ["Pau Seguí", "Publicidad"],
  ["Aitana Botella", "Humanidades"],
  ["Hugo Maciá", "Ingeniería Informática"],
  ["Noelia Rico", "Traducción"],
  ["Clara Amorós", "Historia"],
  ["Tomás Vidal", "Derecho"],
] as const;

/* ------------------------------------------------------------------ */
/* Valoraciones de la demo                                             */
/* ------------------------------------------------------------------ */

type Stars = [number, number, number, number, number];

/**
 * Notas de una actividad: `dist` dice cuántas de 1 a 5 estrellas y `comments`
 * lleva las que tienen texto. Llegan a partir del momento en que Franky las
 * pide; si ese momento aún no ha llegado, la actividad queda sin notas.
 */
function demoRatings(
  a: CommunityActivity,
  now: Date,
  dist: Stars,
  comments: [number, string, string][] = [],
): CommunityRating[] | undefined {
  const askAt = ratingAskAt(a);
  if (askAt > now.toISOString()) return undefined;
  const left = [...dist] as Stars;
  const stars: { s: number; name?: string; comment?: string }[] = [];
  for (const [s, name, comment] of comments) {
    if (left[s - 1] > 0) left[s - 1] -= 1;
    stars.push({ s, name, comment });
  }
  // Las notas sin comentario se intercalan de mayor a menor para que no salgan en bloque.
  for (let s = 5; s >= 1; s--) for (let i = 0; i < left[s - 1]; i++) stars.push({ s });
  const base = new Date(askAt).getTime();
  return stars.map((x, i) => ({
    id: `${a.id}-r${i}`,
    stars: x.s,
    comment: x.comment,
    name: x.name,
    at: new Date(Math.min(now.getTime(), base + i * 11 * 60_000)).toISOString(),
  }));
}

/**
 * Septiembre del curso anterior: las primeras actividades de la hornada de
 * entonces, para comparar cuántos socios nuevos volvían a estas alturas.
 * Cada socio de esa hornada viene a las actividades que se indican (3, 2, 1
 * o ninguna), siempre después de su alta.
 */
function previousSeptember(
  prevStart: string,
  prevCourse: string,
  members: CommunityMember[],
  now: Date,
): CommunityActivity[] {
  const plans = [
    {
      id: "a-prev-open",
      title: `Jornada de puertas abiertas ${prevCourse}`,
      day: addDays(prevStart, 73),
      minutes: 11 * 60,
      durationMinutes: 5 * 60,
      place: "Feria de asociaciones, plaza central del campus",
      capacity: 150,
      base: 96,
      present: 81,
      kind: "otra" as const,
      description: "Stand en la feria de asociaciones con cortos del festival y alta de socios en el momento.",
      photos: 16,
      reachOutside: 4100,
      stars: [0, 1, 3, 9, 11] as Stars,
    },
    {
      id: "a-prev-welcome",
      title: "Cinefórum de bienvenida: Robot Dreams",
      day: addDays(prevStart, 80),
      minutes: 19 * 60,
      durationMinutes: 150,
      place: "Salón de actos, Facultad de Filosofía y Letras",
      capacity: 90,
      base: 58,
      present: 47,
      kind: "proyeccion" as const,
      description: "Primera sesión del curso para los socios nuevos, con coloquio corto.",
      photos: 6,
      reachOutside: 1300,
      stars: [0, 0, 2, 7, 9] as Stars,
    },
    {
      id: "a-prev-snow",
      title: "Cinefórum: La sociedad de la nieve",
      day: addDays(prevStart, 87),
      minutes: 19 * 60,
      durationMinutes: 170,
      place: "Salón de actos, Facultad de Filosofía y Letras",
      capacity: 90,
      base: 63,
      present: 52,
      kind: "proyeccion" as const,
      description: "Proyección en versión original y coloquio.",
      photos: 5,
      reachOutside: 1450,
      stars: [0, 1, 4, 8, 6] as Stars,
    },
  ];

  const cohort = members
    .filter((m) => {
      const d = localDate(m.joinedAt);
      return d >= prevStart && d <= addDays(prevStart, 88);
    })
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
  const cohortIds = new Set(cohort.map((m) => m.id));
  const wanted = (i: number) => (i === 0 ? 3 : i === 1 ? 2 : i <= 6 ? 1 : 0);

  // Qué actividades hace cada uno: las más recientes posteriores a su alta.
  const goes = new Map<string, string[]>();
  cohort.forEach((m, i) => {
    const since = localDate(m.joinedAt);
    const options = plans.filter((p) => p.day >= since).map((p) => p.id).reverse();
    goes.set(m.id, options.slice(0, wanted(i)));
  });

  const joinedAt = new Map(members.map((m) => [m.id, localDate(m.joinedAt)]));
  return plans.map((p) => {
    const draft: CommunityActivity = {
      id: p.id,
      title: p.title,
      date: atLocal(p.day, p.minutes),
      place: p.place,
      capacity: p.capacity,
      registered: p.base,
      checkedIn: 0,
      priceCents: 0,
      status: "done",
      kind: p.kind,
      durationMinutes: p.durationMinutes,
      description: p.description,
      photos: p.photos,
      councilLogo: true,
      reachOutside: p.reachOutside,
      certificates: false,
    };
    const synth = activityAttendees(draft, members);
    const chosen = cohort.filter((m) => goes.get(m.id)?.includes(p.id));
    const extra = chosen
      .filter((m) => !synth.some((x) => x.id === m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        studies: m.studies,
        university: m.university,
        member: true,
        viaFranky: Boolean(m.viaFranky),
        verified: m.verified !== false,
      }));
    // El resto de la sala: inscritos que ya eran socios o que llegaron por Franky.
    const others = synth
      .filter((x) => !cohortIds.has(x.id))
      .filter((x) => !x.member || (joinedAt.get(x.id) ?? "") <= p.day)
      .slice(0, Math.max(0, p.present - chosen.length))
      .map((x) => x.id);
    const checkedInIds = [...chosen.map((m) => m.id), ...others];
    const activity: CommunityActivity = {
      ...draft,
      registered: p.base + extra.length,
      joined: extra.length ? extra : undefined,
      checkedInIds,
      checkedIn: checkedInIds.length,
    };
    return { ...activity, ratings: demoRatings(activity, now, p.stars) };
  });
}

export function buildCommunityDemo(vertical: ProVerticalId, now: Date): ProData {
  const r = rng(seedFor(vertical));
  const today = localDate(now);
  const end = mandateEnd(now);
  const mandateStart = addDays(end, -365);
  const start = courseStart(now);

  const space = makeSpace(vertical, {
    name: "Hilo Rojo",
    city: "San Vicente del Raspeig",
    address: "Club Social del campus, local 3",
    slug: "hilo-rojo",
    owner: { name: "Lucía Carbonell", firstName: "Lucía" },
    hours: [null, { open: 17 * 60, close: 21 * 60 }, null, { open: 18 * 60, close: 22 * 60 }, null, null, null],
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 0,
    rating: 4.8,
    reviewsCount: 64,
    publicProfile: {
      description:
        "Asociación de cine y cultura de la Universidad de Alicante. Cinefórum cada martes, talleres de guion, viajes a festivales y el festival de cortos del campus.",
      photos: 24,
      bookingEnabled: true,
      cardEnabled: false,
      cardDiscountPct: 0,
    },
  });

  /* Junta y voluntarios ---------------------------------------------- */
  const boardPeople = [
    { role: "Presidenta", name: "Lucía Carbonell", studies: "Humanidades", phone: "612 845 301" },
    { role: "Tesorero", name: "Pablo Esteve", studies: "ADE", phone: "634 210 778" },
    { role: "Secretaria", name: "Irene Castelló", studies: "Derecho", phone: "655 902 114" },
    { role: "Vocal de actividades", name: "Marcos Llorca", studies: "Publicidad", phone: "688 431 902" },
  ];
  const board: ProBoardSeat[] = boardPeople.map((b, i) => ({
    id: `b${i + 1}`,
    role: b.role,
    name: b.name,
    since: mandateStart,
    until: end,
  }));

  const staff: ProStaff[] = [
    ...boardPeople.map((b, i) => ({
      id: `s${i + 1}`,
      name: b.name,
      role: "board" as const,
      tone: (["violet", "sky", "emerald", "amber"] as const)[i],
      title: b.role,
      commissionPct: 0,
      clockedInAt: null,
      weekMinutes: 0,
    })),
    { id: "s5", name: "Candela Ferrer", role: "editor", tone: "rose", title: "Voluntaria, puerta y check-in", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s6", name: "Joel Navarro", role: "editor", tone: "teal", title: "Voluntario, redes", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
  ];

  /* Socios ----------------------------------------------------------- */
  const prevCourse = courseLabel(now, -1);
  const used = new Set<string>(boardPeople.map((b) => b.name));
  const members: CommunityMember[] = [];
  boardPeople.forEach((b, i) => {
    members.push({
      id: `m${i + 1}`,
      name: b.name,
      university: UNIVERSITIES[0],
      studies: b.studies,
      role: "junta",
      fee: "paid",
      joinedAt: atLocal(addDays(today, -r.int(420, 900)), 12 * 60),
      activities: r.int(18, 34),
      verified: true,
      viaFranky: false,
      course: r.int(3, 4),
      phone: b.phone,
      imageConsent: true,
      lastSeenAt: atLocal(addDays(today, -r.int(1, 6)), 19 * 60),
      feePaidAt: atLocal(addDays(start, r.int(60, 70)), 12 * 60),
      feePaidVia: "bizum",
      feeHistory: [{ course: prevCourse, status: "paid", cents: DEFAULT_COMMUNITY_SETTINGS.feeCents }],
      joinChannel: "import",
    });
  });

  const TOTAL = 180;
  for (let i = members.length; i < TOTAL; i++) {
    let name = personName(r);
    while (used.has(name)) name = personName(r);
    used.add(name);
    // Los más recientes: la hornada de septiembre, muchos llegados por Franky.
    const isNew = i >= TOTAL - 27;
    const daysAgo = isNew ? r.int(1, 28) : r.int(35, 1000);
    const volunteer = !isNew && r.chance(0.08);
    const rawFee: CommunityMember["fee"] = isNew
      ? r.chance(0.55)
        ? "pending"
        : "paid"
      : r.chance(0.11)
        ? "pending"
        : r.chance(0.06)
          ? "exempt"
          : "paid";
    const fee = volunteer && rawFee === "pending" ? "paid" : rawFee;
    const joinedAt = atLocal(addDays(today, -daysAgo), r.int(10, 20) * 60);
    const viaFranky = isNew ? r.chance(0.78) : r.chance(0.18);
    // Un tercio de los veteranos lleva semanas sin venir: son los "dormidos".
    const seenDaysAgo = isNew
      ? Math.max(0, daysAgo - r.int(0, 5))
      : r.chance(0.68)
        ? r.int(1, 35)
        : r.int(46, 220);
    const activities = isNew ? r.int(0, 2) : r.int(1, 16);
    const payDaysAgo = isNew ? daysAgo : r.int(1, 80);
    const via = r.chance(0.55) ? "franky" : r.chance(0.67) ? "bizum" : "efectivo";
    members.push({
      id: `m${i + 1}`,
      name,
      university: r.chance(0.9) ? UNIVERSITIES[0] : UNIVERSITIES[1],
      studies: r.chance(0.3) ? r.pick(EXTRA_STUDIES) : r.pick(STUDIES),
      role: volunteer ? "voluntario" : "socio",
      fee,
      joinedAt,
      activities,
      verified: r.chance(0.88),
      viaFranky,
      course: isNew ? 1 : r.int(1, 4),
      phone: r.chance(0.88) ? `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}` : undefined,
      imageConsent: r.chance(0.82) ? true : r.chance(0.55) ? false : undefined,
      lastSeenAt: activities ? atLocal(addDays(today, -seenDaysAgo), 19 * 60) : undefined,
      feePaidAt: fee === "paid" ? atLocal(addDays(today, -payDaysAgo), 12 * 60) : undefined,
      feePaidVia: fee === "paid" ? via : undefined,
      feeHistory: isNew
        ? []
        : [{ course: prevCourse, status: r.chance(0.92) ? "paid" : "exempt", cents: DEFAULT_COMMUNITY_SETTINGS.feeCents }],
      joinChannel: isNew ? (viaFranky ? "qr" : "stand") : "import",
    });
  }
  const volunteers = members.filter((m) => m.role === "voluntario").map((m) => m.id);
  const vol = (i: number) => volunteers[i % Math.max(1, volunteers.length)] ?? "m4";
  // Registro de voluntariado: casi todos con el acuerdo firmado; a uno le falta.
  members.forEach((m) => {
    const i = volunteers.indexOf(m.id);
    if (i < 0) return;
    const joined = localDate(m.joinedAt);
    const since = joined > mandateStart ? joined : mandateStart;
    m.volunteer = { since, agreementAt: i === 2 ? undefined : since };
  });

  /* Actividades ------------------------------------------------------ */
  const nextWeekday = (from: string, wd: number) =>
    addDays(from, (wd - weekdayIndex(from) + 7) % 7 || 7);
  const tuesday = nextWeekday(today, 1);
  const saturday = nextWeekday(addDays(today, 10), 5);
  const workshop = nextWeekday(addDays(today, 4), 3);
  const festival = nextWeekday(addDays(today, 30), 3);

  const pastForum = (
    n: number,
    film: string,
    reg: number,
    ci: number,
    photos: number,
  ): CommunityActivity => ({
    id: `a-past-${n}`,
    title: `Cinefórum: ${film}`,
    date: atLocal(addDays(tuesday, -7 * n), 19 * 60),
    place: "Salón de actos, Facultad de Filosofía y Letras",
    capacity: 90,
    registered: reg,
    checkedIn: ci,
    priceCents: 0,
    status: "done",
    kind: "proyeccion",
    durationMinutes: 150,
    description: `Proyección de ${film} en versión original y coloquio de 30 minutos.`,
    photos,
    councilLogo: n !== 3,
    reachOutside: r.int(900, 2400),
    certificates: n > 1,
    prep: prepFor("proyeccion", `a-past-${n}`).map((p) => ({ ...p, done: true })),
    shifts: [
      { id: `a-past-${n}-s1`, role: "Puerta y check-in", from: 18 * 60 + 30, to: 19 * 60 + 30, slots: 2, people: [vol(n), vol(n + 1)] },
      { id: `a-past-${n}-s2`, role: "Redes y fotos", from: 19 * 60, to: 21 * 60 + 30, slots: 1, people: [vol(n + 2)] },
    ],
  });

  const waitlist: CommunityWaitEntry[] = WAITING.map(([name, studies], i) => ({
    id: `w-a2-${i}`,
    name,
    studies,
    university: UNIVERSITIES[0],
    member: false,
    viaFranky: true,
    verified: true,
    joinedAt: atLocal(addDays(today, -3 + Math.floor(i / 2)), (11 + i) * 60),
  }));

  const markDone = (list: ReturnType<typeof prepFor>, done: number[]) =>
    list.map((p, i) => ({ ...p, done: done.includes(i) }));

  const activities: CommunityActivity[] = [
    {
      id: "a1",
      title: "Cinefórum: As bestas",
      date: atLocal(tuesday, 19 * 60),
      place: "Salón de actos, Facultad de Filosofía y Letras",
      capacity: 90,
      registered: 71,
      checkedIn: 0,
      priceCents: 0,
      status: "published",
      kind: "proyeccion",
      durationMinutes: 150,
      description:
        "Proyección en versión original y coloquio con Marta Soler, profesora de Comunicación. Entrada libre con inscripción.",
      councilLogo: true,
      reachOutside: 1840,
      prep: markDone(prepFor("proyeccion", "a1"), [0, 2]),
      budget: [{ id: "a1-b1", concept: "Derechos de proyección", cents: 9000 }],
      shifts: [
        { id: "a1-s1", role: "Puerta y check-in", from: 18 * 60 + 30, to: 19 * 60 + 30, slots: 2, people: [vol(0)] },
        { id: "a1-s2", role: "Redes y fotos", from: 19 * 60, to: 21 * 60 + 30, slots: 1, people: [] },
      ],
    },
    {
      id: "a2",
      title: "Taller de guion: escribe tu primer corto",
      date: atLocal(workshop, 17 * 60),
      place: "Aula 0.12, Aulario II",
      capacity: 25,
      registered: 25,
      checkedIn: 0,
      priceCents: 0,
      ectsHours: 10,
      status: "published",
      kind: "taller",
      durationMinutes: 150,
      description:
        "Cuatro sesiones de dos horas y media con un guionista profesional. Reconocible como créditos con asistencia verificada.",
      councilLogo: true,
      reachOutside: 1210,
      waitlist,
      prep: markDone(prepFor("taller", "a2"), [0, 1, 2]),
      budget: [
        { id: "a2-b1", concept: "Honorarios del guionista", cents: 20000 },
        { id: "a2-b2", concept: "Cuadernos y material", cents: 3500 },
      ],
      shifts: [
        { id: "a2-s1", role: "Puerta y check-in", from: 16 * 60 + 40, to: 17 * 60 + 15, slots: 1, people: [vol(3)] },
      ],
    },
    {
      id: "a3",
      title: "Viaje a Valencia: Mostra de cine",
      date: atLocal(saturday, 8 * 60),
      place: "Salida desde la parada de autobús del campus",
      capacity: 50,
      registered: 38,
      checkedIn: 0,
      priceCents: 2500,
      status: "published",
      kind: "viaje",
      durationMinutes: 13 * 60,
      description: "Autobús de ida y vuelta, entrada a dos sesiones de la Mostra y comida incluida.",
      councilLogo: true,
      reachOutside: 2960,
      prep: markDone(prepFor("viaje", "a3"), [0]),
      budget: [
        { id: "a3-b1", concept: "Autobús de 55 plazas, ida y vuelta", cents: 56000 },
        { id: "a3-b2", concept: "Entradas de la Mostra, dos sesiones", cents: 28000 },
        { id: "a3-b3", concept: "Comida del grupo", cents: 21000 },
      ],
      shifts: [
        { id: "a3-s1", role: "Coordinación", from: 7 * 60 + 45, to: 21 * 60, slots: 2, people: ["m2"] },
      ],
    },
    {
      id: "a4",
      title: "Festival de cortos del campus",
      date: atLocal(festival, 18 * 60),
      place: "Paraninfo",
      capacity: 300,
      registered: 146,
      checkedIn: 0,
      priceCents: 300,
      status: "published",
      sponsorId: "sp1",
      kind: "proyeccion",
      durationMinutes: 180,
      description:
        "Doce cortos de estudiantes a concurso, jurado profesional y premio del público. Con Barbería Nómada.",
      councilLogo: true,
      reachOutside: 5120,
      prep: markDone(prepFor("proyeccion", "a4"), [0]),
      budget: [
        { id: "a4-b1", concept: "Premios del jurado y del público", cents: 30000 },
        { id: "a4-b2", concept: "Carteles y lona", cents: 12000 },
        { id: "a4-b3", concept: "Técnico de sonido", cents: 15000 },
      ],
      budgetSponsorCents: 45000,
      shifts: [
        { id: "a4-s1", role: "Montaje", from: 16 * 60, to: 18 * 60, slots: 4, people: [vol(0), vol(1)] },
        { id: "a4-s2", role: "Puerta y check-in", from: 17 * 60 + 30, to: 19 * 60, slots: 3, people: [vol(2)] },
        { id: "a4-s3", role: "Redes y fotos", from: 18 * 60, to: 21 * 60, slots: 1, people: [vol(3)] },
        { id: "a4-s4", role: "Recogida", from: 21 * 60, to: 22 * 60, slots: 4, people: [] },
      ],
    },
    {
      id: "a5",
      title: "Ruta de rodajes por Alicante",
      date: atLocal(addDays(festival, 17), 10 * 60),
      place: "Plaza de los Luceros",
      capacity: 30,
      registered: 0,
      checkedIn: 0,
      priceCents: 0,
      status: "draft",
      kind: "otra",
      durationMinutes: 180,
      description: "Paseo por las localizaciones de películas rodadas en la ciudad.",
      prep: prepFor("otra", "a5"),
    },
    pastForum(1, "Las chicas están bien", 78, 69, 14),
    pastForum(2, "Cerrar los ojos", 86, 74, 11),
    pastForum(3, "El 47", 64, 51, 6),
    {
      id: "a-past-welcome",
      title: "Jornada de puertas abiertas de Hilo Rojo",
      date: atLocal(addDays(today, -19), 12 * 60),
      place: "Feria de asociaciones, plaza central del campus",
      capacity: 200,
      registered: 164,
      checkedIn: 141,
      priceCents: 0,
      status: "done",
      sponsorId: "sp2",
      kind: "otra",
      durationMinutes: 6 * 60,
      description: "Stand en la feria de asociaciones con proyección de cortos y alta de socios en el momento.",
      photos: 22,
      councilLogo: true,
      reachOutside: 6380,
      certificates: false,
      shifts: [
        { id: "aw-s1", role: "Stand y altas", from: 10 * 60, to: 14 * 60, slots: 3, people: ["m1", vol(4), vol(5)] },
        { id: "aw-s2", role: "Montaje", from: 9 * 60, to: 10 * 60, slots: 2, people: ["m4", vol(6)] },
      ],
    },
    {
      id: "a-past-ws",
      title: "Taller de montaje con DaVinci Resolve",
      date: atLocal(addDays(today, -52), 17 * 60),
      place: "Laboratorio de informática, Politécnica",
      capacity: 20,
      registered: 20,
      checkedIn: 18,
      priceCents: 0,
      ectsHours: 8,
      status: "done",
      kind: "taller",
      durationMinutes: 150,
      description: "Tres sesiones prácticas de edición de vídeo.",
      photos: 9,
      councilLogo: true,
      reachOutside: 740,
      certificates: true,
    },
    // Curso anterior: lo que sale en la memoria que pide el registro en octubre.
    {
      id: "a-prev-festival",
      title: `Festival de cortos del campus ${prevCourse}`,
      date: atLocal(addDays(start, -62), 18 * 60),
      place: "Paraninfo de la Universidad de Alicante",
      capacity: 220,
      registered: 204,
      checkedIn: 186,
      priceCents: 300,
      status: "done",
      kind: "proyeccion",
      durationMinutes: 210,
      description: "Doce cortos a concurso, jurado de profesores y premio del público.",
      photos: 34,
      councilLogo: true,
      reachOutside: 5400,
      certificates: false,
    },
    {
      id: "a-prev-malaga",
      title: "Viaje al Festival de Cine de Málaga",
      date: atLocal(addDays(start, -104), 7 * 60 + 30),
      place: "Salida desde la parada de autobús del campus",
      capacity: 50,
      registered: 48,
      checkedIn: 47,
      priceCents: 3500,
      status: "done",
      kind: "viaje",
      durationMinutes: 16 * 60,
      description: "Autobús, dos sesiones de la sección oficial y visita al Museo Picasso.",
      photos: 41,
      councilLogo: true,
      reachOutside: 2900,
      certificates: false,
    },
    {
      id: "a-prev-foto",
      title: "Taller de fotografía de cine",
      date: atLocal(addDays(start, -158), 17 * 60),
      place: "Plató de la Facultad de Filosofía y Letras",
      capacity: 20,
      registered: 20,
      checkedIn: 19,
      priceCents: 0,
      ectsHours: 10,
      status: "done",
      kind: "taller",
      durationMinutes: 180,
      description: "Cuatro sesiones sobre luz, encuadre y dirección de fotografía.",
      photos: 12,
      councilLogo: true,
      reachOutside: 610,
      certificates: true,
    },
    {
      id: "a-prev-navidad",
      title: "Cinefórum de Navidad: ¡Qué bello es vivir!",
      date: atLocal(addDays(start, -203), 19 * 60),
      place: "Salón de actos, Facultad de Filosofía y Letras",
      capacity: 90,
      registered: 66,
      checkedIn: 58,
      priceCents: 0,
      status: "done",
      kind: "proyeccion",
      durationMinutes: 150,
      description: "Sesión de Navidad con chocolate caliente.",
      photos: 8,
      councilLogo: false,
      reachOutside: 1150,
      certificates: false,
    },
  ];

  // Septiembre del curso anterior: sirve para comparar la hornada de este año.
  const prevStart = `${Number(start.slice(0, 4)) - 1}-07-01`;
  activities.push(...previousSeptember(prevStart, prevCourse, members, now));
  // Generador aparte: lo nuevo no mueve las cifras del resto de la demo.
  const extra = rng(seedFor(vertical) + 97);
  activities.push(sitgesTrip(today, members, extra, nextWeekday(addDays(today, 17), 4)));

  // Notas de quienes vinieron. Franky las pide 24 horas después de acabar.
  const ratingPlans: Record<string, [Stars, [number, string, string][]]> = {
    "a-past-1": [
      [0, 1, 4, 15, 18],
      [
        [5, "Nerea", "El coloquio de después fue lo mejor. Repetiré el martes."],
        [4, "Álex", "Muy bien, aunque empezó diez minutos tarde."],
      ],
    ],
    "a-past-2": [
      [0, 0, 3, 14, 27],
      [
        [5, "Carla", "Qué pedazo de película. Y el debate de después, genial."],
        [5, "Hugo", "Primera vez que vengo y me hago socio seguro."],
        [3, "Paula", "La peli muy bien, pero se oía regular desde las filas de atrás."],
      ],
    ],
    "a-past-3": [
      [1, 2, 5, 12, 9],
      [
        [2, "Marta", "Se cortó el sonido dos veces a mitad de la proyección."],
        [4, "Iván", "Buena elección de película. El sonido falló un poco."],
      ],
    ],
    "a-past-welcome": [
      [0, 1, 6, 22, 31],
      [
        [5, "Laura", "Me apunté en el stand en un minuto con el QR. Muy majos todos."],
        [4, "Sergio", "Los cortos del festival, muy buenos. Faltaba sombra."],
      ],
    ],
    "a-past-ws": [
      [0, 0, 1, 4, 10],
      [[5, "Andrea", "Aprendí más en tres tardes que en todo el cuatrimestre. Y con créditos."]],
    ],
    "a-prev-festival": [
      [1, 2, 8, 40, 52],
      [[5, "Rubén", "El premio del público le dio mucha vida. Muy buen nivel de cortos."]],
    ],
    "a-prev-malaga": [
      [0, 1, 3, 12, 21],
      [[4, "Elena", "Viaje muy bien organizado. La vuelta se hizo larga."]],
    ],
    "a-prev-foto": [[0, 0, 1, 5, 9], []],
    "a-prev-navidad": [[0, 1, 4, 10, 11], []],
  };
  for (const a of activities) {
    const plan = ratingPlans[a.id];
    if (plan) a.ratings = demoRatings(a, now, plan[0], plan[1]);
  }

  /* Asambleas y tareas ----------------------------------------------- */
  const boardMeetingDay = addDays(today, -9);
  const boardMeeting: CommunityAssembly = {
    id: "as1",
    kind: "junta",
    title: "Reunión de junta de septiembre",
    date: atLocal(boardMeetingDay, 20 * 60),
    place: "Local 3 del Club Social",
    status: "cerrada",
    presentIds: ["m1", "m2", "m3", "m4"],
    quorumPct: 50,
    secondCallMinutes: 15,
    convokedAt: atLocal(addDays(boardMeetingDay, -4), 21 * 60),
    startedAt: atLocal(boardMeetingDay, 20 * 60 + 5),
    closedAt: atLocal(boardMeetingDay, 21 * 60 + 40),
    agenda: [
      {
        id: "as1-1",
        title: "Presupuesto del festival de cortos",
        vote: true,
        yes: 4,
        no: 0,
        abstain: 0,
        result: "approved",
        agreement: "Presupuesto de 570 € para el festival, de los que 450 € los pone Barbería Nómada.",
      },
      {
        id: "as1-2",
        title: "Calendario del primer cuatrimestre",
        vote: true,
        yes: 3,
        no: 0,
        abstain: 1,
        result: "approved",
        agreement: "Cinefórum todos los martes salvo en exámenes de enero y viaje a la Mostra de Valencia.",
      },
      {
        id: "as1-3",
        title: "Balance del stand de la feria de asociaciones",
        vote: false,
        agreement: "58 altas en dos días. Se repite el stand en febrero para los Erasmus.",
      },
    ],
  };

  // Reuniones de junta anteriores: sirven para la asistencia de cada cargo.
  const boardMeetingAt = (id: string, day: string, title: string, presentIds: string[]): CommunityAssembly => ({
    id,
    kind: "junta",
    title,
    date: atLocal(day, 20 * 60),
    place: "Local 3 del Club Social",
    status: "cerrada",
    presentIds,
    quorumPct: 50,
    secondCallMinutes: 15,
    convokedAt: atLocal(addDays(day, -5), 21 * 60),
    startedAt: atLocal(day, 20 * 60 + 5),
    closedAt: atLocal(day, 21 * 60 + 15),
    agenda: [],
  });
  const julyMeeting: CommunityAssembly = {
    ...boardMeetingAt("as0a", addDays(mandateStart, 20), "Reunión de junta de traspaso", ["m1", "m2", "m3", "m4"]),
    agenda: [
      {
        id: "as0a-1",
        title: "Reparto de tareas del nuevo curso",
        vote: false,
        agreement: "Pablo lleva la tesorería y los patrocinios; Irene, el registro y las actas; Marcos, las actividades.",
      },
    ],
  };
  const augustMeeting: CommunityAssembly = {
    ...boardMeetingAt("as0b", addDays(today, -38), "Reunión de junta de agosto", ["m1", "m2", "m3"]),
    agenda: [
      {
        id: "as0b-1",
        title: "Stand de la feria de asociaciones",
        vote: true,
        yes: 3,
        no: 0,
        abstain: 0,
        result: "approved",
        agreement: "Stand los dos días de la feria, con alta de socios por QR y cuota de 10 € para primero.",
      },
    ],
  };

  const assemblyDay = nextWeekday(addDays(today, 14), 3);
  const general: CommunityAssembly = {
    id: "as2",
    kind: "ordinaria",
    title: "Asamblea general ordinaria",
    date: atLocal(assemblyDay, 19 * 60),
    place: "Salón de actos, Facultad de Filosofía y Letras",
    status: "convocada",
    presentIds: [],
    quorumPct: 50,
    secondCallMinutes: 30,
    convokedAt: atLocal(addDays(today, -2), 10 * 60),
    agenda: [
      { id: "as2-1", title: `Aprobación de las cuentas del curso ${prevCourse}`, vote: true },
      { id: "as2-2", title: `Presupuesto del curso ${courseLabel(now)}`, vote: true },
      { id: "as2-3", title: "Cuota de socio: 15 € y 10 € para quien entra en primero", vote: true },
      { id: "as2-4", title: "Elección de la vocalía de comunicación", vote: true },
      { id: "as2-5", title: "Ruegos y preguntas", vote: false },
    ],
  };

  const tasks: CommunityTask[] = [
    {
      id: "t1",
      title: "Pedir presupuesto a la imprenta para los carteles del festival",
      owner: "Marcos Llorca",
      due: addDays(today, 3),
      done: false,
      assemblyId: "as1",
      createdAt: boardMeeting.closedAt ?? boardMeeting.date,
    },
    {
      id: "t2",
      title: "Pedir el certificado de la Seguridad Social para la subvención",
      owner: "Pablo Esteve",
      due: addDays(today, 2),
      done: false,
      assemblyId: "as1",
      createdAt: boardMeeting.closedAt ?? boardMeeting.date,
    },
    {
      id: "t3",
      title: "Reservar el Paraninfo para el festival",
      owner: "Irene Castelló",
      due: addDays(today, -2),
      done: true,
      assemblyId: "as1",
      createdAt: boardMeeting.closedAt ?? boardMeeting.date,
    },
    {
      id: "t4",
      title: "Buscar 20 voluntarios para el stand de febrero",
      owner: "Lucía Carbonell",
      due: addDays(today, 40),
      done: false,
      assemblyId: "as1",
      createdAt: boardMeeting.closedAt ?? boardMeeting.date,
    },
  ];

  /* Avisos ----------------------------------------------------------- */
  const announcements: ProAnnouncement[] = [
    {
      id: "an1",
      title: "Este martes, As bestas en versión original",
      body: "A las 19:00 en el salón de actos de Filosofía y Letras. Coloquio después con Marta Soler. Inscríbete para asegurar sitio.",
      at: atLocal(addDays(today, -1), 11 * 60),
      audience: "todos",
      reads: 1260,
      pinned: true,
    },
    {
      id: "an5",
      title: "Convocatoria de la asamblea general ordinaria",
      body: "Cuentas del curso pasado, presupuesto, cuota y vocalía de comunicación. Trae tu carné de Franky para votar.",
      at: general.convokedAt ?? general.date,
      audience: "socios",
      reads: 96,
    },
    {
      id: "an2",
      title: "Cuota del curso: 15 € y todo el año de actividades",
      body: "Puedes pagarla desde Franky en un momento. Hasta el 15 de octubre, 10 € para los de primero.",
      at: atLocal(addDays(today, -6), 10 * 60),
      audience: "socios",
      reads: 142,
    },
    {
      id: "an3",
      title: "Inscripciones abiertas: viaje a la Mostra de Valencia",
      body: "50 plazas, 25 € con autobús, dos sesiones y comida. Se cobra al inscribirte.",
      at: atLocal(addDays(today, -8), 18 * 60),
      audience: "todos",
      reads: 2110,
    },
    {
      id: "an4",
      title: "Reunión de junta: presupuesto del festival",
      body: "Jueves a las 20:00 en el local. Traed la propuesta de premios y el plan de difusión.",
      at: atLocal(addDays(today, -13), 21 * 60),
      audience: "junta",
      reads: 4,
    },
  ];

  /* Patrocinios ------------------------------------------------------ */
  const sponsors: CommunitySponsor[] = [
    { id: "sp1", business: "Barbería Nómada", vertical: "hairdresser", packageName: "Patrocinador del festival de cortos", amountCents: 45000, status: "active", reach: 5120, redemptions: 38, franky: true, perk: "10 % en corte y barba con el carné" },
    { id: "sp2", business: "La Tasca del Campus", vertical: "bar", packageName: "Tapa y caña para socios todo el curso", amountCents: 30000, status: "active", reach: 9420, redemptions: 214, franky: true, perk: "Caña y tapa por 2,50 € con el carné" },
    { id: "sp3", business: "Café Hilo", vertical: "cafe", packageName: "Café del cinefórum", amountCents: 20000, status: "proposed", reach: 0, redemptions: 0, franky: true, perk: "Café a 1 € antes del cinefórum" },
  ];

  /* Subvenciones ----------------------------------------------------- */
  const windows = councilWindows(now, 5);
  const startYear = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) >= 7 ? 0 : 1);
  const course = (y: number) => `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
  const subsidies: ProSubsidy[] = [
    {
      id: "sb1",
      call: `Ayudas del Consejo de Estudiantes a asociaciones, curso ${course(startYear)}`,
      window: windows[0],
      requestedCents: 180000,
      status: "preparing",
      checklist: [
        { label: "Inscrita en el Registro de Asociaciones Universitarias", done: true },
        { label: "Proyecto y presupuesto de las actividades", done: true },
        { label: "Certificado de estar al corriente con Hacienda", done: true },
        { label: "Certificado de estar al corriente con la Seguridad Social", done: false },
        { label: "Memoria de actividades con asistentes verificados", done: false },
        { label: "Publicidad con el logo del Consejo de Estudiantes", done: true },
        { label: "Cuenta bancaria a nombre del CIF de la asociación", done: true },
      ],
    },
    {
      id: "sb2",
      call: `Ayudas del Consejo de Estudiantes a asociaciones, curso ${course(startYear - 1)}`,
      window: addDays(today, -122),
      requestedCents: 120000,
      status: "granted",
      checklist: [
        { label: "Anticipo del 50 % recibido", done: true },
        { label: "Facturas a nombre del CIF de la asociación", done: true },
        { label: "Memoria final con asistentes y fotos", done: false },
        { label: "Publicidad con el logo del Consejo de Estudiantes", done: true },
        { label: "Certificados de Hacienda y Seguridad Social (30 días)", done: false },
      ],
    },
  ];

  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "first_visit",
      title: "Hazte socio en septiembre",
      detail: "Cuota del curso a 10 € en vez de 15 € para los de primero hasta el 15 de octubre",
      discountPct: 33,
      slots: 0,
      claimed: 21,
      audience: { studentsOnly: true, radiusKm: 2, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 4870,
      views: 1190,
      bookings: 21,
      revenueCents: 21000,
      createdAt: atLocal(addDays(today, -24), 10 * 60),
    },
  ];

  /* Caja: gastos con ticket y otros ingresos -------------------------- */
  const day = (d: number, minutes = 12 * 60) => atLocal(addDays(today, d), minutes);
  const movements: CommunityMovement[] = [
    { id: "mv1", kind: "income", date: day(-40), concept: "Anticipo del 50 % de la subvención del Consejo", amountCents: 60000, category: "subvencion", method: "transferencia" },
    { id: "mv2", kind: "expense", date: day(-54), concept: "Dos discos duros para el taller de montaje", amountCents: 7998, category: "material", activityId: "a-past-ws", method: "tarjeta", receipt: { name: "ticket-discos.jpg" } },
    { id: "mv3", kind: "expense", date: day(-27), concept: "Comisión de mantenimiento de la cuenta", amountCents: 1200, category: "banco", method: "transferencia", receipt: { name: "extracto-banco.pdf" } },
    { id: "mv4", kind: "expense", date: day(-23), concept: "Chapas y lona del stand", amountCents: 11800, category: "material", activityId: "a-past-welcome", paidBy: "Marcos Llorca", reimbursed: true, method: "tarjeta", receipt: { name: "factura-chapas.pdf" } },
    { id: "mv5", kind: "expense", date: day(-22), concept: "Derechos de proyección: El 47", amountCents: 9000, category: "derechos", activityId: "a-past-3", method: "transferencia", receipt: { name: "licencia-el-47.pdf" } },
    { id: "mv6", kind: "expense", date: day(-21), concept: "Carteles y flyers de la feria", amountCents: 6490, category: "imprenta", activityId: "a-past-welcome", method: "tarjeta", receipt: { name: "ticket-imprenta.jpg" } },
    { id: "mv7", kind: "income", date: day(-19, 14 * 60), concept: "Venta de chapas en la feria", amountCents: 4600, category: "venta", activityId: "a-past-welcome", method: "efectivo" },
    { id: "mv8", kind: "expense", date: day(-15), concept: "Derechos de proyección: Cerrar los ojos", amountCents: 9000, category: "derechos", activityId: "a-past-2", method: "transferencia", receipt: { name: "licencia-cerrar-los-ojos.pdf" } },
    { id: "mv9", kind: "expense", date: day(-9, 21 * 60), concept: "Pizzas de la reunión de junta", amountCents: 3650, category: "comida", paidBy: "Pablo Esteve", reimbursed: false, method: "tarjeta", receipt: { name: "ticket-pizzeria.jpg" } },
    { id: "mv10", kind: "expense", date: day(-8), concept: "Derechos de proyección: Las chicas están bien", amountCents: 9000, category: "derechos", activityId: "a-past-1", method: "transferencia", receipt: { name: "licencia-las-chicas.pdf" } },
    { id: "mv11", kind: "expense", date: day(-8, 18 * 60), concept: "Palomitas y agua para el coloquio", amountCents: 2340, category: "comida", activityId: "a-past-1", paidBy: "Candela Ferrer", reimbursed: false, method: "efectivo" },
    { id: "mv12", kind: "expense", date: day(-3), concept: "Señal del autobús a Valencia (30 %)", amountCents: 16800, category: "transporte", activityId: "a3", method: "transferencia", receipt: { name: "factura-autocares.pdf" } },
    { id: "mv13", kind: "expense", date: day(-6), concept: "Reserva del albergue de Sitges", amountCents: 70000, category: "local", activityId: "a-sitges", method: "transferencia", receipt: { name: "reserva-albergue.pdf" } },
    { id: "mv14", kind: "expense", date: day(-31), concept: "Taller de bordado de Elche: bolsas de tela del cinefórum (14 unidades)", amountCents: 5600, category: "material", method: "transferencia", paidBy: "Pablo Esteve", reimbursed: true, receipt: { name: "factura-bolsas.pdf" } },
  ];

  const inventory = demoInventory(now, members, prevCourse, tuesday, festival);
  const merch = demoMerch(now, members, extra);

  const draft: ProData = {
    ...emptyData(space),
    staff,
    communityMembers: members,
    activities,
    board,
  };
  const boardMinutes = assemblyMinutesText(boardMeeting, draft, now);
  const julyMinutes = assemblyMinutesText(julyMeeting, draft, now);
  const augustMinutes = assemblyMinutesText(augustMeeting, draft, now);
  const minutesDoc = (id: string, a: CommunityAssembly, body: string): CommunityArchiveDoc => ({
    id,
    title: `Acta de la ${a.title.toLowerCase()}`,
    kind: "acta",
    at: a.closedAt ?? a.date,
    by: "Secretaría",
    body,
  });

  const baseOps: ProCommunityOps = {
    settings: {
      ...DEFAULT_COMMUNITY_SETTINGS,
      howToPay: "Se paga desde Franky con tu enlace de socio o por Bizum a Pablo, el tesorero.",
    },
    openingBalanceCents: 41235,
    movements,
    documents: [
      ...archiveDocuments(now, boardMinutes),
      minutesDoc("d7", julyMeeting, julyMinutes),
      minutesDoc("d8", augustMeeting, augustMinutes),
    ],
    periods: defaultPeriods(now),
    // Relevo de julio: casi todo hecho; faltan el registro de asociaciones y el correo.
    handover: {
      startedAt: mandateStart,
      items: HANDOVER_TEMPLATE.map((t) => {
        const plan: Record<string, [string, number] | [string]> = {
          franky: ["Lucía Carbonell", 0],
          banco: ["Pablo Esteve", 9],
          registro_uni: ["Irene Castelló", 16],
          registro_asoc: ["Irene Castelló"],
          hacienda: ["Pablo Esteve", 23],
          redes: ["Marcos Llorca", 2],
          correo: ["Marcos Llorca"],
          archivo: ["Irene Castelló", 12],
          llaves: ["Lucía Carbonell", 5],
          patrocinadores: ["Lucía Carbonell", 30],
          consejo: ["Lucía Carbonell", 41],
        };
        const [owner, after] = plan[t.id] ?? [];
        // Si la demo se abre a principios de julio, lo que aún no ha pasado queda pendiente.
        return after === undefined || addDays(mandateStart, after) > today
          ? { ...t, owner }
          : { ...t, owner, doneBy: owner, doneAt: atLocal(addDays(mandateStart, after), 18 * 60) };
      }),
    },
    assemblies: [
      { ...julyMeeting, minutes: julyMinutes, archivedDocId: "d7" },
      { ...augustMeeting, minutes: augustMinutes, archivedDocId: "d8" },
      { ...boardMeeting, minutes: boardMinutes, archivedDocId: "d5" },
      general,
    ],
    tasks,
    inventory,
    merch,
  };
  // Lo cobrado de cada pedido entra en la caja como un único ingreso.
  const communityOps = merch.reduce((o, order) => syncMerchCash(o, order.id), baseOps);

  const pending = members.filter((m) => m.fee === "pending").length;
  const newViaFranky = members.filter(
    (m) => m.viaFranky && localDate(m.joinedAt) >= addDays(today, -30),
  );

  return {
    ...draft,
    communityOps,
    history: makeHistory(r, now, 70, 0.48, 450),
    announcements,
    sponsors,
    subsidies,
    offers,
    reviews: makeReviews(r, now, [
      "El cinefórum de los martes es lo mejor de la semana. Buen ambiente y coloquios que no son un rollo.",
      "Fui al taller de montaje y me reconocieron los créditos sin papeleos. Muy bien organizado.",
      "Me enteré por Franky y ya me he hecho socia. Gente muy maja.",
      "El viaje a la Mostra estuvo genial, aunque la vuelta fue muy tarde.",
    ]),
    inbox: inbox(now, [
      ...(newViaFranky[0]
        ? [{ kind: "lead" as const, title: "Nueva socia por Franky", body: `${newViaFranky[0].name}, ${newViaFranky[0].studies}`, href: "miembros", minutesAgo: 14 }]
        : []),
      { kind: "booking", title: "El taller de guion está completo", body: "6 personas en lista de espera. Si amplías aforo, entran solas", href: "actividades", minutesAgo: 45 },
      { kind: "booking", title: "11 inscritos nuevos al viaje a Valencia", body: "Ya van 38 de 50 plazas, 950 € cobrados", href: "actividades", minutesAgo: 70 },
      { kind: "message", title: "Café Hilo ha abierto tu propuesta", body: "Café del cinefórum, 200 € por el curso", href: "patrocinios", minutesAgo: 190 },
      { kind: "system", title: `Solicitud de subvención hasta el ${windowLabel(windows[0])}`, body: "Te faltan 2 requisitos: certificado de la Seguridad Social y memoria", href: "subvenciones", minutesAgo: 600 },
      { kind: "payment", title: "2 gastos por reembolsar", body: "Pablo y Candela adelantaron 59,90 € con su dinero", href: "caja", minutesAgo: 900, read: true },
      { kind: "payment", title: `${pending} cuotas pendientes`, body: "Mándales un recordatorio con el enlace de pago", href: "miembros", minutesAgo: 1500, read: true },
    ]),
    campaigns: makeCampaigns(now, [
      {
        moment: "Semana de bienvenida",
        title: "Stand en la feria de asociaciones",
        when: "Septiembre",
        status: "done",
        audience: "Estudiantes de primero de la UA",
        idea: "Alta de socios en el momento con el QR del stand: 58 altas en dos días.",
      },
      {
        moment: "Fiestas de facultad",
        title: "Cinefórum especial en las fiestas de Filosofía y Letras",
        when: "Noviembre",
        status: "scheduled",
        audience: "Toda la facultad",
        idea: "Sesión doble al aire libre con la delegación de estudiantes. Buen momento para captar socios de segundo.",
      },
      {
        moment: "Exámenes de enero",
        title: "Pausa de exámenes: cine para desconectar",
        when: "Enero",
        status: "suggested",
        audience: "Socios y estudiantes de la UA",
        idea: "Una sola sesión corta el viernes, con café de Café Hilo. Mantiene el vínculo sin quitar tiempo de estudio.",
      },
      {
        moment: "Erasmus de febrero",
        title: "Cinefórum en inglés para los que llegan",
        when: "Febrero",
        status: "suggested",
        audience: "Erasmus admitidos para el segundo cuatrimestre",
        idea: "Película española con subtítulos en inglés. Los Erasmus son los socios que más actividades hacen.",
      },
    ]),
  };
}

/* ------------------------------------------------------------------ */
/* Cifras de caja                                                      */
/* ------------------------------------------------------------------ */

/** Caja del curso: entradas, cuotas y patrocinios, y lo que se lleva cada plataforma. */
export function communityCash(data: ProData) {
  const fee = memberFeeCents(data);
  const acts = data.activities.filter((a) => a.status !== "draft");
  const ticketsCents = acts.reduce((a, x) => a + x.priceCents * x.registered, 0);
  const paid = data.communityMembers.filter((m) => m.fee === "paid").length;
  const pending = data.communityMembers.filter(
    (m) => m.fee === "pending" && !(m as CommunityMember).leftAt,
  ).length;
  const feesCents = paid * fee;
  const pendingCents = pending * fee;
  const sponsorsCents = data.sponsors
    .filter((s) => s.status === "active")
    .reduce((a, s) => a + s.amountCents, 0);
  const frankyFeeCents = Math.round((ticketsCents + feesCents) * FRANKY_FEE);
  const eventbriteCents = Math.round(ticketsCents * EVENTBRITE_FEE);
  return {
    ticketsCents,
    feesCents,
    pendingCents,
    sponsorsCents,
    paid,
    pending,
    totalCents: ticketsCents + feesCents + sponsorsCents,
    frankyFeeCents,
    eventbriteCents,
    /** Lo que no pagas frente a Eventbrite solo en entradas. */
    savedCents: Math.max(0, eventbriteCents - Math.round(ticketsCents * FRANKY_FEE)),
  };
}

/* ------------------------------------------------------------------ */
/* Viaje a plazos, material y pedidos de la demo                       */
/* ------------------------------------------------------------------ */

type Rng = ReturnType<typeof rng>;

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/**
 * Tres días en el Festival de Sitges: la señal ya ha vencido y el resto vence
 * una semana antes de salir. Cuatro viajeros van atrasados con la señal y a
 * unos cuantos les falta el DNI para el seguro.
 */
function sitgesTrip(today: string, members: CommunityMember[], r: Rng, day: string): CommunityActivity {
  const trip: CommunityActivity = {
    id: "a-sitges",
    title: "Viaje al Festival de Sitges",
    date: atLocal(day, 7 * 60),
    place: "Salida desde la parada de autobús del campus",
    capacity: 40,
    registered: 34,
    checkedIn: 0,
    priceCents: 14500,
    status: "published",
    kind: "viaje",
    durationMinutes: 62 * 60,
    description:
      "Tres días de cine fantástico: autobús de ida y vuelta, dos noches de albergue y dos sesiones del festival cada día.",
    councilLogo: true,
    reachOutside: 3410,
    prep: prepFor("viaje", "a-sitges").map((p, i) => ({ ...p, done: i < 2 })),
    budget: [
      { id: "a-sitges-b1", concept: "Autobús de 55 plazas, tres días", cents: 165000 },
      { id: "a-sitges-b2", concept: "Albergue, dos noches", cents: 224000 },
      { id: "a-sitges-b3", concept: "Entradas del festival", cents: 72000 },
    ],
    shifts: [
      { id: "a-sitges-s1", role: "Coordinación", from: 6 * 60 + 30, to: 21 * 60, slots: 2, people: ["m4"] },
    ],
  };
  const signalDue = addDays(today, -10);
  const travellers = activityAttendees(trip, members);
  const payments: CommunityTripPayment[] = [];
  const data: Record<string, CommunityTraveller> = {};
  const late = travellers.length - 4;
  travellers.forEach((p, i) => {
    const via = i % 5 === 1 ? "bizum" : i % 7 === 3 ? "efectivo" : "franky";
    if (i < late) {
      payments.push({
        attendeeId: p.id,
        installmentId: "a-sitges-i1",
        at: atLocal(addDays(signalDue, -r.int(0, 12)), r.int(10, 22) * 60),
        via,
      });
      if (i % 6 === 2) {
        payments.push({
          attendeeId: p.id,
          installmentId: "a-sitges-i2",
          at: atLocal(addDays(today, -r.int(0, 6)), r.int(10, 22) * 60),
          via,
        });
      }
    }
    if (i % 5 !== 4) {
      const n = r.int(20_000_000, 79_999_999);
      const member = members.find((m) => m.id === p.id);
      data[p.id] = {
        idDoc: `${n}${DNI_LETTERS[n % 23]}`,
        phone: member?.phone,
        emergency: i % 3 ? undefined : `Madre, 6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
      };
    }
  });
  return {
    ...trip,
    trip: {
      installments: [
        { id: "a-sitges-i1", label: "Señal", cents: 5000, due: signalDue },
        { id: "a-sitges-i2", label: "Resto", cents: 9500, due: addDays(day, -7) },
      ],
      payments,
      travellers: data,
    },
  };
}

/** El material de Hilo Rojo: el proyector va y viene cada martes y el altavoz no ha vuelto. */
function demoInventory(
  now: Date,
  members: CommunityMember[],
  prevCourse: string,
  tuesday: string,
  festival: string,
): CommunityItem[] {
  const today = localDate(now);
  const start = courseStart(now);
  const at = (d: number) => atLocal(addDays(today, d), 20 * 60);
  const guest = members[40] ?? members[members.length - 1];
  const item = (
    id: string,
    name: string,
    category: CommunityItem["category"],
    units: number,
    valueCents: number,
    ageDays: number,
    location: string,
    extra: Partial<CommunityItem> = {},
  ): CommunityItem => ({
    id,
    name,
    category,
    units,
    valueCents,
    acquiredAt: addDays(start, -ageDays),
    location,
    loans: [],
    ...extra,
  });
  return [
    item("it1", "Proyector Epson de 4.000 lúmenes", "imagen", 1, 74900, 420, "Local 3, armario gris", {
      loans: [
        {
          id: "it1-l2",
          holder: "Marcos Llorca",
          memberId: "m4",
          from: at(-1),
          due: addDays(tuesday, 1),
          note: "Cinefórum del martes",
        },
        {
          id: "it1-l1",
          holder: "Irene Castelló",
          memberId: "m3",
          from: at(-22),
          due: addDays(today, -20),
          returnedAt: at(-20),
        },
      ],
    }),
    item("it2", "Altavoz JBL PartyBox", "sonido", 1, 39900, 300, "Local 3, armario gris", {
      loans: [
        {
          id: "it2-l1",
          holder: guest.name,
          memberId: guest.id,
          from: at(-12),
          due: addDays(today, -5),
          note: "Fiesta de bienvenida de Erasmus",
        },
      ],
    }),
    item("it3", "Pantalla enrollable de 3 metros", "imagen", 1, 18900, 700, "Salón de actos, cuarto técnico"),
    item("it4", "Micrófonos inalámbricos", "sonido", 2, 6500, 300, "Local 3, caja azul"),
    item("it5", "Cámara Sony para el making of", "imagen", 1, 52000, 95, "Local 3, taquilla con candado", {
      note: "Donada por la Facultad de Filosofía y Letras.",
      loans: [
        {
          id: "it5-l1",
          holder: "Joel Navarro",
          from: at(-3),
          due: addDays(festival, 2),
          note: "Vídeos del festival de cortos",
        },
      ],
    }),
    item("it6", "Trípodes", "imagen", 3, 3500, 420, "Local 3, caja azul"),
    item("it7", "Portátil para las proyecciones", "informatica", 1, 64900, 540, "Local 3, taquilla con candado"),
    item("it8", "Carpa plegable de 3 x 3 para el stand", "mobiliario", 1, 12900, 380, "Almacén del Club Social"),
    item("it9", "Roll-up con el logo", "mobiliario", 2, 4500, 380, "Almacén del Club Social"),
    item("it10", `Sudaderas sobrantes del curso ${prevCourse}`, "merchandising", 7, 1650, 330, "Local 3, estantería"),
    item("it11", "Claqueta de madera", "otro", 1, 2400, 900, "Local 3, estantería", {
      retiredAt: atLocal(addDays(today, -60), 12 * 60),
      retiredReason: "Rota en el rodaje del festival",
    }),
  ];
}

/**
 * Dos pedidos: la sudadera del curso con las tallas a punto de cerrar y las
 * bolsas de tela, ya encargadas, con dos personas sin pagar.
 */
function demoMerch(now: Date, members: CommunityMember[], r: Rng): CommunityMerchOrder[] {
  const today = localDate(now);
  const buyers = members.filter((m) => !m.leftAt && m.phone).slice(0, 60);
  const sizes = [
    "S", "M", "M", "L", "M", "S", "L", "XL", "M", "L", "XS", "M", "L",
    "S", "M", "XL", "L", "M", "S", "L", "M", "XXL", "M", "L", "S", "M",
  ];
  const hoodie: CommunityMerchOrder = {
    id: "mo1",
    title: `Sudadera Hilo Rojo ${courseLabel(now)}`,
    garment: "Sudadera con capucha granate, logo bordado en el pecho",
    priceCents: 2800,
    unitCostCents: 1750,
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    supplier: "Taller de bordado de Elche",
    closesOn: addDays(today, 2),
    status: "abierto",
    lines: sizes.map((size, i) => {
      const m = buyers[(i * 7) % buyers.length];
      const paid = i % 3 !== 2;
      return {
        id: `mo1-l${i + 1}`,
        name: m.name,
        memberId: m.id,
        phone: m.phone,
        size,
        qty: i === 4 ? 2 : 1,
        paidAt: paid ? atLocal(addDays(today, -r.int(0, 9)), r.int(10, 22) * 60) : undefined,
        paidVia: paid ? (i % 4 === 0 ? "efectivo" : "bizum") : undefined,
      };
    }),
  };
  const tote: CommunityMerchOrder = {
    id: "mo2",
    title: "Bolsa de tela del cinefórum",
    garment: "Bolsa de algodón crudo con la claqueta de Hilo Rojo serigrafiada",
    priceCents: 800,
    unitCostCents: 400,
    sizes: ["Única"],
    supplier: "Taller de bordado de Elche",
    closesOn: addDays(today, -35),
    status: "encargado",
    orderedAt: atLocal(addDays(today, -31), 12 * 60),
    supplierMovementId: "mv14",
    lines: Array.from({ length: 14 }, (_, i) => {
      const m = buyers[(i * 11 + 3) % buyers.length];
      const paid = i !== 5 && i !== 11;
      return {
        id: `mo2-l${i + 1}`,
        name: m.name,
        memberId: m.id,
        phone: m.phone,
        size: "Única",
        qty: 1,
        paidAt: paid ? atLocal(addDays(today, -r.int(30, 40)), 13 * 60) : undefined,
        paidVia: paid ? ("bizum" as const) : undefined,
        deliveredAt: i < 9 ? atLocal(addDays(today, -r.int(1, 12)), 19 * 60) : undefined,
      };
    }),
  };
  return [hoodie, tote];
}
