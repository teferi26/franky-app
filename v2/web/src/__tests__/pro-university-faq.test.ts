import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import type { ProData } from "@/lib/pro/types";
import {
  faqForTopic,
  faqLink,
  faqProblem,
  faqRanking,
  faqScore,
  faqSummary,
  faqTokens,
  faqsOf,
  helpfulPct,
  needsRewrite,
  normalizeText,
  parseKeywords,
  removeFaq,
  saveFaq,
  searchFaqs,
  sendFaqToAppointment,
  setFaqHidden,
  uncoveredTopics,
  withFaqs,
} from "@/lib/pro/university-faq";
import { officeOf } from "@/lib/pro/university-office";
import type { ProUniAppointment, ProUniFaq } from "@/lib/pro/university-types";

const now = new Date("2026-09-27T10:00:00Z");

function demo(): ProData {
  return buildDemo("university", now);
}

const faq = (patch: Partial<ProUniFaq> = {}): ProUniFaq => ({
  id: "f1",
  desk: "becas",
  question: "¿Cómo consigo el certificado de empadronamiento?",
  answer: "En la sede electrónica del ayuntamiento o en la oficina del padrón.",
  keywords: ["padrón"],
  opens: 100,
  opensWeek: 10,
  helpful: 0,
  unhelpful: 0,
  updatedAt: now.toISOString(),
  ...patch,
});

const appointment = (patch: Partial<ProUniAppointment> = {}): ProUniAppointment => ({
  id: "a1",
  slotId: "s1",
  date: "2026-09-20",
  start: 600,
  desk: "becas",
  student: "Ana",
  faculty: "Derecho",
  topic: "Anular una asignatura",
  status: "done",
  via: "franky",
  createdAt: now.toISOString(),
  ...patch,
});

describe("preguntas frecuentes: búsqueda", () => {
  it("normaliza tildes, mayúsculas y signos", () => {
    expect(normalizeText("¿Cómo pido el NIE?")).toBe("como pido el nie");
  });

  it("descarta palabras vacías y cuenta el plural como singular", () => {
    expect(faqTokens("Dudas con las asignaturas")).toEqual(["asignatura"]);
  });

  it("puntúa más la pregunta y las palabras clave que la respuesta", () => {
    const f = faq();
    // "padrón" es palabra clave y además aparece dentro de "empadronamiento".
    expect(faqScore(f, "padrón")).toBe(7);
    expect(faqScore(f, "certificado")).toBe(3 + 4);
    expect(faqScore(f, "sede")).toBe(1);
    expect(faqScore(f, "fianza")).toBe(0);
  });

  it("sin texto devuelve el ranking; con texto, solo lo que se parece", () => {
    const list = [faq({ id: "a", opensWeek: 5 }), faq({ id: "b", question: "¿Qué pasa con la fianza?", keywords: [], opensWeek: 50 })];
    expect(searchFaqs(list, "").map((f) => f.id)).toEqual(["b", "a"]);
    expect(searchFaqs(list, "fianza").map((f) => f.id)).toEqual(["b"]);
    expect(searchFaqs(list, "Erasmus")).toEqual([]);
  });

  it("las ocultas no las encuentra el estudiante, pero sí el equipo", () => {
    const list = [faq({ hidden: true })];
    expect(searchFaqs(list, "padrón")).toEqual([]);
    expect(searchFaqs(list, "padrón", { includeHidden: true })).toHaveLength(1);
  });

  it("el ranking deja las ocultas al final", () => {
    const list = [faq({ id: "h", hidden: true, opensWeek: 999 }), faq({ id: "v", opensWeek: 1 })];
    expect(faqRanking(list).map((f) => f.id)).toEqual(["v", "h"]);
  });

  it("encuentra la pregunta que responde a la cita y prefiere la misma mesa", () => {
    const becas = faq({ id: "becas" });
    const inter = faq({ id: "inter", desk: "internacional", question: "¿Cómo pido el NIE y el empadronamiento?", keywords: [] });
    expect(faqForTopic([becas, inter], "Me piden el certificado de empadronamiento", "becas")?.id).toBe("becas");
    expect(faqForTopic([becas, inter], "NIE y empadronamiento", "internacional")?.id).toBe("inter");
    expect(faqForTopic([becas], "Cambio de grupo de prácticas", "general")).toBeNull();
    expect(faqForTopic([faq({ hidden: true })], "certificado de empadronamiento")).toBeNull();
  });
});

