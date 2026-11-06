// Lógica compartida del apartado de Becas.
//
// El público objetivo de cada beca se guarda en `scholarships.target_audience`
// (array de tokens de texto libre). A lo largo del tiempo se han usado variantes
// distintas para el mismo nivel (p. ej. "fp_grado_medio" vs "fp_medio"), así que
// aquí normalizamos: cada nivel "canónico" que elige el usuario agrupa todas las
// variantes que pueden aparecer en los datos. Así el filtro no depende de que el
// string coincida exactamente.

export type NivelValue =
  | "eso"
  | "bachillerato"
  | "fp_medio"
  | "fp_superior"
  | "grado"
  | "master"
  | "doctorado"
  | "postdoctorado";

// Niveles que ofrece el formulario, en orden educativo.
export const NIVELES: { value: NivelValue; label: string; hint?: string }[] = [
  { value: "eso", label: "ESO / Secundaria" },
  { value: "bachillerato", label: "Bachillerato" },
  { value: "fp_medio", label: "FP de Grado Medio" },
  { value: "fp_superior", label: "FP de Grado Superior" },
  { value: "grado", label: "Grado universitario" },
  { value: "master", label: "Máster / Posgrado" },
  { value: "doctorado", label: "Doctorado" },
  { value: "postdoctorado", label: "Posdoctorado / Ya tengo el doctorado" },
];

export const NIVEL_LABEL: Record<string, string> = Object.fromEntries(
  NIVELES.map((n) => [n.value, n.label])
);

// Cada nivel canónico agrupa las variantes de token que existen (o pueden
// existir) en `target_audience`.
const NIVEL_ALIASES: Record<NivelValue, string[]> = {
  eso: ["eso", "secundaria", "educacion_secundaria", "4_eso"],
  bachillerato: [
    "bachillerato",
    "bachiller",
    "preuniversitario",
    "acceso_universidad",
    "postobligatoria",
  ],
  // FP: aquí SOLO los tokens que identifican el grado concreto. Los genéricos
  // ("fp", "formacion_profesional") están en FP_GENERICO, porque valen para los
  // dos grados y tenerlos duplicados escondía esa regla.
  fp_medio: ["fp_medio", "fp_grado_medio", "grado_medio", "cfgm", "ciclo_formativo_grado_medio"],
  fp_superior: [
    "fp_superior",
    "fp_grado_superior",
    "grado_superior",
    "cfgs",
    "ciclo_formativo_grado_superior",
  ],
  grado: [
    "grado",
    "grado_ultimo_curso",
    "universitario",
    "universitarios",
    "estudiante_universitario",
    "recien_graduado",
  ],
  master: ["master", "mba", "posgrado", "postgrado", "postgrado_master"],
  doctorado: [
    "doctorado",
    "doctorando",
    "doctorandos",
    "phd",
    "predoctoral",
    "contrato_predoctoral",
  ],
  postdoctorado: ["postdoctorado", "posdoctorado", "postdoc", "postdoctoral", "contrato_postdoctoral"],
};
const RESEARCH_GENERIC = ["investigacion", "investigadores", "investigador"];

// FP sin grado especificado: la fuente no distingue medio de superior, así que
// vale para AMBOS. Es un dato ambiguo de origen, no un error, y se trata de
// forma explícita en vez de repetir el token en las dos listas.
const FP_GENERICO = ["fp", "formacion_profesional", "ciclo_formativo", "fp_dual"];

// Tokens que significan "para cualquier nivel de estudios".
const UNIVERSAL_TOKENS = [
  "todos",
  "cualquiera",
  "todos_los_niveles",
  "general",
  "estudiantes",
];

// Conjunto de TODOS los tokens que designan una etapa educativa concreta. Sirve
// para distinguir una beca ligada a un nivel (grado, máster...) de una beca
// "agnóstica" al nivel (p. ej. dirigida a "profesionales" o "funcionarios").
const ALL_LEVEL_TOKENS = new Set([...Object.values(NIVEL_ALIASES).flat(), ...FP_GENERICO]);

// Tokens de condición especial: si una beca los declara, es EXCLUSIVA de ese
// colectivo y solo debe salir si el usuario cumple la condición.
export const COND_DISCAPACIDAD = ["discapacidad", "diversidad_funcional"];
export const COND_FAMILIA_NUMEROSA = ["familia_numerosa"];

