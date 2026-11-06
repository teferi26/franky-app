"use client";
import { useMemo, useState, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import AskFrankyButton from '@/components/AskFrankyButton';
import { ArrowRight, Search, SlidersHorizontal, Calendar, ExternalLink, X } from "lucide-react";
import dynamic from "next/dynamic";
const BecasEligibilityForm = dynamic(() => import("@/components/BecasEligibilityForm"), {
  loading: () => <p role="status" className="p-6 text-text-muted">Preparando tus preguntas…</p>,
});
const MecAssessment = dynamic(() => import("@/components/MecAssessment"), {
  loading: () => <p role="status" className="py-4 text-text-muted">Preparando la orientación de tu beca…</p>,
});
import { assessScholarship, type ScholarshipProfile, type ScholarshipPreview } from "@/lib/scholarship-eligibility";
import { plazoInfo } from "@/lib/becas";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, SpotlightCard, Magnetic } from "@/components/motion";
import { cn } from "@/lib/utils";

const TYPES: Record<string, string> = { todas: "Todas", nacional: "Nacionales", autonomica: "Autonómicas", europea: "Europeas", privada: "Privadas", internacional: "Internacionales" };
// Estados del plazo, en el mismo orden en que se ordena el catálogo.
const STATUS: { value: string; label: string }[] = [
  { value: "todas", label: "Todos los plazos" },
  { value: "vigente", label: "Fecha de cierre no vencida" },
  { value: "pendiente_apertura", label: "Abre próximamente" },
  { value: "sin_fecha", label: "Plazo por confirmar" },
  { value: "cerrada", label: "Plazo cerrado" },
];
const normalized = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function deadlineStatus(s: ScholarshipPreview) {
  const info = plazoInfo(s.deadline, Date.now(), s);
  if (info.estado === 'pendiente_apertura') return 'pendiente_apertura';
  if (info.estado === 'estimada') return 'cerrada';
  if (info.estado === 'sin_fecha') return 'sin_fecha';
  return 'vigente';
}

// Chip de filtro: outline en reposo, relleno oscuro cuando está activo. Es el
// mismo lenguaje que los chips de la portada, sin tintes violeta de fondo.
function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-quick cursor-pointer",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

