// Taxonomía de niveles de beca (espejo de web/src/lib/becas.ts).
// El público objetivo se guarda en scholarships.target_audience como tokens de
// texto libre con variantes; aquí las normalizamos por nivel canónico.

export type NivelValue =
  | 'eso' | 'bachillerato' | 'fp_medio' | 'fp_superior'
  | 'grado' | 'master' | 'doctorado' | 'postdoctorado';

export const NIVELES: { value: NivelValue; label: string }[] = [
  { value: 'eso', label: 'ESO' },
  { value: 'bachillerato', label: 'Bachillerato' },
  { value: 'fp_medio', label: 'FP Medio' },
  { value: 'fp_superior', label: 'FP Superior' },
  { value: 'grado', label: 'Grado' },
  { value: 'master', label: 'Máster' },
  { value: 'doctorado', label: 'Doctorado' },
  { value: 'postdoctorado', label: 'Posdoctorado / Doctorado terminado' },
];

const NIVEL_ALIASES: Record<NivelValue, string[]> = {
  eso: ['eso', 'secundaria', 'educacion_secundaria', '4_eso'],
  bachillerato: ['bachillerato', 'bachiller', 'preuniversitario', 'acceso_universidad', 'postobligatoria'],
  // FP: solo los tokens del grado concreto. Los genéricos van a FP_GENERICO.
  fp_medio: ['fp_medio', 'fp_grado_medio', 'grado_medio', 'cfgm', 'ciclo_formativo_grado_medio'],
  fp_superior: ['fp_superior', 'fp_grado_superior', 'grado_superior', 'cfgs', 'ciclo_formativo_grado_superior'],
  grado: ['grado', 'grado_ultimo_curso', 'universitario', 'universitarios', 'estudiante_universitario', 'recien_graduado'],
  master: ['master', 'mba', 'posgrado', 'postgrado', 'postgrado_master'],
  doctorado: [
    'doctorado', 'doctorando', 'doctorandos', 'phd', 'predoctoral', 'contrato_predoctoral',
  ],
  postdoctorado: ['postdoctorado', 'posdoctorado', 'postdoc', 'postdoctoral', 'contrato_postdoctoral'],
};
const RESEARCH_GENERIC = ['investigacion', 'investigadores', 'investigador'];

// FP sin grado especificado: vale para medio y para superior.
const FP_GENERICO = ['fp', 'formacion_profesional', 'ciclo_formativo', 'fp_dual'];

const UNIVERSAL_TOKENS = ['todos', 'cualquiera', 'todos_los_niveles', 'general', 'estudiantes'];
const ALL_LEVEL_TOKENS = new Set([...Object.values(NIVEL_ALIASES).flat(), ...FP_GENERICO]);

const normTokens = (target: string[] | null | undefined): string[] =>
  (target ?? []).map((t) => String(t).toLowerCase().trim());

/** 'match' | 'sin_datos' (la beca no dice a quién va) | 'no_match'. */
export type NivelMatch = 'match' | 'sin_datos' | 'no_match';

export function nivelMatchInfo(
  target: string[] | null | undefined,
  nivel: NivelValue | 'todos',
): NivelMatch {
  if (nivel === 'todos') return 'match';
  const aud = normTokens(target);
  if (aud.length === 0) return 'sin_datos';
  if (aud.some((t) => UNIVERSAL_TOKENS.includes(t))) return 'match';
  const aliases = NIVEL_ALIASES[nivel];
  if (aud.some((t) => aliases.includes(t))) return 'match';
  if (!aud.some(t => ALL_LEVEL_TOKENS.has(t)) && aud.some(t => RESEARCH_GENERIC.includes(t))) {
    return nivel === 'doctorado' || nivel === 'postdoctorado' ? 'sin_datos' : 'no_match';
  }
  if ((nivel === 'fp_medio' || nivel === 'fp_superior') && aud.some((t) => FP_GENERICO.includes(t))) return 'match';
  if (!aud.some((t) => ALL_LEVEL_TOKENS.has(t))) return 'match';
  return 'no_match';
}

export function nivelMatches(target: string[] | null | undefined, nivel: NivelValue | 'todos'): boolean {
  return nivelMatchInfo(target, nivel) !== 'no_match';
}

// ── Condiciones especiales (espejo de web/src/lib/becas.ts) ───────────────
export const COND_DISCAPACIDAD = ['discapacidad', 'diversidad_funcional'];
export const COND_FAMILIA_NUMEROSA = ['familia_numerosa'];

/** ¿La beca es exclusiva de un colectivo que el usuario no ha declarado? */
export function condicionExcluye(
  target: string[] | null | undefined,
  tokens: string[],
  usuarioCumple: boolean,
): boolean {
  if (usuarioCumple) return false;
  return normTokens(target).some((t) => tokens.includes(t));
}

