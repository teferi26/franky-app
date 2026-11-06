/**
 * Preguntas frecuentes del servicio de atención al estudiante.
 *
 * El estudiante busca en Franky antes de pedir cita ("certificado de
 * empadronamiento", "fianza", "NIE"). El servicio mantiene la lista en
 * español e inglés, ve cuáles se abren más y cuáles no convencen, y desde la
 * cita previa envía la respuesta cuando la duda ya está resuelta aquí.
 *
 * Funciones puras: las usan la web, la app nativa y los tests. Los datos se
 * leen con `faqsOf()`, que devuelve una lista vacía si el espacio aún no la
 * tiene (un espacio real o una demo guardada antes de que existiera).
 */

import type { ProData } from "./types";
import type { ProUniAppointment, ProUniDesk, ProUniFaq } from "./university-types";
import { addDays, localDate, pct } from "./format";
import { PRIVACY_MIN_GROUP, uniExtrasOf } from "./university";

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export function faqsOf(data: Pick<ProData, "uniExtras">): ProUniFaq[] {
  return uniExtrasOf(data).faqs ?? [];
}

/** Aplica un cambio sobre la lista de preguntas sin tocar el resto. */
export function withFaqs(data: ProData, fn: (faqs: ProUniFaq[]) => ProUniFaq[]): ProData {
  const extras = uniExtrasOf(data);
  return { ...data, uniExtras: { ...extras, faqs: fn(extras.faqs ?? []) } };
}

/** Enlace público a una pregunta, para mandarla por correo o WhatsApp. */
export function faqLink(slug: string, faqId: string): string {
  return `https://franky.es/n/${slug}?pregunta=${encodeURIComponent(faqId)}`;
}

/* ------------------------------------------------------------------ */
/* Búsqueda                                                            */
/* ------------------------------------------------------------------ */

/*
 * Palabras que no ayudan a encontrar nada. Solo hacen falta las de tres
 * letras o más: las más cortas ya se descartan por longitud.
 */
const STOP_WORDS = new Set([
  "los", "las", "una", "uno", "unos", "unas", "con", "por", "para", "que",
  "del", "como", "cuando", "donde", "quien", "cual", "esta", "este", "esto",
  "hay", "mas", "antes", "sin", "sus", "puedo", "tengo", "quiero", "necesito",
  "duda", "dudas", "pasa", "hacer", "hago", "the", "and", "for", "how", "what",
  "can", "you", "your", "does", "with",
]);

