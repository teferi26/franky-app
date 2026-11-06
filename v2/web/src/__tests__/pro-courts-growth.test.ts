import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProClient, ProData } from "@/lib/pro/types";
import type { ProCourtAgreement } from "@/lib/pro/courts-types";
import { addDays, atLocal, localDate, weekdayIndex } from "@/lib/pro/format";
import { courtsOps, emptyCourtsData, patchCourts } from "@/lib/pro/courts-base";
import { isFree } from "@/lib/pro/courts";
import {
  agreementFor,
  agreementMonth,
  agreementPrice,
  agreementReport,
  checkWelcomePack,
  courseOf,
  createWelcomePack,
  dormantDetails,
  dormantMessage,
  easterSunday,
  isWelcomeSeason,
  monthName,
  nextWeekday,
  playHabit,
  removeAgreement,
  saveAgreement,
  toggleAgreementMember,
  uniCalendar,
  welcomePackDefaults,
  welcomePackOf,
  welcomePackShareText,
} from "@/lib/pro/courts-growth";
import {
  deskWarning,
  lastSeenOf,
  membersAway,
  monthlyStudySummaries,
  studyHoursLabel,
  studySummaryMessage,
  summaryMonth,
} from "@/lib/pro/courts-study";
import {
  INVOICE_PROBLEM,
  checkInvoice,
  invoiceText,
  invoicesCsv,
  issueInvoice,
  nextInvoiceNumber,
  setFiscal,
  splitVat,
  unbilledPayments,
  validNif,
} from "@/lib/pro/courts-invoices";
import { addWarning } from "@/lib/pro/courts-admin";
import { parseProCourtsState, planProCourtsStateCommand } from "@/lib/pro/remote-courts-state";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);
const padel = () => buildDemo("sports_facility", now);
const study = () => buildDemo("coworking", now);
const DASHES = /[–—]/;

function client(over: Partial<ProClient> = {}): ProClient {
  return {
    id: "c-x",
    name: "Marta Ruiz",
    phone: "600 111 222",
    tags: [],
    visits: 12,
    spentCents: 0,
    lastVisit: atLocal(addDays(today, -30), 19 * 60),
    noShows: 0,
    source: "phone",
    marketingConsent: true,
    cardMember: false,
    createdAt: atLocal(addDays(today, -300), 12 * 60),
    ...over,
  };
}

