import type { Metadata } from "next";
import Link from "next/link";
import {
  GraduationCap,
  Home,
  MapPin,
  Flame,
  Heart,
  ArrowRight,
  ArrowUpRight,
  Search,
  Trophy,
  Check,
  Plus,
} from "lucide-react";
import { unstable_cache } from "next/cache";
import { createPublicSupabase } from "@/lib/supabase-server";
import { hreflangAlternates } from "@/lib/i18n";
import JsonLd from "@/components/JsonLd";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, SpotlightCard, CountUp, Magnetic, Marquee } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * English landing for incoming international / Erasmus students.
 *
 * Why English and why one page: thousands of students search in English for
 * housing, cost of living and "how Spanish universities work" BEFORE they
 * arrive, and the whole site was Spanish-only. This is the honest slice: one
 * well-written entry point that funnels them into the (Spanish) catalogue and,
 * crucially, into the community wall of their host university.
 *
 * Full multi-page translation (all 60 pages, plus Catalan) is a separate,
 * larger effort, deliberately not half-done here.
 *
 * Diseño v3 "Editorial": la misma composición que la portada en español
 * (src/app/page.tsx): hero claro sobre retícula fina, titular grande con el
 * violeta como único acento, cinta de ciudades, cifras que cuentan, rejilla
 * de tarjetas con elevación y foco de luz, UNA sección oscura para la
 * comunidad, FAQ en acordeón hairline y cierre con CTA.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: {
    absolute:
      "Studying in Spain as an international student: universities, housing & campus life | Franky",
  },
  description:
    "Coming to a Spanish university on Erasmus or as an international student? Find your university, student housing, cost of living, nightlife and what's actually happening on your campus. In English.",
  alternates: {
    canonical: "/en",
    languages: hreflangAlternates({ es: "/", en: "/en" }),
  },
  openGraph: {
    title: "Studying in Spain: the international student's shortcut",
    description:
      "Universities, student housing, cost of living and campus life across Spain, in English.",
    url: "/en",
    type: "website",
    locale: "en_GB",
    // Sin esto /en se compartía sin imagen: un openGraph propio sustituye al
    // del layout y no hereda el opengraph-image de la raíz.
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Franky, the student community in Spain",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Studying in Spain: the international student's shortcut",
    description:
      "Universities, student housing, cost of living and campus life across Spain, in English.",
    images: ["/opengraph-image"],
  },
};

const FAQ = [
  {
    q: "Do I need to speak Spanish to use Franky?",
    a: "No. This page and the sign-up are in English. Most of the catalogue (universities, degrees, housing) is in Spanish, but it's mostly names, numbers and maps, so it's easy to navigate. We're adding more English content over time.",
  },
  {
    q: "How much does student housing cost in Spain?",
    a: "A room in a shared flat usually runs €200 to €600/month depending on the city; a room in a hall of residence €500 to €900/month with meals included. Madrid and Barcelona are the most expensive; smaller university cities are much cheaper.",
  },
  {
    q: "Is Franky free?",
    a: "Yes. Browsing universities, housing and leisure, and joining your campus community, is free. You only pay for specific things like some event tickets.",
  },
  {
    q: "What is the campus wall (FOMO)?",
    a: "It's the feed of your specific university: what students there are talking about today: parties, exams, tips and warnings. You can read recent threads without an account and sign up to post or reply.",
  },
];

// Ciudades universitarias de la cinta del hero: muestra decorativa, el número
// real de campus va en las cifras de abajo.
const CITIES = [
  "Madrid", "Barcelona", "Valencia", "Sevilla", "Granada", "Alicante", "Zaragoza", "Málaga",
  "Salamanca", "Bilbao", "Murcia", "Santiago de Compostela", "Valladolid", "Pamplona", "Oviedo",
];

// Rendimiento (sep-2026): dos COUNT(*) exactos por visita para dos cifras que
// cambian cada muchos días. Se guardan una hora en la caché de datos (el
// `revalidate` de arriba no cachea el HTML porque el layout raíz lee headers()).
const getEnCounts = unstable_cache(
  async () => {
    const supabase = createPublicSupabase();
    const [uniRes, leisureRes] = await Promise.all([
      supabase.from("universities").select("id", { count: "exact", head: true }),
      supabase.from("leisure_spots").select("id", { count: "exact", head: true }),
    ]);
    // Un fallo de BD se relanza: no se cachean cifras vacías durante una hora.
    const failed = uniRes.error ?? leisureRes.error;
    if (failed) throw new Error(`No se pudieron cargar las cifras: ${failed.message}`);
    return { uniCount: uniRes.count, leisureCount: leisureRes.count };
  },
  ["en-landing-counts-v1"],
  { revalidate: 3600 }
);

