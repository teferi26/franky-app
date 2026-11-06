import { notFound, permanentRedirect } from "next/navigation";
import { SCHOLARSHIP_ALIASES } from "@/lib/scholarship-aliases";
import Link from "next/link";
import { createPublicSupabase } from "@/lib/supabase-server";
import {
  ArrowLeft, ExternalLink, Check, FileText, Globe, Info, BadgeCheck, ArrowRight,
} from "lucide-react";
import type { Metadata } from "next";
import { plazoInfo } from "@/lib/becas";
import BecaAlertButton from "@/components/BecaAlertButton";
import JsonLd from "@/components/JsonLd";
import AskFrankyButton from '@/components/AskFrankyButton';
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, ScrollProgress } from "@/components/motion";
import { cn } from "@/lib/utils";

// Ficha pública de beca con ISR: requisitos, documentación y proceso de
// solicitud verificados contra la convocatoria oficial (migración 118).
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

const typeLabels: Record<string, string> = {
  nacional: "Nacional",
  autonomica: "Autonómica",
  europea: "Europea",
  privada: "Privada",
  internacional: "Internacional",
};

const audienceLabels: Record<string, string> = {
  grado: "Grado",
  master: "Máster",
  doctorado: "Doctorado",
  fp_grado_superior: "FP Grado Superior",
  bachillerato: "Bachillerato",
  todos: "Todos los niveles",
};

function formatAmount(min: number | null, max: number | null): string | null {
  if (min != null && max != null) {
    if (min === max) return `${Number(min).toLocaleString("es-ES")} €`;
    return `De ${Number(min).toLocaleString("es-ES")} a ${Number(max).toLocaleString("es-ES")} €`;
  }
  if (max != null) return `Hasta ${Number(max).toLocaleString("es-ES")} €`;
  if (min != null) return `Desde ${Number(min).toLocaleString("es-ES")} €`;
  return null;
}

