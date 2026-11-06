import type {
  LeadStage,
  ProData,
  ProIncident,
  ProLead,
  ProOffer,
  ProProperty,
  ProRoom,
  ProStaff,
  ProTenant,
  ProVerticalId,
  ProVisit,
} from "../types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import { addMonths } from "../housing";
import type { ProHousingOps, ProInventoryItem, ProPropertyOwner } from "../housing-types";
import { defaultInventory, depositDeadline, monthKey, monthsBetween } from "../housing-ops";
import {
  clockIn,
  emptyData,
  inbox,
  makeCampaigns,
  makeHistory,
  makeReviews,
  makeShifts,
  makeSpace,
  personName,
  rng,
  seedFor,
  STUDIES,
  weekHours,
  type Rng,
  type SpaceSeed,
} from "./common";

/* ------------------------------------------------------------------ */
/* Semillas de cada sector                                             */
/* ------------------------------------------------------------------ */

type Zone = "San Vicente centro" | "Tómbola" | "Ciudad Jardín" | "Alicante centro";

/** plan: una letra por habitación. O ocupada, L se libera, F libre, R reservada. */
type PropertySeed = {
  title: string;
  address: string;
  zone: Zone;
  minutes: number;
  plan: string;
  agent?: string;
  published?: boolean;
  photos: number;
  whole?: number;
};

type IncidentSeed = {
  property: number;
  title: string;
  priority: ProIncident["priority"];
  status: ProIncident["status"];
  minutesAgo: number;
  assignee?: string;
};

type HousingSeed = {
  space: SpaceSeed;
  staff: Omit<ProStaff, "clockedInAt" | "weekMinutes">[];
  properties: PropertySeed[];
  stages: Record<LeadStage, number>;
  /** Grupos de Roomie: [tamaño, compatibilidad, índice del piso que quieren o -1, fase]. */
  groups: [number, number, number, LeadStage][];
  incidents: IncidentSeed[];
  reviews: string[];
  historyBase: number;
};