function normTokens(target: string[] | null | undefined): string[] {
  return (target ?? []).map((t) => String(t).toLowerCase().trim());
}

/**
 * Resultado del cruce con el nivel de estudios. Son TRES estados, no dos:
 *
 *  - "match":     la beca vale para ese nivel (o no está ligada a ninguno).
 *  - "sin_datos": la beca NO declara público objetivo. Ni se esconde ni se cuela
 *                 como elegible: va a su propio apartado, avisando de que no
 *                 podemos confirmar que encaje.
 *  - "no_match":  declara niveles y ninguno es el del usuario.
 *
 * El estado intermedio existe porque antes `target_audience` vacío devolvía
 * `true` y esas becas salían como compatibles con cualquiera.
 */
export type NivelMatch = "match" | "sin_datos" | "no_match";

export function nivelMatchInfo(
  target: string[] | null | undefined,
  nivel: string | undefined
): NivelMatch {
  if (!nivel) return "match";
  const aud = normTokens(target);
  if (aud.length === 0) return "sin_datos";
  if (aud.some((t) => UNIVERSAL_TOKENS.includes(t))) return "match";
  const aliases = NIVEL_ALIASES[nivel as NivelValue];
  if (!aliases) return "match"; // nivel desconocido: no filtramos
  if (aud.some((t) => aliases.includes(t))) return "match";
  if (!aud.some(t => ALL_LEVEL_TOKENS.has(t)) && aud.some(t => RESEARCH_GENERIC.includes(t))) {
    return nivel === "doctorado" || nivel === "postdoctorado" ? "sin_datos" : "no_match";
  }
  // FP genérica ("fp", "formacion_profesional") vale para medio y superior.
  if (
    (nivel === "fp_medio" || nivel === "fp_superior") &&
    aud.some((t) => FP_GENERICO.includes(t))
  ) {
    return "match";
  }
  // Declara público pero ninguno es una etapa educativa (p. ej.
  // "deportistas_alto_nivel" de las Becas ADO): no está ligada a un nivel.
  if (!aud.some((t) => ALL_LEVEL_TOKENS.has(t))) return "match";
  return "no_match";
}

/** Compat: las llamadas existentes siguen funcionando igual. */
export function nivelMatches(
  target: string[] | null | undefined,
  nivel: string | undefined
): boolean {
  return nivelMatchInfo(target, nivel) !== "no_match";
}

// ── Tipo de ayuda ─────────────────────────────────────────────────────────
// La tabla `scholarships` NO tiene columna para la naturaleza de la ayuda:
// `type` es el ORIGEN (nacional/autonomica/privada/europea/internacional). Lo
// único que hay es `coverage`, un TEXT[] de tokens libres. Aquí se agrupan en
// categorías SIN tocar el esquema. Un token puede estar en varias a propósito
// (un "viaje" es dinero y es movilidad).
export type CategoriaAyuda = "dinero" | "practicas" | "movilidad" | "formacion";

const COVERAGE_CATEGORIA: Record<string, CategoriaAyuda[]> = {
  // Dinero o gasto cubierto, sin contraprestación laboral
  matricula: ["dinero"],
  tasas: ["dinero"],
  ensenanza: ["dinero"],
  manutencion: ["dinero"],
  comedor: ["dinero"],
  transporte: ["dinero"],
  residencia: ["dinero"],
  alojamiento: ["dinero"],
  material: ["dinero"],
  libros: ["dinero"],
  seguro: ["dinero"],
  beca_mensual: ["dinero"],
  cuantia_fija: ["dinero"],
  cuantia_variable: ["dinero"],
  ayuda_economica: ["dinero"],
  premio_academico: ["dinero"],
  excelencia: ["dinero"],
  permanencia: ["dinero"],
  reeducacion: ["dinero"],
  entrenamiento: ["dinero"],
  proyectos: ["dinero"],
  costes_investigacion: ["dinero"],
  ayuda_investigacion: ["dinero"],
  // Implica trabajar: contrato, prácticas o alta en la Seguridad Social
  practicas_remuneradas: ["practicas", "dinero"],
  practicas: ["practicas"],
  contrato_predoctoral: ["practicas"],
  contrato_postdoctoral: ["practicas"],
  contrato_laboral: ["practicas"],
  seguridad_social: ["practicas"],
  fp_dual: ["practicas"],
  // Irse fuera
  movilidad_internacional: ["movilidad", "dinero"],
  movilidad: ["movilidad", "dinero"],
  movilidad_nacional: ["movilidad", "dinero"],
  viaje: ["movilidad", "dinero"],
  estancia: ["movilidad", "dinero"],
  // Formación en especie (un curso, un idioma), no dinero en mano
  formacion: ["formacion"],
  idiomas: ["formacion"],
};