export default function ScholarshipExplorer({ scholarships }: { scholarships: ScholarshipPreview[] }) {
  const [profile, setProfile] = useState<ScholarshipProfile | null>(null);
  const [wizard, setWizard] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("todas");
  const [status, setStatus] = useState("todas");
  const [visible, setVisible] = useState(24);
  const [showOthers, setShowOthers] = useState(false);
  // Retire legacy query parameters without copying sensitive answers to links.
  useEffect(() => { if (window.location.search) window.history.replaceState(null, "", "/becas"); }, []);
  const assessed = useMemo(() => scholarships.map(s => ({ ...s, assessment: profile ? assessScholarship(s, profile) : null })), [scholarships, profile]);
  const filtered = useMemo(() => assessed.filter(s => (showOthers || !profile || s.assessment?.matches)
    && (type === "todas" || s.type === type)
    && (status === "todas" || deadlineStatus(s) === status)
    && normalized(`${s.name} ${s.provider ?? ""} ${s.comunidad_autonoma ?? ""}`).includes(normalized(search.trim())))
    .sort((a,b) => { const order: Record<string, number> = { vigente: 0, pendiente_apertura: 1, sin_fecha: 2, cerrada: 3 }; return order[deadlineStatus(a)] - order[deadlineStatus(b)] || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.name.localeCompare(b.name); }), [assessed, profile, showOthers, type, status, search]);
  useEffect(() => setVisible(24), [profile, showOthers, type, status, search]);

  const hasFilters = search.trim() !== "" || type !== "todas" || status !== "todas";

  return <div className="min-h-screen bg-bg-primary pb-20">
    {/* Cabecera de listado: eyebrow, titular grande y una sola acción. */}
    <section className="border-b border-border-light">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <Reveal>
          <p className="eyebrow">BecarIA · Becas y ayudas</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
            Ayudas para estudiar,
            <br className="hidden sm:block" />
            <span className="text-violet"> con los plazos claros.</span>
          </h1>
          <p className="mt-4 max-w-xl text-fluid-lead text-text-secondary">
            Revisa requisitos, plazos y la convocatoria oficial de cada beca. O responde seis preguntas y te decimos por dónde empezar.
          </p>
        </Reveal>
        <Reveal delay={120} className="mt-8 flex flex-wrap items-center gap-3">
          <Magnetic>
            <Button size="lg" variant="dark" className="btn-shine" onClick={() => setWizard(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              {profile ? "Editar mis respuestas" : "Encontrar becas para mí"}
            </Button>
          </Magnetic>
          <AskFrankyButton />
          <p role="status" className="text-sm text-text-muted tabular">
            <span className="font-semibold text-text-primary">{filtered.length}</span> {filtered.length === 1 ? "ayuda" : "ayudas"}
            {hasFilters || profile ? " con estos filtros" : " en el catálogo"}
          </p>
        </Reveal>
      </div>
    </section>

    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {wizard && <section className="mt-8 rounded-3xl border border-border bg-bg-primary shadow-card animate-scale-in">
        <div className="flex justify-end px-4 pt-4">
          <Button variant="ghost" size="sm" onClick={() => setWizard(false)}>
            <X className="h-4 w-4" />
            Volver al catálogo
          </Button>
        </div>
        <BecasEligibilityForm initialValues={profile ?? undefined} onComplete={value => { setProfile(value); setWizard(false); setShowOthers(false); document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" }); }} />
      </section>}

      <section id="catalogo" className="scroll-mt-24 pt-10">
        {profile && <MecAssessment region={profile.comunidad} draft={profile.mec??{}} level={profile.nivel} grade={profile.nota_media}/>}

        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl font-bold text-text-primary">{profile ? "Opciones para revisar" : "Explora las ayudas"}</h2>
            <p className="mt-1 text-sm text-text-muted">{profile ? "Coincidencias con tu búsqueda; la concesión depende de las bases y del organismo convocante." : "Puedes consultar los detalles sin completar el formulario."}</p>
          </div>
        </Reveal>

        {profile && <div className="mb-6 rounded-2xl border border-border bg-bg-secondary/60 p-4 text-sm text-text-secondary animate-fade-in">
          <p>Tus respuestas se usan en esta pantalla. Renta, patrimonio, matrícula, nacionalidad y compatibilidades requieren comprobación en cada convocatoria.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowOthers(!showOthers)}>{showOthers ? "Ver solo coincidencias" : "Ver también otras ayudas"}</Button>
            <Button variant="ghost" size="sm" onClick={() => setProfile(null)}>Borrar mis respuestas</Button>
          </div>
        </div>}

        {/* Buscador y filtros: una fila con el campo y dos filas de chips. */}
        <Reveal delay={60} className="mb-8 space-y-4">
          <label className="relative block max-w-xl">
            <span className="sr-only">Buscar becas, entidades o comunidades</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Beca, entidad o comunidad…" className="pl-10" />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de ayuda">
            {Object.entries(TYPES).map(([key,label]) => <Chip key={key} active={type === key} onClick={() => setType(key)}>{label}</Chip>)}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Estado del plazo">
            {STATUS.map(({ value, label }) => <Chip key={value} active={status === value} onClick={() => setStatus(value)}>{label}</Chip>)}
          </div>
        </Reveal>

        {filtered.length === 0
          ? <div className="rounded-3xl border border-border bg-bg-primary">
              <EmptyState
                icon={Search}
                title="No aparecen ayudas con estos filtros"
                description="Amplía la búsqueda o revisa el resto del catálogo."
                action={{ onClick: () => { setSearch(""); setType("todas"); setStatus("todas"); setShowOthers(true); }, label: "Limpiar filtros" }}
              />
            </div>
          : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0,visible).map((s, i) => <ScholarshipCard key={s.id} scholarship={s} index={i % 24} />)}
            </div>}

        {visible<filtered.length&&<div className="mt-8 flex justify-center">
          <Button variant="outline" size="lg" onClick={()=>setVisible(value=>value+24)}>
            Ver más ayudas
            <span className="text-text-muted tabular">({filtered.length-visible} restantes)</span>
          </Button>
        </div>}
      </section>
    </div>
  </div>;
}

const STATE_LABEL: Record<string, string> = {
  vigente: "Cierre no vencido",
  cerrada: "Plazo cerrado",
  pendiente_apertura: "Abre próximamente",
  sin_fecha: "Plazo por confirmar",
};

function ScholarshipCard({ scholarship: s, index }: { scholarship: ScholarshipPreview & { assessment: ReturnType<typeof assessScholarship> | null }; index: number }) {
  const state = deadlineStatus(s);
  const amount = s.amount_min != null && s.amount_max != null ? (s.amount_min === s.amount_max ? `${s.amount_max.toLocaleString('es-ES')} €` : `${s.amount_min.toLocaleString('es-ES')} a ${s.amount_max.toLocaleString('es-ES')} €`) : s.amount_max != null ? `Hasta ${s.amount_max.toLocaleString('es-ES')} €` : null;
  const officialUrl = s.url && /^https?:\/\//.test(s.url) ? s.url : null;
  return <SpotlightCard asChild>
    <article
      className="group hover-lift flex flex-col rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15 animate-list-in"
      style={{ "--i": index } as CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{TYPES[s.type] ?? s.type}</Badge>
        <Badge variant={state === 'vigente' ? 'success' : state === 'pendiente_apertura' ? 'default' : 'secondary'}>{STATE_LABEL[state]}</Badge>
        {s.convocatoria && <span className="text-xs text-text-muted">{s.convocatoria}</span>}
      </div>

      <h3 className="mt-4 font-heading text-lg font-bold leading-snug text-text-primary">
        <Link href={`/becas/${s.id}`} className="transition-colors hover:text-violet">{s.name}</Link>
      </h3>
      <p className="mt-1 text-xs text-text-muted">{s.provider}{s.comunidad_autonoma ? ` · ${s.comunidad_autonoma}` : ""}</p>
      {s.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-text-secondary">{s.description}</p>}

      {/* Cuantía en cifra grande y plazo en una línea: lo que se compara de un vistazo. */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border-light pt-4">
        <div>
          <p className="eyebrow">Cuantía</p>
          {amount
            ? <p className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-text-primary tabular">{amount}</p>
            : <p className="mt-1 text-sm font-medium text-text-muted">Consultar cuantía</p>}
        </div>
        {state === 'pendiente_apertura' && s.opens_at
          ? <p className="inline-flex items-center gap-1.5 text-xs font-medium text-violet tabular"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />Apertura: {new Date(s.opens_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
          : s.deadline && <p className="inline-flex items-center gap-1.5 text-xs text-text-muted tabular"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />{state === 'cerrada' ? 'Cerró' : 'Cierre'}: {new Date(s.deadline).toLocaleDateString('es-ES', { timeZone: 'UTC' })}</p>}
      </div>

      {s.assessment && <details className="mt-4 rounded-xl border border-border-light bg-bg-secondary/60 p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-text-primary">Qué falta por comprobar</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-text-secondary">{[...s.assessment.mismatches,...s.assessment.pending].map(text=><li key={text}>{text}</li>)}</ul>
      </details>}

      <p className="mt-4 text-xs leading-relaxed text-text-muted">{s.url_verified_at ? `Enlace revisado: ${new Date(s.url_verified_at).toLocaleDateString('es-ES')}. Comprueba la convocatoria antes de solicitar.` : "Ficha pendiente de verificación completa. Contrasta la información con el organismo convocante."}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <Link href={`/becas/${s.id}`} className={cn(buttonVariants({ variant: "dark", size: "sm" }), "h-9 px-4 text-sm")}>
          Requisitos y solicitud
          <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
        </Link>
        {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9 px-3 text-sm")}>
          Organismo convocante
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>}
      </div>
    </article>
  </SpotlightCard>;
}
