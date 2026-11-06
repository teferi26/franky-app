import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import {
  EMPTY_UNI_EXTRAS,
  PRIVACY_MIN_GROUP,
  PUBLICATION_TEMPLATES,
  accessibilityHints,
  activeUrgent,
  activityClashes,
  audienceText,
  buildSeasonReport,
  caseDaysLeft,
  caseState,
  creditEligible,
  creditsCsv,
  decideCredits,
  docsOf,
  ectsFor,
  endUrgent,
  estimateReach,
  filterHistory,
  firstYearAlerts,
  fraudSignals,
  initialReads,
  isUrgentActive,
  medianResponseMinutes,
  missingDocs,
  moderationCsv,
  monthGrid,
  openCase,
  ownerHistory,
  pendingCreditGroups,
  readSummary,
  readsByFaculty,
  remindUnread,
  rotatingCode,
  sealExpiryFor,
  sealState,
  seasonReportCsv,
  seasonReportHtml,
  shiftMonth,
  sortModerationQueue,
  surveyResults,
  templateForDeadline,
  uniExtrasOf,
  upcomingDeadlines,
  urgentUntil,
  whatsappShareUrl,
  zoneObservatory,
} from "@/lib/pro/university";
import type {
  ProUniAssocActivity,
  ProUniExtras,
  ProUniMarketRoom,
  UniAssociation,
  UniHousing,
  UniModeration,
  UniPublication,
} from "@/lib/pro/university-types";

const now = new Date("2026-09-27T10:00:00Z");

function demo(): ProData {
  return buildDemo("university", now);
}

function extras(d: ProData): ProUniExtras {
  return uniExtrasOf(d);
}

const pub = (patch: Partial<UniPublication> = {}): UniPublication => ({
  id: "p",
  title: "Aviso",
  channel: "aviso",
  at: now.toISOString(),
  reach: 0,
  reactions: 0,
  status: "published",
  audience: "Todo el campus",
  ...patch,
});

describe("datos del motor", () => {
  it("un espacio sin datos del motor se lee con listas vacías", () => {
    const d = demo();
    delete d.uniExtras;
    expect(uniExtrasOf(d)).toBe(EMPTY_UNI_EXTRAS);
    expect(buildSeasonReport(d, now).faculties).toEqual([]);
  });

  it("la demo trae públicos, plazos, créditos, comercios y muestra de precios", () => {
    const x = extras(demo());
    expect(x.audiences.campus).toBeGreaterThan(0);
    expect(x.deadlines.length).toBeGreaterThanOrEqual(3);
    expect(x.credits.some((r) => r.status === "pending")).toBe(true);
    expect(x.perks.some((p) => p.enabled)).toBe(true);
    expect(x.market.length).toBeGreaterThan(100);
  });

  it("el contador de créditos de cada asociación coincide con sus solicitudes pendientes", () => {
    const d = demo();
    const x = extras(d);
    for (const a of d.uniAssociations) {
      const pending = x.credits.filter((r) => r.associationId === a.id && r.status === "pending").length;
      expect(a.ectsRequests).toBe(pending);
    }
  });

  it("ningún texto de la demo ni de las plantillas usa guiones largos", () => {
    expect(JSON.stringify(demo())).not.toMatch(/[–—]/);
    expect(JSON.stringify(PUBLICATION_TEMPLATES)).not.toMatch(/[–—]/);
  });
});

