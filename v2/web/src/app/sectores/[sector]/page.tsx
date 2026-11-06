import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion";
import {
  SectorHeader,
  SectorFooter,
} from "@/components/sector-sites/site-chrome";
import ProductPreview from "@/components/sector-sites/product-preview";
import MobileAccess from "@/components/sector-sites/mobile-access";
import CampaignLink from "@/components/sector-sites/campaign-link";
import {
  DaySection,
  FaqSection,
  GainsSection,
  ModulesSection,
  PlanSection,
  planPrice,
  ProofSection,
  StudentSection,
  WorkflowSection,
} from "@/components/sector-sites/sector-sections";
import { getSectorSite, SECTOR_SITES } from "@/lib/sector-sites/catalog";
import {
  sectorCanonicalUrl,
  getSectorSlugFromHost,
  sectorHref,
  sectorMetadataHost,
} from "@/lib/sector-sites/routing";
import { PRO_VERTICALS, demoSpaceId } from "@/lib/pro/verticals";

type Props = { params: Promise<{ sector: string }> };

/* Frases bajo el titular cuando el sector aún no tiene las suyas. */
const DEFAULT_HIGHLIGHTS = [
  "Un espacio para tu actividad",
  "Conexión con estudiantes",
  "Tu equipo, desde cualquier lugar",
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = getSectorSite((await params).sector);
  if (!site) return {};
  const canonical = sectorCanonicalUrl(site.slug);
  const host = (await headers()).get("host");
  const metadataHost = sectorMetadataHost(host);
  return {
    title: { absolute: site.seoTitle },
    description: site.seoDescription,
    keywords: site.keywords,
    alternates: { canonical },
    robots: { index: metadataHost.indexable, follow: true },
    openGraph: {
      type: "website",
      locale: "es_ES",
      siteName: `Franky ${site.name}`,
      title: site.seoTitle,
      description: site.seoDescription,
      url: canonical,
      images: [
        {
          url: "https://franky.es/img/og-default.png",
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: site.seoTitle,
      description: site.seoDescription,
      images: ["https://franky.es/img/og-default.png"],
    },
  };
}

export default async function SectorPage({ params }: Props) {
  const site = getSectorSite((await params).sector);
  if (!site) notFound();
  const requestHeaders = await headers();
  const onSubdomain =
    getSectorSlugFromHost(requestHeaders.get("host")) === site.slug;
  const homeHref = onSubdomain ? "/" : `/sectores/${site.slug}`;
  const accessHref = onSubdomain ? "/acceder" : `${homeHref}/acceder`;
  const startHref = `/pro/empezar?sector=${site.vertical}&origen=${site.slug}`;
  const demoHref = `/pro/${demoSpaceId(site.vertical)}`;
  const vertical = PRO_VERTICALS[site.vertical];
  const canonical = sectorCanonicalUrl(site.slug);
  const price = planPrice(vertical);
  const related = SECTOR_SITES.filter(
    (item) =>
      item.slug !== site.slug &&
      PRO_VERTICALS[item.vertical].group === vertical.group,
  ).slice(0, 3);

  // Contenido rico opcional: cada sección se pinta solo si tiene datos.
  const modules = site.modules ?? [];
  const highlights = site.highlights?.length
    ? site.highlights
    : DEFAULT_HIGHLIGHTS;
  const studentPoints = site.studentSection?.points ?? [];
  const planIncludes =
    site.planIncludes ?? modules.map((module) => module.name);
  // "Un día" tiene fondo propio y no deja margen inferior: si va justo antes
  // de la sección oscura, esta necesita aire arriba.
  const dayIsLast = Boolean(
    site.dayWithFranky?.length && !site.gains?.rows.length,
  );

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${canonical}#website`,
        url: canonical,
        name: `Franky ${site.name}`,
        inLanguage: "es-ES",
        publisher: {
          "@type": "Organization",
          name: "Franky",
          url: "https://franky.es",
        },
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: site.seoTitle,
        description: site.seoDescription,
        isPartOf: { "@id": `${canonical}#website` },
      },
      {
        "@type": "FAQPage",
        mainEntity: site.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };

  return (
    <div className="bg-bg-primary text-text-primary">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        nonce={requestHeaders.get("x-nonce") ?? undefined}
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <SectorHeader
        name={site.name}
        homeHref={homeHref}
        accessHref={accessHref}
      />

      {/* Portada */}
      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.12fr_1fr] lg:items-center lg:gap-16 lg:pb-20 lg:pt-20">
        <div>
          <p className="eyebrow">{site.eyebrow}</p>
          <h1 className="mt-5 font-heading text-[clamp(2.6rem,5.2vw,4.5rem)] font-extrabold leading-[1.04] tracking-[-.055em]">
            {site.title} <span className="text-violet">{site.accent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-muted">
            {site.description}
          </p>
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
          <p className="mt-5 text-xs leading-relaxed text-text-muted">
            7 días gratis. Después, {price.amount} {price.period}.{" "}
            {price.annual}
          </p>
          <a
            href={accessHref}
            className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-text-secondary hover:text-violet"
          >
            Acceder como {site.audienceLabel} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <ProductPreview engine={vertical.engine} name={site.name} />
      </section>
      <div className="border-y border-border-light">
        <ul className="mx-auto grid max-w-7xl gap-4 px-5 py-6 text-sm font-medium text-text-secondary sm:grid-cols-3 sm:px-8">
          {highlights.map((label) => (
            <li key={label} className="flex items-center gap-3">
              <Check
                className="h-4 w-4 shrink-0 text-violet"
                strokeWidth={1.9}
              />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Lo esencial en tres puntos */}
      <section
        id="herramientas"
        className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 sm:px-8 lg:py-24"
      >
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Hecho para {site.name.toLowerCase()}</p>
          <h2 className="mt-3 font-heading text-fluid-h2 font-bold tracking-tight">
            Menos vueltas.
            <br />
            Más tiempo para lo tuyo.
          </h2>
        </Reveal>
        <Reveal stagger className="mt-10 grid gap-8 md:grid-cols-3 md:gap-12">
          {site.benefits.map((benefit, index) => (
            <RevealItem
              key={benefit.title}
              index={index}
              className="border-t border-border pt-6"
            >
              <span className="font-heading text-sm font-semibold text-violet tabular">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 font-heading text-2xl font-bold tracking-tight">
                {benefit.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                {benefit.body}
              </p>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {modules.length > 0 && (
        <ModulesSection modules={modules} noun={vertical.noun} />
      )}

      {site.dayWithFranky?.length ? (
        <DaySection moments={site.dayWithFranky} />
      ) : null}

      {site.gains?.rows.length ? (
        <GainsSection gains={site.gains} vertical={vertical} />
      ) : null}

      {/*
        La sección oscura (una por página). Si el sector tiene puntos propios
        de estudiantes, los pinta y los pasos van en su propia sección; si no,
        mantiene los pasos aquí, como en la primera versión.
      */}
      <StudentSection
        eyebrow={
          site.studentSection?.eyebrow ?? "La diferencia está al otro lado"
        }
        title={site.studentTitle}
        body={site.studentBody}
        points={studentPoints.length ? studentPoints : site.workflow}
        numbered={!studentPoints.length}
        spaced={dayIsLast}
      />

      {site.proof?.items.length ? <ProofSection proof={site.proof} /> : null}

      <MobileAccess accessHref={accessHref} app={site.mobileApp} />

      {studentPoints.length > 0 && site.workflow.length > 0 && (
        <WorkflowSection steps={site.workflow} />
      )}

      <div
        className={studentPoints.length ? "border-t border-border-light" : ""}
      >
        <PlanSection
          vertical={vertical}
          includes={planIncludes}
          startHref={startHref}
          demoHref={demoHref}
        />
      </div>

      <FaqSection faq={site.faq} />

      {related.length > 0 && (
        <aside className="mx-auto max-w-7xl px-5 pb-12 sm:px-8">
          <p className="text-sm text-text-muted">También hay un Franky para</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {related.map((item) => (
              <a
                href={sectorHref(item.slug)}
                key={item.slug}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
              >
                {item.name}
                <ArrowUpRight className="h-4 w-4 text-violet" />
              </a>
            ))}
          </div>
        </aside>
      )}
      <SectorFooter name={site.name} />
    </div>
  );
}