// ── Tipo de ayuda (espejo de web/src/lib/becas.ts) ────────────────────────
// `scholarships` no tiene columna para esto: `type` es el ORIGEN. Lo único que
// hay es `coverage`, tokens libres, que aquí se agrupan en categorías.
export type CategoriaAyuda = 'dinero' | 'practicas' | 'movilidad' | 'formacion';

const COVERAGE_CATEGORIA: Record<string, CategoriaAyuda[]> = {
  matricula: ['dinero'], tasas: ['dinero'], ensenanza: ['dinero'], manutencion: ['dinero'],
  comedor: ['dinero'], transporte: ['dinero'], residencia: ['dinero'], alojamiento: ['dinero'],
  material: ['dinero'], libros: ['dinero'], seguro: ['dinero'], beca_mensual: ['dinero'],
  cuantia_fija: ['dinero'], cuantia_variable: ['dinero'], ayuda_economica: ['dinero'],
  premio_academico: ['dinero'], excelencia: ['dinero'], permanencia: ['dinero'],
  reeducacion: ['dinero'], entrenamiento: ['dinero'], proyectos: ['dinero'],
  costes_investigacion: ['dinero'], ayuda_investigacion: ['dinero'],
  practicas_remuneradas: ['practicas', 'dinero'], practicas: ['practicas'],
  contrato_predoctoral: ['practicas'], contrato_postdoctoral: ['practicas'],
  contrato_laboral: ['practicas'], seguridad_social: ['practicas'], fp_dual: ['practicas'],
  movilidad_internacional: ['movilidad', 'dinero'], movilidad: ['movilidad', 'dinero'],
  movilidad_nacional: ['movilidad', 'dinero'], viaje: ['movilidad', 'dinero'],
  estancia: ['movilidad', 'dinero'],
  formacion: ['formacion'], idiomas: ['formacion'],
};

const AUDIENCE_MOVILIDAD = ['erasmus', 'movilidad_internacional', 'sicue'];

export function categoriasAyuda(
  coverage: string[] | null | undefined,
  target?: string[] | null,
): Set<CategoriaAyuda> {
  const out = new Set<CategoriaAyuda>();
  for (const raw of coverage ?? []) {
    for (const c of COVERAGE_CATEGORIA[String(raw).toLowerCase().trim()] ?? []) out.add(c);
  }
  for (const raw of target ?? []) {
    if (AUDIENCE_MOVILIDAD.includes(String(raw).toLowerCase().trim())) out.add('movilidad');
  }
  return out;
}

export type AyudaFiltro = 'cualquiera' | 'dinero' | 'practicas' | 'movilidad';

export const TIPOS_AYUDA: { value: AyudaFiltro; label: string; hint: string }[] = [
  { value: 'cualquiera', label: 'Cualquier ayuda', hint: 'Muéstramelo todo' },
  { value: 'dinero', label: 'Solo dinero', hint: 'Matrícula, manutención, transporte, residencia… sin trabajar a cambio' },
  { value: 'practicas', label: 'Prácticas o contrato', hint: 'Prácticas remuneradas, contratos predoctorales, FP dual' },
  { value: 'movilidad', label: 'Irme al extranjero', hint: 'Erasmus+, SICUE, movilidad internacional' },
];

/** "dinero" filtra por exclusión para no esconder becas sin coverage. */
export function tipoAyudaMatches(
  coverage: string[] | null | undefined,
  target: string[] | null | undefined,
  filtro: AyudaFiltro,
): boolean {
  if (filtro === 'cualquiera') return true;
  const cats = categoriasAyuda(coverage, target);
  if (filtro === 'dinero') return !(cats.has('practicas') && !cats.has('dinero'));
  return cats.has(filtro);
}

// ── Perfil del asistente de elegibilidad (mismas preguntas que la web) ─────
export interface PerfilBecas {
  mec?: import('./mec-requirements').MecDraft;
  nivel: NivelValue | 'todos';
  comunidad: string | null;
  /** Tramo de renta anual elegido, en euros. */
  renta: number | null;
  nota: number | null;
  ayuda: AyudaFiltro;
  discapacidad: boolean;
  familia_numerosa: boolean;
}

export const PERFIL_VACIO: PerfilBecas = {
  nivel: 'todos', comunidad: null, renta: null, nota: null,
  ayuda: 'cualquiera', discapacidad: false, familia_numerosa: false,
};

export const perfilActivo = (p: PerfilBecas): boolean =>
  JSON.stringify(p) !== JSON.stringify(PERFIL_VACIO);