describe("pistas: jugadores dormidos", () => {
  it("encuentra a quien venía a menudo y lleva tres semanas sin reservar", () => {
    const d = padel();
    const list = dormantDetails(d, now);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(p.client.visits).toBeGreaterThanOrEqual(6);
      expect(p.daysAway).toBeGreaterThanOrEqual(21);
      expect(p.message).toContain(d.space.name);
      expect(p.message).not.toMatch(DASHES);
      const future = d.bookings.some(
        (b) => b.clientId === p.client.id && localDate(b.start) >= today && b.status === "confirmed",
      );
      expect(future).toBe(false);
    }
  });

  it("no cuenta a quien ya tiene una reserva próxima ni a quien viene poco", () => {
    const base = padel();
    const c = client();
    const d: ProData = { ...base, clients: [c, client({ id: "c-y", visits: 2 })] };
    expect(dormantDetails(d, now).map((p) => p.client.id)).toEqual(["c-x"]);
    const booked: ProData = {
      ...d,
      bookings: [
        ...d.bookings,
        {
          id: "b-future",
          kind: "court",
          clientId: "c-x",
          clientName: c.name,
          resourceId: d.resources[0].id,
          start: atLocal(addDays(today, 2), 18 * 60),
          end: atLocal(addDays(today, 2), 19 * 60 + 30),
          partySize: 4,
          status: "confirmed",
          priceCents: 2400,
          paidCents: 0,
          source: "phone",
        },
      ],
    };
    expect(dormantDetails(booked, now)).toEqual([]);
  });

  it("saca su día y hora de siempre y ofrece esa pista si está libre", () => {
    const base = padel();
    const c = client();
    // Tres martes a las 19:00 en el pasado.
    const past = [1, 2, 3].map((w) => {
      const date = nextWeekday(addDays(today, -7 * w - 6), 1);
      return {
        id: `h-${w}`,
        kind: "court" as const,
        clientId: c.id,
        clientName: c.name,
        resourceId: base.resources[0].id,
        start: atLocal(date, 19 * 60),
        end: atLocal(date, 20 * 60 + 30),
        partySize: 4,
        status: "done" as const,
        priceCents: 2400,
        paidCents: 2400,
        source: "phone" as const,
      };
    });
    const d: ProData = { ...base, clients: [c], bookings: [...base.bookings, ...past], openMatches: [] };
    expect(playHabit(d, c.id)).toMatchObject({ weekday: 1, minute: 19 * 60, times: 3 });
    const [p] = dormantDetails(d, now);
    if (p.freeSlot) {
      expect(weekdayIndex(p.freeSlot.date)).toBe(1);
      expect(p.message).toContain("martes a las 19:00");
      const r = d.resources.find((x) => x.id === p.freeSlot!.resourceId)!;
      expect(isFree(d, r, p.freeSlot.date, p.freeSlot.minute, 90)).toBe(true);
    } else {
      expect(p.message).toContain("¿Te buscamos pista");
    }
  });

  it("prefiere un partido abierto de su nivel para volver", () => {
    const text = dormantMessage({
      name: "Marta Ruiz",
      club: "Pádel Raspeig",
      match: {
        id: "m",
        resourceId: "r1",
        start: atLocal("2026-09-26", 19 * 60 + 30),
        level: "3,0",
        players: ["A", "B", "C"],
        needed: 1,
      },
    });
    expect(text).toBe(
      "Hola Marta, hace tiempo que no te vemos por Pádel Raspeig. El sábado a las 19:30 hay un partido de nivel 3,0 y le falta uno. ¿Te apuntamos?",
    );
  });
});

describe("pistas: pack de bienvenida de septiembre", () => {
  it("sabe en qué curso y temporada estamos", () => {
    expect(courseOf("2026-09-24")).toBe("2026-27");
    expect(courseOf("2027-03-01")).toBe("2026-27");
    expect(courseOf("2026-07-01")).toBe("2026-27");
    expect(isWelcomeSeason("2026-09-24")).toBe(true);
    expect(isWelcomeSeason("2026-11-02")).toBe(false);
    expect(isWelcomeSeason("2026-08-20")).toBe(true);
  });

  it("propone un clínic en valle y una americana que caben", () => {
    const d = padel();
    const plan = welcomePackDefaults(d, today)!;
    expect(plan.course).toBe("2026-27");
    expect(plan.clinic.from).toBeGreaterThanOrEqual(10 * 60);
    expect(plan.clinic.from + plan.clinic.duration).toBeLessThanOrEqual(14 * 60);
    expect(plan.clinic.weekday).toBeLessThan(5);
    expect(plan.americana.date > today).toBe(true);
    expect(checkWelcomePack(d, plan)).toMatchObject({ ok: true });
  });

  it("crea clínic, americana con pistas bloqueadas y la marca del curso de una vez", () => {
    const d = padel();
    const plan = welcomePackDefaults(d, today)!;
    const next = createWelcomePack(d, plan, { group: "g1", americana: "a1", block: "bk1", campaign: "cp1" }, now.toISOString());
    const ops = courtsOps(next);
    expect(ops.school.find((g) => g.id === "g1")).toMatchObject({ level: "Iniciación", weekday: plan.clinic.weekday });
    const a = ops.americanas.find((x) => x.id === "a1")!;
    expect(a.studentsOnly).toBe(true);
    expect(a.resourceIds.length).toBe(3);
    expect(ops.blocks.find((b) => b.id === "bk1")).toMatchObject({ reason: "tournament", sourceId: "a1", date: plan.americana.date });
    expect(welcomePackOf(next, today)).toMatchObject({ groupId: "g1", americanaId: "a1", course: "2026-27" });
    // Las pistas de la americana ya no están libres a esa hora.
    const r = next.resources.find((x) => x.id === a.resourceIds[0])!;
    expect(isFree(next, r, a.date, a.from, 60)).toBe(false);
    expect(welcomePackOf(d, today)).toBeUndefined();
  });

  it("no crea nada si el monitor ya tiene clase a esa hora", () => {
    const d = padel();
    const plan = welcomePackDefaults(d, today)!;
    const busy = courtsOps(d).school[0];
    const clash = {
      ...plan,
      clinic: { ...plan.clinic, coachId: busy.coachId, weekday: busy.weekday, from: busy.from, resourceId: d.resources.find((r) => r.id !== busy.resourceId && r.kind === "court")!.id },
    };
    expect(checkWelcomePack(d, clash)).toEqual({ ok: false, reason: "clinic_coach" });
    expect(createWelcomePack(d, clash, { group: "g", americana: "a", block: "b", campaign: "c" }, now.toISOString())).toBe(d);
  });

  it("escribe la invitación para el grupo del club", () => {
    const plan = welcomePackDefaults(padel(), today)!;
    const text = welcomePackShareText(plan, "Pádel Raspeig");
    expect(text).toContain("Clínic de iniciación");
    expect(text).toContain("Americana de bienvenida");
    expect(text).not.toMatch(DASHES);
  });
});

