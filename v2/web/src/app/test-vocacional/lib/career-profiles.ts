/* ═══════════════════════════════════════════════════════════
   Career Profile Mapping — rules-based profile generation
   for career matching from career name + branch + cut_off.
   Used client-side to build CareerProfile vectors.
   ═══════════════════════════════════════════════════════════ */

import type { RiasecScores, AptitudesScores, ValoresScores } from "../types";

// ── Base profiles by branch ──
export const BRANCH_BASE_RIASEC: Record<string, RiasecScores> = {
  ciencias_salud: { R: 3, I: 7, A: 1, S: 8, E: 2, C: 4 },
  ingenieria_arquitectura: { R: 8, I: 7, A: 3, S: 1, E: 3, C: 5 },
  ciencias: { R: 3, I: 9, A: 2, S: 1, E: 1, C: 5 },
  ciencias_sociales_juridicas: { R: 1, I: 3, A: 2, S: 5, E: 7, C: 6 },
  artes_humanidades: { R: 1, I: 5, A: 8, S: 3, E: 2, C: 2 },
};

export const BRANCH_BASE_APTITUDES: Record<string, AptitudesScores> = {
  ciencias_salud: { logico_matematica: 5, verbal_linguistica: 4, espacial_visual: 4, cientifico_tecnica: 8, interpersonal: 7, corporal_kinestesica: 5 },
  ingenieria_arquitectura: { logico_matematica: 8, verbal_linguistica: 2, espacial_visual: 7, cientifico_tecnica: 7, interpersonal: 3, corporal_kinestesica: 4 },
  ciencias: { logico_matematica: 8, verbal_linguistica: 3, espacial_visual: 5, cientifico_tecnica: 9, interpersonal: 2, corporal_kinestesica: 1 },
  ciencias_sociales_juridicas: { logico_matematica: 4, verbal_linguistica: 7, espacial_visual: 2, cientifico_tecnica: 2, interpersonal: 7, corporal_kinestesica: 1 },
  artes_humanidades: { logico_matematica: 2, verbal_linguistica: 8, espacial_visual: 6, cientifico_tecnica: 1, interpersonal: 4, corporal_kinestesica: 3 },
};

export const BRANCH_BASE_VALORES: Record<string, ValoresScores> = {
  ciencias_salud: { seguridad_economica: 6, impacto_social: 8, prestigio: 7, autonomia: 4, creatividad: 3, conciliacion: 3 },
  ingenieria_arquitectura: { seguridad_economica: 7, impacto_social: 4, prestigio: 5, autonomia: 5, creatividad: 4, conciliacion: 4 },
  ciencias: { seguridad_economica: 4, impacto_social: 5, prestigio: 5, autonomia: 7, creatividad: 5, conciliacion: 5 },
  ciencias_sociales_juridicas: { seguridad_economica: 5, impacto_social: 6, prestigio: 5, autonomia: 4, creatividad: 3, conciliacion: 5 },
  artes_humanidades: { seguridad_economica: 2, impacto_social: 4, prestigio: 3, autonomia: 7, creatividad: 9, conciliacion: 5 },
};

// ── Keyword deltas ──
// Each keyword adjusts the base profile for specific careers

type KeywordDelta = {
  riasec?: Partial<RiasecScores>;
  aptitudes?: Partial<AptitudesScores>;
  valores?: Partial<ValoresScores>;
  aversiones?: string[];
  ambicion_delta?: number;
  tags?: string[];
};

