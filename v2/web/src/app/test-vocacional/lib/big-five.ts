/* ═══════════════════════════════════════════════════════════
   Big Five (OCEAN) personality module
   - 25 questions (5 per factor) using a 5-point Likert scale
   - Some items reverse-scored to reduce acquiescence bias
   - Maps Big Five scores to a derived MBTI-style 4-letter type
     (E/I, S/N, T/F, J/P) for an easy-to-grasp identity label
   - Generates a Spanish narrative paragraph describing the
     person across all 5 traits and their work style
   ═══════════════════════════════════════════════════════════ */

export type BigFiveTrait = "O" | "C" | "E" | "A" | "N";

export const BIG_FIVE_LABELS: Record<BigFiveTrait, string> = {
  O: "Apertura a la experiencia",
  C: "Responsabilidad",
  E: "Extraversión",
  A: "Amabilidad",
  N: "Estabilidad emocional",
};

// "N" is internally Neuroticism; we display it inverted as Stability.
export type BigFiveScores = Record<BigFiveTrait, number>; // 0-100 percentile

export interface BigFiveQuestion {
  id: string;
  text: string;
  trait: BigFiveTrait;
  reversed: boolean;
}

/**
 * 35 ítems Big Five (7 por dimensión).
 * Base: IPIP-NEO-PI 50 + BFI-2 (Soto & John, 2017), tono adaptado al español
 * coloquial joven manteniendo el contenido psicométrico de cada ítem.
 * Mezcla items directos y reverse-scored para reducir el sesgo de aquiescencia.
 * El usuario contesta 1 (totalmente en desacuerdo) … 5 (totalmente de acuerdo).
 */
