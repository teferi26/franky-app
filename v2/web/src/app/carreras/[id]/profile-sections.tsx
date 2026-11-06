import {
  GraduationCap, School, Briefcase, Gauge, CheckCircle,
  ListOrdered, AlertTriangle, BookOpen, Globe, Link as LinkIcon,
  Euro, ChevronDown, Award, FileText,
} from "lucide-react";
import Link from 'next/link';
import { finiteNumber, positiveNumber, salaryRange as range, researchDate, nationalLabourReference, workloadGuidance, type LabourReference, PROFILE_SCOPE, LABOUR_SCOPE } from '@/lib/career-evidence';

// Secciones de la ficha profunda de carrera (career_profiles, migración 118).
// Datos investigados con fuentes reales; cualquier campo puede venir a null y
// cada sección se oculta sola si no tiene contenido.

export interface CareerProfile {
  id: string;
  slug: string;
  canonical_name: string;
  kind: string;
  branch: string | null;
  overview: string | null;
  difficulty_score: number | null;
  difficulty_rationale: string | null;
  cut_off_min: number | null;
  cut_off_max: number | null;
  cut_off_median: number | null;
  pre_university: PreUniversity | null;
  university_stage: UniversityStage | null;
  post_university: PostUniversity | null;
  salidas: Salida[] | null;
  salario_medio: SalarioMedio | null;
  empleabilidad: Empleabilidad | null;
  why_study: string[] | null;
  why_not_study: string[] | null;
  sources: Source[] | null;
  research_confidence: string | null;
  researched_at: string | null;
}

interface PreUniversity {
  bachillerato_recomendado?: string | null;
  asignaturas_clave?: string[] | null;
  ebau?: string | null;
  acceso_fp?: string | null;
  fp_reviewed_at?: string | null;
  consejos?: string | null;
}

interface UniversityStage {
  duracion_oficial_anios?: number | null;
  curso_a_curso?: { curso: number | string; resumen: string }[] | null;
  asignaturas_dificiles?: { nombre: string; curso?: number | string | null; por_que?: string | null }[] | null;
  tasa_abandono?: { valor_pct: number; fuente?: string | null } | null;
  practicas_tfg?: string | null;
}

interface PostUniversity {
  guidance_reviewed_at?: string | null;
  insercion_laboral?: LabourReference & {
    tasa_afiliacion_ss?: number | null;
    anios_referencia?: string | null;
    tiempo_medio_primer_empleo?: string | null;
    fuente?: string | null;
  } | null;
  master_necesario?: string | null;
  master_motivo?: string | null;
  masters_habituales?: { nombre: string; para_que?: string | null }[] | null;
  colegiacion_oposiciones?: string | null;
}

interface Salida {
  rol: string;
  descripcion?: string | null;
  como_llegar?: string[] | null;
  salario_espana_eur?: {
    junior?: [number, number] | null;
    con_experiencia?: [number, number] | null;
    fuente?: string | null;
  } | null;
  salario_extranjero?: { pais: string; rango?: [number, number] | null; moneda?: string | null; fuente?: string | null }[] | null;
  demanda?: string | null;
}

interface SalarioMedio extends LabourReference {
  metric?: string | null;
  one_year_eur?: number | null;
  four_years_eur?: number | null;
  recien_egresado_eur?: number | null;
  cinco_anios_eur?: number | null;
  fuente?: string | null;
}

interface Empleabilidad extends LabourReference {
  metric?: string | null;
  one_year_pct?: number | null;
  valor_pct?: number | null;
  definicion?: string | null;
  fuente?: string | null;
}

interface Source {
  titulo?: string | null;
  url: string;
  fecha_consulta?: string | null;
}

const demandaStyles: Record<string, string> = {
  alta: "bg-green-50 text-green-700 border-green-200",
  media: "bg-amber-50 text-amber-700 border-amber-200",
  baja: "bg-red-50 text-red-700 border-red-200",
};

const masterLabels: Record<string, string> = {
  imprescindible: "Imprescindible",
  recomendado: "Recomendado",
  opcional: "Opcional",
  poco_habitual: "Poco habitual",
};

const masterStyles: Record<string, string> = {
  imprescindible: "bg-red-50 text-red-700 border-red-200",
  recomendado: "bg-amber-50 text-amber-700 border-amber-200",
  opcional: "bg-blue-50 text-blue-700 border-blue-200",
  poco_habitual: "bg-green-50 text-green-700 border-green-200",
};

function SectionCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-6 sm:p-8">
      <h2 className="font-heading text-2xl font-bold tracking-tight text-text-primary mb-1 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {subtitle && <p className="text-sm text-text-muted mb-4">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

export function DifficultyCard({ profile }: { profile: CareerProfile }) {
  const guidance = workloadGuidance(profile.difficulty_score, profile.difficulty_rationale);
  if (!guidance) return null;
  const { score } = guidance;
  const color = (score ?? 0) >= 8 ? "text-red-600" : (score ?? 0) >= 6 ? "text-amber-600" : "text-green-600";
  const barColor = (score ?? 0) >= 8 ? "bg-red-500" : (score ?? 0) >= 6 ? "bg-amber-500" : "bg-green-500";
  return (
    <SectionCard
      icon={<Gauge className="h-5 w-5 text-violet" />}
      title={guidance.title}
      subtitle={guidance.scope}
    >
      {score != null && <div className="flex items-center gap-4 mb-3">
        <span className={`text-4xl font-extrabold ${color}`}>{score.toFixed(1).replace(/\.0$/, "")}</span>
        <span className="text-sm text-text-muted">/ 10</span>
        <div className="flex-1 h-3 rounded-full bg-bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score * 10}%` }} />
        </div>
      </div>}
      {guidance.rationale && (
        <p className="text-sm text-text-secondary leading-relaxed">{guidance.rationale}</p>
      )}
    </SectionCard>
  );
}