describe("pistas: convenios", () => {
  const ua: ProCourtAgreement = {
    id: "cv-t",
    name: "Deportes UA",
    kind: "university",
    university: "Universidad de Alicante",
    memberIds: [],
    discountPct: 20,
    valleyOnly: true,
    from: "2026-09-01",
    to: "2027-07-31",
    contact: { name: "Nuria Pastor" },
    active: true,
    createdAt: now.toISOString(),
  };

  it("aplica el precio pactado a los estudiantes verificados de esa universidad, solo en valle", () => {
    const base = padel();
    const uaStudent = client({ id: "c-ua", student: { university: "Universidad de Alicante", faculty: "Derecho", verified: true } });
    const unverified = client({ id: "c-nv", student: { university: "Universidad de Alicante", faculty: "Derecho", verified: false } });
    const d = saveAgreement({ ...patchCourts(base, { agreements: [] }), clients: [uaStudent, unverified] }, ua);
    expect(agreementFor(d, "c-ua", "2026-09-29", 11 * 60)?.id).toBe("cv-t");
    expect(agreementFor(d, "c-ua", "2026-09-29", 19 * 60)).toBeNull();
    expect(agreementFor(d, "c-ua", "2026-10-03", 11 * 60)).toBeNull(); // sábado
    expect(agreementFor(d, "c-nv", "2026-09-29", 11 * 60)).toBeNull();
    expect(agreementFor(d, "c-ua", "2027-08-10", 11 * 60)).toBeNull();
    expect(agreementPrice(1800, 20)).toBe(1450);
  });

  it("vale para los apuntados a mano y se puede quitar a alguien", () => {
    const base = patchCourts(padel(), { agreements: [] });
    const c = client({ id: "c-a" });
    const assoc: ProCourtAgreement = { ...ua, id: "cv-a", kind: "association", university: undefined, valleyOnly: false, discountPct: 10 };
    let d = saveAgreement({ ...base, clients: [c] }, assoc);
    expect(agreementFor(d, "c-a", "2026-09-29", 19 * 60)).toBeNull();
    d = toggleAgreementMember(d, "cv-a", "c-a");
    expect(agreementFor(d, "c-a", "2026-09-29", 19 * 60)?.id).toBe("cv-a");
    d = toggleAgreementMember(d, "cv-a", "c-a");
    expect(agreementFor(d, "c-a", "2026-09-29", 19 * 60)).toBeNull();
    expect(courtsOps(removeAgreement(d, "cv-a")).agreements).toEqual([]);
  });

  it("resume el mes para el responsable con lo que se han ahorrado", () => {
    const base = patchCourts(padel(), { agreements: [] });
    const c = client({ id: "c-ua", student: { university: "Universidad de Alicante", faculty: "Derecho", verified: true } });
    const r = base.resources.find((x) => x.kind === "court")!;
    const date = "2026-09-22"; // martes
    const d = saveAgreement(
      {
        ...base,
        clients: [c],
        bookings: [
          { id: "k1", kind: "court", clientId: "c-ua", clientName: c.name, resourceId: r.id, start: atLocal(date, 11 * 60), end: atLocal(date, 12 * 60 + 30), partySize: 4, status: "done", priceCents: 1000, paidCents: 1000, source: "franky" },
          { id: "k2", kind: "court", clientId: "c-ua", clientName: c.name, resourceId: r.id, start: atLocal(date, 19 * 60), end: atLocal(date, 20 * 60 + 30), partySize: 4, status: "done", priceCents: 2400, paidCents: 2400, source: "franky" },
          { id: "k3", kind: "court", clientId: "c-ua", clientName: c.name, resourceId: r.id, start: atLocal("2026-09-23", 11 * 60), end: atLocal("2026-09-23", 12 * 60 + 30), partySize: 4, status: "cancelled", priceCents: 1000, paidCents: 0, source: "franky" },
        ],
      },
      ua,
    );
    const m = agreementMonth(d, ua, "2026-09");
    expect(m.bookings).toBe(1);
    expect(m.minutes).toBe(90);
    expect(m.amountCents).toBe(1000);
    expect(m.players).toEqual([{ clientId: "c-ua", name: c.name, bookings: 1 }]);
    const report = agreementReport(ua, "2026-09", m, "Pádel Raspeig");
    expect(report).toContain("septiembre");
    expect(report).toContain("1 reserva");
    expect(report).not.toMatch(DASHES);
  });

  it("la demo trae convenios con uso real este mes", () => {
    const d = padel();
    const ops = courtsOps(d);
    expect(ops.agreements.length).toBe(2);
    const assoc = ops.agreements.find((a) => a.kind === "association")!;
    expect(assoc.memberIds.length).toBeGreaterThan(0);
  });
});

