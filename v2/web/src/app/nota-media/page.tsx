import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import NotaMediaCalculator from "./calculator";

/**
 * Calculadora de nota media, portada de la app movil (mejora 87 del ciclo 2).
 *
 * En web se sirve PUBLICA e indexable: "como calcular la nota media de la
 * carrera" es una busqueda constante y no habia nada en franky.es que la
 * respondiera. Ademas es un imán natural hacia /notas-corte y /becas, que es
 * donde de verdad se convierte.
 *
 * Estatica de verdad: la calculadora es 100% de cliente y no toca la base.
 */
export const dynamic = "force-static";

const FAQ = [
  {
    q: "¿Cómo se calcula la nota media de una carrera?",
    a: "Se hace una media ponderada por créditos, no una media simple: cada asignatura pesa en proporción a sus créditos ECTS. Se multiplica la nota de cada asignatura por sus créditos, se suma todo y se divide entre el total de créditos.",
  },
  {
    q: "¿Cuentan las asignaturas suspensas?",
    a: "Para la media del expediente oficial sí: una asignatura suspensa cuenta con su nota hasta que la apruebas. Por eso aquí verás dos cifras, la media de todo y la media de lo que llevas aprobado.",
  },
  {
    q: "¿Qué equivalencia tiene mi nota?",
    a: "En el sistema español: de 5 a 6,9 es Aprobado, de 7 a 8,9 es Notable y de 9 a 10 es Sobresaliente. Por debajo de 5 es Suspenso.",
  },
  {
    q: "¿Se guardan mis notas en algún sitio?",
    a: "No. La lista se queda en tu navegador y no se envía a ningún servidor. No hace falta cuenta para usar la calculadora.",
  },
];

export const metadata: Metadata = {
  title: "Calculadora de nota media universitaria (ponderada por créditos)",
  description:
    "Calcula tu nota media del expediente ponderada por créditos ECTS. Añade tus asignaturas y ve al momento tu media, tus créditos superados y tu equivalencia (aprobado, notable, sobresaliente). Gratis y sin registro.",
  alternates: { canonical: "/nota-media" },
  openGraph: {
    title: "Calculadora de nota media universitaria",
    description:
      "Media ponderada por créditos ECTS, créditos superados y equivalencia. Sin registro.",
    url: "/nota-media",
    type: "website",
  },
};

export default function NotaMediaPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "Calculadora de nota media universitaria",
        url: "https://franky.es/nota-media",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={jsonLd} />

      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6 lg:px-8 lg:pt-8 lg:pb-16">
          <Breadcrumbs
            className="mb-8"
            items={[
              { name: "Inicio", href: "/" },
              { name: "Calculadora de nota media" },
            ]}
          />
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Herramienta</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Calculadora de nota media
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-muted">
              Media ponderada por créditos ECTS, que es como se calcula de verdad
              el expediente. Añade tus asignaturas y lo verás al momento. Sin
              registro y sin que salga nada de tu navegador.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <Reveal variant="fade" delay={100}>
          <NotaMediaCalculator />
        </Reveal>

        {/* FAQ: responde las dudas reales y alimenta el rich snippet. */}
        <Reveal as="section" className="mx-auto mt-20 max-w-3xl">
          <p className="eyebrow">Preguntas</p>
          <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">Dudas habituales</h2>
          <div className="mt-8 divide-y divide-border-light border-y border-border-light">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-[17px] font-bold text-text-primary transition-colors hover:text-violet">
                  {f.q}
                  <Plus className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-300 ease-[var(--ease-out-quart)] group-open:rotate-45" />
                </summary>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>

        {/* Enlaces internos: quien calcula su media suele estar decidiendo algo. */}
        <Reveal as="nav" aria-label="Herramientas relacionadas" className="mx-auto mt-12 max-w-3xl">
          <p className="eyebrow">Sigue por aquí</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/notas-corte", label: "Notas de corte" },
              { href: "/becas", label: "Becas para las que califico" },
              { href: "/notas-corte", label: "Explorar carreras" },
              { href: "/test-vocacional", label: "Test vocacional" },
            ].map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 rounded-full px-4 text-sm font-medium")}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
