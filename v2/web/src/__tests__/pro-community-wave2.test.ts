import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import type { CommunityActivity, CommunityMember } from "@/lib/pro/community-types";
import { communityOps, emptyCommunityOps, withCommunityOps } from "@/lib/pro/community";
import {
  activityEnd,
  addRating,
  askRatingsNow,
  averageRating,
  clampStars,
  ratingAskAt,
  ratingLabel,
  ratingState,
  ratingSummary,
} from "@/lib/pro/community-feedback";
import {
  cohortComparison,
  cohortDelta,
  cohortRetention,
  newcomerInviteMessage,
} from "@/lib/pro/community-cohort";
import {
  HANDOVER_FRANKY_ID,
  HANDOVER_TEMPLATE,
  handoverPeople,
  handoverProgress,
  handoverStage,
  markFrankyAccessDone,
  newHandover,
  setHandoverOwner,
  startHandover,
  toggleHandoverItem,
} from "@/lib/pro/community-handover";
import { activityPosterHtml, clip, posterFacts } from "@/lib/pro/community-poster";
import {
  annualReportHtml,
  annualReportTag,
  courseHighlights,
  courseYearNumbers,
} from "@/lib/pro/community-annual";
import { courseMemoryHtml, subsidyMemoryFromData } from "@/lib/pro/community-docs";
import { courseRange } from "@/lib/pro/community-registry";
import { communityTodayItems } from "@/lib/pro/community-today";

// Un sábado de octubre, igual que el resto de pruebas del motor.
const now = new Date("2026-10-03T10:00:00.000Z");
const demo = () => buildDemo("community", now);
const LONG_DASH = /[–—]/;

function activity(extra: Partial<CommunityActivity> = {}): CommunityActivity {
  return {
    id: "t1",
    title: "Cinefórum de prueba",
    date: "2026-10-01T17:00:00.000Z",
    place: "Salón de actos",
    capacity: 90,
    registered: 40,
    checkedIn: 20,
    priceCents: 0,
    status: "done",
    durationMinutes: 120,
    ...extra,
  };
}

function member(id: string, joinedAt: string, extra: Partial<CommunityMember> = {}): CommunityMember {
  return {
    id,
    name: `Persona ${id}`,
    university: "Universidad de Alicante",
    studies: "Historia",
    role: "socio",
    fee: "paid",
    joinedAt,
    activities: 0,
    ...extra,
  };
}

/* ------------------------------------------------------------------ */