export function PreUniversitySection({ pre }: {
  pre: PreUniversity | null;
}) {
  if (!pre) return null;
  const hasContent = pre.bachillerato_recomendado || pre.asignaturas_clave?.length || pre.ebau || pre.acceso_fp || pre.consejos;
  if (!hasContent) return null;
  return (
    <SectionCard
      icon={<School className="h-5 w-5 text-violet" />}
      title="Antes de la universidad"
      subtitle="Preparación recomendada, PAU y acceso desde FP. Comprueba las condiciones de tu destino."
    >
      <div className="space-y-4 text-sm text-text-secondary">
        <div className="grid sm:grid-cols-2 gap-3">
          {pre.bachillerato_recomendado && (
            <div className="p-3 rounded-xl bg-bg-secondary">
              <p className="text-xs font-semibold text-violet mb-1">Bachillerato recomendado</p>
              <p>{pre.bachillerato_recomendado}</p>
            </div>
          )}
          <div className="p-3 rounded-xl bg-bg-secondary">
            <p className="text-xs font-semibold text-violet mb-1">Tu acceso, paso a paso</p>
            <p>Comprueba la convocatoria de esta ficha y las ponderaciones de la universidad. Las notas cambian entre cursos, campus y vías de acceso.</p>
            <Link href="/notas-corte" className="inline-flex min-h-11 items-center text-violet font-semibold underline underline-offset-4">Explorar notas por curso</Link>
          </div>
        </div>
        {pre.asignaturas_clave && pre.asignaturas_clave.length > 0 && (
          <div>
            <p className="font-semibold text-text-primary mb-1.5">Materias para preparar el comienzo</p>
            <div className="flex flex-wrap gap-2">
              {pre.asignaturas_clave.map((a, i) => (
                <span key={i} className="px-3 py-1 rounded-full border border-border text-text-secondary text-xs font-medium">{a}</span>
              ))}
            </div>
          </div>
        )}
        {pre.ebau && (
          <div>
            <p className="font-semibold text-text-primary mb-1">PAU / EBAU</p>
            <p className="leading-relaxed">{pre.ebau}</p>
          </div>
        )}
        {pre.acceso_fp && (
          <div>
            <p className="font-semibold text-text-primary mb-1">Acceso desde FP</p>
            <p className="leading-relaxed">{pre.acceso_fp}</p>
            {researchDate(pre.fp_reviewed_at) && (
              <div className="mt-2 text-xs text-text-muted">
                <p>Acceso desde FP revisado en {researchDate(pre.fp_reviewed_at)}.</p>
                <a href="https://www.todofp.es/como-cuando-y-donde-estudiar/acceso-fp-desde-fp/acceso-a-la-universidad.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-violet underline underline-offset-4">Consultar la información oficial de FP</a>
              </div>
            )}
          </div>
        )}
        {pre.consejos && (
          <div className="p-3 rounded-xl border border-border border-l-2 border-l-orange bg-bg-primary">
            <p className="font-semibold text-amber-800 mb-1">Consejos</p>
            <p className="text-amber-900 leading-relaxed">{pre.consejos}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export function UniversityStageSection({ stage }: { stage: UniversityStage | null }) {
  if (!stage) return null;
  const hasContent = stage.curso_a_curso?.length || stage.asignaturas_dificiles?.length || stage.tasa_abandono || stage.practicas_tfg;
  if (!hasContent) return null;
  return (
    <SectionCard
      icon={<GraduationCap className="h-5 w-5 text-violet" />}
      title="Durante la carrera"
      subtitle="Orientación general: contrástala con el plan de estudios del campus que te interesa."
    >
      <div className="space-y-5 text-sm text-text-secondary">
        {stage.curso_a_curso && stage.curso_a_curso.length > 0 && (
          <ol className="relative border-l-2 border-violet/15 ml-3 space-y-4">
            {stage.curso_a_curso.map((c, i) => (
              <li key={i} className="ml-5">
                <span className="absolute -left-[11px] h-5 w-5 rounded-full bg-violet/10 border-2 border-violet/30 flex items-center justify-center text-[10px] font-bold text-violet">
                  {/^\d{1,2}$/.test(String(c.curso)) ? c.curso : i + 1}
                </span>
                <p className="font-semibold text-text-primary">
                  {typeof c.curso === "number" || /^\d+$/.test(String(c.curso)) ? `${c.curso}º curso` : c.curso}
                </p>
                <p className="leading-relaxed">{c.resumen}</p>
              </li>
            ))}
          </ol>
        )}
        {stage.asignaturas_dificiles && stage.asignaturas_dificiles.length > 0 && (
          <div>
            <p className="font-semibold text-text-primary mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Materias que conviene preparar
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {stage.asignaturas_dificiles.map((a, i) => (
                <div key={i} className="p-3 rounded-xl border border-border-light">
                  <p className="font-semibold text-text-primary">
                    {a.nombre}
                    {a.curso != null && a.curso !== "" && (
                      <span className="ml-1.5 text-xs font-normal text-text-muted">({a.curso}º)</span>
                    )}
                  </p>
                  {a.por_que && <p className="text-xs mt-0.5 leading-relaxed">{a.por_que}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {finiteNumber(stage.tasa_abandono?.valor_pct, 0, 100) != null && stage.tasa_abandono?.fuente && (
            <div className="p-3 rounded-xl border border-border-light bg-bg-secondary/60">
              <p className="text-xs font-semibold text-text-muted mb-0.5">Tasa de abandono</p>
              <p className="text-lg font-bold text-text-primary">{Number(stage.tasa_abandono.valor_pct).toLocaleString("es-ES")} %</p>
              <p className="text-xs text-text-secondary mt-1">Fuente y alcance: {stage.tasa_abandono.fuente}</p>
            </div>
          )}
          {stage.duracion_oficial_anios != null && (
            <div className="p-3 rounded-xl border border-border-light bg-bg-secondary/60">
              <p className="text-xs font-semibold text-text-muted mb-0.5">Duración habitual de la titulación</p>
              <p className="text-lg font-bold text-text-primary">{stage.duracion_oficial_anios} años</p>
            </div>
          )}
        </div>
        {stage.practicas_tfg && (
          <div>
            <p className="font-semibold text-text-primary mb-1">Prácticas y TFG</p>
            <p className="leading-relaxed">{stage.practicas_tfg}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export function PostUniversitySection({ post }: { post: PostUniversity | null }) {
  if (!post) return null;
  const ins = post.insercion_laboral;
  const hasContent = ins || post.master_necesario || post.masters_habituales?.length || post.colegiacion_oposiciones;
  if (!hasContent) return null;
  return (
    <SectionCard
      icon={<Briefcase className="h-5 w-5 text-violet" />}
      title="Después de la carrera"
      subtitle="Referencias laborales, opciones de especialización y requisitos que conviene comprobar."
    >
      <div className="space-y-5 text-sm text-text-secondary">
        {ins?.fuente && !nationalLabourReference(ins) && (finiteNumber(ins.tasa_afiliacion_ss, 0, 100) != null || ins.tiempo_medio_primer_empleo) && (
          <div className="grid sm:grid-cols-2 gap-3">
            {finiteNumber(ins.tasa_afiliacion_ss, 0, 100) != null && ins.anios_referencia && (
              <div className="p-3 rounded-xl border border-border border-l-2 border-l-success bg-bg-primary">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Afiliación a la Seguridad Social</p>
                <p className="text-lg font-bold text-green-800">{Number(ins.tasa_afiliacion_ss).toLocaleString("es-ES")} %</p>
                {ins.anios_referencia && <p className="text-xs text-green-700">{ins.anios_referencia}</p>}
                <p className="text-xs text-green-800 mt-2">{ins.fuente}</p>
              </div>
            )}
            {ins.tiempo_medio_primer_empleo && (
              <div className="p-3 rounded-xl border border-border-light bg-bg-secondary/60">
                <p className="text-xs font-semibold text-text-muted mb-0.5">Contexto del acceso al empleo</p>
                <p className="font-semibold text-text-primary leading-snug">{ins.tiempo_medio_primer_empleo}</p>
              </div>
            )}
          </div>
        )}
        {post.master_necesario && (
          <div>
            <p className="font-semibold text-text-primary mb-1.5">¿Qué formación necesitas después?</p>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full border font-semibold ${masterStyles[post.master_necesario] || "bg-bg-secondary text-text-secondary border-border-light"}`}>
              {masterLabels[post.master_necesario] || post.master_necesario}
            </span>
            {post.master_motivo && <p className="mt-2 leading-relaxed">{post.master_motivo}</p>}
          </div>
        )}
        {post.masters_habituales && post.masters_habituales.length > 0 && (
          <div>
            <p className="font-semibold text-text-primary mb-2">Opciones de formación y especialización</p>
            <ul className="space-y-2">
              {post.masters_habituales.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Award className="h-4 w-4 text-violet shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium text-text-primary">{m.nombre}</span>
                    {m.para_que && <span className="text-text-secondary">: {m.para_que}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {post.colegiacion_oposiciones && (
          <div className="p-3 rounded-xl border border-border bg-bg-secondary/60">
            <p className="font-semibold text-blue-800 mb-1">Colegiación y oposiciones</p>
            <p className="text-text-secondary leading-relaxed">{post.colegiacion_oposiciones}</p>
          </div>
        )}
        {researchDate(post.guidance_reviewed_at) && <p className="text-xs text-text-muted">Acceso y recorrido académico revisados en {researchDate(post.guidance_reviewed_at)}. Las referencias laborales indican su propio periodo.</p>}
      </div>
    </SectionCard>
  );
}

export function SalidasSection({ salidas }: { salidas: Salida[] | null }) {
  if (!salidas || salidas.length === 0) return null;
  return (
    <SectionCard
      icon={<Briefcase className="h-5 w-5 text-violet" />}
      title="Salidas profesionales, paso a paso"
      subtitle="Áreas profesionales y posibles pasos de preparación. Comprueba los requisitos de cada puesto."
    >
      <div className="space-y-3">
        {salidas.map((s, i) => (
          <details key={i} className="group rounded-xl border border-border-light overflow-hidden">
            <summary className="flex items-start gap-2.5 px-3 sm:px-4 py-3 cursor-pointer hover:bg-bg-secondary transition-colors list-none">
              <span className="h-7 w-7 rounded-full border border-border bg-bg-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-violet">{i + 1}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary leading-snug">{s.rol}</p>
                {s.salario_espana_eur?.fuente && (range(s.salario_espana_eur.junior) || range(s.salario_espana_eur.con_experiencia)) && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {range(s.salario_espana_eur.junior) ? `${range(s.salario_espana_eur.junior)} junior · ` : ""}
                    {range(s.salario_espana_eur.con_experiencia) ? `${range(s.salario_espana_eur.con_experiencia)} con experiencia` : ''}
                  </p>
                )}
                {s.demanda && (
                  <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full border font-semibold ${demandaStyles[s.demanda] || ""}`}>
                    demanda orientativa {s.demanda}
                  </span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180 shrink-0 mt-1.5" />
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm text-text-secondary space-y-4 border-t border-border-light">
              {s.descripcion && <p className="leading-relaxed pt-2">{s.descripcion}</p>}
              {s.como_llegar && s.como_llegar.length > 0 && (
                <div>
                  <p className="font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                    <ListOrdered className="h-4 w-4 text-violet" />
                    Cómo llegar
                  </p>
                  <ol className="space-y-1.5 ml-1">
                    {s.como_llegar.map((paso, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className="h-5 w-5 rounded-full border border-border flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-violet">{j + 1}</span>
                        </span>
                        <span className="leading-relaxed">{paso.replace(/^paso \d+:?\s*/i, "")}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {s.salario_espana_eur?.fuente && (range(s.salario_espana_eur.junior) || range(s.salario_espana_eur.con_experiencia)) && (
                <div>
                  <p className="font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                    <Euro className="h-4 w-4 text-success" />
                    Salario en España (bruto/año)
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    {range(s.salario_espana_eur?.junior) && (
                      <div className="p-2.5 rounded-lg border border-border-light bg-bg-secondary/60">
                        <p className="text-[11px] text-text-muted">Junior</p>
                        <p className="font-bold text-text-primary text-sm">{range(s.salario_espana_eur?.junior)}</p>
                      </div>
                    )}
                    {range(s.salario_espana_eur?.con_experiencia) && (
                      <div className="p-2.5 rounded-lg border border-border border-l-2 border-l-success bg-bg-primary">
                        <p className="text-[11px] text-green-700">Con experiencia</p>
                        <p className="font-bold text-green-800 text-sm">{range(s.salario_espana_eur?.con_experiencia)}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-2">Fuente: {s.salario_espana_eur.fuente}</p>
                </div>
              )}
              {s.salario_extranjero && s.salario_extranjero.length > 0 && (
                <div>
                  <p className="font-semibold text-text-primary mb-2 flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-blue-500" />
                    Salario en el extranjero (bruto/año)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {s.salario_extranjero.map((e, j) =>
                      e.fuente && e.moneda && range(e.rango, e.moneda) ? (
                        <div key={j} className="p-2.5 rounded-lg border border-border bg-bg-secondary/60">
                          <p className="text-[11px] text-blue-700">{e.pais}</p>
                          <p className="font-bold text-text-primary text-sm tabular">{range(e.rango, e.moneda || "€")}</p>
                          <p className="text-xs text-text-muted mt-1 max-w-sm">Fuente: {e.fuente}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}

export function WhySection({ whyStudy, whyNot }: { whyStudy: string[] | null; whyNot: string[] | null }) {
  if (!whyStudy?.length && !whyNot?.length) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {whyStudy && whyStudy.length > 0 && (
        <section className="rounded-2xl border border-border bg-bg-primary p-6">
          <h2 className="font-heading text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Lo que puede atraerte
          </h2>
          <ul className="space-y-2">
            {whyStudy.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}
      {whyNot && whyNot.length > 0 && (
        <section className="rounded-2xl border border-border bg-bg-primary p-6">
          <h2 className="font-heading text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Qué valorar antes de elegir
          </h2>
          <ul className="space-y-2">
            {whyNot.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <BookOpen className="h-4 w-4 text-violet shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function SourcesSection({ profile }: { profile: CareerProfile }) {
  if (!profile.sources || profile.sources.length === 0) return null;
  return (
    <details id="fuentes" className="scroll-mt-32 rounded-2xl border border-border bg-bg-primary overflow-hidden group">
      <summary className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-bg-secondary transition-colors list-none">
        <span className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet" />
          Fuentes de los datos ({profile.sources.length})
          {researchDate(profile.researched_at) && (
            <span className="text-xs font-normal text-text-muted">
              · guía revisada en {researchDate(profile.researched_at)}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="px-6 pb-4 space-y-1.5 border-t border-border-light pt-3">
        {profile.sources.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
            <LinkIcon className="h-3 w-3 text-text-muted shrink-0 mt-0.5" />
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-violet hover:underline break-all">
              {s.titulo || s.url}
            </a>
            {s.fecha_consulta && <span className="text-text-muted shrink-0">({s.fecha_consulta})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function OverviewSection({ profile, careerName }: { profile: CareerProfile; careerName: string }) {
  if (!profile.overview) return null;
  return (
    <SectionCard
      icon={<BookOpen className="h-5 w-5 text-violet" />}
      title={`¿Qué es ${careerName}?`}
    >
      <div className="text-text-secondary leading-relaxed space-y-3">
        {profile.overview.split(/\n\n+/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </SectionCard>
  );
}

export function ProfileScope({ profile }: { profile: CareerProfile }) {
  const date = researchDate(profile.researched_at);
  return (
    <aside className="rounded-2xl border border-border bg-bg-secondary/60 p-5 text-sm">
      <p className="font-semibold text-text-primary">Conoce la titulación</p>
      <p className="mt-1 text-text-secondary leading-relaxed">{PROFILE_SCOPE}</p>
      <p className="mt-2 text-xs text-text-muted">{date ? `Guía revisada en ${date}.` : 'Fecha de revisión de la guía pendiente.'} Cada indicador conserva el periodo descrito en su fuente.</p>
      {!!profile.sources?.length && <a href="#fuentes" className="inline-flex min-h-11 items-center font-semibold text-violet underline underline-offset-4">Ver fuentes de la guía</a>}
    </aside>
  );
}

export function LabourEvidenceSection({ profile }: { profile: CareerProfile }) {
  const employment = profile.empleabilidad;
  const officialEmployment = employment?.metric === 'ss_affiliation_rate' ? nationalLabourReference(employment) : null;
  const officialSalary = profile.salario_medio?.metric === 'annual_contribution_base' ? nationalLabourReference(profile.salario_medio) : null;
  const value = finiteNumber(employment?.valor_pct, 0, 100);
  const showEmployment = value != null && employment?.fuente?.trim() && employment.definicion?.trim();
  const salarySource = profile.salario_medio?.fuente?.trim();
  if (!showEmployment && !salarySource && !officialEmployment && !officialSalary) return null;
  return (
    <SectionCard icon={<Briefcase className="h-5 w-5 text-violet" />} title="Datos laborales con contexto" subtitle={LABOUR_SCOPE}>
      <div className="space-y-4">
        {officialEmployment && employment ? (
          <OfficialLabourCard reference={officialEmployment} title="Afiliación a la Seguridad Social"
            first={finiteNumber(employment.one_year_pct, 0, 100)} fourth={finiteNumber(employment.valor_pct, 0, 100)} unit="percent"
            explanation="La afiliación en España no es una tasa de empleo. No recoge todo el trabajo en el extranjero ni todos los regímenes alternativos." />
        ) : showEmployment && employment && (
          <div className="rounded-xl border border-border-light p-4">
            <p className="text-2xl font-bold text-text-primary">{value.toLocaleString('es-ES')} %</p>
            <p className="text-sm text-text-primary mt-1">{employment.definicion}</p>
            <p className="text-xs text-text-secondary mt-2">Fuente: {employment.fuente}</p>
          </div>
        )}
        {officialSalary ? (
          <OfficialLabourCard reference={officialSalary} title="Base media de cotización anual"
            first={positiveNumber(profile.salario_medio?.one_year_eur)} fourth={positiveNumber(profile.salario_medio?.four_years_eur)} unit="euro"
            explanation="Referencia de personas afiliadas por cuenta ajena a tiempo completo. No equivale a un sueldo neto ni a una oferta salarial." />
        ) : salarySource && (
          <div className="rounded-xl border border-border-light p-4">
            <h3 className="font-semibold text-text-primary">Referencias sobre ingresos</h3>
            <p className="text-sm text-text-secondary mt-2 leading-relaxed">{salarySource}</p>
            <p className="text-xs text-text-muted mt-2">Una base de cotización no equivale a un sueldo neto ni a una oferta salarial. Consulta el periodo y la población de cada estudio.</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function OfficialLabourCard({ reference, title, first, fourth, unit, explanation }: {
  reference: NonNullable<ReturnType<typeof nationalLabourReference>>;
  title: string; first: number | null; fourth: number | null; unit: 'percent' | 'euro'; explanation: string;
}) {
  const format = (value: number | null) => value == null ? 'No publicado' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${unit === 'percent' ? ' %' : ' €'}`;
  return <article className="rounded-xl border border-border-light p-4">
    <h3 className="font-semibold text-text-primary">{title}</h3>
    <p className="mt-1 text-sm text-text-secondary">Campo nacional: {reference.field}</p>
    <p className="mt-1 text-xs text-text-muted">Cohorte {reference.cohort} · seguimiento hasta {reference.followUpYear}</p>
    <dl className="grid grid-cols-2 gap-3 my-4">
      {[['Al año de terminar',first],['A los cuatro años',fourth]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-bg-secondary p-3">
        <dt className="text-xs text-text-secondary">{label}</dt>
        <dd className="text-lg font-bold text-text-primary mt-1">{format(value as number | null)}</dd>
      </div>)}
    </dl>
    <p className="text-xs text-text-secondary leading-relaxed">{explanation}</p>
    {(first == null || fourth == null) && <p className="text-xs text-text-secondary mt-2">«No publicado» conserva la ausencia o supresión del dato en la tabla; no significa cero.</p>}
    <a href={reference.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-sm text-violet underline underline-offset-4">Abrir tabla oficial del SIIU</a>
    {reference.checkedDate && <p className="text-xs text-text-muted">Fuente comprobada en {reference.checkedDate}.</p>}
  </article>;
}
