import { proWebPrice } from "../../../../shared/pro/web-pricing";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { Reveal, RevealItem, SpotlightCard } from "@/components/motion";
import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import CampaignLink from "@/components/sector-sites/campaign-link";
import { SECTOR_ICONS } from "@/components/sector-sites/sector-icons";
import type { ProVertical } from "@/lib/pro/verticals";
import type {
  SectorGains,
  SectorModule,
  SectorMoment,
  SectorPoint,
  SectorProof,
  SectorQuestion,
  SectorSurface,
} from "@/lib/sector-sites/types";

/*
 * Secciones de la web de sector. Son componentes de servidor: el único
 * JavaScript de cliente es el de Reveal, SpotlightCard y CampaignLink.
 * Cada sección recibe datos ya comprobados; la página decide si se pinta.
 */

const SURFACE_LABEL: Record<SectorSurface, string> = {
  web: "Web",
  app: "App",
};

const container = "mx-auto max-w-7xl px-5 sm:px-8";

/** Importe en euros con separador de miles de España (14.900 €). */
export function euros(value: number) {
  return `${value.toLocaleString("es-ES")} €`;
}

/** Precio principal del plan tal como se enseña en Ajustes de Franky Pro. */
export function planPrice(vertical: ProVertical) {
  const { monthly, annual, founder } = proWebPrice(vertical.id);
  if (vertical.id === "university") {
    return {
      amount: `Desde ${euros(founder)}`,
      period: "al año",
      annual: null,
    };
  }
  if (!monthly) return { amount: "Gratis", period: "", annual: null };
  const twoFree = annual === monthly * 10;
  return {
    amount: euros(monthly),
    period: proWebPrice(vertical.id).offerLabel ? "al mes + IVA" : "al mes",
    annual: annual
      ? `O ${euros(annual)} al año${twoFree ? " (dos meses gratis)" : ""}${proWebPrice(vertical.id).offerLabel ? " + IVA" : ""}.`
      : null,
  };
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <Reveal className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-heading text-fluid-h2 font-bold tracking-tight">
        {title}
      </h2>
      {body ? (
        <p className="mt-5 leading-relaxed text-text-muted">{body}</p>
      ) : null}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* Módulos: índice con anclas y detalle de cada uno                     */
/* ------------------------------------------------------------------ */

export function ModulesSection({
  modules,
  noun,
}: {
  modules: SectorModule[];
  /** Cómo se nombra al negocio en frases ("tu peluquería"). */
  noun: string;
}) {
  return (
    <section id="modulos" className={`${container} scroll-mt-8 py-16 lg:py-24`}>
      <SectionHeading
        eyebrow="Todo lo que incluye"
        title={`Todo lo que Franky hace por ${noun}.`}
        body="Cada módulo es una parte de tu día. Toca uno para ver todo lo que puedes hacer con él."
      />
      <Reveal
        stagger
        as="nav"
        aria-label="Módulos de Franky"
        className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {modules.map((module, index) => {
          const Icon = SECTOR_ICONS[module.icon];
          return (
            <RevealItem key={module.id} index={index} asChild>
              <SpotlightCard asChild>
                <a
                  href={`#modulo-${module.id}`}
                  className="group hover-lift flex min-h-11 flex-col rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15"
                >
                  <Icon className="h-6 w-6 text-violet" strokeWidth={1.75} />
                  <span className="mt-4 font-heading text-lg font-bold tracking-tight">
                    {module.name}
                  </span>
                  <span className="mt-1 text-sm leading-relaxed text-text-muted">
                    {module.summary}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                    {module.capabilities.length} funciones
                    <ArrowDown className="arrow-nudge h-3.5 w-3.5" />
                  </span>
                </a>
              </SpotlightCard>
            </RevealItem>
          );
        })}
      </Reveal>
      <div className="mt-16">
        {modules.map((module, index) => (
          <ModuleDetail key={module.id} module={module} index={index} />
        ))}
      </div>
    </section>
  );
}

function ModuleDetail({
  module,
  index,
}: {
  module: SectorModule;
  index: number;
}) {
  const Icon = SECTOR_ICONS[module.icon];
  return (
    <article
      id={`modulo-${module.id}`}
      className="grid scroll-mt-8 gap-8 border-t border-border py-12 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16"
    >
      <Reveal className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 text-violet" strokeWidth={1.75} />
          <span className="font-heading text-sm font-semibold text-text-muted tabular">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <h3 className="mt-4 font-heading text-3xl font-bold tracking-tight">
          {module.name}
        </h3>
        <p className="mt-3 leading-relaxed text-text-muted">{module.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Disponible en">
          {module.where.map((surface) => (
            <span
              key={surface}
              className={badgeVariants({ variant: "outline" })}
            >
              {SURFACE_LABEL[surface]}
            </span>
          ))}
        </div>
      </Reveal>
      <Reveal as="ul" stagger className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
        {module.capabilities.map((capability, i) => (
          <RevealItem key={capability.title} index={i} asChild>
            <li className="flex gap-3">
              <Check
                className="mt-1 h-4 w-4 shrink-0 text-violet"
                strokeWidth={1.9}
              />
              <div>
                <p className="font-semibold">{capability.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {capability.body}
                </p>
              </div>
            </li>
          </RevealItem>
        ))}
      </Reveal>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Un día con Franky                                                   */
/* ------------------------------------------------------------------ */

export function DaySection({ moments }: { moments: SectorMoment[] }) {
  return (
    <section
      id="un-dia"
      className="scroll-mt-8 border-y border-border-light bg-bg-secondary/60"
    >
      <div
        className={`${container} grid gap-10 py-16 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20 lg:py-24`}
      >
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHeading
            eyebrow="Un día con Franky"
            title="Un día cualquiera, de la apertura al cierre."
            body="Así se ve tu jornada cuando todo está en el mismo sitio, sin libretas ni hojas sueltas."
          />
        </div>
        <Reveal as="ol" stagger className="relative">
          {moments.map((moment, index) => (
            <RevealItem
              key={`${moment.time}-${moment.title}`}
              index={index}
              asChild
            >
              <li className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-4 border-t border-border py-6 first:border-t-0 first:pt-0 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                <time className="font-heading text-xl font-bold text-violet tabular">
                  {moment.time}
                </time>
                <div>
                  <p className="font-semibold">{moment.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">
                    {moment.body}
                  </p>
                </div>
              </li>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tiempo y dinero                                                      */
/* ------------------------------------------------------------------ */

export function GainsSection({
  gains,
  vertical,
}: {
  gains: SectorGains;
  vertical: ProVertical;
}) {
  const priced = gains.rows.filter((row) => row.monthly);
  const min = priced.reduce((total, row) => total + (row.monthly?.min ?? 0), 0);
  const max = priced.reduce((total, row) => total + (row.monthly?.max ?? 0), 0);
  const price = planPrice(vertical);
  return (
    <section
      id="lo-que-ganas"
      className={`${container} scroll-mt-8 py-16 lg:py-24`}
    >
      <SectionHeading
        eyebrow="Tiempo y dinero"
        title={gains.title}
        body={gains.intro}
      />
      {/*
        En el móvil una tabla de tres columnas esconde "En Franky" tras el
        scroll lateral: ahí se pinta como lista. Desde md, tabla completa.
      */}
      <Reveal as="ul" className="mt-10 grid gap-3 md:hidden">
        {gains.rows.map((row) => (
          <li
            key={row.category}
            className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card"
          >
            <p className="font-semibold">{row.category}</p>
            <p className="mt-1 text-sm text-text-muted tabular">
              <span className="sr-only">Precio orientativo: </span>
              {row.usualPrice}
            </p>
            <p className="mt-3 flex gap-2 border-t border-border-light pt-3 text-sm">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-violet"
                strokeWidth={1.9}
              />
              {row.inFranky}
            </p>
          </li>
        ))}
        {priced.length > 0 ? (
          <li className="rounded-2xl bg-bg-secondary p-5">
            <p className="text-sm text-text-muted">Por separado</p>
            <p className="font-heading text-xl font-bold tabular">
              {euros(min)} a {euros(max)} al mes
            </p>
            <p className="mt-3 text-sm text-text-muted">Con Franky</p>
            <p className="font-heading text-xl font-bold text-violet tabular">
              {price.amount} {price.period}
            </p>
          </li>
        ) : null}
      </Reveal>
      <Reveal className="mt-10 hidden overflow-x-auto rounded-2xl border border-border bg-bg-primary shadow-card md:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Herramientas que se suelen pagar por separado y cómo las incluye
            Franky
          </caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[.12em] text-text-muted">
              <th scope="col" className="px-5 py-4 font-semibold">
                Lo que sueles contratar
              </th>
              <th scope="col" className="px-5 py-4 font-semibold">
                Precio orientativo
              </th>
              <th scope="col" className="px-5 py-4 font-semibold">
                En Franky
              </th>
            </tr>
          </thead>
          <tbody>
            {gains.rows.map((row) => (
              <tr
                key={row.category}
                className="border-b border-border-light align-top last:border-b-0"
              >
                <th scope="row" className="px-5 py-4 font-semibold">
                  {row.category}
                </th>
                <td className="px-5 py-4 text-text-secondary tabular">
                  {row.usualPrice}
                </td>
                <td className="px-5 py-4">
                  <span className="flex gap-2">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-violet"
                      strokeWidth={1.9}
                    />
                    {row.inFranky}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {priced.length > 0 ? (
            <tfoot>
              <tr className="border-t border-border bg-bg-secondary/60">
                <th scope="row" className="px-5 py-4 font-semibold">
                  Por separado
                </th>
                <td className="px-5 py-4 font-semibold tabular">
                  {euros(min)} a {euros(max)} al mes
                </td>
                <td className="px-5 py-4 font-semibold">
                  Con Franky: {price.amount} {price.period}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Reveal>
      <p className="mt-3 text-xs leading-relaxed text-text-muted">
        {gains.note}
      </p>
      {gains.time?.length ? (
        <Reveal
          stagger
          className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {gains.time.map((point, index) => (
            <RevealItem
              key={point.title}
              index={index}
              className="border-t border-border pt-5"
            >
              <p className="font-heading text-lg font-bold tracking-tight">
                {point.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {point.body}
              </p>
            </RevealItem>
          ))}
        </Reveal>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Estudiantes: la única sección oscura de la página                    */
/* ------------------------------------------------------------------ */

export function StudentSection({
  eyebrow,
  title,
  body,
  points,
  numbered,
  spaced,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: SectorPoint[];
  /** Numera los puntos (para pasos) o los marca con un check. */
  numbered: boolean;
  /** Añade aire arriba cuando la sección anterior no deja margen propio. */
  spaced: boolean;
}) {
  const padding = spaced ? "py-16 lg:py-24" : "pb-16 lg:pb-24";
  return (
    <section id="estudiantes" className={`${container} scroll-mt-8 ${padding}`}>
      <Reveal className="grid gap-10 rounded-[2rem] bg-bg-dark px-6 py-10 text-white sm:px-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:py-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/60">
            {eyebrow}
          </p>
          <h2 className="mt-4 font-heading text-fluid-h2 font-bold tracking-tight">
            {title}
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-white/70">{body}</p>
        </div>
        <div className="flex flex-col justify-center gap-6">
          {points.map((point, index) => (
            <div
              key={point.title}
              className="flex gap-5 border-t border-white/15 pt-5"
            >
              {numbered ? (
                <span className="font-heading text-xl text-white/50 tabular">
                  {String(index + 1).padStart(2, "0")}
                </span>
              ) : (
                <Check
                  className="mt-1 h-4 w-4 shrink-0 text-white/60"
                  strokeWidth={1.9}
                />
              )}
              <div>
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/65">
                  {point.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Cómo se empieza                                                      */
/* ------------------------------------------------------------------ */

export function WorkflowSection({ steps }: { steps: SectorPoint[] }) {
  return (
    <section
      id="como-empezar"
      className={`${container} scroll-mt-8 py-16 lg:py-24`}
    >
      <SectionHeading
        eyebrow="Cómo se empieza"
        title="Así empiezas, paso a paso."
      />
      <Reveal stagger className="mt-10 grid gap-8 md:grid-cols-3 md:gap-12">
        {steps.map((step, index) => (
          <RevealItem
            key={step.title}
            index={index}
            className="border-t border-border pt-6"
          >
            <span className="font-heading text-sm font-semibold text-violet tabular">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-4 font-heading text-2xl font-bold tracking-tight">
              {step.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {step.body}
            </p>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Prueba real                                                          */
/* ------------------------------------------------------------------ */

export function ProofSection({ proof }: { proof: SectorProof }) {
  return (
    <section
      id="resultados"
      className={`${container} scroll-mt-8 pb-16 lg:pb-24`}
    >
      <SectionHeading eyebrow="Con datos reales" title={proof.title} />
      <Reveal
        stagger
        className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
      >
        {proof.items.map((item, index) => (
          <RevealItem
            key={item.label}
            index={index}
            className="border-t border-border pt-6"
          >
            <p className="font-heading text-fluid-h2 font-extrabold tracking-tight tabular">
              {item.value}
            </p>
            <p className="mt-2 font-semibold">{item.label}</p>
            <p className="mt-1 text-xs text-text-muted">{item.source}</p>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Plan y precio                                                        */
/* ------------------------------------------------------------------ */

export function PlanSection({
  vertical,
  includes,
  startHref,
  demoHref,
}: {
  vertical: ProVertical;
  includes: string[];
  startHref: string;
  demoHref: string;
}) {
  const price = planPrice(vertical);
  return (
    <section
      id="planes"
      className={`${container} grid scroll-mt-8 gap-10 py-16 lg:grid-cols-2 lg:gap-20 lg:py-24`}
    >
      <div>
        <SectionHeading
          eyebrow="Tu plan"
          title="Un precio claro. Todo incluido."
          body="Prueba todas las herramientas durante 7 días. Crea tu cuenta, elige tu plan y empieza a trabajar."
        />
        <div className="mt-10 divide-y divide-border-light border-y border-border-light">
          {[
            {
              title: "Crea tu cuenta",
              body: "Entra con tu cuenta de Franky o crea una con tu correo.",
            },
            {
              title: "Prepara tu espacio",
              body: "Añade el nombre, la ciudad, la dirección y el teléfono de tu negocio.",
            },
            {
              title: "Empieza a trabajar",
              body: "Elige mensual o anual. Tu guía te ayuda a preparar la agenda y tu ficha pública.",
            },
          ].map((step, index) => (
            <div key={step.title} className="flex gap-5 py-6">
              <span className="font-heading text-xl text-violet tabular">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Reveal variant="scale">
        <SpotlightCard className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
          <p className="eyebrow">{vertical.label}</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-heading text-5xl font-extrabold tracking-tight tabular">
              {price.amount}
            </span>
            {price.period ? (
              <span className="text-text-muted">{price.period}</span>
            ) : null}
          </p>
          {proWebPrice(vertical.id).offerLabel ? (
            <p className="mt-2 text-sm font-semibold text-violet">
              {proWebPrice(vertical.id).offerLabel}
            </p>
          ) : null}
          {price.annual ? (
            <p className="mt-2 text-sm text-text-secondary">{price.annual}</p>
          ) : null}
          {vertical.price.note ? (
            <p className="mt-1 text-sm text-text-muted">
              {vertical.price.note}
            </p>
          ) : null}
          {includes.length ? (
            <ul className="mt-6 grid gap-2.5 border-t border-border-light pt-6">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-violet"
                    strokeWidth={1.9}
                  />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <CampaignLink
              href={startHref}
              className={buttonVariants({ variant: "dark", size: "lg" })}
            >
              Empieza gratis 7 días <ArrowRight className="h-4 w-4" />
            </CampaignLink>
            <Link
              href={demoHref}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Probar la demo <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </SpotlightCard>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Preguntas frecuentes                                                 */
/* ------------------------------------------------------------------ */

export function FaqSection({ faq }: { faq: SectorQuestion[] }) {
  return (
    <section
      id="preguntas"
      className="scroll-mt-8 border-t border-border-light"
    >
      <div
        className={`${container} grid gap-10 py-16 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-20`}
      >
        <SectionHeading eyebrow="Antes de empezar" title="Las cosas claras." />
        <div className="divide-y divide-border-light">
          {faq.map((item) => (
            <details key={item.question} className="group py-5 first:pt-0">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 pr-6 text-sm leading-relaxed text-text-muted">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