const KEYWORD_DELTAS: Record<string, KeywordDelta> = {
  // Health sub-specialties
  medicina: { riasec: { S: 2, I: 1 }, aversiones: ["sangre"], ambicion_delta: 3, tags: ["medicina"] },
  enfermería: { riasec: { S: 3 }, valores: { conciliacion: 2, impacto_social: 2 }, aversiones: ["sangre"], tags: ["enfermeria"] },
  enfermeria: { riasec: { S: 3 }, valores: { conciliacion: 2, impacto_social: 2 }, aversiones: ["sangre"], tags: ["enfermeria"] },
  odontología: { riasec: { R: 2, S: 1 }, aptitudes: { corporal_kinestesica: 3 }, aversiones: ["sangre"], tags: ["odontologia"] },
  odontologia: { riasec: { R: 2, S: 1 }, aptitudes: { corporal_kinestesica: 3 }, aversiones: ["sangre"], tags: ["odontologia"] },
  veterinaria: { riasec: { R: 2, S: 1, I: 1 }, aversiones: ["sangre"], tags: ["veterinaria"] },
  farmacia: { riasec: { I: 2, C: 2, S: -1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["farmacia"] },
  fisioterapia: { riasec: { R: 2, S: 2 }, aptitudes: { corporal_kinestesica: 4 }, tags: ["fisioterapia"] },
  psicología: { riasec: { S: 3, I: 2, R: -2 }, aptitudes: { interpersonal: 3 }, tags: ["psicologia"] },
  psicologia: { riasec: { S: 3, I: 2, R: -2 }, aptitudes: { interpersonal: 3 }, tags: ["psicologia"] },
  biomedicina: { riasec: { I: 3, R: 1, S: -2 }, tags: ["investigacion_biomedica", "biomedicina"] },
  biotecnología: { riasec: { I: 2, R: 2 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["biotecnologia"] },
  biotecnologia: { riasec: { I: 2, R: 2 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["biotecnologia"] },
  nutrición: { riasec: { S: 2, I: 1 }, aptitudes: { cientifico_tecnica: 1 }, tags: ["nutricion"] },
  nutricion: { riasec: { S: 2, I: 1 }, aptitudes: { cientifico_tecnica: 1 }, tags: ["nutricion"] },
  óptica: { riasec: { R: 2, I: 1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["optica"] },
  optica: { riasec: { R: 2, I: 1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["optica"] },
  podología: { riasec: { R: 2, S: 1 }, aptitudes: { corporal_kinestesica: 2 }, tags: ["podologia"] },
  logopedia: { riasec: { S: 3 }, aptitudes: { interpersonal: 3, verbal_linguistica: 2 }, tags: ["logopedia"] },
  terapia: { riasec: { S: 2 }, aptitudes: { interpersonal: 2 }, tags: ["terapia"] },

  // Engineering sub-specialties
  informática: { riasec: { I: 2, R: 1, S: -2 }, aptitudes: { logico_matematica: 3 }, tags: ["informatica", "programacion"] },
  informatica: { riasec: { I: 2, R: 1, S: -2 }, aptitudes: { logico_matematica: 3 }, tags: ["informatica", "programacion"] },
  software: { riasec: { I: 2, R: 1 }, aptitudes: { logico_matematica: 3 }, tags: ["informatica", "programacion"] },
  computadores: { riasec: { I: 2, R: 2 }, aptitudes: { logico_matematica: 2 }, tags: ["informatica"] },
  datos: { riasec: { I: 3, C: 2 }, aptitudes: { logico_matematica: 3 }, tags: ["datos", "informatica"] },
  telecomunicaciones: { riasec: { I: 2, R: 2 }, aptitudes: { logico_matematica: 2 }, tags: ["telecomunicaciones"] },
  telecomunicación: { riasec: { I: 2, R: 2 }, aptitudes: { logico_matematica: 2 }, tags: ["telecomunicaciones"] },
  industrial: { riasec: { R: 2, E: 1 }, aptitudes: { logico_matematica: 1, espacial_visual: 1 }, tags: ["industrial"] },
  civil: { riasec: { R: 3 }, aptitudes: { espacial_visual: 2 }, tags: ["civil", "construccion"] },
  mecánica: { riasec: { R: 3 }, aptitudes: { espacial_visual: 2, corporal_kinestesica: 1 }, tags: ["mecanica"] },
  mecanica: { riasec: { R: 3 }, aptitudes: { espacial_visual: 2, corporal_kinestesica: 1 }, tags: ["mecanica"] },
  electrónica: { riasec: { R: 3, I: 1 }, aptitudes: { logico_matematica: 2 }, tags: ["electronica"] },
  electronica: { riasec: { R: 3, I: 1 }, aptitudes: { logico_matematica: 2 }, tags: ["electronica"] },
  eléctrica: { riasec: { R: 3 }, aptitudes: { logico_matematica: 1 }, tags: ["electrica"] },
  electrica: { riasec: { R: 3 }, aptitudes: { logico_matematica: 1 }, tags: ["electrica"] },
  aeronáutica: { riasec: { R: 2, I: 2 }, aptitudes: { logico_matematica: 3 }, ambicion_delta: 2, tags: ["aeronautica"] },
  aeronautica: { riasec: { R: 2, I: 2 }, aptitudes: { logico_matematica: 3 }, ambicion_delta: 2, tags: ["aeronautica"] },
  aeroespacial: { riasec: { R: 2, I: 3 }, aptitudes: { logico_matematica: 3 }, ambicion_delta: 2, tags: ["aeronautica"] },
  naval: { riasec: { R: 3 }, aptitudes: { espacial_visual: 2 }, tags: ["naval"] },
  biomédica: { riasec: { I: 2, S: 1 }, tags: ["biomedica"] },
  biomedica: { riasec: { I: 2, S: 1 }, tags: ["biomedica"] },
  química: { riasec: { I: 2 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["quimica"] },
  quimica: { riasec: { I: 2 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["quimica"] },
  ambiental: { riasec: { I: 1 }, valores: { impacto_social: 3 }, tags: ["ambiental", "energia"] },
  energía: { riasec: { R: 1, I: 1 }, valores: { impacto_social: 2 }, tags: ["energia"] },
  energia: { riasec: { R: 1, I: 1 }, valores: { impacto_social: 2 }, tags: ["energia"] },
  robótica: { riasec: { R: 2, I: 2 }, aptitudes: { logico_matematica: 2, espacial_visual: 2 }, tags: ["robotica"] },
  robotica: { riasec: { R: 2, I: 2 }, aptitudes: { logico_matematica: 2, espacial_visual: 2 }, tags: ["robotica"] },
  arquitectura: { riasec: { A: 4, R: 2, I: -1 }, aptitudes: { espacial_visual: 4 }, valores: { creatividad: 3 }, tags: ["arquitectura"] },

  // Sciences
  matemáticas: { riasec: { I: 3, C: 2 }, aptitudes: { logico_matematica: 4 }, tags: ["matematicas"] },
  matematicas: { riasec: { I: 3, C: 2 }, aptitudes: { logico_matematica: 4 }, tags: ["matematicas"] },
  física: { riasec: { I: 3, R: 1 }, aptitudes: { logico_matematica: 3, cientifico_tecnica: 2 }, tags: ["fisica"] },
  fisica: { riasec: { I: 3, R: 1 }, aptitudes: { logico_matematica: 3, cientifico_tecnica: 2 }, tags: ["fisica"] },
  biología: { riasec: { I: 3 }, aptitudes: { cientifico_tecnica: 3 }, tags: ["biologia_pura", "biologia"] },
  biologia: { riasec: { I: 3 }, aptitudes: { cientifico_tecnica: 3 }, tags: ["biologia_pura", "biologia"] },
  estadística: { riasec: { I: 2, C: 3 }, aptitudes: { logico_matematica: 4 }, tags: ["datos", "estadistica"] },
  estadistica: { riasec: { I: 2, C: 3 }, aptitudes: { logico_matematica: 4 }, tags: ["datos", "estadistica"] },
  geología: { riasec: { I: 2, R: 2 }, tags: ["geologia"] },
  geologia: { riasec: { I: 2, R: 2 }, tags: ["geologia"] },
  marina: { riasec: { I: 1, R: 2 }, tags: ["marina"] },

  // Social / Legal
  derecho: { riasec: { E: 3, S: 1 }, aptitudes: { verbal_linguistica: 4 }, aversiones: ["hablar_publico"], tags: ["derecho", "justicia"] },
  ade: { riasec: { E: 3, C: 2 }, aptitudes: { logico_matematica: 2, interpersonal: 2 }, tags: ["ade", "empresa"] },
  administración: { riasec: { E: 2, C: 3 }, aptitudes: { logico_matematica: 1 }, tags: ["ade", "empresa"] },
  administracion: { riasec: { E: 2, C: 3 }, aptitudes: { logico_matematica: 1 }, tags: ["ade", "empresa"] },
  empresa: { riasec: { E: 2, C: 2 }, aptitudes: { interpersonal: 2 }, tags: ["empresa"] },
  economía: { riasec: { I: 2, E: 1, C: 2 }, aptitudes: { logico_matematica: 3 }, tags: ["economia"] },
  economia: { riasec: { I: 2, E: 1, C: 2 }, aptitudes: { logico_matematica: 3 }, tags: ["economia"] },
  finanzas: { riasec: { C: 3, E: 1 }, aptitudes: { logico_matematica: 3 }, tags: ["finanzas"] },
  contabilidad: { riasec: { C: 4 }, aptitudes: { logico_matematica: 2 }, tags: ["finanzas"] },
  marketing: { riasec: { E: 3, A: 2 }, aptitudes: { interpersonal: 2 }, tags: ["marketing", "publicidad"] },
  publicidad: { riasec: { A: 2, E: 2 }, aptitudes: { verbal_linguistica: 2 }, valores: { creatividad: 2 }, tags: ["publicidad"] },
  relaciones: { riasec: { E: 2, S: 1 }, aptitudes: { interpersonal: 3 }, tags: ["comunidad"] },
  turismo: { riasec: { E: 2, S: 2 }, aptitudes: { interpersonal: 2 }, tags: ["turismo"] },
  criminología: { riasec: { I: 2, E: 1 }, aptitudes: { verbal_linguistica: 2 }, tags: ["criminologia"] },
  criminologia: { riasec: { I: 2, E: 1 }, aptitudes: { verbal_linguistica: 2 }, tags: ["criminologia"] },
  trabajo_social: { riasec: { S: 4 }, valores: { impacto_social: 4 }, tags: ["trabajo_social", "comunidad"] },
  sociología: { riasec: { I: 2, S: 2 }, tags: ["sociologia"] },
  sociologia: { riasec: { I: 2, S: 2 }, tags: ["sociologia"] },
  políticas: { riasec: { E: 2, S: 1 }, valores: { impacto_social: 3 }, tags: ["politica"] },
  politicas: { riasec: { E: 2, S: 1 }, valores: { impacto_social: 3 }, tags: ["politica"] },
  periodismo: { riasec: { A: 1, E: 1, I: 1 }, aptitudes: { verbal_linguistica: 3 }, aversiones: ["hablar_publico"], tags: ["periodismo"] },
  comunicación: { riasec: { A: 1, E: 2 }, aptitudes: { verbal_linguistica: 2, interpersonal: 1 }, aversiones: ["hablar_publico"], tags: ["comunicacion"] },
  comunicacion: { riasec: { A: 1, E: 2 }, aptitudes: { verbal_linguistica: 2, interpersonal: 1 }, aversiones: ["hablar_publico"], tags: ["comunicacion"] },
  educación: { riasec: { S: 4 }, aptitudes: { interpersonal: 3 }, valores: { impacto_social: 3 }, aversiones: ["hablar_publico"], tags: ["educacion", "ensenanza"] },
  educacion: { riasec: { S: 4 }, aptitudes: { interpersonal: 3 }, valores: { impacto_social: 3 }, aversiones: ["hablar_publico"], tags: ["educacion", "ensenanza"] },
  magisterio: { riasec: { S: 4 }, aptitudes: { interpersonal: 3 }, valores: { impacto_social: 3 }, aversiones: ["hablar_publico"], tags: ["educacion", "ensenanza"] },
  maestro: { riasec: { S: 4 }, aptitudes: { interpersonal: 3 }, tags: ["educacion", "ensenanza", "ninos"] },
  infantil: { riasec: { S: 3 }, aptitudes: { interpersonal: 2, corporal_kinestesica: 1 }, tags: ["ensenanza", "ninos"] },
  primaria: { riasec: { S: 3 }, aptitudes: { interpersonal: 2 }, tags: ["ensenanza", "ninos"] },
  pedagogía: { riasec: { S: 3, I: 1 }, aptitudes: { interpersonal: 2 }, tags: ["educacion"] },
  pedagogia: { riasec: { S: 3, I: 1 }, aptitudes: { interpersonal: 2 }, tags: ["educacion"] },
  social: { riasec: { S: 2 }, valores: { impacto_social: 2 }, tags: ["comunidad"] },

  // Arts & Humanities
  "bellas artes": { riasec: { A: 4, R: 1 }, aptitudes: { espacial_visual: 4 }, valores: { creatividad: 4 }, tags: ["arte_visual"] },
  diseño: { riasec: { A: 3, R: 1 }, aptitudes: { espacial_visual: 3 }, valores: { creatividad: 3 }, tags: ["diseño_funcional"] },
  historia: { riasec: { I: 2, A: 1 }, aptitudes: { verbal_linguistica: 3 }, tags: ["historia"] },
  filosofía: { riasec: { I: 3, A: 1 }, aptitudes: { verbal_linguistica: 3 }, tags: ["filosofia"] },
  filosofia: { riasec: { I: 3, A: 1 }, aptitudes: { verbal_linguistica: 3 }, tags: ["filosofia"] },
  filología: { riasec: { I: 1, A: 2 }, aptitudes: { verbal_linguistica: 4 }, tags: ["filologia"] },
  filologia: { riasec: { I: 1, A: 2 }, aptitudes: { verbal_linguistica: 4 }, tags: ["filologia"] },
  traducción: { riasec: { C: 2, A: 1 }, aptitudes: { verbal_linguistica: 4 }, tags: ["traduccion"] },
  traduccion: { riasec: { C: 2, A: 1 }, aptitudes: { verbal_linguistica: 4 }, tags: ["traduccion"] },
  audiovisual: { riasec: { A: 3, R: 1 }, aptitudes: { espacial_visual: 3 }, valores: { creatividad: 3 }, tags: ["audiovisual"] },
  cine: { riasec: { A: 3 }, aptitudes: { espacial_visual: 2, verbal_linguistica: 1 }, tags: ["audiovisual"] },
  música: { riasec: { A: 4 }, aptitudes: { corporal_kinestesica: 2 }, valores: { creatividad: 4 }, tags: ["musica"] },
  musica: { riasec: { A: 4 }, aptitudes: { corporal_kinestesica: 2 }, valores: { creatividad: 4 }, tags: ["musica"] },
  geografía: { riasec: { I: 2, R: 1 }, aptitudes: { espacial_visual: 2 }, tags: ["geografia"] },
  geografia: { riasec: { I: 2, R: 1 }, aptitudes: { espacial_visual: 2 }, tags: ["geografia"] },
  antropología: { riasec: { I: 2, S: 1 }, aptitudes: { verbal_linguistica: 2 }, tags: ["antropologia"] },
  antropologia: { riasec: { I: 2, S: 1 }, aptitudes: { verbal_linguistica: 2 }, tags: ["antropologia"] },

  // Modifiers
  "doble grado": { ambicion_delta: 3, valores: { prestigio: 2 } },
  doble: { ambicion_delta: 2, valores: { prestigio: 1 } },
  internacional: { valores: { prestigio: 1 }, tags: ["internacional"] },
  bilingüe: { aptitudes: { verbal_linguistica: 1 }, tags: ["internacional"] },
  bilingue: { aptitudes: { verbal_linguistica: 1 }, tags: ["internacional"] },

  // Sport/Physical
  deporte: { riasec: { R: 2, S: 2 }, aptitudes: { corporal_kinestesica: 4 }, tags: ["deporte"] },
  "ciencias del deporte": { riasec: { R: 2, S: 2 }, aptitudes: { corporal_kinestesica: 4 }, tags: ["deporte"] },
  "actividad física": { riasec: { R: 2 }, aptitudes: { corporal_kinestesica: 4 }, tags: ["deporte"] },

  // ── Audit fixes (added 2026-05): keywords y aversiones que faltaban ──
  // Especialidades médicas / sanitarias que no caían bajo "medicina"
  cirugía: { riasec: { R: 2, S: 1, I: 1 }, aptitudes: { corporal_kinestesica: 3 }, aversiones: ["sangre"], tags: ["medicina", "cirugia"] },
  cirugia: { riasec: { R: 2, S: 1, I: 1 }, aptitudes: { corporal_kinestesica: 3 }, aversiones: ["sangre"], tags: ["medicina", "cirugia"] },
  forense: { riasec: { I: 3, R: 1 }, aversiones: ["sangre"], tags: ["forense", "criminologia"] },
  obstetricia: { riasec: { S: 3 }, aversiones: ["sangre"], tags: ["enfermeria", "obstetricia"] },
  matrona: { riasec: { S: 3 }, aversiones: ["sangre"], tags: ["enfermeria", "obstetricia"] },
  paramédico: { riasec: { R: 2, S: 2 }, aversiones: ["sangre"], tags: ["paramedico"] },
  paramedico: { riasec: { R: 2, S: 2 }, aversiones: ["sangre"], tags: ["paramedico"] },

  // (Las aversiones de comunicación/educación/periodismo se aplican abajo en post-process)

  // Carreras con alta carga matemática (la aversión a matemáticas penalizará bien)
  actuarial: { riasec: { I: 3, C: 2 }, aptitudes: { logico_matematica: 4 }, aversiones: ["matematicas"], tags: ["actuarial", "finanzas"] },
  cuantitativ: { aptitudes: { logico_matematica: 3 }, aversiones: ["matematicas"], tags: ["datos"] },

  // Otras especialidades que faltaban
  optometría: { riasec: { R: 2, I: 1, S: 1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["optica", "optometria"] },
  optometria: { riasec: { R: 2, I: 1, S: 1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["optica", "optometria"] },
  enología: { riasec: { I: 1, R: 2 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["enologia", "agroalimentaria"] },
  enologia: { riasec: { I: 1, R: 2 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["enologia", "agroalimentaria"] },
  agronomía: { riasec: { R: 3, I: 1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["agronomia", "agroalimentaria", "medio_ambiente"] },
  agronomia: { riasec: { R: 3, I: 1 }, aptitudes: { cientifico_tecnica: 2 }, tags: ["agronomia", "agroalimentaria", "medio_ambiente"] },
  forestal: { riasec: { R: 3, I: 1 }, valores: { impacto_social: 2 }, tags: ["forestal", "medio_ambiente"] },
  agricola: { riasec: { R: 3 }, tags: ["agronomia", "agroalimentaria"] },
  "ingeniería agroalimentaria": { riasec: { R: 2, I: 1 }, tags: ["agronomia", "agroalimentaria"] },

  // Educación social / animación sociocultural
  "educación social": { riasec: { S: 4 }, valores: { impacto_social: 4 }, tags: ["educacion_social", "comunidad"] },
  "educacion social": { riasec: { S: 4 }, valores: { impacto_social: 4 }, tags: ["educacion_social", "comunidad"] },

  // Lengua de signos — solo S, no hablar público
  signos: { riasec: { S: 3, A: 1 }, aptitudes: { interpersonal: 2 }, tags: ["signos", "comunidad"] },

  // Animación, diseño, multimedia
  animación: { riasec: { A: 4 }, aptitudes: { espacial_visual: 3 }, valores: { creatividad: 3 }, tags: ["arte_visual", "audiovisual"] },
  animacion: { riasec: { A: 4 }, aptitudes: { espacial_visual: 3 }, valores: { creatividad: 3 }, tags: ["arte_visual", "audiovisual"] },
  videojuegos: { riasec: { A: 2, R: 2, I: 1 }, aptitudes: { logico_matematica: 2, espacial_visual: 2 }, tags: ["videojuegos", "informatica"] },
  multimedia: { riasec: { A: 3, R: 1 }, aptitudes: { espacial_visual: 2 }, tags: ["audiovisual"] },

  // Ciencias sociales que faltaban
  trabajo: { riasec: { S: 1 }, tags: ["empresa"] },
  rrhh: { riasec: { S: 2, E: 1 }, aptitudes: { interpersonal: 3 }, tags: ["rrhh"] },
  laboral: { riasec: { E: 2, C: 1 }, aptitudes: { verbal_linguistica: 1 }, tags: ["laboral"] },
  fiscal: { riasec: { C: 3, E: 1 }, aptitudes: { logico_matematica: 1 }, tags: ["fiscal", "finanzas"] },
  banca: { riasec: { C: 2, E: 2 }, aptitudes: { logico_matematica: 2 }, tags: ["finanzas", "banca"] },
};

/**
 * Build a career profile from name, branch, cut_off_score, and degree_type.
 * This is the core rules-based engine used to enrich ~5199 careers.
 */
export function buildCareerProfile(
  name: string,
  branch: string,
  cutOff: number | null,
  degreeType: string
): {
  riasec: RiasecScores;
  aptitudes: AptitudesScores;
  valores: ValoresScores;
  aversiones: string[];
  ambicion: number;
  tags: string[];
} {
  // Start from base
  const riasec = { ...(BRANCH_BASE_RIASEC[branch] || BRANCH_BASE_RIASEC.ciencias_sociales_juridicas) };
  const aptitudes = { ...(BRANCH_BASE_APTITUDES[branch] || BRANCH_BASE_APTITUDES.ciencias_sociales_juridicas) };
  const valores = { ...(BRANCH_BASE_VALORES[branch] || BRANCH_BASE_VALORES.ciencias_sociales_juridicas) };
  const aversiones = new Set<string>();
  const tags = new Set<string>();
  let ambicion = 5;

  // Apply keyword deltas
  const nameLower = name.toLowerCase();
  for (const [keyword, delta] of Object.entries(KEYWORD_DELTAS)) {
    if (nameLower.includes(keyword)) {
      // RIASEC deltas
      if (delta.riasec) {
        for (const [k, v] of Object.entries(delta.riasec)) {
          riasec[k as keyof RiasecScores] = Math.max(0, Math.min(10, (riasec[k as keyof RiasecScores] || 0) + v));
        }
      }
      // Aptitudes deltas
      if (delta.aptitudes) {
        for (const [k, v] of Object.entries(delta.aptitudes)) {
          aptitudes[k as keyof AptitudesScores] = Math.max(0, Math.min(10, (aptitudes[k as keyof AptitudesScores] || 0) + v));
        }
      }
      // Valores deltas
      if (delta.valores) {
        for (const [k, v] of Object.entries(delta.valores)) {
          valores[k as keyof ValoresScores] = Math.max(0, Math.min(10, (valores[k as keyof ValoresScores] || 0) + v));
        }
      }
      // Aversions
      if (delta.aversiones) delta.aversiones.forEach((a) => aversiones.add(a));
      // Ambition
      if (delta.ambicion_delta) ambicion += delta.ambicion_delta;
      // Tags
      if (delta.tags) delta.tags.forEach((t) => tags.add(t));
    }
  }

  // Adjust ambition by cut-off
  if (cutOff !== null) {
    if (cutOff >= 13) ambicion = Math.min(10, ambicion + 3);
    else if (cutOff >= 12) ambicion = Math.min(10, ambicion + 2);
    else if (cutOff >= 10) ambicion = Math.min(10, ambicion + 1);
    else if (cutOff < 6) ambicion = Math.max(1, ambicion - 2);
  }

  // Doble grado ambition
  if (degreeType === "doble_grado") {
    ambicion = Math.min(10, ambicion + 2);
    tags.add("doble_grado");
  }

  // Add branch tag (raw + prefixed for matcher)
  tags.add(branch);
  tags.add(`branch_${branch}`);

  // ── Component tags for double grados — detect specific famous combinations ──
  // These are key for the matching engine to surface "Doble Grado X+Y" correctly
  // when the student picked the corresponding combo in stage 5/2.
  const hasInfo = nameLower.includes("informát") || nameLower.includes("informat");
  const hasAde = nameLower.includes("ade") || nameLower.includes("administrac") || nameLower.includes("empresa");
  const hasDerecho = nameLower.includes("derecho");
  const hasFisica = nameLower.includes("física") || nameLower.includes("fisica");
  const hasMates = nameLower.includes("matemát") || nameLower.includes("matemat");
  const hasPeriodismo = nameLower.includes("periodismo");
  const hasAudiovisual = nameLower.includes("audiovisual");
  const hasFisio = nameLower.includes("fisioter");
  const hasDeporte = nameLower.includes("deporte") || nameLower.includes("inef");
  const hasPsico = nameLower.includes("psicolog");
  const hasCrimino = nameLower.includes("criminolog");
  const hasOdonto = nameLower.includes("odontolog");
  const hasMedicina = nameLower.includes("medicina");
  const hasBiotech = nameLower.includes("biotec");
  const hasBio = nameLower.includes("biolog") || nameLower.includes("bioquímic") || nameLower.includes("bioquimic");
  const hasFarmacia = nameLower.includes("farmacia");
  const hasOptica = nameLower.includes("óptic") || nameLower.includes("optic") || nameLower.includes("optomet");
  const hasIndustrial = nameLower.includes("industrial");
  const hasMecanica = nameLower.includes("mecán") || nameLower.includes("mecan");
  const hasElectronica = nameLower.includes("electrón") || nameLower.includes("electron");
  const hasCivil = nameLower.includes("civil");
  const hasArquitectura = nameLower.includes("arquitectura");
  const hasTelecos = nameLower.includes("teleco") || nameLower.includes("telecomu");
  const hasFinanzas = nameLower.includes("finanz");
  const hasRRII = nameLower.includes("relaciones internacionales") || nameLower.includes("internacionales");
  const hasEconomia = nameLower.includes("econom");
  const hasComunicacion = nameLower.includes("comunicación") || nameLower.includes("comunicacion");
  const hasRRHH = nameLower.includes("rrhh") || nameLower.includes("recursos humanos");

  if (hasInfo && hasAde) tags.add("doble_informatica_ade");
  if (hasDerecho && hasAde) tags.add("doble_derecho_ade");
  if (hasMates && hasFisica) tags.add("doble_mates_fisica");
  if (hasMates && hasInfo) tags.add("doble_mates_info");
  if (hasPeriodismo && hasAudiovisual) tags.add("doble_periodismo_audiovisual");
  if (hasFisio && hasDeporte) tags.add("doble_fisio_deporte");
  if (hasPsico && hasCrimino) tags.add("doble_psico_crimino");
  if (hasBiotech && (hasFarmacia || hasBio)) tags.add("doble_biotech_bio");
  if (hasOptica) { tags.add("optica"); if (nameLower.includes("optomet")) tags.add("optometria"); }
  if (hasIndustrial && (hasMecanica || hasElectronica)) tags.add("doble_industrial_mecanica");
  if (hasCivil && hasArquitectura) tags.add("doble_civil_arquitectura");
  if (hasTelecos && hasAde) tags.add("doble_telecos_empresa");
  if (hasAde && (hasFinanzas || hasEconomia)) tags.add("doble_ade_finanzas");
  if (hasDerecho && hasRRII) tags.add("doble_derecho_rrii");
  if (hasComunicacion && hasAudiovisual) tags.add("doble_periodismo_audiovisual");
  if (hasRRHH) tags.add("rrhh");
  if (hasMedicina) tags.add("medicina");
  if (hasOdonto) tags.add("odontologia");
  if (hasFisio) tags.add("fisioterapia");
  if (hasPsico) tags.add("psicologia");
  if (hasCrimino) tags.add("criminologia");
  if (hasArquitectura) tags.add("arquitectura");
  if (hasFinanzas) tags.add("finanzas");
  if (hasEconomia) tags.add("economia");
  if (hasComunicacion) tags.add("comunicacion");

  // Re-emphasize core component tags so matching tag intersection works
  if (hasInfo) tags.add("informatica");
  if (hasAde) tags.add("ade");

  return {
    riasec,
    aptitudes,
    valores,
    aversiones: Array.from(aversiones),
    ambicion: Math.max(1, Math.min(10, ambicion)),
    tags: Array.from(tags),
  };
}