describe("valoración tras la actividad", () => {
  it("resume notas: media con un decimal, reparto y parte de asistentes que valora", () => {
    const a = activity({
      ratings: [
        { id: "r1", stars: 5, at: "2026-10-02T20:00:00.000Z", comment: "Genial", name: "Ana" },
        { id: "r2", stars: 4, at: "2026-10-02T21:00:00.000Z" },
        { id: "r3", stars: 4, at: "2026-10-02T22:00:00.000Z", comment: "  " },
        { id: "r4", stars: 2, at: "2026-10-03T08:00:00.000Z", comment: "Se oía mal", name: "Luis" },
      ],
    });
    const r = ratingSummary(a);
    expect(r.count).toBe(4);
    expect(r.avg).toBe(3.8);
    expect(r.distribution).toEqual([0, 1, 0, 2, 1]);
    expect(r.responsePct).toBe(20);
    // Solo los comentarios con texto, del más reciente al más antiguo.
    expect(r.comments.map((c) => c.name)).toEqual(["Luis", "Ana"]);
    expect(ratingLabel(r.avg)).toBe("3,8");
  });

  it("las notas se quedan entre 1 y 5 y se limpian los comentarios vacíos", () => {
    expect(clampStars(9)).toBe(5);
    expect(clampStars(0)).toBe(1);
    const a = addRating(activity(), { id: "x", stars: 7, at: now.toISOString(), comment: "   " });
    expect(a.ratings?.[0]).toMatchObject({ stars: 5, comment: undefined });
  });

  it("Franky la pide 24 horas después de acabar, o antes si la junta la adelanta", () => {
    const a = activity({ status: "published", date: "2026-10-02T17:00:00.000Z" });
    expect(activityEnd(a)).toBe("2026-10-02T19:00:00.000Z");
    expect(ratingAskAt(a)).toBe("2026-10-03T19:00:00.000Z");
    expect(ratingState(a, now)).toBe("scheduled");
    const early = askRatingsNow(a, now.toISOString());
    expect(ratingAskAt(early)).toBe(now.toISOString());
    expect(ratingState(early, now)).toBe("asked");
    // Pedirla otra vez no cambia la fecha.
    expect(askRatingsNow(early, "2026-10-03T12:00:00.000Z").ratingAskedAt).toBe(now.toISOString());
  });

  it("antes de acabar no se pide; los borradores y las actividades vacías no tienen valoración", () => {
    expect(ratingState(activity({ status: "published", date: "2026-10-06T17:00:00.000Z" }), now)).toBe("before");
    expect(ratingState(activity({ status: "draft" }), now)).toBe("none");
    expect(ratingState(activity({ checkedIn: 0, date: "2026-09-01T17:00:00.000Z" }), now)).toBe("none");
    expect(ratingState(activity({ date: "2026-09-01T17:00:00.000Z" }), now)).toBe("asked");
  });

  it("la media de un curso pondera por número de notas", () => {
    const a = activity({ ratings: [{ id: "a", stars: 5, at: "x" }] });
    const b = activity({
      id: "t2",
      ratings: [
        { id: "b1", stars: 3, at: "x" },
        { id: "b2", stars: 3, at: "x" },
        { id: "b3", stars: 3, at: "x" },
      ],
    });
    expect(averageRating([a, b])).toEqual({ avg: 3.5, count: 4 });
    expect(averageRating([])).toEqual({ avg: 0, count: 0 });
  });

  it("la demo tiene notas solo en actividades ya pedidas y nunca más que asistentes", () => {
    for (const a of demo().activities as CommunityActivity[]) {
      const count = (a.ratings ?? []).length;
      if (!count) continue;
      expect(ratingState(a, now)).toBe("asked");
      expect(count).toBeLessThanOrEqual(a.checkedIn);
      expect((a.ratings ?? []).every((r) => r.at <= now.toISOString())).toBe(true);
    }
  });

  it("la memoria de la subvención y la del curso llevan la nota media", () => {
    const d = demo();
    const memory = subsidyMemoryFromData(d, "sb1", now) ?? "";
    expect(memory).toContain("Nota");
    expect(memory).toMatch(/nota media de \d+ asistentes/);
    expect(courseMemoryHtml(d, now)).toContain("Nota");
  });
});

/* ------------------------------------------------------------------ */

