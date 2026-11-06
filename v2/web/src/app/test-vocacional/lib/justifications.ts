/* ═══════════════════════════════════════════════════════════
   Justification engine — produce explanations in natural Spanish
   for why a career, a university and a city fit a student.
   ═══════════════════════════════════════════════════════════ */

import type { StudentProfile, CareerProfile, CareerMatch, CityProfile } from "../types";
import type { BigFiveScores } from "./big-five";
import { careerCommunity, isDistanceOffer, normalizeCommunity } from './geography';

const RIASEC_LABELS: Record<string, string> = {
  R: "realista (manual y técnica)",
  I: "investigadora (analítica y curiosa)",
  A: "artística (creativa y expresiva)",
  S: "social (orientada a personas)",
  E: "emprendedora (líder y persuasiva)",
  C: "convencional (ordenada y metódica)",
};

// Short adjectives (sin paréntesis) para construir frases más naturales.
const RIASEC_ADJ: Record<string, string> = {
  R: "lo realista y práctico",
  I: "lo analítico e investigador",
  A: "lo creativo y expresivo",
  S: "el trato con personas",
  E: "el liderazgo y la iniciativa",
  C: "el orden y el método",
};

const BRANCH_LABELS: Record<string, string> = {
  ciencias: "ciencias",
  ciencias_salud: "ciencias de la salud",
  ingenieria_arquitectura: "ingeniería y arquitectura",
  artes_humanidades: "artes y humanidades",
  ciencias_sociales_juridicas: "ciencias sociales y jurídicas",
};

const APTITUDE_LABELS: Record<string, string> = {
  logico_matematica: "lógico-matemática",
  verbal_linguistica: "verbal",
  espacial_visual: "espacial-visual",
  cientifico_tecnica: "científico-técnica",
  interpersonal: "interpersonal",
  corporal_kinestesica: "corporal-kinestésica",
};

const VALUE_LABELS: Record<string, string> = {
  seguridad_economica: "estabilidad económica",
  impacto_social: "impacto social",
  prestigio: "reconocimiento profesional",
  autonomia: "autonomía y libertad",
  creatividad: "expresión creativa",
  conciliacion: "equilibrio vida-trabajo",
};

// Etiquetas legibles para los tags de interés: evita mostrar claves crudas como
// "doble_grado" o "ade" en la justificación que lee el estudiante.
const TAG_LABELS: Record<string, string> = {
  doble_grado: "los dobles grados",
  grado_simple: "un grado bien enfocado",
  ade: "empresa y negocios",
  empresa: "gestión empresarial",
  finanzas: "finanzas",
  informatica: "informática",
  programacion: "programación",
  telecomunicaciones: "telecomunicaciones",
  derecho: "derecho",
  medicina: "medicina",
  enfermeria: "enfermería",
  psicologia: "psicología",
  biotecnologia: "biotecnología",
  farmacia: "farmacia",
  fisioterapia: "fisioterapia",
  deporte: "ciencias del deporte",
  periodismo: "periodismo",
  audiovisual: "comunicación audiovisual",
  relaciones_internacionales: "relaciones internacionales",
  matematicas: "matemáticas",
  fisica: "física",
};
function humanizeTag(t: string): string {
  return TAG_LABELS[t] || t.replace(/_/g, " ");
}

function topKeysOf<T extends Record<string, number>>(o: T, n = 2): string[] {
  return Object.entries(o)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => k);
}

/**
 * Genera una justificación rica (3-5 frases) de por qué una carrera concreta
 * encaja con el perfil del estudiante. Combina RIASEC, valores, aptitudes,
 * tags específicos y rasgos Big Five.
 */