// requirements puede venir como {academicos:[], economicos:[], otros:[]}
// (formato 118), como objeto arbitrario clave→valor o como array legado.
function normalizeRequirements(req: unknown): { label: string; items: string[] }[] {
  if (!req) return [];
  if (Array.isArray(req)) {
    const items = req.map(String).filter(Boolean);
    return items.length ? [{ label: "Requisitos", items }] : [];
  }
  if (typeof req === "object") {
    const labels: Record<string, string> = {
      academicos: "Académicos",
      economicos: "Económicos",
      otros: "Otros",
    };
    const groups: { label: string; items: string[] }[] = [];
    for (const [key, value] of Object.entries(req as Record<string, unknown>)) {
      const items = Array.isArray(value)
        ? value.map(String).filter(Boolean)
        : typeof value === "string" && value
          ? [value]
          : [];
      if (items.length) {
        groups.push({ label: labels[key] || key.charAt(0).toUpperCase() + key.slice(1), items });
      }
    }
    return groups;
  }
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (SCHOLARSHIP_ALIASES[id]) return { alternates: { canonical: `/becas/${SCHOLARSHIP_ALIASES[id]}` } };
  const supabase = createPublicSupabase();
  const { data: beca } = await supabase
    .from("scholarships")
    .select("name, provider, type, description")
    .eq("id", id)
    .single();

  if (!beca) return { title: "Beca no encontrada" };

  const title = `${beca.name}: requisitos y cómo solicitarla`;
  const description =
    (beca.description ? `${beca.description.slice(0, 140)}. ` : "") +
    `Requisitos, documentación, plazos y proceso de solicitud paso a paso de ${beca.name}${beca.provider ? ` (${beca.provider})` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: `/becas/${id}` },
    openGraph: { title, description, type: "website", url: `/becas/${id}` },
  };
}

// Cifra clave de la cabecera: rótulo pequeño arriba y valor grande en cifra
// tabular. Sin cajas de colores: el valor es lo que destaca.
function KeyFigure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "muted" | "warning" }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className={cn(
        "mt-1.5 font-heading text-2xl font-extrabold tracking-tight tabular sm:text-3xl",
        tone === "muted" ? "text-text-muted" : tone === "warning" ? "text-warning" : "text-text-primary"
      )}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-text-muted">{note}</p>}
    </div>
  );
}

export default async function BecaDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (SCHOLARSHIP_ALIASES[id]) permanentRedirect(`/becas/${SCHOLARSHIP_ALIASES[id]}`);
  const supabase = createPublicSupabase();

  const { data: beca, error } = await supabase
    .from("scholarships")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error('No se pudo cargar la convocatoria. Inténtalo de nuevo.');
  if (!beca) notFound();

  const amount = formatAmount(beca.amount_min, beca.amount_max);
  const requirements = normalizeRequirements(beca.requirements);
  const process: string[] = Array.isArray(beca.application_process)
    ? (beca.application_process as string[]).map(String).filter(Boolean)
    : [];
  const sources: { titulo?: string | null; url: string; fecha_consulta?: string | null }[] =
    Array.isArray(beca.sources) ? beca.sources : [];
  const documents: string[] = Array.isArray(beca.documents_required) ? beca.documents_required : [];
  const coverage: string[] = Array.isArray(beca.coverage) ? beca.coverage : [];
  const audience: string[] = Array.isArray(beca.target_audience) ? beca.target_audience : [];

  const plazo = plazoInfo(beca.deadline, Date.now(), beca);
  const hasKeyFigures = Boolean(amount || plazo.fecha || beca.gpa_requirement || beca.income_threshold);

  return (
    <div className="min-h-screen bg-bg-primary overflow-x-clip">
      <ScrollProgress />
      {/* Migas para Google (el enlace visible "Volver a becas" ya cubre la navegación). */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: "https://franky.es/" },
            { "@type": "ListItem", position: 2, name: "Becas y ayudas", item: "https://franky.es/becas" },
            { "@type": "ListItem", position: 3, name: beca.name, item: `https://franky.es/becas/${id}` },
          ],
        }}
      />

      {/* ══════════ CABECERA ══════════ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 lg:pt-12 lg:pb-14">
          <Reveal>
            <Link
              href="/becas"
              className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
              Volver a becas
            </Link>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{typeLabels[beca.type] || beca.type}</Badge>
              {beca.comunidad_autonoma && <Badge variant="outline">{beca.comunidad_autonoma}</Badge>}
              {beca.convocatoria && <Badge variant="secondary">Convocatoria {beca.convocatoria}</Badge>}
              {beca.url_verified_at && (
                <Badge variant="success">
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                  Fuentes consultadas {new Date(beca.url_verified_at).toLocaleDateString('es-ES')}
                </Badge>
              )}
            </div>

            <h1 className="mt-4 max-w-4xl text-fluid-h1 font-extrabold text-text-primary">{beca.name}</h1>
            {beca.provider && (
              <p className="mt-3 text-fluid-lead text-text-secondary">{beca.provider}</p>
            )}

            {/* Alerta de plazo (migración 146): el cron diario avisa por email
                cuando quedan 7 días o menos. Solo con plazo oficial por delante
                (abierta/proxima): con la convocatoria vencida ("estimada") el
                cron no dispararía nunca y la suscripción sería un engaño. */}
            {plazo.fecha && (plazo.estado === "abierta" || plazo.estado === "proxima") && (
              <div className="mt-6">
                <BecaAlertButton scholarshipId={beca.id} />
              </div>
            )}
          </Reveal>

          {/* ══════════ CIFRAS CLAVE ══════════ */}
          {hasKeyFigures && (
            <Reveal delay={120} className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-border-light pt-8 sm:grid-cols-4">
              {amount && <KeyFigure label="Cuantía" value={amount} />}
              {plazo.fecha && (
                <KeyFigure
                  label={plazo.estimada ? "Último plazo publicado" : plazo.estado === "proxima" ? "Cierra pronto" : "Fecha límite"}
                  value={plazo.fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  note={plazo.estimada ? "Cerrado" : undefined}
                  tone={plazo.estimada ? "muted" : plazo.estado === "proxima" ? "warning" : undefined}
                />
              )}
              {beca.gpa_requirement && (
                <KeyFigure label="Nota mínima" value={Number(beca.gpa_requirement).toLocaleString("es-ES")} note="Requisito académico: revisar curso" />
              )}
              {beca.income_threshold && (
                <KeyFigure label="Umbral de renta" value={`${Number(beca.income_threshold).toLocaleString("es-ES")} €`} note="Umbral indicado: consultar unidad familiar" />
              )}
            </Reveal>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-24 pt-10">
        {plazo.estado === 'pendiente_apertura' && plazo.apertura && (
          <Reveal role="status" className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm text-violet-deep">
            <strong>La solicitud todavía no está abierta.</strong> Apertura prevista en la convocatoria: {plazo.apertura.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}.
          </Reveal>
        )}
        {beca.closes_at && <p className="mb-6 text-sm text-text-muted tabular">Cierre oficial: {new Date(beca.closes_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' })} (hora peninsular española).</p>}

        {/* Aviso de convocatoria: si el último plazo ya cerró, explicamos que la
            beca es anual y damos la fecha prevista sin prometer una oficial. */}
        {plazo.estimada && (
          <Reveal className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">El plazo de la última convocatoria ya cerró
                {plazo.ultimaConvocatoria ? ` (${plazo.ultimaConvocatoria.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })})` : ""}.</p>
              <p className="mt-1">
                {beca.deadline_note
                  ? beca.deadline_note
                  : "No consta un nuevo plazo confirmado. Comprueba si hay una nueva convocatoria en la sede oficial."}
              </p>
            </div>
          </Reveal>
        )}

        <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
          {/* ══════════ CONTENIDO ══════════ */}
          {/* min-w-0: evita el desbordamiento de columnas grid en iOS Safari */}
          <div className="min-w-0 space-y-12 lg:col-span-8">
            {beca.description && (
              <Reveal as="section">
                <p className="eyebrow">Qué es</p>
                <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary">¿Qué es esta beca?</h2>
                <p className="prose-comfy mt-4 leading-relaxed text-text-secondary">{beca.description}</p>
              </Reveal>
            )}

            {requirements.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow">Condiciones</p>
                <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary">Requisitos</h2>
                <div className="mt-5 space-y-6">
                  {requirements.map((group, i) => (
                    <div key={i}>
                      {requirements.length > 1 && (
                        <p className="mb-3 text-sm font-semibold text-text-primary">{group.label}</p>
                      )}
                      <ul className="divide-y divide-border-light border-y border-border-light">
                        {group.items.map((item, j) => (
                          <li key={j} className="flex items-start gap-3 py-3 text-sm leading-relaxed text-text-secondary">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            {process.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow">Solicitud</p>
                <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary">Cómo solicitarla, paso a paso</h2>
                <p className="mt-2 text-sm text-text-muted">
                  Proceso según la convocatoria oficial{beca.convocatoria ? ` ${beca.convocatoria}` : ""}.
                </p>
                <ol className="mt-5 space-y-4">
                  {process.map((paso, i) => (
                    <li key={i} className="flex items-start gap-4 text-sm text-text-secondary">
                      <span className="mt-0.5 w-7 shrink-0 font-heading text-lg font-extrabold leading-none text-violet tabular">{String(i + 1).padStart(2, "0")}</span>
                      <span className="leading-relaxed">{paso.replace(/^paso \d+:?\s*/i, "")}</span>
                    </li>
                  ))}
                </ol>
              </Reveal>
            )}

            {documents.length > 0 && (
              <Reveal as="section">
                <p className="eyebrow">Papeles</p>
                <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary">Documentación necesaria</h2>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {documents.map((doc, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-bg-primary p-3.5 text-sm text-text-secondary shadow-card">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      {doc}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {sources.length > 0 && (
              <Reveal as="details" className="group rounded-2xl border border-border bg-bg-primary shadow-card">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-secondary rounded-2xl">
                  <FileText className="h-4 w-4 text-violet" aria-hidden="true" />
                  Fuentes de los datos ({sources.length})
                </summary>
                <ul className="space-y-2 border-t border-border-light px-5 pb-5 pt-4">
                  {sources.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                      <Globe className="mt-0.5 h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all transition-colors hover:text-violet hover:underline">
                        {s.titulo || s.url}
                      </a>
                      {s.fecha_consulta && <span className="shrink-0 text-text-muted">({s.fecha_consulta})</span>}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>

          {/* ══════════ BARRA LATERAL ══════════ */}
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-span-4">
            <div className="rounded-2xl border border-border bg-bg-secondary/60 p-5">
              <h2 className="font-heading text-lg font-bold">¿Tienes dudas sobre esta beca?</h2>
              <p className="mb-4 mt-2 text-sm text-text-secondary">Pregunta por los requisitos, documentos o plazos publicados en esta ficha.</p>
              <AskFrankyButton detail />
            </div>
            <Reveal variant="fade" delay={160} className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <h2 className="font-heading text-lg font-bold text-text-primary">Datos clave</h2>
              <dl className="mt-3 divide-y divide-border-light text-sm">
                <div className="flex justify-between gap-3 py-2.5">
                  <dt className="text-text-muted">Tipo</dt>
                  <dd className="font-medium text-text-primary">{typeLabels[beca.type] || beca.type}</dd>
                </div>
                {beca.provider && (
                  <div className="flex justify-between gap-3 py-2.5">
                    <dt className="shrink-0 text-text-muted">Convoca</dt>
                    <dd className="text-right font-medium text-text-primary">{beca.provider}</dd>
                  </div>
                )}
                {audience.length > 0 && (
                  <div className="flex justify-between gap-3 py-2.5">
                    <dt className="shrink-0 text-text-muted">Dirigida a</dt>
                    <dd className="text-right font-medium text-text-primary">
                      {audience.map((a) => audienceLabels[a] || a).join(", ")}
                    </dd>
                  </div>
                )}
                {coverage.length > 0 && (
                  <div className="flex justify-between gap-3 py-2.5">
                    <dt className="shrink-0 text-text-muted">Cubre</dt>
                    <dd className="text-right font-medium capitalize text-text-primary">{coverage.join(", ").replace(/_/g, " ")}</dd>
                  </div>
                )}
                {beca.deadline_note && (
                  <div className="py-2.5">
                    <dt className="mb-1 text-text-muted">Plazos</dt>
                    <dd className="font-medium leading-snug text-text-primary">{beca.deadline_note}</dd>
                  </div>
                )}
              </dl>

              {beca.url && (
                <div className="mt-5 border-t border-border-light pt-5">
                  <p className="text-sm text-text-secondary">
                    La solicitud se hace siempre en la página del organismo convocante, nunca a través de Franky.
                  </p>
                  <a
                    href={beca.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine mt-4 w-full")}
                  >
                    Ir a la convocatoria oficial
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <p className="mt-2 flex items-center gap-1 break-all text-[11px] text-text-muted">
                    <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {String(beca.url).replace(/^https?:\/\//, "")}
                  </p>
                </div>
              )}
            </Reveal>

            <Reveal variant="fade" delay={240} className="rounded-2xl border border-border-light bg-bg-secondary/60 p-6">
              <h3 className="font-heading text-lg font-bold text-text-primary">¿Cumples los requisitos?</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Encuentra ayudas según tus estudios y el tipo de apoyo que buscas.
              </p>
              <Link
                href="/becas"
                className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet"
              >
                Encontrar ayudas para mí
                <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
              </Link>
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  );
}