describe("calendario universitario", () => {
  it("calcula la Pascua de cada año", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2028)).toBe("2028-04-16");
  });

  it("empieza por el momento actual y propone el pack en septiembre", () => {
    const list = uniCalendar(today, "sports_facility");
    expect(list[0].title).toBe("Inicio de curso");
    expect(list[0].action).toEqual({ kind: "welcome" });
    expect(list.some((m) => m.title === "Exámenes de enero")).toBe(true);
    const santa = list.find((m) => m.title === "Semana Santa")!;
    expect(santa.from <= "2027-03-28" && santa.to >= "2027-03-28").toBe(true);
    for (const m of list) {
      expect(m.idea).not.toMatch(DASHES);
      expect(m.what).not.toMatch(DASHES);
    }
  });

  it("en una sala de estudio, enero es el pico y se propone el bono exámenes", () => {
    const list = uniCalendar("2026-12-10", "coworking");
    expect(list[0].title).toBe("Antes de exámenes");
    const jan = list.find((m) => m.title === "Exámenes de enero")!;
    expect(jan.demand).toBe("alta");
    expect(jan.action).toEqual({ kind: "offer", title: "Bono exámenes" });
  });

  it("nombra los meses en español", () => {
    expect(monthName("2026-09")).toBe("septiembre");
    expect(monthName("2027-01")).toBe("enero");
  });
});