const AGENCY: HousingSeed = {
  space: {
    name: "Habitat Campus",
    city: "San Vicente del Raspeig",
    address: "Calle Ancha de Castelar 31, bajo",
    slug: "habitat-campus",
    owner: { name: "Rocío Llorca", firstName: "Rocío" },
    hours: weekHours(10 * 60, 20 * 60, { saturday: [10 * 60, 14 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 6,
    rating: 4.6,
    reviewsCount: 87,
    publicProfile: {
      description:
        "Inmobiliaria especializada en estudiantes desde 2014. Pisos por habitaciones en San Vicente y Alicante, contrato claro y mantenimiento en 48 horas.",
      photos: 38,
      bookingEnabled: true,
      cardEnabled: false,
      cardDiscountPct: 0,
    },
  },
  staff: [
    { id: "s1", name: "Rocío Llorca", role: "owner", tone: "violet", title: "Directora", commissionPct: 0, phone: "600 000 000" },
    { id: "s2", name: "Javier Mora", role: "agent", tone: "sky", title: "Agente, San Vicente", commissionPct: 10, phone: "611 204 118" },
    { id: "s3", name: "Paula Ortega", role: "agent", tone: "emerald", title: "Agente, Erasmus", commissionPct: 10, phone: "622 318 407" },
    { id: "s4", name: "Sergio Blasco", role: "agent", tone: "amber", title: "Agente, Alicante", commissionPct: 10, phone: "644 902 355" },
  ],
  properties: [
    { title: "Piso Calle Alicante 18", address: "Calle Alicante 18, 3.º B", zone: "San Vicente centro", minutes: 7, plan: "OOOL", agent: "s2", photos: 14 },
    { title: "Ático Avenida de la Libertad", address: "Avenida de la Libertad 5, ático", zone: "San Vicente centro", minutes: 9, plan: "OOF", agent: "s2", photos: 11 },
    { title: "Piso Ancha de Castelar 9", address: "Calle Ancha de Castelar 9, 1.º A", zone: "San Vicente centro", minutes: 5, plan: "OOOOR", agent: "s3", photos: 16, published: false },
    { title: "Dúplex Río Turia", address: "Calle Río Turia 3, dúplex", zone: "Tómbola", minutes: 12, plan: "FFF", agent: "s3", photos: 12, whole: 105000 },
    { title: "Piso Pintor Pérez Gil", address: "Calle Pintor Pérez Gil 14, 2.º", zone: "Tómbola", minutes: 13, plan: "OOLO", agent: "s4", photos: 9 },
    { title: "Adosado Guadalquivir", address: "Calle Guadalquivir 21", zone: "Ciudad Jardín", minutes: 15, plan: "OOOOF", agent: "s4", photos: 18 },
    { title: "Piso Avenida de Novelda", address: "Avenida de Novelda 110, 4.º C", zone: "Ciudad Jardín", minutes: 16, plan: "OORF", agent: "s2", photos: 10 },
    { title: "Piso Calle San Vicente 41", address: "Calle San Vicente 41, 5.º", zone: "Alicante centro", minutes: 24, plan: "OOLO", agent: "s3", photos: 13 },
    { title: "Piso Calle Castaños", address: "Calle Castaños 12, 3.º izquierda", zone: "Alicante centro", minutes: 27, plan: "OOOF", agent: "s4", photos: 8 },
  ],
  stages: { new: 8, contacted: 7, visit: 6, reserved: 3, signed: 6, lost: 5 },
  groups: [
    [3, 87, 3, "visit"],
    [3, 79, -1, "new"],
    [2, 92, 1, "contacted"],
  ],
  incidents: [
    { property: 4, title: "La caldera no da agua caliente", priority: "urgent", status: "open", minutesAgo: 170 },
    { property: 0, title: "Llave del portal rota dentro de la cerradura", priority: "urgent", status: "open", minutesAgo: 38 },
    { property: 7, title: "El wifi se corta por las noches", priority: "normal", status: "in_progress", minutesAgo: 60 * 26, assignee: "Sergio Blasco" },
    { property: 5, title: "Humedad en la pared del baño", priority: "normal", status: "open", minutesAgo: 60 * 50 },
    { property: 6, title: "La lavadora pierde agua", priority: "normal", status: "in_progress", minutesAgo: 60 * 70, assignee: "Fontanería Esteve" },
    { property: 1, title: "Persiana del salón atascada", priority: "low", status: "resolved", minutesAgo: 60 * 24 * 6, assignee: "Javier Mora" },
  ],
  reviews: [
    "Me buscaron habitación desde Milán y la visita por vídeo fue tal cual. Llegué y todo estaba listo.",
    "Cuando se rompió la caldera vinieron al día siguiente. Nada que ver con mi piso anterior.",
    "Nos juntaron con dos chicas de Enfermería por Roomie y es el mejor piso que he tenido.",
    "Contrato claro, fianza devuelta en su plazo y sin sorpresas.",
    "Javier contesta rápido y te explica todo. Repetimos el curso que viene.",
    "El piso está bien, aunque la habitación interior es algo pequeña.",
  ],
  historyBase: 24,
};

const LANDLORD: HousingSeed = {
  space: {
    name: "Pisos de Carmen",
    city: "San Vicente del Raspeig",
    address: "Calle Alicante 30, 2.º",
    slug: "pisos-de-carmen",
    owner: { name: "Carmen Soler", firstName: "Carmen" },
    hours: weekHours(17 * 60 + 30, 20 * 60, { saturday: [10 * 60, 13 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 8,
    rating: 4.8,
    reviewsCount: 14,
    publicProfile: {
      description: "Dos pisos para estudiantes cerca del campus, reformados y con trato directo con la propietaria.",
      photos: 3,
      bookingEnabled: true,
      cardEnabled: false,
      cardDiscountPct: 0,
    },
  },
  staff: [{ id: "s1", name: "Carmen Soler", role: "owner", tone: "rose", title: "Propietaria", commissionPct: 0, phone: "655 123 480" }],
  properties: [
    { title: "Piso Calle Alicante 30", address: "Calle Alicante 30, 2.º", zone: "San Vicente centro", minutes: 8, plan: "OOLF", photos: 9 },
    { title: "Piso Pintor Sorolla", address: "Calle Pintor Sorolla 12, 1.º", zone: "Tómbola", minutes: 12, plan: "OOR", photos: 7 },
  ],
  stages: { new: 2, contacted: 2, visit: 1, reserved: 1, signed: 1, lost: 1 },
  groups: [[2, 90, 0, "contacted"]],
  incidents: [
    { property: 0, title: "La caldera hace ruido al encenderse", priority: "normal", status: "in_progress", minutesAgo: 60 * 30, assignee: "Calderas Pastor" },
    { property: 1, title: "No cierra la puerta de la habitación", priority: "urgent", status: "open", minutesAgo: 95 },
  ],
  reviews: [
    "Carmen es un encanto y el piso está reformado. Muy recomendable.",
    "Todo en orden con el contrato y la fianza. Se nota que se preocupa.",
    "Buena ubicación, al lado del tranvía y a un paso del campus.",
  ],
  historyBase: 5,
};

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

const ZONE_BASE: Record<Zone, number> = {
  "San Vicente centro": 330,
  Tómbola: 305,
  "Ciudad Jardín": 295,
  "Alicante centro": 345,
};

const ERASMUS_FROM: [string, string][] = [
  ["Politecnico di Milano", "Milán"],
  ["Université Lumière Lyon 2", "Lyon"],
  ["Universität Wien", "Viena"],
  ["KU Leuven", "Lovaina"],
  ["Università di Bologna", "Bolonia"],
  ["Universidade do Porto", "Oporto"],
  ["Uniwersytet Warszawski", "Varsovia"],
];

const UA = "Universidad de Alicante";
const UMH = "Universidad Miguel Hernández";

function uniqueName(r: Rng, used: Set<string>) {
  let n = personName(r);
  while (used.has(n)) n = personName(r);
  used.add(n);
  return n;
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

function makeRooms(r: Rng, p: PropertySeed, index: number, today: string): ProRoom[] {
  return [...p.plan].map((code, i) => {
    const sizeM2 = i === 0 ? r.int(13, 17) : r.int(9, 14);
    const exterior = i === 0 || r.chance(0.55);
    const privateBath = (i === 0 && p.plan.length >= 4) || r.chance(0.12);
    const raw = ZONE_BASE[p.zone] + (sizeM2 - 11) * 8 + (exterior ? 15 : 0) + (privateBath ? 45 : 0);
    const priceCents = Math.min(420, Math.max(280, roundTo(raw, 5))) * 100;
    const status: ProRoom["status"] = code === "O" ? "occupied" : code === "L" ? "leaving" : code === "R" ? "reserved" : "free";
    return {
      id: `r${index + 1}-${i + 1}`,
      name: `Habitación ${i + 1}`,
      sizeM2,
      priceCents,
      status,
      availableFrom: status === "free" ? addDays(today, i % 2 ? r.int(0, 6) : 0) : today,
      exterior,
      privateBath,
    };
  });
}

function messageFor(r: Rng, lead: { erasmus: boolean; studies: string; moveIn: string; group?: number; city?: string }) {
  const month = new Date(`${lead.moveIn}T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
  if (lead.group)
    return r.pick([
      `Somos ${lead.group} de ${lead.studies} y buscamos piso entero cerca del campus desde ${month}. Nos ha juntado Roomie.`,
      `Hola, somos un grupo de ${lead.group} que ya se conoce por Roomie. ¿Se podría alquilar el piso entero?`,
    ]);
  if (lead.erasmus)
    return r.pick([
      `Hola, llego de Erasmus en ${month} desde ${lead.city}. ¿Podemos hacer la visita por vídeo?`,
      `Buenas, vengo de ${lead.city} para el segundo cuatrimestre. ¿La habitación tiene escritorio y buena luz?`,
    ]);
  return r.pick([
    `Hola, estudio ${lead.studies} en la UA y busco habitación desde ${month}. ¿Sigue libre?`,
    `Buenas, me interesa la habitación. ¿Los gastos van aparte? Busco para ${month}.`,
    `Hola, mis padres pueden ser avalistas. ¿Cuándo se podría ver el piso?`,
    `Me cambio de piso en ${month}. ¿Hay más estudiantes en el piso? ¿De qué carreras?`,
  ]);
}

/* ------------------------------------------------------------------ */
/* Demo                                                                */
/* ------------------------------------------------------------------ */

export function buildHousingDemo(vertical: ProVerticalId, now: Date): ProData {
  const seed = vertical === "landlord" ? LANDLORD : AGENCY;
  const r = rng(seedFor(vertical));
  const space = makeSpace(vertical, seed.space);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const febYear = month <= 2 ? year : year + 1;
  const febStart = `${febYear}-02-01`;
  const janEnd = `${febYear}-01-31`;
  const leaveDate = janEnd >= addDays(today, 10) ? janEnd : addDays(today, 40);
  const prevSeptYear = month >= 9 ? year : year - 1;
  const prevSept = `${prevSeptYear}-09-01`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const dayOfMonth = Number(today.slice(8, 10));
  const isAgency = vertical !== "landlord";
  const used = new Set<string>();

  const todayHours = space.hours[weekdayIndex(today)] ?? { open: 10 * 60, close: 20 * 60 };
  const staff: ProStaff[] = seed.staff.map((s, i) => ({
    ...s,
    clockedInAt: clockIn(today, todayHours.open, i, now),
    weekMinutes: 0,
  }));

  /* Pisos */
  const properties: ProProperty[] = seed.properties.map((p, i) => {
    const rooms = makeRooms(r, p, i, today);
    return {
      id: `p${i + 1}`,
      title: p.title,
      address: p.address,
      zone: p.zone,
      minutesToCampus: p.minutes,
      rooms,
      photos: p.photos,
      views30: r.int(90, 620),
      published: p.published ?? true,
      agentId: p.agent,
      wholeFlatPriceCents: p.whole,
    };
  });

  const roomsBy = (code: ProRoom["status"]) =>
    properties.flatMap((p) => p.rooms.filter((room) => room.status === code).map((room) => ({ property: p, room })));
  const occupiedRooms = roomsBy("occupied");
  const leavingRooms = roomsBy("leaving");
  const freeRooms = roomsBy("free").filter((x) => !seed.properties[Number(x.property.id.slice(1)) - 1].whole);
  const reservedRooms = roomsBy("reserved");

  // Habitaciones de los recién firmados: repartidas entre los pisos.
  const shuffled = [...occupiedRooms].sort(() => r.next() - 0.5);
  const signedRooms = shuffled.slice(0, seed.stages.signed);

  /* Interesados */
  const leads: ProLead[] = [];
  const stageOrder: LeadStage[] = ["new", "contacted", "visit", "reserved", "signed", "lost"];
  const newAges = [9, 26, 55, 140, 320, 760, 1520, 2900];
  let n = 0;

  for (const stage of stageOrder) {
    for (let i = 0; i < seed.stages[stage]; i++) {
      n++;
      const group = i === 0 ? seed.groups.find((g) => g[3] === stage) : undefined;
      const signAgo = r.int(3, 11);
      const name = uniqueName(r, used);
      const erasmus = !group && ((stage === "new" && i === 1) || r.chance(isAgency ? 0.26 : 0.2));
      const [from, city] = r.pick(ERASMUS_FROM);
      const studies = erasmus ? `Erasmus, ${r.pick(["Economía", "Arquitectura", "Ingeniería", "Traducción", "Turismo"])} (${from})` : r.pick(STUDIES);
      const university = erasmus ? UA : r.chance(0.78) ? UA : UMH;

      // Qué piso y habitación le interesa.
      let target: { property: ProProperty; room?: ProRoom } | undefined;
      let moveIn: string;
      if (stage === "signed") {
        target = signedRooms[i];
        moveIn = addDays(today, -Math.max(1, signAgo - r.int(1, 3)));
      } else if (stage === "reserved") {
        target = reservedRooms[i] ?? leavingRooms[i - reservedRooms.length] ?? freeRooms[i];
        moveIn = target?.room?.status === "leaving" ? febStart : addDays(today, r.int(4, 20));
      } else if (group) {
        target = group[2] >= 0 ? { property: properties[group[2]] } : undefined;
        moveIn = group[3] === "new" ? febStart : addDays(today, r.int(5, 25));
      } else {
        const feb = erasmus || r.chance(0.2);
        const pool = feb ? [...leavingRooms, ...freeRooms] : freeRooms;
        target = stage === "new" && r.chance(0.2) ? undefined : pool.length ? r.pick(pool) : undefined;
        moveIn = feb ? febStart : addDays(today, r.int(3, 35));
      }

      const months = moveIn >= febStart ? 5 : r.pick([9, 10, 10, 12]);
      const roomPrice = target?.room?.priceCents ?? 34000;
      const budgetCents = group ? roundTo(roomPrice + r.int(-10, 20) * 100, 1000) : roundTo(roomPrice + r.int(-30, 40) * 100, 1000);
      const created =
        stage === "new"
          ? new Date(now.getTime() - newAges[i % newAges.length] * 60000)
          : new Date(now.getTime() - (stage === "contacted" ? r.int(1, 5) : stage === "visit" ? r.int(2, 8) : stage === "reserved" ? r.int(6, 14) : stage === "signed" ? signAgo + r.int(4, 14) : r.int(5, 30)) * 86400000 - r.int(0, 600) * 60000);
      const lastContact =
        stage === "new"
          ? undefined
          : stage === "signed"
            ? atLocal(addDays(today, -signAgo), 12 * 60)
            : new Date(Math.min(now.getTime() - 3600000, created.getTime() + r.int(1, 30) * 3600000)).toISOString();

      const agentId = isAgency ? (stage === "new" && i < 3 ? undefined : target?.property.agentId ?? r.pick(["s2", "s3", "s4"])) : undefined;
      const groupNames = group ? Array.from({ length: group[0] - 1 }, () => uniqueName(r, used).split(" ")[0]) : [];

      leads.push({
        id: `l${n}`,
        name,
        university,
        studies,
        verified: stage === "signed" || stage === "reserved" || r.chance(0.86),
        erasmus,
        budgetCents: group ? budgetCents : Math.min(45000, Math.max(26000, budgetCents)),
        moveIn,
        months,
        propertyId: target?.property.id,
        roomId: target?.room?.id,
        stage,
        roomieGroup: group ? { size: group[0], compatibility: group[1], names: [name.split(" ")[0], ...groupNames] } : undefined,
        message: messageFor(r, { erasmus, studies, moveIn, group: group?.[0], city }),
        createdAt: created.toISOString(),
        lastContactAt: lastContact,
        agentId,
        guarantor: r.chance(0.62),
        lostReason: stage === "lost" ? r.pick(["Encontró otro piso", "Se sale de su presupuesto", "No le cuadran las fechas", "No contesta"]) : undefined,
        contractSentAt: stage === "reserved" ? new Date(now.getTime() - r.int(1, 3) * 86400000).toISOString() : undefined,
      });
    }
  }

  // Las habitaciones reservadas y las que se liberan con reserva apuntan a su interesado.
  const reservedLeads = leads.filter((l) => l.stage === "reserved");
  for (const l of reservedLeads) {
    const p = properties.find((x) => x.id === l.propertyId);
    const room = p?.rooms.find((x) => x.id === l.roomId);
    if (room && room.status === "reserved") room.availableFrom = l.moveIn;
  }

  /* Inquilinos */
  const tenants: ProTenant[] = [];
  const signedLeads = leads.filter((l) => l.stage === "signed");
  let t = 0;
  const rentPlan: ProTenant["rentStatus"][] = [];
  const tenantRooms = [...occupiedRooms, ...leavingRooms];
  tenantRooms.forEach((_, i) => rentPlan.push(i % 9 === 4 ? "late" : i % 6 === 2 ? "pending" : "paid"));
  if (dayOfMonth <= 3) rentPlan.forEach((s, i) => (rentPlan[i] = s === "late" ? "pending" : s));

  for (const { property, room } of tenantRooms) {
    t++;
    const signedIdx = signedRooms.findIndex((x) => x.room.id === room.id);
    const lead = signedIdx >= 0 ? signedLeads[signedIdx] : undefined;
    const leaving = room.status === "leaving";
    let contractStart: string;
    let contractEnd: string;
    let contractKind: ProTenant["contractKind"];
    let depositStatus: ProTenant["deposit"]["status"] = "lodged";

    if (lead) {
      contractStart = lead.moveIn;
      contractKind = lead.months >= 11 ? "habitacion" : "temporada";
      contractEnd = addDays(addMonths(contractStart, lead.months), -1);
      depositStatus = signedLeads.length > 1 && signedIdx === signedLeads.length - 1 ? "lodged" : "pending";
    } else if (leaving) {
      contractStart = daysSince(prevSept, today) <= 200 ? prevSept : addDays(today, -r.int(30, 90));
      contractEnd = leaveDate;
      contractKind = "temporada";
    } else if (r.chance(0.55) && daysSince(prevSept, today) <= 200) {
      contractStart = prevSept;
      contractEnd = `${prevSeptYear + 1}-06-30`;
      contractKind = "temporada";
    } else {
      contractStart = addDays(today, -r.int(40, 330));
      contractEnd = addDays(addMonths(contractStart, 12), -1);
      contractKind = "habitacion";
    }

    const name = lead?.name ?? uniqueName(r, used);
    const rentStatus = contractStart > monthStart && lead ? "paid" : rentPlan[t - 1];
    const tenant: ProTenant = {
      id: `t${t}`,
      name,
      university: lead?.university ?? (leaving ? UA : r.chance(0.8) ? UA : UMH),
      propertyId: property.id,
      roomId: room.id,
      rentCents: room.priceCents,
      contractStart,
      contractEnd,
      contractKind,
      deposit: {
        amountCents: room.priceCents * (contractKind === "temporada" ? 2 : 1),
        status: depositStatus,
        dueAt: depositDeadline(contractStart),
      },
      rentStatus,
      paidThisMonthAt:
        rentStatus === "paid" ? atLocal(contractStart > monthStart ? contractStart : addDays(monthStart, r.int(0, Math.max(0, Math.min(4, dayOfMonth - 1)))), r.int(9, 21) * 60) : undefined,
      leavingAt: leaving ? leaveDate : undefined,
      lodgedAt: depositStatus === "lodged" ? addDays(contractStart, r.int(5, 20)) : undefined,
    };
    tenants.push(tenant);
    room.tenantId = tenant.id;
    room.availableFrom = leaving ? addDays(leaveDate, 1) : addDays(contractEnd, 1);
  }

  // Dos inquilinos del curso pasado: una fianza devuelta y otra por devolver.
  for (let i = 0; i < (isAgency ? 2 : 1); i++) {
    t++;
    const { property, room } = occupiedRooms[(i * 5 + 3) % occupiedRooms.length];
    const end = addDays(today, -r.int(50, 90));
    tenants.push({
      id: `t${t}`,
      name: uniqueName(r, used),
      university: UA,
      propertyId: property.id,
      roomId: room.id,
      rentCents: room.priceCents - 1000,
      contractStart: addDays(end, -300),
      contractEnd: end,
      contractKind: "temporada",
      deposit: { amountCents: (room.priceCents - 1000) * 2, status: i === 0 ? "lodged" : "returned", dueAt: addDays(end, -270) },
      rentStatus: "paid",
      leavingAt: end,
      lodgedAt: addDays(end, -285),
      returnedAt: i === 0 ? undefined : addDays(end, 20),
    });
  }

  /* Visitas */
  const visits: ProVisit[] = [];
  let v = 0;
  const pushVisit = (lead: ProLead, date: string, minute: number, status: ProVisit["status"], video?: boolean) => {
    v++;
    visits.push({
      id: `v${v}`,
      leadId: lead.id,
      propertyId: lead.propertyId ?? properties[0].id,
      start: atLocal(date, minute),
      mode: (video ?? lead.erasmus) ? "video" : r.chance(0.2) ? "video" : "in_person",
      status,
      agentId: lead.agentId ?? (isAgency ? properties.find((p) => p.id === lead.propertyId)?.agentId : undefined),
    });
  };
  const open = todayHours.open;
  const close = todayHours.close;
  // Visitas de hoy repartidas alrededor de ahora: alguna hecha y otras por llegar.
  const base = Math.round(nowMin / 30) * 30;
  const todaySlots = [...new Set([base - 120, base + 30, base - 30, base + 90, open + 30, open + 120, close - 60].map((m) => Math.min(close - 30, Math.max(open, m))))];
  const visitLeads = leads.filter((l) => l.stage === "visit");
  visitLeads.forEach((lead, i) => {
    if (i < Math.min(todaySlots.length, isAgency ? 4 : 1)) {
      const minute = Math.min(todaySlots[i], close - 30);
      pushVisit(lead, today, minute, minute + 30 <= nowMin ? "done" : "scheduled", lead.roomieGroup ? false : undefined);
    } else {
      pushVisit(lead, addDays(today, 1 + (i % 5)), [11 * 60, 12 * 60 + 30, 17 * 60, 18 * 60][i % 4], "scheduled");
    }
  });
  // Contactados con visita propuesta para esta semana.
  leads
    .filter((l) => l.stage === "contacted")
    .slice(0, isAgency ? 3 : 1)
    .forEach((lead, i) => pushVisit(lead, addDays(today, 1 + i), isAgency ? [10 * 60 + 30, 13 * 60, 19 * 60][i] : 18 * 60, "scheduled"));
  // Pasadas: hechas para reservas y firmados, una que no vino.
  leads
    .filter((l) => l.stage === "reserved" || l.stage === "signed")
    .forEach((lead) => pushVisit(lead, localDate(new Date(new Date(lead.createdAt).getTime() + 2 * 86400000)), r.pick([11 * 60, 12 * 60, 17 * 60, 18 * 60 + 30]), "done"));
  leads
    .filter((l) => l.stage === "lost")
    .slice(0, 2)
    .forEach((lead, i) => pushVisit(lead, addDays(today, -(i + 2)), 17 * 60 + i * 60, i === 0 ? "no_show" : "cancelled"));

  properties.forEach((p) => {
    p.views30 = Math.max(p.views30, visits.filter((x) => x.propertyId === p.id).length * 40);
  });

  /* Incidencias */
  const incidents: ProIncident[] = seed.incidents.map((inc, i) => {
    const property = properties[inc.property];
    const tenant = tenants.find((x) => x.propertyId === property.id && x.contractEnd >= today);
    return {
      id: `i${i + 1}`,
      propertyId: property.id,
      roomId: tenant?.roomId,
      tenantName: tenant?.name ?? "Inquilino",
      title: inc.title,
      priority: inc.priority,
      status: inc.status,
      createdAt: new Date(now.getTime() - inc.minutesAgo * 60000).toISOString(),
      assignee: inc.assignee,
    };
  });

  /* Ofertas */
  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "group",
      title: "Primer mes sin honorarios para grupos de Roomie",
      detail: "Grupos compatibles que alquilan el piso entero no pagan honorarios de agencia el primer mes",
      discountPct: 100,
      slots: isAgency ? 4 : 1,
      claimed: isAgency ? 1 : 0,
      audience: { studentsOnly: true, radiusKm: 10, universities: [UA, UMH] },
      status: "live",
      reach: isAgency ? 1840 : 620,
      views: isAgency ? 402 : 96,
      bookings: isAgency ? 3 : 1,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -18), 11 * 60),
    },
    {
      id: "o2",
      kind: "first_visit",
      title: "Erasmus de febrero",
      detail: "Visita por vídeo y reserva online para quien llega en el segundo cuatrimestre",
      discountPct: 0,
      slots: isAgency ? 12 : 2,
      claimed: isAgency ? 3 : 0,
      audience: { studentsOnly: true, radiusKm: 50, universities: [UA] },
      status: "scheduled",
      reach: isAgency ? 960 : 240,
      views: 0,
      bookings: 0,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -2), 10 * 60),
    },
  ];

  const housingOps = seedOperations(vertical, now, properties, tenants, leads, visits, incidents, staff);

  const newLeads = leads.filter((l) => l.stage === "new");
  const urgent = incidents.find((i) => i.priority === "urgent" && i.status === "open");
  const late = tenants.find((x) => x.rentStatus === "late");
  const pendingDeposit = tenants.find((x) => x.deposit.status === "pending");
  const group = leads.find((l) => l.roomieGroup);

  const data = emptyData(space);
  return {
    ...data,
    history: makeHistory(r, now, seed.historyBase, 0.7, 34000),
    staff,
    shifts: makeShifts(staff, now, todayHours.open, todayHours.close),
    properties,
    leads,
    visits,
    tenants,
    incidents,
    housingOps,
    offers,
    reviews: makeReviews(r, now, seed.reviews),
    inbox: inbox(now, [
      ...(newLeads[0] ? [{ kind: "lead" as const, title: "Nuevo interesado verificado", body: `${newLeads[0].name}, entrada el ${shortDay(newLeads[0].moveIn)}`, href: "interesados", minutesAgo: 9 }] : []),
      ...(urgent ? [{ kind: "incident" as const, title: "Incidencia urgente", body: `${urgent.title} (${urgent.tenantName})`, href: "inquilinos", minutesAgo: 38 }] : []),
      ...(group?.roomieGroup
        ? [{ kind: "lead" as const, title: `Grupo de Roomie, ${group.roomieGroup.compatibility} % compatibles`, body: `${group.roomieGroup.size} estudiantes buscan piso entero`, href: "interesados", minutesAgo: 120 }]
        : []),
      ...(late ? [{ kind: "payment" as const, title: "Renta con retraso", body: `${late.name} aún no ha pagado este mes`, href: "inquilinos", minutesAgo: 300 }] : []),
      ...(pendingDeposit ? [{ kind: "system" as const, title: "Fianza por depositar", body: `La de ${pendingDeposit.name} tiene plazo hasta el ${shortDay(pendingDeposit.deposit.dueAt)}`, href: "inquilinos", minutesAgo: 600, read: true }] : []),
    ]),
    campaigns: makeCampaigns(now, [
      {
        moment: "Admitidos de julio",
        title: "Habitación para los admitidos de fuera",
        when: "Hecho en julio",
        status: "done",
        audience: "Admitidos en la UA que viven a más de 60 km",
        idea: isAgency ? "Aviso a 1.240 admitidos: 64 interesados y 11 contratos." : "Aviso a los admitidos: 9 interesados y 2 contratos.",
      },
      {
        moment: "Erasmus de febrero",
        title: "Habitaciones para el segundo cuatrimestre",
        when: "Noviembre",
        status: "scheduled",
        audience: "Erasmus admitidos en la UA para febrero",
        idea: "Visita por vídeo y reserva online de las habitaciones que se liberan en enero.",
      },
      {
        moment: "Renovaciones de mayo",
        title: "Renueva antes de que empiece la búsqueda",
        when: "Mayo",
        status: "suggested",
        audience: "Tus inquilinos actuales",
        idea: "Propón renovar al mismo precio antes del 15 de mayo y te ahorras la rotación de septiembre.",
      },
    ]),
  };
}

function daysSince(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);
}

function shortDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
}


/* ------------------------------------------------------------------ */
/* Operación: cobros, papeles, suministros, gastos, llaves              */
/* ------------------------------------------------------------------ */

const PROVIDERS: Record<"agency" | "landlord", ProHousingOps["providers"]> = {
  agency: [
    { id: "pv1", name: "Fontanería Esteve", trade: "fontaneria", phone: "611 450 732" },
    { id: "pv2", name: "Electricidad Pastor", trade: "electricidad", phone: "622 118 904" },
    { id: "pv3", name: "Cerrajería San Vicente", trade: "cerrajeria", phone: "644 207 315", note: "Urgencias 24 h" },
    { id: "pv4", name: "Limpiezas Raspeig", trade: "limpieza", phone: "655 381 206", note: "Limpieza de salida por habitación" },
    { id: "pv5", name: "Calderas Pastor", trade: "calderas", phone: "633 902 147" },
  ],
  landlord: [
    { id: "pv1", name: "Calderas Pastor", trade: "calderas", phone: "633 902 147" },
    { id: "pv2", name: "Fontanería Esteve", trade: "fontaneria", phone: "611 450 732" },
    { id: "pv3", name: "Cerrajería San Vicente", trade: "cerrajeria", phone: "644 207 315", note: "Urgencias 24 h" },
  ],
};

const OWNERS: ProPropertyOwner[] = [
  { id: "ow1", name: "Vicente Alberola", phone: "610 482 391", feePct: 0.08 },
  { id: "ow2", name: "Remedios Sala", phone: "679 214 558", feePct: 0.1 },
  { id: "ow3", name: "Hermanos Carratalá", phone: "686 330 172", feePct: 0.08 },
  { id: "ow4", name: "Antonia Marco", phone: "617 905 264", feePct: 0.1 },
];

/** Qué propietario tiene cada piso de la inmobiliaria, por orden de la cartera. */
const OWNER_OF = ["ow1", "ow1", "ow2", "ow2", "ow3", "ow3", "ow3", "ow4", "ow4"];

const PARENTS = ["Antonio", "María José", "Francisco", "Carmen", "José Luis", "Pilar", "Juan Carlos", "Rosa"];

function seedOperations(
  vertical: ProVerticalId,
  now: Date,
  properties: ProProperty[],
  tenants: ProTenant[],
  leads: ProLead[],
  visits: ProVisit[],
  incidents: ProIncident[],
  staff: ProStaff[],
): ProHousingOps {
  // Semilla aparte: añadir datos aquí no cambia el resto de la demo.
  const r = rng(seedFor(vertical) + 101);
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const currentMonth = monthKey(today);
  const lastMonth = monthKey(addMonths(`${currentMonth}-01`, -1));
  const isAgency = vertical !== "landlord";
  const providers = PROVIDERS[isAgency ? "agency" : "landlord"];

  /* Pisos: datos obligatorios, normas, tope de suministros y habitaciones de verano. */
  properties.forEach((p, i) => {
    const hidden = !p.published;
    p.compliance = {
      nrua: hidden ? undefined : `ESFCTU000003${String(r.int(10000000, 99999999))}`,
      energyLetter: hidden ? undefined : r.pick(["C", "D", "E", "E", "F"] as const),
      energyExpiresAt: i === 1 ? addDays(today, 64) : addDays(today, r.int(400, 3000)),
      cadastralRef: `${r.int(1000000, 9999999)}YH${r.int(1000, 9999)}S${String(r.int(1, 40)).padStart(4, "0")}${r.pick(["KZ", "LX", "BM", "JT"])}`,
      insuranceRenewsAt: i === 0 ? addDays(today, 23) : addDays(today, r.int(90, 330)),
      ibiDueAt: i === 2 ? addDays(today, 41) : addDays(today, r.int(80, 300)),
    };
    p.rules = [
      "Silencio de 23:00 a 8:00 entre semana.",
      "Visitas que se quedan a dormir: avisad antes al resto.",
      "Cada uno friega lo suyo el mismo día.",
      "Nada de fumar dentro del piso.",
      ...(i % 2 ? ["Las bicis, en el trastero, no en el pasillo."] : []),
    ];
    if (i % 3 === 0) p.utilitiesCapCents = 4000;
    if (isAgency) p.ownerId = OWNER_OF[i];
    // Lo que Carmen pediría por cada piso entero, para compararlo con las habitaciones.
    if (!isAgency) p.wholeFlatReferenceCents = i === 0 ? 105000 : 80000;
    if (i % 3 === 1) {
      const room = p.rooms.find((x) => x.status === "occupied");
      if (room) room.summer = true;
    }
  });

  /* Inquilinos: mensualidades pasadas, papeles, inventario y renovación. */
  let lateSeen = false;
  let renewals = 0;
  for (const t of tenants) {
    const until = (t.leavingAt ?? t.contractEnd).slice(0, 10);
    const past = monthsBetween(monthKey(t.contractStart), lastMonth)
      .filter((m) => m <= monthKey(until))
      .slice(-14);
    const owesLastMonth = t.rentStatus === "late" && !lateSeen && past.length > 1;
    if (owesLastMonth) lateSeen = true;
    t.payments = past.map((month) => {
      if (owesLastMonth && month === lastMonth) return { month, status: "late" as const, amountCents: t.rentCents };
      const day = String(r.int(1, 6)).padStart(2, "0");
      return {
        month,
        status: "paid" as const,
        amountCents: t.rentCents,
        paidAt: atLocal(`${month}-${day}`, r.int(9, 21) * 60),
        method: r.chance(0.3) ? ("franky" as const) : ("transfer" as const),
      };
    });

    const surname = t.name.split(" ").slice(1).join(" ");
    const recent = t.deposit.status === "pending";
    t.docs = {
      items: {
        id: { status: "received", at: t.contractStart },
        enrolment: { status: "received", at: t.contractStart },
        guarantor: recent && r.chance(0.5) ? { status: "requested", at: t.contractStart } : { status: "received", at: t.contractStart },
        insurance: recent ? { status: "requested", at: t.contractStart } : { status: r.chance(0.7) ? "received" : "missing" },
      },
      guarantor: {
        name: `${r.pick(PARENTS)} ${surname}`,
        phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
        relation: r.chance(0.5) ? "Madre" : "Padre",
      },
    };

    const room = properties.find((p) => p.id === t.propertyId)?.rooms.find((x) => x.id === t.roomId);
    const items: ProInventoryItem[] = defaultInventory(room).map((item) => ({ ...item, in: r.chance(0.2) ? "worn" : "good" }));
    t.inventory = { items, inPhotos: r.int(8, 16), checkedInAt: t.contractStart };

    const end = t.contractEnd.slice(0, 10);
    const endsSoon = end >= today && end <= addDays(today, 150) && !t.leavingAt;
    if (endsSoon) {
      renewals++;
      if (renewals === 1)
        t.renewal = {
          sentAt: atLocal(addDays(today, -9), 11 * 60),
          newRentCents: t.rentCents + 1000,
          answer: "yes",
          answeredAt: atLocal(addDays(today, -7), 20 * 60),
        };
      else if (renewals === 2) t.renewal = { sentAt: atLocal(addDays(today, -6), 12 * 60), newRentCents: t.rentCents };
    }
  }

  // Quien ya se fue y espera su fianza: inventario de salida hecho y un desperfecto.
  const toReturn = tenants.find((t) => t.contractEnd.slice(0, 10) < today && t.deposit.status === "lodged");
  if (toReturn?.inventory) {
    toReturn.inventory = {
      ...toReturn.inventory,
      outPhotos: 11,
      items: toReturn.inventory.items.map((item, i) => ({ ...item, out: i === 1 ? "damaged" : i === 3 ? "worn" : item.in })),
    };
  }

  /* Visitas de mañana: una confirmada y otra pedida desde la ficha del piso. */
  const tomorrow = addDays(today, 1);
  const forTomorrow = visits.filter((v) => localDate(v.start) === tomorrow && v.status === "scheduled");
  if (forTomorrow[0]) forTomorrow[0].confirmedAt = atLocal(today, 10 * 60);
  const future = visits.filter((v) => localDate(v.start) > today && v.status === "scheduled");
  const fromPage = future[future.length - 1];
  if (fromPage) fromPage.source = "public";

  /* Incidencias: fotos del inquilino y el técnico asignado. */
  for (const inc of incidents) {
    inc.photos = inc.tenantName === "Inquilino" ? 0 : r.int(1, 3);
    const provider = providers.find((p) => p.name === inc.assignee);
    if (provider) inc.providerId = provider.id;
    if (inc.status === "resolved") {
      inc.resolvedAt = new Date(new Date(inc.createdAt).getTime() + 26 * 3600000).toISOString();
      inc.costCents = 4500;
    }
  }

  /* Gastos del último año por piso. */
  type Expense = ProHousingOps["expenses"][number];
  const expenses: Expense[] = [];
  const add = (
    propertyId: string,
    date: string,
    category: Expense["category"],
    concept: string,
    amountCents: number,
    extra: { incidentId?: string; providerId?: string } = {},
  ) => {
    if (date > today) return;
    expenses.push({ id: `e${expenses.length + 1}`, propertyId, date, category, concept, amountCents, ...extra });
  };
  properties.forEach((p, i) => {
    const community = r.int(40, 75) * 100;
    for (let m = 0; m < 12; m++) {
      const month = monthKey(addMonths(`${currentMonth}-01`, -m));
      add(p.id, `${month}-05`, "comunidad", "Cuota de la comunidad", community);
    }
    const ibiDate = `${year}-06-20` <= today ? `${year}-06-20` : `${year - 1}-06-20`;
    add(p.id, ibiDate, "ibi", "IBI", r.int(320, 540) * 100);
    add(p.id, addDays(today, -r.int(60, 300)), "seguro", "Seguro del hogar", r.int(170, 260) * 100);
    if (i % 2 === 0) {
      const concept = r.pick(["Cambio del termo", "Arreglo de la cisterna", "Pintar una habitación"]);
      add(p.id, addDays(today, -r.int(20, 200)), "reparacion", concept, r.int(90, 320) * 100, { providerId: providers[0].id });
    }
    if (i % 3 === 0) {
      const concept = r.pick(["Colchón nuevo", "Silla de escritorio", "Microondas"]);
      add(p.id, addDays(today, -r.int(30, 250)), "muebles", concept, r.int(60, 210) * 100);
    }
    if (isAgency) {
      const date = `${year}-07-10` <= today ? `${year}-07-10` : `${year - 1}-07-10`;
      add(p.id, date, "limpieza", "Limpieza de fin de curso", r.int(80, 140) * 100, { providerId: "pv4" });
    }
  });
  for (const inc of incidents.filter((i) => i.costCents)) {
    add(inc.propertyId, localDate(inc.resolvedAt ?? inc.createdAt), "reparacion", inc.title, inc.costCents ?? 0, {
      incidentId: inc.id,
      providerId: inc.providerId,
    });
  }

  /* Suministros: luz e internet del mes pasado, agua bimestral y la luz del anterior. */
  const utilities: ProHousingOps["utilities"] = [];
  const monthEnd = (month: string) => addDays(addMonths(`${month}-01`, 1), -1);
  const prev2 = monthKey(addMonths(`${lastMonth}-01`, -1));
  for (const p of properties.slice(0, isAgency ? 5 : 2)) {
    const people = p.rooms.length;
    const bill = (kind: ProHousingOps["utilities"][number]["kind"], from: string, to: string, amountCents: number, split: "days" | "equal") =>
      utilities.push({ id: `u${utilities.length + 1}`, propertyId: p.id, kind, from, to, amountCents, split });
    bill("luz", `${lastMonth}-01`, monthEnd(lastMonth), r.int(14, 26) * people * 100, "days");
    bill("internet", `${lastMonth}-01`, monthEnd(lastMonth), 3500, "equal");
    bill("agua", `${prev2}-01`, monthEnd(lastMonth), r.int(7, 12) * people * 100, "days");
    bill("luz", `${prev2}-01`, monthEnd(prev2), r.int(12, 22) * people * 100, "days");
  }

  /* Llaves: un juego por inquilino y otro de repuesto. */
  const keys: ProHousingOps["keys"] = [];
  const office = isAgency ? "Oficina" : (staff[0]?.name.split(" ")[0] ?? "Propietaria");
  for (const p of properties) {
    keys.push({ id: `k-${p.id}-0`, propertyId: p.id, label: "Juego de repuesto", holder: office, since: addDays(today, -200) });
    tenants
      .filter((t) => t.propertyId === p.id && t.contractEnd.slice(0, 10) >= today)
      .forEach((t, i) =>
        keys.push({ id: `k-${p.id}-${i + 1}`, propertyId: p.id, label: `Juego ${i + 1}`, tenantId: t.id, holder: t.name, since: t.contractStart.slice(0, 10) }),
      );
  }
  if (toReturn) {
    keys.push({
      id: `k-${toReturn.id}`,
      propertyId: toReturn.propertyId,
      label: "Juego de la habitación",
      tenantId: toReturn.id,
      holder: toReturn.name,
      since: toReturn.contractStart.slice(0, 10),
    });
  }

  // Lista de espera: a dos interesados ya contactados se les dijo que no había hueco.
  leads
    .filter((l) => l.stage === "contacted" && !l.roomieGroup && !l.replies?.length)
    .slice(0, 2)
    .forEach((l, i) => {
      const at = atLocal(addDays(today, -(12 + i * 5)), (18 + i) * 60);
      l.replies = [{ id: "full", at }];
      l.lastContactAt = at;
    });

  // Los interesados en reserva ya han mandado parte de los papeles.
  for (const l of leads.filter((x) => x.stage === "reserved")) {
    const at = l.contractSentAt;
    l.docs = { items: { id: { status: "received", at }, enrolment: { status: "requested", at }, guarantor: { status: "requested", at } } };
  }

  const settledMonth = monthKey(addMonths(`${lastMonth}-01`, -1));
  const owners = isAgency ? OWNERS.map((o, i) => ({ ...o, settled: i < 2 ? [settledMonth] : [] })) : [];

  return { providers, expenses, utilities, keys, owners };
}