export const BIG_FIVE_QUESTIONS: BigFiveQuestion[] = [
  // ── Openness (O) — apertura, imaginación, curiosidad intelectual ──
  { id: "bf_o1", trait: "O", reversed: false, text: "Mi cabeza está siempre dándole vueltas a ideas y posibilidades nuevas." },
  { id: "bf_o2", trait: "O", reversed: false, text: "Me atraen las preguntas filosóficas y los temas que la mayoría considera abstractos." },
  { id: "bf_o3", trait: "O", reversed: false, text: "Disfruto probando cosas nuevas: comidas raras, ciudades desconocidas, géneros que nunca había escuchado…" },
  { id: "bf_o4", trait: "O", reversed: true,  text: "Prefiero lo de siempre antes que aventurarme con cosas nuevas." },
  { id: "bf_o5", trait: "O", reversed: false, text: "Me emociono fácilmente con una buena película, una canción o una obra de arte." },
  { id: "bf_o6", trait: "O", reversed: false, text: "Cuando algo me llama la atención, profundizo hasta entenderlo bien, aunque nadie me lo pida." },
  { id: "bf_o7", trait: "O", reversed: true,  text: "No le veo sentido a darle vueltas a ideas que no sirven para nada práctico." },

  // ── Conscientiousness (C) — disciplina, orden, esfuerzo dirigido ──
  { id: "bf_c1", trait: "C", reversed: false, text: "Soy de los/as que llegan a tiempo, con todo preparado y sin estrés de última hora." },
  { id: "bf_c2", trait: "C", reversed: false, text: "Si me comprometo a algo, lo cumplo aunque me cueste." },
  { id: "bf_c3", trait: "C", reversed: false, text: "Me importan los detalles y reviso lo que hago antes de darlo por terminado." },
  { id: "bf_c4", trait: "C", reversed: true,  text: "Procrastino bastante: dejo cosas para el último momento más de lo que me gustaría admitir." },
  { id: "bf_c5", trait: "C", reversed: true,  text: "Mi mesa, mi habitación o mi mochila suelen estar bastante hechos un desastre." },
  { id: "bf_c6", trait: "C", reversed: false, text: "Cuando me propongo una meta, soy capaz de mantener el ritmo durante semanas o meses." },
  { id: "bf_c7", trait: "C", reversed: true,  text: "Me cuesta concentrarme en una tarea cuando aparece algo más interesante." },

  // ── Extraversion (E) — energía social, asertividad, búsqueda de estímulo ──
  { id: "bf_e1", trait: "E", reversed: false, text: "Estar con gente me carga las pilas: salgo con más energía que con la que llegué." },
  { id: "bf_e2", trait: "E", reversed: false, text: "No tengo problema en ponerme a hablar con desconocidos." },
  { id: "bf_e3", trait: "E", reversed: false, text: "En los grupos suelo ser yo quien rompe el silencio o lleva la voz cantante." },
  { id: "bf_e4", trait: "E", reversed: true,  text: "Después de un día social intenso necesito horas a solas para reponerme." },
  { id: "bf_e5", trait: "E", reversed: true,  text: "Me siento más yo en grupos pequeños o cara a cara que en fiestas grandes." },
  { id: "bf_e6", trait: "E", reversed: false, text: "Me atraen las situaciones con mucho movimiento, ruido o gente." },
  { id: "bf_e7", trait: "E", reversed: true,  text: "Prefiero quedarme en casa antes que salir, incluso cuando sé que lo pasaría bien." },

  // ── Agreeableness (A) — empatía, cooperación, confianza interpersonal ──
  { id: "bf_a1", trait: "A", reversed: false, text: "Cuando alguien tiene un mal día me afecta y me importa cómo se siente." },
  { id: "bf_a2", trait: "A", reversed: false, text: "Tiendo a pensar bien de la gente hasta que me demuestren lo contrario." },
  { id: "bf_a3", trait: "A", reversed: false, text: "En una discusión cedo si veo que para la otra persona pesa más." },
  { id: "bf_a4", trait: "A", reversed: true,  text: "Soy bastante frío/a o distante con quien acabo de conocer." },
  { id: "bf_a5", trait: "A", reversed: true,  text: "Defiendo mis intereses aunque eso suponga pisar a alguien." },
  { id: "bf_a6", trait: "A", reversed: false, text: "Me cuesta poco perdonar y dejar las cosas atrás cuando alguien se disculpa." },
  { id: "bf_a7", trait: "A", reversed: true,  text: "Si el plan no me convence, me cuesta seguirles la corriente a los demás solo por encajar." },

  // ── Neuroticism (N) — sensibilidad emocional, ansiedad, reactividad ──
  // (display invertido como "Estabilidad emocional" en el dashboard)
  { id: "bf_n1", trait: "N", reversed: false, text: "Le doy vueltas a cosas pequeñas más de lo que sería razonable." },
  { id: "bf_n2", trait: "N", reversed: false, text: "Mi humor cambia bastante a lo largo del día sin un motivo claro." },
  { id: "bf_n3", trait: "N", reversed: false, text: "Cuando algo sale mal me afecta varios días, no solo el momento." },
  { id: "bf_n4", trait: "N", reversed: true,  text: "Bajo presión mantengo la cabeza fría y resuelvo." },
  { id: "bf_n5", trait: "N", reversed: true,  text: "Me considero una persona estable y poco influenciable por las emociones del momento." },
  { id: "bf_n6", trait: "N", reversed: false, text: "Las críticas, aunque sean constructivas, me duelen más de lo que me gustaría." },
  { id: "bf_n7", trait: "N", reversed: true,  text: "Cuando hay incertidumbre, no me suele agobiar: me adapto." },
];

export function calculateBigFive(answers: Record<string, number>): BigFiveScores {
  const totals: Record<BigFiveTrait, { sum: number; count: number }> = {
    O: { sum: 0, count: 0 },
    C: { sum: 0, count: 0 },
    E: { sum: 0, count: 0 },
    A: { sum: 0, count: 0 },
    N: { sum: 0, count: 0 },
  };

  for (const q of BIG_FIVE_QUESTIONS) {
    const raw = answers[q.id];
    if (typeof raw !== "number") continue;
    const score = q.reversed ? 6 - raw : raw; // invert reversed items
    totals[q.trait].sum += score;
    totals[q.trait].count += 1;
  }

  const result: BigFiveScores = { O: 50, C: 50, E: 50, A: 50, N: 50 };
  for (const trait of Object.keys(totals) as BigFiveTrait[]) {
    const t = totals[trait];
    if (t.count > 0) {
      const avg = t.sum / t.count; // 1-5
      result[trait] = Math.round(((avg - 1) / 4) * 100); // 0-100
    }
  }
  return result;
}