/** Minúsculas, sin tildes y con un solo espacio entre palabras. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras con significado; el plural cuenta como el singular. */
export function faqTokens(text: string): string[] {
  const words = normalizeText(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
  return [...new Set(words)];
}

/**
 * Lo que se parece una pregunta a lo que alguien busca. Pesa más coincidir en
 * la pregunta o en las palabras clave que en la respuesta.
 */
export function faqScore(faq: ProUniFaq, query: string): number {
  const wanted = faqTokens(query);
  if (!wanted.length) return 0;
  const strong = new Set(
    faqTokens([faq.question, faq.questionEn ?? "", ...(faq.keywords ?? [])].join(" ")),
  );
  const weak = new Set(faqTokens(`${faq.answer} ${faq.answerEn ?? ""}`));
  let score = 0;
  for (const w of wanted) {
    if (strong.has(w)) score += 3;
    else if (weak.has(w)) score += 1;
  }
  const whole = normalizeText(query);
  if (whole.length >= 6 && normalizeText(faq.question).includes(whole)) score += 4;
  return score;
}

/** Las más abiertas esta semana primero; a igualdad, las más abiertas siempre. */
export function faqRanking(faqs: ProUniFaq[]): ProUniFaq[] {
  return [...faqs].sort(
    (a, b) => Number(Boolean(a.hidden)) - Number(Boolean(b.hidden)) || b.opensWeek - a.opensWeek || b.opens - a.opens,
  );
}

/**
 * Búsqueda como la hace el estudiante: sin texto devuelve el ranking; con
 * texto, solo las que se parecen, de más a menos.
 */
export function searchFaqs(
  faqs: ProUniFaq[],
  query: string,
  options: { desk?: ProUniDesk | null; includeHidden?: boolean } = {},
): ProUniFaq[] {
  const pool = faqs.filter(
    (f) => (options.includeHidden || !f.hidden) && (!options.desk || f.desk === options.desk),
  );
  if (!faqTokens(query).length) return faqRanking(pool);
  return pool
    .map((f) => ({ f, score: faqScore(f, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.f.opens - a.f.opens)
    .map((x) => x.f);
}

/** A partir de esta puntuación la pregunta responde de verdad a la cita. */
const TOPIC_MATCH_MIN = 3;

/**
 * La pregunta publicada que ya responde a lo que escribió el estudiante al
 * pedir cita. Si dos se parecen igual, gana la de la misma mesa.
 */
export function faqForTopic(faqs: ProUniFaq[], topic: string, desk?: ProUniDesk): ProUniFaq | null {
  let best: { faq: ProUniFaq; score: number } | null = null;
  for (const faq of faqs) {
    if (faq.hidden) continue;
    const base = faqScore(faq, topic);
    if (base < TOPIC_MATCH_MIN) continue;
    const score = base + (desk && faq.desk === desk ? 2 : 0);
    if (!best || score > best.score || (score === best.score && faq.opens > best.faq.opens)) {
      best = { faq, score };
    }
  }
  return best?.faq ?? null;
}

/* ------------------------------------------------------------------ */
/* Lo que dicen las cifras                                             */
/* ------------------------------------------------------------------ */

/** Por debajo de este acuerdo, la respuesta se marca para reescribirla. */
export const FAQ_HELPFUL_MIN = 60;

/** Parte de quien votó que dice que le sirvió; null con menos de 10 votos. */
export function helpfulPct(faq: ProUniFaq): number | null {
  const votes = faq.helpful + faq.unhelpful;
  return votes < PRIVACY_MIN_GROUP ? null : pct(faq.helpful, votes);
}

export function needsRewrite(faq: ProUniFaq): boolean {
  const p = helpfulPct(faq);
  return p !== null && p < FAQ_HELPFUL_MIN;
}

export type UncoveredTopic = { topic: string; desk: ProUniDesk; count: number };

/**
 * Temas por los que se sigue pidiendo cita y que ninguna pregunta responde.
 * Son los candidatos a pregunta nueva: cada uno ahorra citas cada semana.
 */
export function uncoveredTopics(
  appointments: ProUniAppointment[],
  faqs: ProUniFaq[],
  now: Date,
  days = 28,
  min = 3,
): UncoveredTopic[] {
  const from = addDays(localDate(now), -days);
  const groups = new Map<string, UncoveredTopic>();
  for (const a of appointments) {
    if (a.date < from || a.status === "cancelled") continue;
    const key = `${a.desk}:${normalizeText(a.topic)}`;
    const group = groups.get(key) ?? { topic: a.topic.trim(), desk: a.desk, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.count >= min && !faqForTopic(faqs, g.topic, g.desk))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "es"));
}

export type FaqSummary = {
  published: number;
  hidden: number;
  opensWeek: number;
  toRewrite: number;
  /** Citas de las últimas cuatro semanas a las que se envió una respuesta. */
  answeredFromDesk: number;
};

export function faqSummary(faqs: ProUniFaq[], appointments: ProUniAppointment[], now: Date): FaqSummary {
  const from = addDays(localDate(now), -28);
  return {
    published: faqs.filter((f) => !f.hidden).length,
    hidden: faqs.filter((f) => f.hidden).length,
    opensWeek: faqs.filter((f) => !f.hidden).reduce((a, f) => a + f.opensWeek, 0),
    toRewrite: faqs.filter((f) => !f.hidden && needsRewrite(f)).length,
    answeredFromDesk: appointments.filter((a) => a.faqId && a.date >= from).length,
  };
}

/* ------------------------------------------------------------------ */
/* Edición                                                             */
/* ------------------------------------------------------------------ */

export type FaqDraft = Pick<ProUniFaq, "desk" | "question" | "answer"> &
  Partial<Pick<ProUniFaq, "id" | "questionEn" | "answerEn" | "keywords" | "hidden">>;

/** Motivo por el que no se puede guardar, o null si está bien. */
export function faqProblem(faqs: ProUniFaq[], draft: FaqDraft): string | null {
  if (draft.question.trim().length < 8) return "Escribe la pregunta como la haría un estudiante.";
  if (draft.answer.trim().length < 20) return "La respuesta es muy corta: di qué tiene que hacer y dónde.";
  const same = normalizeText(draft.question);
  if (faqs.some((f) => f.id !== draft.id && normalizeText(f.question) === same)) {
    return "Ya hay una pregunta igual.";
  }
  const en = [draft.questionEn?.trim(), draft.answerEn?.trim()];
  if (en.filter(Boolean).length === 1) {
    return en[0] ? "Falta la respuesta en inglés." : "Falta la pregunta en inglés.";
  }
  return null;
}

/** Palabras clave escritas separadas por comas, limpias y sin repetir. */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const word = raw.trim();
    const key = normalizeText(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

/**
 * Crea o actualiza una pregunta. Al editar se conservan las cifras: siguen
 * siendo de la misma duda aunque cambie la redacción.
 */
export function saveFaq(faqs: ProUniFaq[], draft: FaqDraft, now: Date, newId: string): ProUniFaq[] {
  const clean = {
    desk: draft.desk,
    question: draft.question.trim(),
    answer: draft.answer.trim(),
    questionEn: draft.questionEn?.trim() || undefined,
    answerEn: draft.answerEn?.trim() || undefined,
    keywords: draft.keywords?.length ? draft.keywords : undefined,
    hidden: draft.hidden || undefined,
    updatedAt: now.toISOString(),
  };
  const current = draft.id ? faqs.find((f) => f.id === draft.id) : undefined;
  if (current) return faqs.map((f) => (f.id === current.id ? { ...f, ...clean } : f));
  return [...faqs, { id: newId, opens: 0, opensWeek: 0, helpful: 0, unhelpful: 0, ...clean }];
}

export function setFaqHidden(faqs: ProUniFaq[], id: string, hidden: boolean, now: Date): ProUniFaq[] {
  return faqs.map((f) => (f.id === id ? { ...f, hidden: hidden || undefined, updatedAt: now.toISOString() } : f));
}

export function removeFaq(faqs: ProUniFaq[], id: string): ProUniFaq[] {
  return faqs.filter((f) => f.id !== id);
}

/**
 * Deja constancia de que a esa cita se le envió la respuesta. La cita sigue
 * en la agenda: el estudiante decide si aún la necesita.
 */
export function sendFaqToAppointment(
  appointments: ProUniAppointment[],
  appointmentId: string,
  faqId: string,
  now: Date,
): ProUniAppointment[] {
  return appointments.map((a) =>
    a.id === appointmentId ? { ...a, faqId, faqSentAt: now.toISOString() } : a,
  );
}