describe("públicos y alcance", () => {
  const x = extras(demo());

  it("estima el alcance con la tasa del canal y redondea a decenas", () => {
    const e = estimateReach(x, "aviso", "campus");
    expect(e.people).toBe(x.audiences.campus);
    expect(e.reach % 10).toBe(0);
    expect(e.reach).toBeLessThan(e.people);
    expect(estimateReach(x, "fomo", "campus").reach).toBeLessThan(e.reach);
  });

  it("suma solo las facultades elegidas y acota primero por facultad", () => {
    const two = estimateReach(x, "aviso", "faculties", ["Derecho", "Ciencias"]);
    expect(two.people).toBe(x.audiences.faculties.Derecho + x.audiences.faculties.Ciencias);
    const absent = estimateReach(x, "aviso", "welcome_absent", ["Ciencias"]);
    const ciencias = x.faculties.find((f) => f.faculty === "Ciencias")!;
    expect(absent.people).toBe(ciencias.active30 - ciencias.participated);
    expect(estimateReach(x, "aviso", "welcome_absent").people).toBe(x.audiences.welcome_absent);
  });

  it("un público de menos de 10 personas no se puede usar", () => {
    const tiny = estimateReach(x, "aviso", "welcome_absent", ["Doble grado internacional"]);
    expect(tiny.people).toBeLessThan(PRIVACY_MIN_GROUP);
    expect(tiny.tooSmall).toBe(true);
    expect(estimateReach(x, "aviso", "faculties", []).tooSmall).toBe(true);
  });

  it("nombra el público de forma legible", () => {
    expect(audienceText("campus")).toBe("Todo el campus");
    expect(audienceText("faculties", ["Derecho", "Ciencias"])).toBe("Derecho, Ciencias");
    expect(audienceText("welcome_absent", ["Ciencias"])).toBe("Primero que no vino a la bienvenida, Ciencias");
    expect(audienceText("erasmus", ["Ciencias"])).toBe("Erasmus e internacionales");
  });

  it("prepara la lectura vacía por facultad al publicar", () => {
    const campus = initialReads(x, "campus");
    expect(campus).toHaveLength(Object.keys(x.audiences.faculties).length);
    expect(campus.every((r) => r.read === 0)).toBe(true);
    expect(initialReads(x, "erasmus")).toEqual([{ faculty: "Erasmus e internacionales", audience: x.audiences.erasmus, read: 0 }]);
  });
});

describe("Lo he leído", () => {
  const p = pub({
    readReceipt: true,
    reads: [
      { faculty: "Derecho", audience: 100, read: 80 },
      { faculty: "Ciencias", audience: 200, read: 50 },
      { faculty: "Doble grado", audience: 6, read: 6 },
    ],
  });

  it("resume lo leído y lo que falta", () => {
    expect(readSummary(p)).toEqual({ audience: 306, read: 136, unread: 170, pct: 44 });
  });

  it("oculta facultades de menos de 10 y ordena de menos a más leída", () => {
    const rows = readsByFaculty(p);
    expect(rows.map((r) => r.faculty)).toEqual(["Ciencias", "Derecho", "Doble grado"]);
    expect(rows[2].hidden).toBe(true);
  });

  it("recuerda solo a quien no lo ha leído", () => {
    const next = remindUnread(p, now);
    expect(next.reminders).toEqual([{ at: now.toISOString(), sentTo: 170 }]);
    const allRead = pub({ readReceipt: true, reads: [{ faculty: "Derecho", audience: 10, read: 10 }] });
    expect(remindUnread(allRead, now)).toBe(allRead);
  });
});

describe("avisos urgentes", () => {
  it("calcula hasta cuándo queda fijado", () => {
    expect(urgentUntil("1h", now)).toBe("2026-09-27T11:00:00.000Z");
    expect(urgentUntil("3h", now)).toBe("2026-09-27T13:00:00.000Z");
    // 23:59 en Madrid (horario de verano, UTC+2).
    expect(urgentUntil("day", now)).toBe("2026-09-27T21:59:00.000Z");
  });

  it("solo está activo publicado, antes de su hora y sin retirar", () => {
    const p = pub({ urgent: { kind: "closure", until: "2026-09-27T12:00:00Z" } });
    expect(isUrgentActive(p, now)).toBe(true);
    expect(isUrgentActive(p, new Date("2026-09-27T12:30:00Z"))).toBe(false);
    expect(isUrgentActive({ ...p, status: "draft" }, now)).toBe(false);
    const ended = endUrgent(p, now);
    expect(ended.urgent?.endedAt).toBe(now.toISOString());
    expect(isUrgentActive(ended, now)).toBe(false);
    expect(activeUrgent([pub(), p], now)?.id).toBe("p");
    expect(activeUrgent([ended], now)).toBeNull();
  });

  it("la demo arranca con un aviso urgente vigente", () => {
    expect(activeUrgent(demo().uniPublications as UniPublication[], now)).not.toBeNull();
  });
});