// Tokens que aparecen en `target_audience` y delatan que la beca es de movilidad.
const AUDIENCE_MOVILIDAD = ["erasmus", "movilidad_internacional", "sicue"];

/** Categorías que cubre una beca. Conjunto vacío = no lo sabemos. */
export function categoriasAyuda(
  coverage: string[] | null | undefined,
  target?: string[] | null
): Set<CategoriaAyuda> {
  const out = new Set<CategoriaAyuda>();
  for (const raw of coverage ?? []) {
    for (const c of COVERAGE_CATEGORIA[String(raw).toLowerCase().trim()] ?? []) out.add(c);
  }
  for (const raw of target ?? []) {
    if (AUDIENCE_MOVILIDAD.includes(String(raw).toLowerCase().trim())) out.add("movilidad");
  }
  return out;
}

export type AyudaFiltro = "cualquiera" | "dinero" | "practicas" | "movilidad";

export const TIPOS_AYUDA: { value: AyudaFiltro; label: string; hint: string }[] = [
  { value: "cualquiera", label: "Cualquier ayuda", hint: "Muéstramelo todo" },
  {
    value: "dinero",
    label: "Solo dinero",
    hint: "Matrícula, manutención, transporte, residencia, premios… sin tener que trabajar a cambio",
  },
  {
    value: "practicas",
    label: "Prácticas o contrato",
    hint: "Prácticas remuneradas, contratos predoctorales, FP dual",
  },
  {
    value: "movilidad",
    label: "Irme al extranjero",
    hint: "Erasmus+, SICUE, movilidad internacional",
  },
];

export const AYUDA_MOTIVO: Record<Exclude<AyudaFiltro, "cualquiera">, string> = {
  dinero: "Es un contrato o unas prácticas, no una ayuda económica",
  practicas: "No consta que incluya prácticas ni contrato",
  movilidad: "No consta que sea una ayuda de movilidad",
};

/**
 * ¿La beca encaja con el tipo de ayuda que busca el usuario?
 *
 * "dinero" filtra por EXCLUSIÓN (solo descarta lo que es inequívocamente un
 * contrato o unas prácticas sin componente económico de beca). Si filtrase en
 * positivo, cualquier beca sin `coverage` desaparecería de golpe, y eso es
 * mucho dato antiguo. "practicas" y "movilidad" sí filtran en positivo, porque
 * el usuario los ha pedido expresamente.
 */
export function tipoAyudaMatches(
  coverage: string[] | null | undefined,
  target: string[] | null | undefined,
  filtro: AyudaFiltro
): boolean {
  if (filtro === "cualquiera") return true;
  const cats = categoriasAyuda(coverage, target);
  if (filtro === "dinero") return !(cats.has("practicas") && !cats.has("dinero"));
  return cats.has(filtro);
}

/** ¿La beca es exclusiva de un colectivo que el usuario no ha declarado? */
export function condicionExcluye(
  target: string[] | null | undefined,
  tokens: string[],
  usuarioCumple: boolean
): boolean {
  if (usuarioCumple) return false;
  const aud = normTokens(target);
  return aud.some((t) => tokens.includes(t));
}

export type DeadlineStatus = "abierta" | "proxima" | "cerrada" | "sin_fecha";

/** Estado del plazo de solicitud a partir de la fecha límite (compat). */
export function deadlineStatus(
  deadline: string | null | undefined,
  now: number = Date.now()
): DeadlineStatus {
  if (!deadline) return "sin_fecha";
  const d = new Date(deadline).getTime();
  if (Number.isNaN(d)) return "sin_fecha";
  if (d < now) return "cerrada";
  const days = (d - now) / 864e5;
  if (days <= 15) return "proxima";
  return "abierta";
}

// Solo fechas publicadas: un plazo vencido no se proyecta a otro año.
// El estado legado «estimada» identifica una convocatoria ya cerrada.
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