describe("preguntas frecuentes: cifras", () => {
  it("no enseña el porcentaje de utilidad con menos de 10 votos", () => {
    expect(helpfulPct(faq({ helpful: 5, unhelpful: 4 }))).toBeNull();
    expect(helpfulPct(faq({ helpful: 30, unhelpful: 10 }))).toBe(75);
  });

  it("marca para reescribir las que convencen a menos del 60 %", () => {
    expect(needsRewrite(faq({ helpful: 44, unhelpful: 61 }))).toBe(true);
    expect(needsRewrite(faq({ helpful: 90, unhelpful: 10 }))).toBe(false);
    expect(needsRewrite(faq({ helpful: 1, unhelpful: 5 }))).toBe(false);
  });

  it("propone temas de la cita previa que se repiten sin respuesta", () => {
    const appts = [
      appointment({ id: "1" }),
      appointment({ id: "2" }),
      appointment({ id: "3", topic: "anular una asignatura" }),
      appointment({ id: "4", status: "cancelled" }),
      appointment({ id: "5", topic: "Certificado de empadronamiento" }),
      appointment({ id: "6", topic: "Certificado de empadronamiento" }),
      appointment({ id: "7", topic: "Certificado de empadronamiento" }),
      appointment({ id: "8", date: "2026-07-01" }),
    ];
    const topics = uncoveredTopics(appts, [faq()], now);
    expect(topics).toEqual([{ topic: "Anular una asignatura", desk: "becas", count: 3 }]);
  });

  it("resume publicadas, ocultas, aperturas y respuestas enviadas", () => {
    const list = [faq({ opensWeek: 10 }), faq({ id: "f2", hidden: true, opensWeek: 99 }), faq({ id: "f3", opensWeek: 5, helpful: 2, unhelpful: 20 })];
    const summary = faqSummary(list, [appointment({ faqId: "f1" }), appointment({ id: "old", faqId: "f1", date: "2026-01-01" })], now);
    expect(summary).toEqual({ published: 2, hidden: 1, opensWeek: 15, toRewrite: 1, answeredFromDesk: 1 });
  });
});

describe("preguntas frecuentes: edición", () => {
  it("pide pregunta y respuesta completas y sin repetir", () => {
    const list = [faq()];
    expect(faqProblem(list, { desk: "becas", question: "¿Beca?", answer: "x".repeat(30) })).toMatch(/pregunta/);
    expect(faqProblem(list, { desk: "becas", question: "¿Dónde pido la beca?", answer: "En la sede." })).toMatch(/corta/);
    expect(faqProblem(list, { desk: "becas", question: "¿como consigo el certificado de empadronamiento", answer: "x".repeat(30) })).toBe("Ya hay una pregunta igual.");
    expect(faqProblem(list, { id: "f1", desk: "becas", question: faq().question, answer: "x".repeat(30) })).toBeNull();
  });

  it("exige las dos partes en inglés o ninguna", () => {
    const base = { desk: "becas" as const, question: "¿Dónde pido la beca?", answer: "x".repeat(30) };
    expect(faqProblem([], { ...base, questionEn: "Where?" })).toBe("Falta la respuesta en inglés.");
    expect(faqProblem([], { ...base, answerEn: "There" })).toBe("Falta la pregunta en inglés.");
    expect(faqProblem([], { ...base, questionEn: "Where?", answerEn: "There" })).toBeNull();
  });

  it("limpia las palabras clave", () => {
    expect(parseKeywords(" padrón, Padron ,, NIE ")).toEqual(["padrón", "NIE"]);
  });

  it("crea con cifras a cero y al editar conserva las cifras", () => {
    const created = saveFaq([], { desk: "general", question: " ¿Nueva? ", answer: " Respuesta " }, now, "n1");
    expect(created[0]).toMatchObject({ id: "n1", question: "¿Nueva?", answer: "Respuesta", opens: 0, helpful: 0 });
    const edited = saveFaq([faq()], { id: "f1", desk: "becas", question: "Otra redacción de la pregunta", answer: "Otra respuesta más larga" }, now, "x");
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ question: "Otra redacción de la pregunta", opens: 100, opensWeek: 10 });
  });

  it("oculta, publica y borra", () => {
    const hidden = setFaqHidden([faq()], "f1", true, now);
    expect(hidden[0].hidden).toBe(true);
    expect(setFaqHidden(hidden, "f1", false, now)[0].hidden).toBeUndefined();
    expect(removeFaq([faq()], "f1")).toEqual([]);
  });

  it("deja constancia de la respuesta enviada a una cita", () => {
    const next = sendFaqToAppointment([appointment(), appointment({ id: "a2" })], "a2", "f1", now);
    expect(next[0].faqId).toBeUndefined();
    expect(next[1]).toMatchObject({ faqId: "f1", faqSentAt: now.toISOString(), status: "done" });
  });

  it("construye el enlace público de la pregunta", () => {
    expect(faqLink("universidad-demo", "fq 1")).toBe("https://franky.es/n/universidad-demo?pregunta=fq%201");
  });
});

describe("preguntas frecuentes en la demo", () => {
  it("trae preguntas, una por reescribir, una oculta y temas sin respuesta", () => {
    const data = demo();
    const faqs = faqsOf(data);
    expect(faqs.length).toBeGreaterThanOrEqual(6);
    expect(faqs.filter((f) => f.hidden)).toHaveLength(1);
    expect(faqs.filter(needsRewrite).length).toBeGreaterThanOrEqual(1);
    const office = officeOf(data);
    expect(uncoveredTopics(office.appointments, faqs, now).length).toBeGreaterThan(0);
    expect(office.appointments.some((a) => a.faqId)).toBe(true);
  });

  it("un espacio sin preguntas se sigue pintando y acepta la primera", () => {
    const data = demo();
    const empty = { ...data, uniExtras: { ...data.uniExtras!, faqs: undefined } };
    expect(faqsOf(empty)).toEqual([]);
    const next = withFaqs(empty, (list) => saveFaq(list, { desk: "general", question: "¿Dónde está el SAE?", answer: "En el edificio de Rectorado, planta baja." }, now, "q"));
    expect(faqsOf(next)).toHaveLength(1);
  });
});