describe("plantillas, accesibilidad y compartir", () => {
  it("cada plazo trae la plantilla que le toca con su título y público", () => {
    const t = templateForDeadline({ id: "d", title: "Becas: fin del plazo", date: "2026-10-06", kind: "becas", audience: "first_year" });
    expect(t.id).toBe("becas");
    expect(t.title).toBe("Becas: fin del plazo");
    expect(t.audience).toBe("first_year");
    expect(t.readReceipt).toBe(true);
    expect(templateForDeadline({ id: "d", title: "Otro", date: "2026-10-06", kind: "otro", audience: "campus" }).channel).toBe("aviso");
  });

  it("avisa de mayúsculas, textos largos y enlaces pegados", () => {
    expect(accessibilityHints("Horario de la biblioteca", "Abre a las 8.")).toEqual([]);
    const hints = accessibilityHints("CIERRE DEL CAMPUS HOY", `Más info en https://example.org ${"a".repeat(900)}!!`);
    expect(hints).toHaveLength(4);
  });

  it("comparte por WhatsApp con el enlace de la ficha pública", () => {
    const url = whatsappShareUrl({ title: "Becas", body: "Plazo abierto" }, "universidad-demo");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("https://franky.es/n/universidad-demo");
  });
});

describe("pasaporte", () => {
  it("el QR del proyector cambia cada 30 segundos y es estable dentro de la ventana", () => {
    const t0 = Date.parse("2026-09-27T10:00:00Z");
    const a = rotatingCode("BIEN-01", t0);
    expect(rotatingCode("BIEN-01", t0 + 29_000).token).toBe(a.token);
    expect(rotatingCode("BIEN-01", t0 + 30_000).token).not.toBe(a.token);
    expect(a.token.startsWith("BIEN-01-")).toBe(true);
    expect(rotatingCode("BIEN-01", t0 + 5_000).msLeft).toBe(25_000);
  });

  it("la encuesta no enseña resultados con menos de 10 respuestas", () => {
    expect(surveyResults({ question: "?", options: ["a", "b", "c"], answers: [3, 2, 1] }).hidden).toBe(true);
    const r = surveyResults({ question: "?", options: ["a", "b", "c"], answers: [60, 30, 10] });
    expect(r.hidden).toBe(false);
    expect(r.rows.map((x) => x.pct)).toEqual([60, 30, 10]);
  });
});

describe("alojamiento", () => {
  const base: UniHousing = {
    id: "h",
    title: "Piso",
    owner: "Ana",
    zone: "Tómbola",
    priceCents: 30000,
    verified: true,
    complaints: 0,
    status: "verified",
  };

  it("el sello caduca el 31 de agosto del curso en que se concede", () => {
    expect(sealExpiryFor("2026-07-15T10:00:00Z")).toBe("2027-08-31");
    expect(sealExpiryFor("2026-09-27T10:00:00Z")).toBe("2027-08-31");
    expect(sealExpiryFor("2026-03-01T10:00:00Z")).toBe("2026-08-31");
  });

  it("pide renovar desde julio y marca los caducados", () => {
    expect(sealState({ ...base, verifiedUntil: "2027-08-31" }, now)).toBe("valid");
    expect(sealState({ ...base, verifiedUntil: "2027-08-31" }, new Date("2027-07-10T10:00:00Z"))).toBe("renewal");
    expect(sealState({ ...base, verifiedUntil: "2026-08-31" }, now)).toBe("expired");
    expect(sealState({ ...base, status: "pending" }, now)).toBe("none");
  });

  it("un caso vence si el propietario no responde a tiempo", () => {
    const c = openCase("Queja", 5, now, "c");
    expect(caseState(c, now)).toBe("open");
    expect(caseDaysLeft(c, now)).toBe(5);
    const later = new Date(now.getTime() + 6 * 86_400_000);
    expect(caseState(c, later)).toBe("overdue");
    expect(caseDaysLeft(c, later)).toBeLessThan(0);
    expect(caseState({ ...c, status: "answered" }, later)).toBe("answered");
  });

  it("resume el historial del propietario sin contar el piso que se revisa", () => {
    const all = demo().uniHousing as UniHousing[];
    const h1 = all.find((h) => h.id === "h1")!;
    const history = ownerHistory(all, h1);
    expect(history.others.every((o) => o.owner === "Habitat Campus" && o.id !== "h1")).toBe(true);
    expect(history.verified).toBeGreaterThan(0);
    expect(history.complaints).toBeGreaterThan(0);
  });

  it("la demo tiene un caso vencido y sellos caducados", () => {
    const all = demo().uniHousing as UniHousing[];
    expect(all.some((h) => h.case && caseState(h.case, now) === "overdue")).toBe(true);
    expect(all.some((h) => sealState(h, now) === "expired")).toBe(true);
  });

  it("el observatorio da la mediana por zona y oculta zonas pequeñas", () => {
    const rooms: ProUniMarketRoom[] = [
      ...Array.from({ length: 11 }, (_, i) => ({ zone: "A", priceCents: 30000 + i * 1000, minutesToCampus: 10, kind: "room" as const })),
      ...Array.from({ length: 4 }, () => ({ zone: "B", priceCents: 50000, minutesToCampus: 20, kind: "room" as const })),
      { zone: "A", priceCents: 90000, minutesToCampus: 10, kind: "studio" },
    ];
    const zones = zoneObservatory(rooms);
    expect(zones[0]).toMatchObject({ zone: "A", count: 11, medianCents: 35000, hidden: false });
    expect(zones[1]).toMatchObject({ zone: "B", hidden: true });
  });
});