describe("retención de la hornada", () => {
  function data(members: CommunityMember[], activities: CommunityActivity[]): ProData {
    return { ...demo(), communityMembers: members, activities };
  }

  it("cuenta solo asistencias posteriores al alta y dentro del curso", () => {
    const members = [
      member("m1", "2026-09-01T10:00:00.000Z"),
      member("m2", "2026-09-20T10:00:00.000Z"),
      member("m3", "2026-09-25T10:00:00.000Z"),
      member("m4", "2025-09-10T10:00:00.000Z"),
    ];
    const acts = [
      activity({ id: "e1", date: "2026-09-10T17:00:00.000Z", checkedInIds: ["m1", "m2", "m4"], checkedIn: 3 }),
      activity({ id: "e2", date: "2026-09-22T17:00:00.000Z", checkedInIds: ["m1", "m2"], checkedIn: 2 }),
      activity({ id: "e3", date: "2026-09-29T17:00:00.000Z", checkedInIds: ["m1"], checkedIn: 1 }),
      // Aún no ha pasado: no cuenta.
      activity({ id: "e4", status: "published", date: "2026-10-05T17:00:00.000Z", checkedInIds: ["m3"], checkedIn: 1 }),
    ];
    const r = cohortRetention(data(members, acts), now);
    expect(r.joined).toBe(3);
    // m2 estaba en e1 antes de darse de alta: esa no cuenta.
    expect(r.atLeast).toEqual([2, 1, 1]);
    expect(r.pct).toEqual([67, 33, 33]);
    expect(r.neverCame.map((m) => m.id)).toEqual(["m3"]);
    expect(r.cameOnce.map((m) => m.id)).toEqual(["m2"]);
  });

  it("el curso anterior se corta en el mismo día del curso para comparar", () => {
    const members = [
      member("n1", "2026-09-05T10:00:00.000Z"),
      member("n2", "2026-09-06T10:00:00.000Z"),
      member("p1", "2025-09-05T10:00:00.000Z"),
      member("p2", "2025-09-06T10:00:00.000Z"),
      // Entró más tarde que el día de corte del curso anterior: no está en la hornada comparable.
      member("p3", "2025-11-20T10:00:00.000Z"),
    ];
    const acts = [
      activity({ id: "c1", date: "2026-09-10T17:00:00.000Z", checkedInIds: ["n1", "n2"], checkedIn: 2 }),
      activity({ id: "c2", date: "2026-09-20T17:00:00.000Z", checkedInIds: ["n1", "n2"], checkedIn: 2 }),
      activity({ id: "p-a", date: "2025-09-10T17:00:00.000Z", checkedInIds: ["p1", "p2"], checkedIn: 2 }),
      activity({ id: "p-b", date: "2025-09-20T17:00:00.000Z", checkedInIds: ["p1"], checkedIn: 1 }),
      // Después del día de corte del curso anterior: no cuenta.
      activity({ id: "p-c", date: "2025-12-01T17:00:00.000Z", checkedInIds: ["p2", "p3"], checkedIn: 2 }),
    ];
    const c = cohortComparison(data(members, acts), now);
    expect(c.current.pct[1]).toBe(100);
    expect(c.previous?.cutoff).toBe("2025-10-03");
    expect(c.previous?.joined).toBe(2);
    expect(c.previous?.pct[1]).toBe(50);
    expect(cohortDelta(c)).toBe(50);
  });

  it("sin altas el curso anterior no hay comparación", () => {
    const members = [member("n1", "2026-09-05T10:00:00.000Z")];
    const c = cohortComparison(data(members, []), now);
    expect(c.previous).toBeNull();
    expect(cohortDelta(c)).toBeNull();
  });

  it("la demo compara la hornada con la del curso pasado", () => {
    const c = cohortComparison(demo(), now);
    expect(c.current.joined).toBeGreaterThan(20);
    expect(c.previous).not.toBeNull();
    expect(c.previous?.atLeast[0]).toBeGreaterThan(0);
    expect(cohortDelta(c)).toBe(c.current.pct[1] - (c.previous?.pct[1] ?? 0));
  });

  it("el mensaje de bienvenida invita a la próxima actividad", () => {
    const text = newcomerInviteMessage({
      member: member("m1", "2026-09-01T10:00:00.000Z", { name: "Marta Soler" }),
      spaceName: "Hilo Rojo",
      activity: activity({ title: "Taller de guion", date: "2026-10-08T15:00:00.000Z", place: "Aula 0.12" }),
      url: "https://franky.es/n/hilo-rojo",
    });
    expect(text).toContain("Hola Marta");
    expect(text).toContain("Taller de guion");
    expect(text).toContain("https://franky.es/n/hilo-rojo");
    expect(text).not.toMatch(LONG_DASH);
  });
});

/* ------------------------------------------------------------------ */