export function justifyCareer(
  profile: StudentProfile,
  bigFive: BigFiveScores | null,
  match: CareerMatch
): string {
  const career = match.career;
  const parts: string[] = [];
  const interests = topKeysOf(profile.riasec, 2).filter(key =>
    topKeysOf(career.riasec as unknown as Record<string, number>, 2).includes(key));
  if (interests.length) {
    parts.push(`En tus respuestas ${interests.length === 1 ? 'destaca' : 'destacan'} ${interests.map(key => RIASEC_ADJ[key]).join(' y ')}. El perfil orientativo de ${career.name} comparte esos intereses.`);
  }
  const aptitudes = topKeysOf(profile.aptitudes, 2).filter(key =>
    topKeysOf(career.aptitudes as unknown as Record<string, number>, 2).includes(key));
  if (aptitudes.length) {
    parts.push(`Has señalado estas afinidades: ${aptitudes.map(key => APTITUDE_LABELS[key]).join(' y ')}. El modelo las relaciona con actividades de esta titulación.`);
  }
  const values = topKeysOf(profile.valores, 2).filter(key =>
    topKeysOf(career.valores as unknown as Record<string, number>, 2).includes(key));
  if (values.length) {
    parts.push(`También has señalado estas prioridades: ${values.map(key => VALUE_LABELS[key]).join(' y ')}. Revisa cómo se concretan en el plan de estudios y en sus salidas.`);
  }
  const tags = career.tags.filter(tag => (profile.tags[tag] ?? 0) >= 2);
  if (tags.length) parts.push(`Conecta con preferencias que has marcado: ${tags.slice(0, 3).map(humanizeTag).join(', ')}.`);
  if (bigFive && bigFive.E >= 65 && aptitudes.includes('interpersonal')) {
    parts.push('En personalidad has indicado que disfrutas del contacto con otras personas; puedes explorar qué peso tiene en esta profesión.');
  }
  const conflicts = (career.aversiones ?? []).filter(key => (profile.aversiones as unknown as Record<string, number>)[key] >= 4);
  if (conflicts.length) parts.push(`Para revisar: el perfil de la carrera incluye ${conflicts.map(humanizeTag).join(', ')}, que has señalado entre las actividades que preferirías evitar.`);
  if (!parts.length) parts.push('El modelo ha seleccionado esta oferta al combinar tus respuestas. Revisa sus asignaturas y requisitos para decidir si te interesa explorarla.');
  return parts.join(' ');
}

const BIG_FIVE_DESC: Record<string, [string, string]> = {
  // [si alto, si bajo]
  O: ["muy abierto/a a ideas y experiencias nuevas", "práctico/a y de gustos convencionales"],
  C: ["muy responsable, organizado/a y disciplinado/a", "flexible y espontáneo/a, menos rutinario/a"],
  E: ["extravertido/a, gana energía con la gente", "más reservado/a, rinde mejor en entornos tranquilos"],
  A: ["empático/a y cooperativo/a", "directo/a, competitivo/a y crítico/a"],
  N: ["sensible al estrés, vive las cosas con intensidad", "emocionalmente estable y tranquilo/a bajo presión"],
};

/**
 * Construye un resumen en español del perfil del estudiante para alimentar a
 * la IA (Gemini). Se queda solo con las señales fuertes para que el prompt sea
 * compacto y la justificación sea concreta, no genérica.
 */