describe("asociaciones y créditos", () => {
  it("sabe qué documentos faltan y da por entregado todo a las registradas", () => {
    const d = demo();
    const ajedrez = d.uniAssociations.find((a) => a.id === "as9") as UniAssociation;
    expect(missingDocs(ajedrez).map((x) => x.key)).toEqual(["plan"]);
    const registered = d.uniAssociations.find((a) => a.registered) as UniAssociation;
    expect(docsOf(registered).every((x) => x.ok)).toBe(true);
  });

  it("la asistencia mínima decide qué se puede validar", () => {
    const r = { id: "r", associationId: "a", activity: "x", student: "s", email: "e", faculty: "f", hours: 10, attended: 4, sessions: 5, status: "pending" as const };
    expect(creditEligible(r)).toBe(true);
    expect(creditEligible({ ...r, attended: 3 })).toBe(false);
    expect(ectsFor(10, 25)).toBe(0.4);
    expect(ectsFor(20, 0)).toBe(0);
  });

  it("valida un lote y recalcula el contador de cada asociación", () => {
    const d = demo();
    const x = extras(d);
    const groups = pendingCreditGroups(x.credits, d.uniAssociations as UniAssociation[]);
    const target = groups.find((g) => g.associationId === "as4")!;
    const ids = target.requests.filter(creditEligible).map((r) => r.id);
    const next = decideCredits(d, ids, "validated", now);
    const as4 = next.uniAssociations.find((a) => a.id === "as4")!;
    expect(as4.ectsRequests).toBe(target.requests.length - ids.length);
    const decided = extras(next).credits.filter((r) => ids.includes(r.id));
    expect(decided.every((r) => r.status === "validated" && r.decidedAt === now.toISOString())).toBe(true);
    // Otras asociaciones no cambian.
    expect(next.uniAssociations.find((a) => a.id === "as1")!.ectsRequests).toBe(d.uniAssociations.find((a) => a.id === "as1")!.ectsRequests);
  });

  it("el CSV para secretaría solo lleva lo validado y neutraliza fórmulas", () => {
    const d = demo();
    const x = extras(d);
    const credits = [
      ...x.credits,
      { ...x.credits[0], id: "evil", student: "=HYPERLINK(1)", status: "validated" as const, decidedAt: now.toISOString() },
    ];
    const csv = creditsCsv(credits, d.uniAssociations as UniAssociation[], 25);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Estudiante");
    expect(lines).toHaveLength(1 + credits.filter((r) => r.status === "validated").length);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });

  it("detecta actividades en el mismo espacio a la vez, sin distinguir tildes ni mayúsculas", () => {
    const acts: ProUniAssocActivity[] = [
      { id: "a", associationId: "x", title: "A", start: "2026-10-01T16:00:00Z", end: "2026-10-01T18:00:00Z", place: "Aula 12, Filosofía" },
      { id: "b", associationId: "y", title: "B", start: "2026-10-01T17:00:00Z", end: "2026-10-01T19:00:00Z", place: "aula 12, filosofia" },
      { id: "c", associationId: "z", title: "C", start: "2026-10-01T18:00:00Z", end: "2026-10-01T20:00:00Z", place: "Aula 12, Filosofía" },
    ];
    const clashes = activityClashes(acts);
    expect(clashes.get("a")).toEqual(["b"]);
    expect(clashes.get("b")).toEqual(["a", "c"]);
    expect(activityClashes(extras(demo()).assocActivities).size).toBeGreaterThan(0);
  });
});