describe("sala de estudio: horas del mes, avisos y socios que no vienen", () => {
  it("escribe el resumen de horas por persona", () => {
    expect(studyHoursLabel(86 * 60)).toBe("86 h");
    expect(studyHoursLabel(3 * 60 + 30)).toBe("3 h 30 min");
    expect(studyHoursLabel(40)).toBe("40 min");
    const text = studySummaryMessage({ name: "Irene Soler", minutes: 86 * 60, month: "2026-09", space: "Sala Silencio" });
    expect(text).toBe("Hola Irene, en septiembre has estudiado 86 h en Sala Silencio. Gracias por venir, ¡a por el siguiente mes!");
  });

  it("prepara los resúmenes del mes ordenados por horas", () => {
    const d = study();
    const list = monthlyStudySummaries(d, today.slice(0, 7), now);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].rank).toBe(1);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].minutes).toBeGreaterThanOrEqual(list[i].minutes);
    expect(list.every((s) => s.message.includes("Sala") || s.message.includes(d.space.name))).toBe(true);
  });

  it("sabe cuándo toca mandar el resumen", () => {
    expect(summaryMonth("2026-09-28")).toBe("2026-09");
    expect(summaryMonth("2026-10-02")).toBe("2026-09");
    expect(summaryMonth("2026-09-15")).toBeNull();
    expect(summaryMonth("2026-02-26")).toBe("2026-02");
  });

  it("marca en recepción a quien lleva tres avisos", () => {
    let d = study();
    d = patchCourts(d, { warnings: [] });
    const who = { name: "Lucía Gil" };
    expect(deskWarning(d, who, today)).toEqual({ count: 0, flagged: false });
    for (let i = 0; i < 3; i++)
      d = addWarning(d, { id: `w${i}`, name: "Lucía Gil", kind: "noise", at: atLocal(addDays(today, -i), 11 * 60) });
    expect(deskWarning(d, who, today)).toMatchObject({ count: 3, flagged: true, lastKind: "noise" });
    expect(deskWarning(d, { name: " lucía gil " }, today).count).toBe(3);
  });

  it("encuentra a los socios que llevan diez días sin venir y ofrece pausar", () => {
    const d = study();
    const away = membersAway(d, today);
    for (const a of away) {
      expect(a.days).toBeGreaterThanOrEqual(10);
      expect(["active", "overdue", "trial"]).toContain(a.member.status);
      expect(a.message).toContain("pausar");
      expect(a.message).not.toMatch(DASHES);
      if (a.lastSeen) expect(lastSeenOf(d, a.member.id, today)).toBe(a.lastSeen);
    }
    // Un socio que vino ayer no aparece.
    const m = d.members.find((x) => x.status === "active")!;
    const r = d.resources.find((x) => x.kind === "desk")!;
    const yesterday = addDays(today, -1);
    const withVisit: ProData = {
      ...d,
      bookings: [
        ...d.bookings,
        { id: "v1", kind: "court", clientId: m.id, clientName: m.name, resourceId: r.id, start: atLocal(yesterday, 10 * 60), end: atLocal(yesterday, 14 * 60), partySize: 1, status: "done", priceCents: 0, paidCents: 0, source: "walkin" },
      ],
    };
    expect(membersAway(withVisit, today).some((a) => a.member.id === m.id)).toBe(false);
  });
});