export function buildProfileSummary(
  profile: StudentProfile,
  bigFive: BigFiveScores | null,
  mbtiType?: string,
  hollandCode?: string
): string {
  const lines: string[] = [];

  const riasecTop = Object.entries(profile.riasec)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k]) => RIASEC_LABELS[k]);
  if (riasecTop.length) lines.push(`- Intereses dominantes (RIASEC): ${riasecTop.join(", ")}.`);

  const aptTop = topKeysOf(profile.aptitudes, 3).map((k) => APTITUDE_LABELS[k]);
  if (aptTop.length) lines.push(`- Aptitudes más fuertes: ${aptTop.join(", ")}.`);

  const valTop = topKeysOf(profile.valores, 3).map((k) => VALUE_LABELS[k]);
  if (valTop.length) lines.push(`- Lo que más valora: ${valTop.join(", ")}.`);

  const aversiones = Object.entries(profile.aversiones)
    .filter(([, v]) => v >= 4)
    .map(([k]) => k.replace(/_/g, " "));
  if (aversiones.length) lines.push(`- Quiere evitar: ${aversiones.join(", ")}.`);

  const ambicionTop = Object.entries(profile.ambicion)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 1)
    .map(([k]) => k);
  if (ambicionTop.length) {
    const map: Record<string, string> = {
      academica: "ambición académica/investigadora",
      economica: "ambición económica",
      social: "motivación por el impacto social",
    };
    lines.push(`- Motivación principal: ${map[ambicionTop[0]] || ambicionTop[0]}.`);
  }

  const ev = profile.estilo_vida;
  const evParts: string[] = [];
  if (ev.urbano >= 7) evParts.push("prefiere ciudad grande");
  else if (ev.urbano <= 3) evParts.push("prefiere entornos pequeños/tranquilos");
  if (ev.social >= 7) evParts.push("muy social");
  if (ev.ritmo >= 7) evParts.push("busca un ritmo intenso");
  else if (ev.ritmo <= 3) evParts.push("prefiere un ritmo pausado");
  if (evParts.length) lines.push(`- Estilo de vida: ${evParts.join(", ")}.`);

  if (bigFive) {
    const bfParts = (Object.keys(BIG_FIVE_DESC) as (keyof typeof BIG_FIVE_DESC)[])
      .map((t) => {
        const v = (bigFive as unknown as Record<string, number>)[t] ?? 50;
        if (v >= 65) return BIG_FIVE_DESC[t][0];
        if (v <= 35) return BIG_FIVE_DESC[t][1];
        return null;
      })
      .filter(Boolean);
    if (bfParts.length) lines.push(`- Personalidad (Big Five): ${bfParts.join("; ")}.`);
  }

  const tags = Object.entries(profile.tags || {})
    .filter(([, v]) => v >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([k]) => k.replace(/_/g, " "));
  if (tags.length) lines.push(`- Intereses concretos detectados: ${tags.join(", ")}.`);

  const meta: string[] = [];
  if (mbtiType) meta.push(`MBTI ${mbtiType}`);
  if (hollandCode) meta.push(`Holland ${hollandCode.slice(0, 3).toUpperCase()}`);
  if (profile.pragmatico?.nota_estimada > 0) meta.push(`nota estimada ${profile.pragmatico.nota_estimada}`);
  if (meta.length) lines.push(`- Otros: ${meta.join(", ")}.`);

  return lines.join("\n");
}

interface UniRow {
  id: string;
  name: string;
  short_name: string | null;
  type: string;
  city: string;
  comunidad_autonoma: string;
  cut_off?: number | null;
}

/**
 * Justifica por qué se recomienda una universidad concreta.
 * Combina: tipo (pública/privada vs presupuesto), nota corte realista,
 * ciudad afín, distancia geográfica vs movilidad declarada.
 */
export function justifyUniversity(
  profile: StudentProfile,
  uni: UniRow,
  career: CareerProfile
): string {
  const parts: string[] = [];

  // Type vs budget
  if (uni.type === "publica") {
    if (profile.pragmatico.presupuesto === 1) {
      parts.push("Es una universidad pública, como has indicado que prefieres. Consulta sus precios y las becas aplicables.");
    } else {
      parts.push("Es una universidad pública. Revisa su plan de estudios, precios y servicios para comparar la oferta.");
    }
  } else if (uni.type === "privada") {
    if (profile.pragmatico.presupuesto === 3) {
      parts.push("Es una universidad privada y has indicado que contemplas esa opción. Comprueba su coste total y financiación.");
    } else if (profile.pragmatico.presupuesto === 2) {
      parts.push("Es una universidad privada, una alternativa que no has descartado. Comprueba precios y becas antes de decidir.");
    }
  }

  // Cut-off realism
  if (career.cut_off_score && profile.pragmatico.nota_estimada > 0) {
    const diff = profile.pragmatico.nota_estimada - career.cut_off_score;
    const format = (grade: number) => grade.toLocaleString('es-ES', { maximumFractionDigits: 3 });
    const comparison = diff > 0 ? 'por encima del' : diff === 0 ? 'en el mismo nivel que el' : 'por debajo del';
    parts.push(`Tu nota estimada (${format(profile.pragmatico.nota_estimada)}) está ${comparison} corte de referencia${career.cut_off_year ? ` de ${career.cut_off_year}` : ''} (${format(career.cut_off_score)}). La comparación no garantiza plaza; revisa convocatoria, cupo y ponderaciones.`);
  }

  // Geographic preference
  const userComunidad = normalizeCommunity(profile.geografico.comunidad_actual);
  const offerRegion = normalizeCommunity(career.location_region) ?? careerCommunity(career.campus, uni.comunidad_autonoma);
  if (isDistanceOffer(career.modality)) {
    parts.push('La oferta figura a distancia. Revisa si las prácticas o los exámenes requieren desplazamientos, aunque la sede esté en otra comunidad.');
  } else if (userComunidad && offerRegion) {
    if (userComunidad === offerRegion) {
      parts.push(`La ubicación de esta oferta${career.campus ? ` (${career.campus})` : ''} está en tu comunidad o ciudad autónoma. Comprueba los desplazamientos necesarios.`);
    } else if (profile.geografico.movilidad >= 2) {
      parts.push(`La oferta${career.campus ? ` de ${career.campus}` : ''} está en otra comunidad, y has indicado que puedes valorar mudarte.`);
    } else if (profile.geografico.movilidad === 1) {
      parts.push('Esta oferta está fuera de la zona en la que has indicado que quieres estudiar.');
    }
  }

  if (parts.length === 0) {
    parts.push(`${uni.name} incluye esta carrera en el catálogo. Revisa sus requisitos y plan de estudios.`);
  }

  return parts.join(" ");
}