/**
 * Deriva un código tipo MBTI a partir del Big Five + RIASEC del usuario.
 * No es MBTI clínico (Big Five es más fiable) pero da una etiqueta compacta
 * fácil de recordar y de explicar.
 *
 *  E/I  ← Extraversion
 *  S/N  ← Openness (alta = N intuitivo, baja = S sensorial)
 *  T/F  ← Agreeableness (alta = F sentimiento, baja = T pensamiento)
 *  J/P  ← Conscientiousness (alta = J planificador, baja = P perceptivo)
 */
export function deriveMbtiType(bf: BigFiveScores): string {
  const ei = bf.E >= 50 ? "E" : "I";
  const sn = bf.O >= 50 ? "N" : "S";
  const tf = bf.A >= 50 ? "F" : "T";
  const jp = bf.C >= 50 ? "J" : "P";
  return `${ei}${sn}${tf}${jp}`;
}

const MBTI_NICKNAMES: Record<string, { label: string; tagline: string }> = {
  INTJ: { label: "El/La Estratega",     tagline: "mente analítica con una visión a largo plazo" },
  INTP: { label: "El/La Pensador/a",    tagline: "curioso/a, lógico/a y aficionado/a a las teorías" },
  ENTJ: { label: "El/La Comandante",    tagline: "líder natural orientado/a a resultados" },
  ENTP: { label: "El/La Innovador/a",   tagline: "inquieto/a, creativo/a y argumentador/a" },
  INFJ: { label: "El/La Mentor/a",      tagline: "sensible, profundo/a y con causa" },
  INFP: { label: "El/La Soñador/a",     tagline: "idealista, creativo/a y reflexivo/a" },
  ENFJ: { label: "El/La Líder Empático/a", tagline: "carismático/a y entregado/a a los demás" },
  ENFP: { label: "El/La Activador/a",   tagline: "entusiasta, espontáneo/a e inspirador/a" },
  ISTJ: { label: "El/La Inspector/a",   tagline: "metódico/a, fiable y orientado/a al deber" },
  ISFJ: { label: "El/La Protector/a",   tagline: "leal, organizado/a y atento/a al detalle" },
  ESTJ: { label: "El/La Director/a",    tagline: "ejecutivo/a, claro/a y eficiente" },
  ESFJ: { label: "El/La Anfitrión/a",   tagline: "cercano/a, organizado/a y muy social" },
  ISTP: { label: "El/La Artesano/a",    tagline: "práctico/a, observador/a y resolutivo/a" },
  ISFP: { label: "El/La Artista",       tagline: "sensible, espontáneo/a y estético/a" },
  ESTP: { label: "El/La Emprendedor/a", tagline: "directo/a, enérgico/a y resolutivo/a" },
  ESFP: { label: "El/La Animador/a",    tagline: "cálido/a, divertido/a y muy presente" },
};

export function getMbtiNickname(type: string) {
  return MBTI_NICKNAMES[type] || { label: "Tu perfil", tagline: "una mezcla única de rasgos" };
}

interface NarrativeContext {
  bigFive: BigFiveScores;
  mbtiType: string;
  topRiasec: string[];   // e.g. ["I","S","A"]
  topValues: string[];   // e.g. ["impacto_social","creatividad"]
  topAptitudes: string[];
}

/**
 * Genera una narrativa de 4-6 frases describiendo a la persona, su forma
 * de trabajar y de relacionarse, en tono cercano y útil.
 */
