import type { ProData, ProVerticalId } from "../types";
import type { ProGrade, ProRoomBooking } from "../classes-types";
import { addDays, localDate } from "../format";
import { withExtras } from "../classes-care";
import { groupStudents } from "../classes-play";
import { rng, seedFor, type Rng } from "./common";

/**
 * Tercera ola de la demo del motor de clases. En la academia: notas de los
 * simulacros de cada grupo, niveles de inglés, el grupo que sigue a
 * Contabilidad, el material de cada grupo y la matrícula de los planes
 * mensuales. En el escape room: el barro del taller de cerámica, cumpleaños
 * del año pasado por felicitar y una empresa que pide factura. Semilla
 * propia para no mover nada de lo anterior.
 */

const TOPICS: Record<string, string[]> = {
  ct1: ["Límites y continuidad", "Derivadas", "Integrales"],
  ct2: ["Estadística descriptiva", "Probabilidad", "Inferencia"],
  ct3: ["Estequiometría", "Enlace químico", "Equilibrio"],
};

function makeGrades(r: Rng, data: ProData, now: Date): ProGrade[] {
  const today = localDate(now);
  const days = [-35, -21, -7];
  const grades: ProGrade[] = [];
  for (const typeId of Object.keys(TOPICS)) {
    const students = groupStudents(data, typeId).slice(0, 8);
    students.forEach((m, i) => {
      // Un par de alumnos por grupo van flojos y uno va a peor: los que
      // tienen que salir en "necesitan refuerzo".
      const base = i === 0 ? 3.6 : i === 1 ? 6.4 : 5.2 + r.next() * 3.2;
      const drift = i === 1 ? -1.4 : r.next() * 1.2 - 0.3;
      days.forEach((offset, k) => {
        const raw = base + drift * k + (r.next() - 0.5);
        const grade = Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
        grades.push({
          id: `gr-${typeId}-${m.id}-${k}`,
          memberId: m.id,
          classTypeId: typeId,
          on: addDays(today, offset),
          topic: TOPICS[typeId][k],
          grade,
          kind: k === 2 ? "mock" : "test",
        });
      });
    });
  }
  return grades;
}

function seedAcademy(r: Rng, data: ProData, now: Date): ProData {
  const today = localDate(now);
  const grades = makeGrades(r, data, now);
  const english = groupStudents(data, "ct5");
  return withExtras(data, (x) => {
    const members = { ...x.members };
    english.forEach((m, i) => {
      members[m.id] = { ...members[m.id], level: i % 4 === 3 ? "B1" : "B2" };
    });
    return {
      ...x,
      members,
      grades,
      recoveryRules: { maxPending: 4 },
      plans: {
        pl1: { enrollmentCents: 2000 },
        pl2: { enrollmentCents: 2000 },
      },
      types: {
        ...x.types,
        ct1: {
          ...x.types.ct1,
          materials: [
            {
              id: "mt1",
              title: "Apuntes de derivadas",
              url: "https://drive.google.com/drive/folders/calculo-derivadas",
              addedOn: addDays(today, -12),
            },
            {
              id: "mt2",
              title: "Exámenes de otros años",
              url: "https://drive.google.com/drive/folders/calculo-examenes",
              addedOn: addDays(today, -4),
            },
          ],
        },
        ct4: { ...x.types.ct4, nextTypeId: "ct2" },
        ct5: {
          ...x.types.ct5,
          cefr: "B2",
          materials: [
            {
              id: "mt3",
              title: "Writing: modelos de email",
              url: "https://drive.google.com/drive/folders/ingles-b2-writing",
              addedOn: addDays(today, -9),
            },
          ],
        },
      },
    };
  });
}

const PAST_PARTIES = [
  { honoree: "Lucía", contact: "Lucía Sempere", daysAhead: 6 },
  { honoree: "Álvaro", contact: "Marta Pastor", daysAhead: 13 },
  { honoree: "Nerea", contact: "Nerea Gil", daysAhead: 40 },
];

function seedCulture(r: Rng, data: ProData, now: Date): ProData {
  const today = localDate(now);
  const until = addDays(today, 7);
  // Barro del taller: lo que hay en el almacén se queda corto para tres plazas.
  const seats = data.sessions
    .filter(
      (s) =>
        s.classTypeId === "ct3" &&
        s.status !== "cancelled" &&
        localDate(s.start) >= today &&
        localDate(s.start) <= until,
    )
    .reduce((a, s) => a + s.booked, 0);

  // Una reserva de mañana es de una empresa que ha pedido factura.
  const tomorrow = addDays(today, 1);
  const companyBooking = data.bookings.find((b) => {
    const s = data.sessions.find((x) => x.id === b.sessionId);
    return s && localDate(s.start) === tomorrow && b.status !== "cancelled";
  });

  return withExtras(data, (x) => {
    const roomBookings: Record<string, ProRoomBooking> = { ...x.roomBookings };
    PAST_PARTIES.forEach((p, i) => {
      // Cumpleaños del año pasado cuyo aniversario cae en las próximas semanas.
      const partyOn = addDays(addDays(today, p.daysAhead), -365);
      roomBookings[`cumple-${i + 1}`] = {
        players: r.int(4, 6),
        birthdayOf: p.honoree,
        partyOn,
        contactName: p.contact,
        phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
        extras: ["Tarta propia", "Sala de celebración"],
      };
    });
    if (companyBooking) {
      roomBookings[companyBooking.id] = {
        ...roomBookings[companyBooking.id],
        company: {
          name: "Levante Digital Consultores S.L.",
          taxId: "B54872136",
          address: "Avenida de Maisonnave 28, 03003 Alicante",
        },
        notes: "Equipo de la empresa, piden factura",
      };
    }
    return {
      ...x,
      roomBookings,
      types: {
        ...x.types,
        ct3: {
          ...x.types.ct3,
          seatMaterial: { item: "barro", perSeat: 1, unit: "kg", stock: Math.max(0, seats - 3) },
        },
      },
    };
  });
}

export function seedClassStudy(vertical: ProVerticalId, data: ProData, now: Date): ProData {
  const r = rng(seedFor(vertical) ^ 0x57d7);
  if (vertical === "academy") return seedAcademy(r, data, now);
  if (vertical === "culture") return seedCulture(r, data, now);
  return data;
}