/**
 * Justifica por qué se recomienda una ciudad concreta.
 * Usa el CityProfile y los rasgos del estudiante (urbano, social, ritmo, costes).
 */
export function justifyCity(
  profile: StudentProfile,
  bigFive: BigFiveScores | null,
  city: CityProfile
): string {
  const parts: string[] = [];
  const ev = profile.estilo_vida;

  // Size
  if (city.size === "XXL" || city.size === "XL") {
    if (ev.urbano >= 7) parts.push(`${city.name} es una ciudad grande, justo lo que buscas: ritmo, oferta cultural y mucha vida estudiantil.`);
    else if (ev.urbano <= 4) parts.push(`Ojo: ${city.name} es una ciudad muy grande y tú declaras preferir entornos más pequeños.`);
    else parts.push(`${city.name} es una metrópoli con todos los servicios.`);
  } else if (city.size === "S" || city.size === "M") {
    if (ev.urbano <= 4) parts.push(`${city.name} es una ciudad de tamaño humano, ideal si prefieres tranquilidad sin perder vida universitaria.`);
    else if (ev.urbano >= 7) parts.push(`Aviso: ${city.name} es más pequeña que las metrópolis, podrías echar de menos algo de bullicio.`);
  }

  // Nightlife / culture
  if (ev.social >= 7 && city.nightlife >= 7) {
    parts.push(`Su vida nocturna y social va a sobrarte para disfrutar.`);
  }
  if (city.culture >= 7) {
    if (bigFive && bigFive.O >= 65) parts.push(`Su oferta cultural (museos, conciertos, exposiciones) es perfecta para tu apertura a lo nuevo.`);
    else parts.push(`Buena oferta cultural si te apetece descubrir cosas.`);
  }

  // Cost of living
  if (city.cost_of_living === "muy_alto") {
    if (profile.pragmatico.presupuesto <= 2) {
      parts.push(`⚠️ Tiene un coste de vida alto. Plantéate compartir piso o residencia.`);
    } else {
      parts.push(`Coste de vida alto, pero compatible con tu presupuesto.`);
    }
  } else if (city.cost_of_living === "bajo") {
    parts.push(`Coste de vida asequible: tu día a día va a estirarse mucho más.`);
  }

  // Climate / beach
  if (city.beach_proximity === "si") parts.push(`Y de regalo: tienes playa cerca.`);

  // Student-friendliness
  if (city.student_friendly >= 8) {
    parts.push(`Es una ciudad muy estudiantil: vas a encontrar gente de tu edad fácilmente.`);
  }

  if (parts.length === 0) {
    parts.push(`${city.name} es una buena opción para estudiar.`);
  }

  return parts.join(" ");
}