export function generatePersonalityNarrative(ctx: NarrativeContext): {
  summary: string;
  workStyle: string;
  strengths: string[];
} {
  const { bigFive, mbtiType, topRiasec, topValues } = ctx;
  const nick = getMbtiNickname(mbtiType);

  const O = bigFive.O, C = bigFive.C, E = bigFive.E, A = bigFive.A, N = bigFive.N;

  const traits: string[] = [];
  if (O >= 70) traits.push("una mente abierta, curiosa y atraída por lo nuevo");
  else if (O <= 35) traits.push("una persona pragmática, que prefiere lo familiar y lo concreto");

  if (C >= 70) traits.push("muy disciplinada y organizada en lo que se propone");
  else if (C <= 35) traits.push("flexible y espontánea, que prefiere no atarse a la rutina");

  if (E >= 70) traits.push("con mucha energía social, te recargas con la gente");
  else if (E <= 35) traits.push("reservada y reflexiva, que necesita tiempo a solas para recargar");

  if (A >= 70) traits.push("empática y muy sintonizada con cómo se sienten los demás");
  else if (A <= 35) traits.push("directa, racional y con poco filtro a la hora de defender lo tuyo");

  if (N <= 35) traits.push("emocionalmente estable y con una buena capacidad para manejar la presión");
  else if (N >= 65) traits.push("sensible a lo que pasa alrededor, con pasiones intensas y también preocupaciones intensas");

  const summary = `Tu perfil corresponde a **${nick.label}**: ${nick.tagline}. ${
    traits.length ? "Eres " + traits.slice(0, 3).join("; ") + "." : ""
  }`;

  const workParts: string[] = [];
  if (topRiasec.includes("I")) workParts.push("disfrutas analizando, investigando y haciendo preguntas a fondo");
  if (topRiasec.includes("R")) workParts.push("te sientes cómodo/a con lo manual, lo técnico y lo tangible");
  if (topRiasec.includes("A")) workParts.push("necesitas un espacio para crear y expresarte");
  if (topRiasec.includes("S")) workParts.push("te realizas cuando ayudas o trabajas con personas");
  if (topRiasec.includes("E")) workParts.push("te ves liderando, vendiendo o convenciendo a otros");
  if (topRiasec.includes("C")) workParts.push("rindes mejor con sistemas claros, datos y procesos definidos");

  const valueParts: string[] = [];
  for (const v of topValues) {
    if (v === "impacto_social") valueParts.push("dejar huella en la gente");
    if (v === "creatividad") valueParts.push("tener libertad creativa");
    if (v === "autonomia") valueParts.push("decidir tú cómo y cuándo trabajas");
    if (v === "prestigio") valueParts.push("ser reconocido/a en tu campo");
    if (v === "seguridad_economica") valueParts.push("estabilidad económica");
    if (v === "conciliacion") valueParts.push("equilibrio entre trabajo y vida personal");
  }

  const workStyle =
    (workParts.length ? "En lo profesional, " + workParts.slice(0, 2).join(" y ") + "." : "") +
    (valueParts.length ? " Lo que más valoras: " + valueParts.slice(0, 2).join(" y ") + "." : "");

  const strengths: string[] = [];
  if (O >= 60) strengths.push("Pensamiento creativo");
  if (C >= 60) strengths.push("Disciplina y organización");
  if (E >= 60) strengths.push("Habilidad social");
  if (A >= 60) strengths.push("Empatía");
  if (N <= 40) strengths.push("Resistencia al estrés");
  if (topRiasec.includes("I")) strengths.push("Análisis y resolución de problemas");
  if (topRiasec.includes("A")) strengths.push("Sensibilidad estética");
  if (topRiasec.includes("S")) strengths.push("Trato con personas");
  if (topRiasec.includes("E")) strengths.push("Liderazgo");
  if (topRiasec.includes("C")) strengths.push("Atención al detalle");
  if (topRiasec.includes("R")) strengths.push("Habilidades técnicas/manuales");

  return {
    summary,
    workStyle: workStyle.trim(),
    strengths: strengths.slice(0, 6),
  };
}