describe("guía del relevo", () => {
  it("empieza con todos los pasos por hacer", () => {
    const h = newHandover("2026-06-15");
    expect(h.items).toHaveLength(HANDOVER_TEMPLATE.length);
    expect(handoverProgress(h)).toMatchObject({ done: 0, total: HANDOVER_TEMPLATE.length, complete: false });
    expect(HANDOVER_TEMPLATE.every((t) => !LONG_DASH.test(`${t.label} ${t.detail}`))).toBe(true);
  });

  it("marcar un paso apunta quién lo hizo (el encargado, si lo hay) y cuándo; desmarcar lo borra", () => {
    let ops = startHandover(emptyCommunityOps(), "2026-06-15");
    ops = setHandoverOwner(ops, "banco", "Pablo Esteve");
    ops = toggleHandoverItem(ops, "banco", "Lucía Carbonell", "2026-06-20T10:00:00.000Z");
    ops = toggleHandoverItem(ops, "redes", "Lucía Carbonell", "2026-06-21T10:00:00.000Z");
    const byId = new Map(ops.handover?.items.map((i) => [i.id, i]));
    expect(byId.get("banco")).toMatchObject({ doneBy: "Pablo Esteve", doneAt: "2026-06-20T10:00:00.000Z" });
    expect(byId.get("redes")).toMatchObject({ doneBy: "Lucía Carbonell" });
    ops = toggleHandoverItem(ops, "banco", "Lucía Carbonell", "2026-06-22T10:00:00.000Z");
    expect(ops.handover?.items.find((i) => i.id === "banco")?.doneAt).toBeUndefined();
    expect(handoverProgress(ops.handover).done).toBe(1);
  });

  it("el traspaso en Franky marca los accesos y empieza guía nueva si la anterior es vieja", () => {
    const old = { ...startHandover(emptyCommunityOps(), "2025-07-01") };
    const next = markFrankyAccessDone(old, "Lucía Carbonell", "2026-07-01T10:00:00.000Z");
    expect(next.handover?.startedAt).toBe("2026-07-01");
    const franky = next.handover?.items.find((i) => i.id === HANDOVER_FRANKY_ID);
    expect(franky).toMatchObject({ doneBy: "Lucía Carbonell", doneAt: "2026-07-01T10:00:00.000Z" });

    // Si la junta empezó la guía antes del traspaso, se sigue con la misma.
    let recent = startHandover(emptyCommunityOps(), "2026-06-10");
    recent = toggleHandoverItem(recent, "banco", "Pablo Esteve", "2026-06-12T10:00:00.000Z");
    const same = markFrankyAccessDone(recent, "Lucía Carbonell", "2026-07-01T10:00:00.000Z");
    expect(same.handover?.startedAt).toBe("2026-06-10");
    expect(handoverProgress(same.handover).done).toBe(2);
  });

  it("el momento del relevo: pronto, a medias, completo o nada", () => {
    const d = demo();
    // Demo: relevo de julio a medias (faltan registro de asociaciones y correo).
    expect(handoverStage(d, now)).toBe("open");
    expect(handoverProgress(communityOps(d).handover).pending.map((i) => i.id)).toEqual([
      "registro_asoc",
      "correo",
    ]);

    const complete = withCommunityOps(d, (o) => ({
      ...o,
      handover: o.handover && {
        ...o.handover,
        items: o.handover.items.map((i) => ({ ...i, doneAt: i.doneAt ?? now.toISOString() })),
      },
    }));
    expect(handoverStage(complete, now)).toBe("complete");

    const idle = withCommunityOps(d, (o) => ({ ...o, handover: undefined }));
    expect(handoverStage(idle, now)).toBe("idle");

    const endingSoon = { ...idle, board: idle.board.map((b) => ({ ...b, until: "2026-11-15" })) };
    expect(handoverStage(endingSoon, now)).toBe("soon");
  });

  it("se puede encargar a la junta actual y a la que entra, sin repetir nombres", () => {
    const d = withCommunityOps(demo(), (o) => ({
      ...o,
      scheduledBoard: [
        { id: "n1", role: "Presidencia", name: "Noelia Rico", since: "2027-07-01", until: "2028-06-30" },
        { id: "n2", role: "Tesorería", name: "Pablo Esteve", since: "2027-07-01", until: "2028-06-30" },
      ],
    }));
    const people = handoverPeople(d);
    expect(people).toContain("Noelia Rico");
    expect(people.filter((p) => p === "Pablo Esteve")).toHaveLength(1);
  });

  it("el Resumen avisa del relevo a medias", () => {
    const items = communityTodayItems(demo(), now);
    const item = items.find((i) => i.kind === "handover");
    expect(item?.title).toBe("Relevo a medias");
    expect(item?.detail).toContain("registro de asociaciones");
    expect(item?.section).toBe("junta");
  });
});

/* ------------------------------------------------------------------ */