export const COMUNIDADES = [
  'Andalucía', 'Aragón', 'Asturias', 'Baleares', 'Canarias',
  'Cantabria', 'Castilla y León', 'Castilla-La Mancha', 'Cataluña',
  'Comunidad Valenciana', 'Extremadura', 'Galicia', 'La Rioja',
  'Madrid', 'Murcia', 'Navarra', 'País Vasco', 'Ceuta', 'Melilla',
];

export const TRAMOS_RENTA: { value: number; label: string }[] = [
  { value: 8000, label: 'Menos de 8.000 €/año' },
  { value: 14000, label: 'Entre 8.000 y 14.000 €/año' },
  { value: 22000, label: 'Entre 14.000 y 22.000 €/año' },
  { value: 36000, label: 'Entre 22.000 y 36.000 €/año' },
  { value: 50000, label: 'Entre 36.000 y 50.000 €/año' },
  { value: 100000, label: 'Más de 50.000 €/año' },
];

/** Espejo de matchesEligibility (web/src/app/becas/page.tsx). */
export function matchesPerfil(
  s: {
    target_audience: string[] | null;
    coverage?: string[] | null;
    income_threshold: number | null;
    gpa_requirement: number | null;
    comunidad_autonoma: string | null;
  },
  p: PerfilBecas,
): { ok: boolean; sinNivel: boolean } {
  const no = { ok: false, sinNivel: false };
  // A single threshold doesn't specify household members, deductions, course
  // or exceptions. Those checks remain pending in the official call.
  const nm = nivelMatchInfo(s.target_audience, p.nivel);
  if (nm === 'no_match') return no;
  if (!tipoAyudaMatches(s.coverage, s.target_audience, p.ayuda)) return no;
  return { ok: true, sinNivel: nm === 'sin_datos' };
}

// Published dates only: expired calls are never projected into a new year.
export type PlazoEstado = 'abierta' | 'proxima' | 'pendiente_apertura' | 'estimada' | 'sin_fecha';
export interface ScholarshipWindow { opens_at?: string | null; closes_at?: string | null }
export interface PlazoInfo {
  estado: PlazoEstado;
  fecha: Date | null;
  apertura: Date | null;
  /** Legacy flag for a closed call, not an estimated future date. */
  estimada: boolean;
  dias: number | null;
  ultimaConvocatoria: Date | null;
}
const validDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
export function plazoInfo(deadline: string | null | undefined, now = Date.now(), window: ScholarshipWindow = {}): PlazoInfo {
  const exactClose = validDate(window.closes_at);
  const close = exactClose ?? validDate(deadline);
  const open = validDate(window.opens_at);
  const base = { fecha: close, apertura: open, estimada: false, dias: null, ultimaConvocatoria: null };
  // Reject contradictory data without advertising an actionable call.
  if (open && close && open.getTime() >= close.getTime()) return { ...base, estado: 'sin_fecha' };
  if (open && open.getTime() > now) return { ...base, estado: 'pendiente_apertura' };
  if (!close) return { ...base, estado: 'sin_fecha' };
  const dateOnly = !exactClose && !!deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const current = dateOnly
    ? deadline! >= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(now))
    : close.getTime() > now;
  if (current) {
    const dias = Math.max(0, Math.ceil((close.getTime()-now)/864e5));
    return { ...base, estado: dias <= 21 ? 'proxima' : 'abierta', dias };
  }
  return { ...base, estado: 'estimada', estimada: true, ultimaConvocatoria: close };
}
export function plazoAbierto(deadline: string | null | undefined, now = Date.now(), window: ScholarshipWindow = {}): boolean {
  const state = plazoInfo(deadline, now, window).estado;
  return state === 'abierta' || state === 'proxima';
}
export function mesAnyo(fecha: Date): string {
  return fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
}
export function plazoBadge(info: PlazoInfo): { label: string; tone: 'green' | 'amber' | 'gray' | 'muted' } | null {
  switch (info.estado) {
    case 'pendiente_apertura': return { label: 'Abre próximamente', tone: 'gray' };
    case 'abierta': return { label: 'Plazo abierto', tone: 'green' };
    case 'proxima': return { label: info.dias === 0 ? 'Cierra hoy' : `Cierra en ${info.dias} días`, tone: 'amber' };
    case 'estimada': return { label: 'Plazo cerrado', tone: 'gray' };
    default: return null;
  }
}
export function plazoOrden(deadline: string | null | undefined, now = Date.now(), window: ScholarshipWindow = {}): number {
  const info = plazoInfo(deadline, now, window);
  if (info.estado === 'pendiente_apertura') return 1e15 + (info.apertura?.getTime() ?? 0);
  if (info.estado === 'sin_fecha' || !info.fecha) return 2e15;
  return (info.estimada ? 3e15 : 0) + info.fecha.getTime();
}