describe("moderación", () => {
  it("marca las señales de timo más comunes", () => {
    const keys = (t: string) => fraudSignals(t).map((s) => s.key);
    expect(keys("Fianza de tres meses en efectivo y sin contrato. Escribid por WhatsApp.")).toEqual(["cash", "contract", "whatsapp"]);
    expect(keys("Solo hay que enviar foto del DNI")).toEqual(["id"]);
    expect(keys("Reserva con Bizum antes de ver el piso")).toContain("prepay");
    expect(keys("Crítica al horario de la biblioteca")).toEqual([]);
  });

  it("pone arriba lo que más daña aunque tenga menos reportes", () => {
    const items = [
      { id: "1", reason: "Propiedad intelectual", content: "Vendo apuntes", reports: 20, at: "2026-09-26T10:00:00Z" },
      { id: "2", reason: "Spam", content: "Reserva con Bizum antes de ver el piso", reports: 2, at: "2026-09-26T11:00:00Z" },
      { id: "3", reason: "Acoso", content: "Insultos", reports: 3, at: "2026-09-26T12:00:00Z" },
    ];
    expect(sortModerationQueue(items).map((m) => m.id)).toEqual(["3", "2", "1"]);
  });

  it("calcula la mediana real de respuesta y filtra el historial", () => {
    const d = demo();
    const items = d.uniModeration as UniModeration[];
    const median = medianResponseMinutes(items, now);
    expect(median).not.toBeNull();
    expect(median!).toBeGreaterThan(0);
    expect(medianResponseMinutes([], now)).toBeNull();
    const acoso = filterHistory(items, { reason: "Acoso" });
    expect(acoso.every((m) => m.reason === "Acoso" && m.status !== "pending")).toBe(true);
    expect(filterHistory(items, { from: "2099-01-01" })).toEqual([]);
    const csv = moderationCsv(acoso);
    expect(csv.split("\n")).toHaveLength(acoso.length + 1);
  });
});

describe("calendario", () => {
  it("pinta semanas completas de lunes a domingo", () => {
    const weeks = monthGrid("2026-09");
    expect(weeks[0][0]).toBe("2026-08-31");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat()).toContain("2026-09-30");
    expect(weeks.at(-1)!.at(-1)).toBe("2026-10-04");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("ordena los plazos próximos y deja fuera los pasados", () => {
    const list = upcomingDeadlines(
      [
        { id: "b", title: "B", date: "2026-10-10", kind: "becas", audience: "campus" },
        { id: "a", title: "A", date: "2026-10-01", kind: "matricula", audience: "campus" },
        { id: "old", title: "Old", date: "2026-09-01", kind: "otro", audience: "campus" },
      ],
      now,
    );
    expect(list.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("primero e informe", () => {
  it("alerta de facultades con demasiado primero sin actividad, nunca de grupos pequeños", () => {
    const alerts = firstYearAlerts(extras(demo()).faculties);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.inactivePct >= 45 && a.firstYear >= PRIVACY_MIN_GROUP)).toBe(true);
    expect(alerts.map((a) => a.inactivePct)).toEqual([...alerts.map((a) => a.inactivePct)].sort((a, b) => b - a));
  });

  it("el informe de temporada resume el curso y oculta grupos pequeños", () => {
    const r = buildSeasonReport(demo(), now);
    expect(r.sections.map((s) => s.title)).toEqual(["Comunicación", "Bienvenida", "Alojamiento", "Asociaciones", "Convivencia"]);
    expect(r.faculties.find((f) => f.faculty === "Doble grado internacional")?.firstYear).toBeNull();
    const csv = seasonReportCsv(r);
    expect(csv).toContain("Menos de 10, oculto");
    expect(csv).not.toMatch(/[–—]/);
  });

  it("el documento imprimible escapa el HTML", () => {
    const d = demo();
    d.space = { ...d.space, name: "<script>alert(1)</script>" };
    const html = seasonReportHtml(buildSeasonReport(d, now));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