describe("facturas", () => {
  it("valida DNI, NIE y NIF de empresa con su control", () => {
    expect(validNif("12345678Z")).toBe(true);
    expect(validNif("12345678-z")).toBe(true);
    expect(validNif("12345678A")).toBe(false);
    expect(validNif("X1234567L")).toBe(true);
    expect(validNif("Q2826000H")).toBe(true);
    expect(validNif("B54837216")).toBe(true);
    expect(validNif("B54837217")).toBe(false);
    expect(validNif("hola")).toBe(false);
  });

  it("saca base e IVA del total cobrado", () => {
    expect(splitVat(12100, 21)).toEqual({ baseCents: 10000, vatCents: 2100 });
    const { baseCents, vatCents } = splitVat(5500, 21);
    expect(baseCents + vatCents).toBe(5500);
  });

  it("numera de forma correlativa por serie y año", () => {
    const d = study();
    const invoices = courtsOps(d).invoices;
    const year = Number(today.slice(0, 4));
    expect(nextInvoiceNumber(invoices, "T", year)).toEqual({ seq: 3, number: `T${year}-0003` });
    expect(nextInvoiceNumber(invoices, "F", year)).toEqual({ seq: 2, number: `F${year}-0002` });
    expect(nextInvoiceNumber(invoices, "F", year + 1).number).toBe(`F${year + 1}-0001`);
  });

  it("emite una simplificada desde un cobro y no la repite", () => {
    const d = study();
    const [payment] = unbilledPayments(d, addDays(today, -7));
    expect(payment).toBeDefined();
    const draft = {
      full: false,
      date: today,
      customer: { name: payment.clientName },
      lines: [{ concept: payment.concept, amountCents: payment.amountCents }],
      paymentId: payment.id,
    };
    const { data: next, invoice } = issueInvoice(d, draft, { id: "inv-1", nowIso: now.toISOString() });
    expect(invoice?.series).toBe("T");
    expect(invoice?.number).toBe(`T2026-0003`);
    expect(invoice!.baseCents + invoice!.vatCents).toBe(payment.amountCents);
    expect(unbilledPayments(next, addDays(today, -7)).some((p) => p.id === payment.id)).toBe(false);
    expect(checkInvoice(next, draft)).toEqual({ ok: false, reason: "paid" });
  });

  it("pide factura completa por encima de 400 € y datos del cliente", () => {
    const d = study();
    const big = { full: false, date: today, customer: { name: "Academia" }, lines: [{ concept: "Sala, trimestre", amountCents: 45000 }] };
    expect(checkInvoice(d, big)).toEqual({ ok: false, reason: "limit" });
    expect(INVOICE_PROBLEM.limit).toContain("400 €");
    expect(checkInvoice(d, { ...big, full: true, customer: { name: "Academia", nif: "B42985119" } })).toEqual({ ok: false, reason: "address" });
    expect(checkInvoice(d, { ...big, full: true, customer: { name: "Academia", nif: "B42985118", address: "Calle 1" } })).toEqual({ ok: false, reason: "nif" });
    const ok = checkInvoice(d, { ...big, full: true, customer: { name: "Academia", nif: "B42985119", address: "Calle 1" } });
    expect(ok).toEqual({ ok: true, series: "F", totalCents: 45000 });
  });

  it("no factura sin los datos del negocio", () => {
    const d = patchCourts(study(), { fiscal: null });
    expect(checkInvoice(d, { full: false, date: today, customer: { name: "X" }, lines: [{ concept: "Día", amountCents: 1200 }] })).toEqual({ ok: false, reason: "fiscal" });
    const fixed = setFiscal(d, { name: " Sala SL ", nif: "b-54837216", address: "Calle 2", vatPct: 21 });
    expect(courtsOps(fixed).fiscal).toEqual({ name: "Sala SL", nif: "B54837216", address: "Calle 2", vatPct: 21 });
  });

  it("exporta el libro de facturas y el texto de cada una", () => {
    const d = study();
    const ops = courtsOps(d);
    const csv = invoicesCsv(ops.invoices);
    expect(csv.split("\n")).toHaveLength(ops.invoices.length + 1);
    expect(csv).toContain("Simplificada");
    expect(csv).toContain(";\"21\";");
    const text = invoiceText(ops.invoices.find((i) => i.series === "F")!, ops.fiscal!);
    expect(text).toContain("NIF B42985119");
    expect(text).toContain("Total: 180,00 €");
    expect(text).not.toMatch(DASHES);
  });
});

describe("guardado en la cuenta real", () => {
  it("los datos nuevos viajan en el documento del motor", () => {
    const d = padel();
    const before = { ...d, courts: { ...courtsOps(d), revision: 4 } };
    const after = saveAgreement(before, { ...courtsOps(d).agreements[0], id: "cv-new", name: "Asociación Erasmus" });
    const cmd = planProCourtsStateCommand("court.agreement.save", before, after);
    expect(cmd.rpc).toBe("pro_save_courts_state");
    const state = (cmd.args.p_data as { state: { agreements: { id: string }[] } }).state;
    expect(state.agreements.map((a) => a.id)).toContain("cv-new");
  });

  it("un documento antiguo sin convenios ni facturas se lee con valores por defecto", () => {
    const legacy = { ...emptyCourtsData() } as Partial<ReturnType<typeof emptyCourtsData>>;
    delete legacy.agreements;
    delete legacy.invoices;
    delete legacy.fiscal;
    delete legacy.campaigns;
    const parsed = parseProCourtsState({ organization_id: "org", revision: 2, data: legacy }, "org");
    expect(parsed.agreements).toEqual([]);
    expect(parsed.invoices).toEqual([]);
    expect(parsed.fiscal).toBeNull();
    expect(parsed.campaigns).toEqual([]);
  });
});