describe("cartel y story", () => {
  it("resume los datos de la actividad para el cartel", () => {
    const f = posterFacts(
      activity({ status: "published", priceCents: 300, ectsHours: 10, councilLogo: true }),
      { campus: "Universidad de Alicante" },
    );
    // money() separa el símbolo con un espacio duro (Intl), igual que en pantalla.
    expect(f.price.replace(/\s/g, " ")).toBe("3 € la entrada");
    expect(f.credits).toBe("Cuenta 10 h para créditos");
    expect(f.council).toBe("Con el apoyo del Consejo de Estudiantes de la Universidad de Alicante");
    expect(posterFacts(activity()).price).toBe("Gratis con inscripción");
  });

  it("recorta la descripción en una palabra entera", () => {
    expect(clip("uno dos tres cuatro cinco", 12)).toBe("uno dos tres...");
    expect(clip("corto", 20)).toBe("corto");
  });

  it("el cartel escapa los textos, incrusta el QR y rechaza SVG con scripts", () => {
    const qr = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
    const html = activityPosterHtml({
      spaceName: "Hilo <Rojo>",
      activity: activity({ title: "Cine & <b>coloquio</b>", status: "published" }),
      url: "https://franky.es/n/hilo-rojo",
      campus: "Universidad de Alicante",
      qrSvg: qr,
    });
    expect(html).toContain("Hilo &lt;Rojo&gt;");
    expect(html).toContain("Cine &amp; &lt;b&gt;coloquio&lt;/b&gt;");
    expect(html).toContain('<div class="qr"><svg');
    expect(html).toContain("franky.es/n/hilo-rojo");
    expect(html).not.toMatch(LONG_DASH);

    const evil = activityPosterHtml({
      spaceName: "Hilo Rojo",
      activity: activity(),
      url: "https://franky.es/n/hilo-rojo",
      qrSvg: '<svg onload="alert(1)"></svg>',
    });
    expect(evil).not.toContain("onload");
    expect(evil).not.toContain('class="qr"');
  });
});

/* ------------------------------------------------------------------ */

describe("memoria anual del curso", () => {
  it("cuenta el curso en marcha hasta hoy", () => {
    const n = courseYearNumbers(demo(), now);
    expect(n.course).toEqual(courseRange(now));
    expect(n.until).toBe("2026-10-03");
    expect(n.activities.length).toBeGreaterThan(0);
    expect(n.activities.every((a) => a.date.slice(0, 10) >= "2026-07-01")).toBe(true);
    expect(n.rating.count).toBeGreaterThan(0);
    expect(n.agreements.length).toBeGreaterThan(0);
    expect(n.openTasks.every((t) => t.title)).toBe(true);
    expect(n.handover).toMatchObject({ done: 9, total: 11 });
    expect(n.volunteerHours).toBeGreaterThan(0);
  });

  it("las frases destacadas salen de los datos", () => {
    const lines = courseHighlights(courseYearNumbers(demo(), now));
    expect(lines.some((l) => l.startsWith("La actividad con más gente fue"))).toBe(true);
    expect(lines.some((l) => l.includes("ha vuelto a una segunda actividad"))).toBe(true);
    expect(lines.every((l) => !LONG_DASH.test(l))).toBe(true);
  });

  it("el documento tiene resumen, actividades y dinero, y lo que queda para la junta que entra", () => {
    const html = annualReportHtml(demo(), now);
    expect(html).toContain("Memoria del curso 26/27");
    expect(html).toContain("Lo más destacado");
    expect(html).toContain("Socios nuevos que vuelven");
    expect(html).toContain("Actividades y dinero");
    expect(html).toContain("Para la junta que entra");
    expect(html).toContain("Tareas abiertas");
    expect(html).toContain("Pendientes: Registro de asociaciones, Correo y dominio.");
    expect(html).not.toMatch(LONG_DASH);
    expect(annualReportTag(courseRange(now))).toBe("memoria-curso:26/27");
  });

  it("escapa lo que escriben los socios", () => {
    const d = demo();
    const hacked: ProData = {
      ...d,
      activities: (d.activities as CommunityActivity[]).map((a) =>
        a.id === "a-past-2" ? { ...a, title: "<script>alert(1)</script>" } : a,
      ),
    };
    const html = annualReportHtml(hacked, now);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

/* ------------------------------------------------------------------ */

describe("Resumen: actividades flojas", () => {
  it("avisa de una actividad reciente con nota por debajo de 4", () => {
    const d = demo();
    const weak: ProData = {
      ...d,
      activities: [
        ...d.activities,
        activity({
          id: "weak",
          title: "Charla floja",
          date: "2026-09-30T17:00:00.000Z",
          ratings: [1, 3, 3, 4, 3, 2].map((stars, i) => ({
            id: `w${i}`,
            stars,
            at: "2026-10-01T20:00:00.000Z",
            comment: i === 0 ? "No se oía nada" : undefined,
          })),
        }),
      ],
    };
    const item = communityTodayItems(weak, now).find((i) => i.kind === "feedback");
    expect(item?.title).toBe("Charla floja se quedó en 2,7 de 5");
    expect(item?.query).toBe("a=weak&pestana=valoracion");
    expect(item?.detail).toBe("1 comentario para mejorar la próxima.");
  });
});