export default async function EnglishLandingPage() {
  const { uniCount, leisureCount } = await getEnCounts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const cards = [
    {
      icon: GraduationCap,
      title: "Universities",
      desc: `Explore ${uniCount ? `${uniCount}+ ` : ""}Spanish universities: location, degrees and admission marks.`,
      href: "/universidades",
      cta: "Browse universities",
    },
    {
      icon: Home,
      title: "Student housing",
      desc: "Shared flats, halls of residence and student rooms near your campus, with real prices.",
      href: "/alojamiento",
      cta: "Find housing",
    },
    {
      icon: MapPin,
      title: "Nightlife & places",
      desc: `${leisureCount ? `${leisureCount}+ ` : ""}bars, parks, museums and clubs around every university city.`,
      href: "/ocio",
      cta: "Explore the city",
    },
    {
      icon: Trophy,
      title: "Grants & aid",
      desc: "Scholarships and student aid available in Spain, filtered by your profile.",
      href: "/becas",
      cta: "Check grants",
    },
  ];

  // Solo cifras reales de la BD: si una no llega, no se inventa.
  const stats = [
    uniCount ? { number: uniCount, label: "Spanish universities" } : null,
    leisureCount ? { number: leisureCount, label: "bars, parks and places around campus" } : null,
  ].filter((s): s is { number: number; label: string } => s !== null);

  return (
    <div className="min-h-screen">
      <JsonLd data={jsonLd} />

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <p className="eyebrow animate-slide-up">For international &amp; Erasmus students</p>
              <h1 className="mt-4 text-fluid-display font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
                Everything you need to
                <br />
                <span className="text-violet">study in Spain.</span>
              </h1>
              <p className="mt-6 max-w-lg text-fluid-lead text-text-secondary animate-slide-up [animation-delay:120ms]">
                Universities, student housing, cost of living, nightlife. And once
                you arrive, what&apos;s actually happening on your campus. Start in
                English; the rest is easy to navigate.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-up [animation-delay:180ms]">
                <Magnetic>
                  <Link
                    href="/universidades"
                    className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}
                  >
                    <Search className="h-4 w-4" aria-hidden="true" />
                    Find your university
                    <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
                  </Link>
                </Magnetic>
                <Link href="/registro" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Create a free account
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-text-muted animate-slide-up [animation-delay:240ms]">
                {["Free for students", "No account needed to browse", "Official admission marks"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-violet" strokeWidth={2.5} aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-sm text-text-muted animate-slide-up [animation-delay:300ms]">
                ¿Prefieres español?{" "}
                <Link href="/" className="link-underline font-medium text-text-primary">
                  Ir a la versión en español
                </Link>
              </p>
            </div>

            {/* Visual: dos tarjetas reales del producto, en HTML puro. */}
            <div className="relative hidden lg:col-span-5 lg:block" aria-hidden="true">
              <div className="relative mx-auto h-[420px] w-full max-w-[460px]">
                <div className="absolute inset-0 rounded-[2rem] bg-bg-secondary/60" />
                <div className="absolute left-6 top-8 animate-slide-up [animation-delay:120ms]">
                  <div className="w-[300px] rounded-2xl border border-border bg-bg-primary p-4 shadow-float animate-float [animation-delay:-2s]">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-deep">
                        UV
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-text-primary">Campus wall · Universitat de València</p>
                        <p className="text-[11px] text-text-muted">12 min ago · 18 replies</p>
                      </div>
                      <Flame className="ml-auto h-4 w-4 text-violet" />
                    </div>
                    <p className="mt-3 text-[13.5px] leading-snug text-text-primary">
                      Erasmus welcome dinner on Thursday, anyone from the Blasco Ibáñez campus coming?
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">#erasmus</span>
                      <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">#plans</span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-8 right-6 animate-slide-up [animation-delay:220ms]">
                  <div className="w-[240px] overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card-hover animate-float-slow">
                    <div className="flex h-20 items-end bg-[linear-gradient(135deg,#e9e5f5,#d9d3ee)] p-2.5 dark:bg-[linear-gradient(135deg,#221f2e,#2b2740)]">
                      <span className="rounded-md bg-bg-primary/90 px-1.5 py-0.5 text-[11px] font-semibold text-text-primary">€340/month</span>
                    </div>
                    <div className="p-3">
                      <p className="text-[13px] font-semibold text-text-primary">Room near the campus</p>
                      <p className="text-[11.5px] text-text-muted">8 min walk · 2 flatmates</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cinta de ciudades universitarias. */}
        <div className="border-y border-border-light py-5">
          <Marquee duration={60} gap="3.5rem">
            {CITIES.map((c) => (
              <span key={c} className="whitespace-nowrap font-heading text-[15px] font-semibold tracking-tight text-text-muted">
                {c}
              </span>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ============ CIFRAS ============ */}
      {stats.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <Reveal stagger className="grid gap-y-10 sm:grid-cols-2">
            {stats.map((s, i) => (
              <RevealItem key={s.label} index={i} className="sm:border-l sm:border-border-light sm:pl-8 sm:first:border-l-0 sm:first:pl-0">
                <p className="font-heading text-4xl font-extrabold tracking-tight text-text-primary lg:text-5xl">
                  <CountUp value={s.number} suffix="+" locale="en-GB" />
                </p>
                <p className="mt-2 text-sm text-text-muted">{s.label}</p>
              </RevealItem>
            ))}
          </Reveal>
        </section>
      )}

      {/* ============ TARJETAS ============ */}
      <section className="border-y border-border-light bg-bg-secondary/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow">Before you land</p>
              <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
                The four things to sort out first.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-text-muted">
              All of it can be browsed without an account.
            </p>
          </Reveal>

          <Reveal stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c, i) => (
              <RevealItem key={c.href} index={i} asChild>
                <SpotlightCard asChild>
                  <Link
                    href={c.href}
                    className="group hover-lift flex min-h-[220px] flex-col rounded-2xl border border-border bg-bg-primary p-6 shadow-card hover:border-text-primary/15"
                  >
                    <div className="flex items-center justify-between">
                      <c.icon className="h-5 w-5 text-text-primary transition-colors duration-200 group-hover:text-violet" aria-hidden="true" />
                      <ArrowUpRight className="h-4 w-4 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-100" aria-hidden="true" />
                    </div>
                    <h3 className="mt-6 font-heading text-lg font-bold text-text-primary">{c.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{c.desc}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-text-primary">
                      {c.cta}
                      <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
                    </span>
                  </Link>
                </SpotlightCard>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ COMUNIDAD (única sección oscura) ============ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal variant="fade" className="relative overflow-hidden rounded-[2rem] bg-bg-dark text-white">
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.12]" aria-hidden="true" />
          <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-12 lg:gap-14 lg:p-16">
            <div className="lg:col-span-5">
              <p className="eyebrow text-white/50">The community</p>
              <h2 className="mt-4 text-fluid-h2 font-extrabold text-white">
                Your campus, in real time.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65">
                Once you pick your university, its wall shows what students are
                talking about right now: parties, exam tips, warnings, gossip.
                The fastest way to feel at home before you even land.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              <SpotlightCard asChild>
                <Link
                  href="/fomo"
                  className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-[border-color,background-color] duration-300 hover:border-white/20 hover:bg-white/[0.07]"
                  style={{ ["--spot-color" as string]: "rgba(255,255,255,0.08)" }}
                >
                  <Flame className="h-6 w-6 text-violet-light" aria-hidden="true" />
                  <h3 className="mt-6 font-heading text-xl font-bold">Campus walls</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    One feed per university, written by the students who are there today.
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-white">
                    See campus walls <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
                  </span>
                </Link>
              </SpotlightCard>
              <SpotlightCard asChild>
                <Link
                  href="/crush"
                  className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-[border-color,background-color] duration-300 hover:border-white/20 hover:bg-white/[0.07]"
                  style={{ ["--spot-color" as string]: "rgba(232,121,249,0.10)" }}
                >
                  <Heart className="h-6 w-6 text-fuchsia" aria-hidden="true" />
                  <h3 className="mt-6 font-heading text-xl font-bold">Crush</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Meet people from your host university. Instagram handles are swapped only when both say yes.
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-white">
                    How it works <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
                  </span>
                </Link>
              </SpotlightCard>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============ FAQ ============ */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <p className="eyebrow">Frequently asked</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              What people ask before they arrive.
            </h2>
            <p className="mt-3 text-sm text-text-muted">
              Something else?{" "}
              <Link href="/ayuda" className="link-underline font-medium text-text-primary">
                Help centre
              </Link>
            </p>
          </Reveal>
          <Reveal stagger className="lg:col-span-8">
            {FAQ.map((f, i) => (
              <RevealItem key={f.q} index={i} variant="fade" asChild>
                <details className="group border-b border-border py-1 first:border-t">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[15px] font-semibold text-text-primary transition-colors hover:text-violet [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-text-muted transition-[transform,background-color,color,border-color] duration-300 ease-[var(--ease-out-quart)] group-open:rotate-45 group-open:border-text-primary group-open:bg-text-primary group-open:text-bg-primary">
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                  </summary>
                  <p className="animate-fade-in pb-5 pr-12 text-sm leading-relaxed text-text-muted">{f.a}</p>
                </details>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="border-t border-border-light bg-bg-secondary/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <Reveal variant="blur" className="mx-auto max-w-2xl text-center">
            <h2 className="text-fluid-h1 font-extrabold text-text-primary">
              Start today. It&apos;s free.
            </h2>
            <p className="mt-4 text-fluid-lead text-text-muted">
              Create your account in a minute and join your host university&apos;s community.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/registro" className={cn(buttonVariants({ size: "lg" }), "btn-shine")}>
                Create a free account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/universidades" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Browse without an account
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
