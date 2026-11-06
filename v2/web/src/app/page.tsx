import type { CSSProperties } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import {
  GraduationCap,
  BookOpen,
  Home,
  MapPin,
  Trophy,
  Compass,
  ArrowRight,
  ArrowUpRight,
  Flame,
  Heart,
  Users,
  ShoppingBag,
  CalendarDays,
  MessageCircle,
  Check,
  Plus,
  Lock,
} from "lucide-react";
import { createPublicSupabase, createServerSupabase } from "@/lib/supabase-server";
import { cutOffCourse } from "@/lib/academic-year";
import { formatAcademicScore } from "@/lib/academic-score";
import { isSocialCampaignVisit } from "@/lib/social-landing";
import { MADRID_TZ } from "@/lib/event-time";
import { SCHOLARSHIP_ALIASES } from "@/lib/scholarship-aliases";
import HomeSocial from "@/components/home/HomeSocial";
import { SOCIAL_SAME_AS } from "@/lib/social";
import { hreflangAlternates } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";
import AdSlot from "@/components/AdSlot";
import JsonLd from "@/components/JsonLd";
import { Reveal, RevealItem, SpotlightCard, CountUp, TiltCard, Marquee, Magnetic } from "@/components/motion";
import { cn } from "@/lib/utils";

// La home ya no es `force-dynamic`. Sigue renderizandose por peticion porque
// lee `headers()` para el nonce de la CSP (eso opta fuera del prerender), pero
// los datos SI se cachean: antes cada visita disparaba 5 consultas a Supabase
// para cifras que cambian una vez al dia. Ahora la BD se toca una vez cada
// media hora, no una vez por visitante.
export const revalidate = 1800;

const HOME_DATA_TTL = 1800;

// Las secciones por debajo del pliegue no se ven hasta que alguien hace
// scroll: con `content-visibility: auto` el navegador aplaza su layout.
const DIFERIR_PINTADO: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto 900px",
};

const getHomeData = unstable_cache(
  async () => {
    // Cliente anon sin cookies: la home no depende de la sesion.
    const supabase = createPublicSupabase();
    const [uni, career, scholarship, leisure, top, community, nextEvent] = await Promise.all([
      supabase.from("universities").select("*", { count: "exact", head: true }),
      supabase.from("careers").select("*", { count: "exact", head: true }),
      supabase.from("scholarships").select("*", { count: "exact", head: true }).eq("is_active", true).not("id", "in", `(${Object.keys(SCHOLARSHIP_ALIASES).join(",")})`),
      supabase.from("leisure_spots").select("*", { count: "exact", head: true }),
      supabase
        .from("careers")
        .select("id, slug, name, cut_off_score, cut_off_year, universities(name, short_name)")
        .not("cut_off_score", "is", null)
        .gt("cut_off_score", 0)
        .order("cut_off_score", { ascending: false })
        .limit(5),
      supabase.rpc("get_public_community_stats"),
      // Próximo plan, para el hero de la visita que llega desde redes.
      supabase
        .from("events")
        .select("id, title, start_date, city")
        .gte("start_date", new Date().toISOString())
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      uniCount: uni.count,
      careerCount: career.count,
      scholarshipsCount: scholarship.count,
      leisureCount: leisure.count,
      topCareers: top.data,
      // Si la migración 142 aún no está aplicada, la RPC no existe y la
      // sección de prueba social sencillamente no se pinta.
      community: (community.error ? null : community.data) as CommunityStats | null,
      nextEvent: (nextEvent.error ? null : nextEvent.data) as NextEvent | null,
    };
  },
  ["home-stats-v5"],
  { revalidate: HOME_DATA_TTL }
);

type NextEvent = { id: string; title: string; start_date: string; city: string | null };

type CommunityStats = {
  students: number;
  active_universities: number;
  threads_30d: number;
};

// Las descripciones se calculan con los contadores reales.
function buildFeatures(counts: {
  uni: number | null;
  career: number | null;
  scholarship: number | null;
  leisure: number | null;
}) {
  const n = (v: number | null, fallback: string) =>
    v && v > 0 ? `${v.toLocaleString("es-ES")}` : fallback;

  return [
    {
      icon: GraduationCap,
      title: "Universidades",
      desc: `Las ${n(counts.uni, "")} universidades de España con información detallada, grados y filtros.`.replace(/\s+/g, " "),
      href: "/universidades",
    },
    {
      icon: BookOpen,
      title: "Notas de corte",
      desc: `${n(counts.career, "Todas las")} carreras con su nota de corte oficial y el curso de referencia.`,
      href: "/notas-corte",
    },
    {
      icon: Trophy,
      title: "Becas y ayudas",
      desc: "MEC, autonómicas, Erasmus+ y privadas. Convocatorias y requisitos en un solo sitio.",
      href: "/becas",
    },
    {
      icon: Home,
      title: "Alojamiento",
      desc: "Pisos compartidos, residencias y colegios mayores cerca de tu campus.",
      href: "/alojamiento",
    },
    {
      icon: MapPin,
      title: "Zonas de ocio",
      desc: `${n(counts.leisure, "Los mejores")} bares, parques, museos y discotecas de cada ciudad universitaria.`,
      href: "/ocio",
    },
    { icon: Flame, title: "FOMO", desc: "El tablón de tu campus: lo que se comenta hoy, escrito por gente de tu uni.", href: "/fomo" },
    // Funciones de comunidad: sin cuenta, el enlace directo acababa en el
    // login sin explicación. Se marcan y llevan al registro con vuelta.
    { icon: Heart, title: "Crush", desc: "Conoce gente de tu uni e intercambia Instagram cuando el interés sea mutuo.", href: "/registro?next=%2Fcrush", requiresAccount: true },
    { icon: Users, title: "RoomieMatch", desc: "Compañeros de piso según tu ciudad, presupuesto y hábitos.", href: "/registro?next=%2Froomie-match", requiresAccount: true },
    { icon: MessageCircle, title: "Comunidades", desc: "Grupos por intereses, carrera o ciudad. Encuentra a los tuyos.", href: "/registro?next=%2Fcomunidades", requiresAccount: true },
    { icon: ShoppingBag, title: "Mercado", desc: "Compra y vende entre estudiantes: libros, apuntes y lo que ya no usas.", href: "/registro?next=%2Fmercado", requiresAccount: true },
    { icon: CalendarDays, title: "Eventos", desc: "Planes y fiestas universitarias. Precio final claro antes de pagar.", href: "/eventos" },
    { icon: Compass, title: "Test vocacional", desc: "Tu perfil RIASEC y las carreras que mejor encajan contigo.", href: "/test-vocacional" },
  ];
}

// Preguntas frecuentes: responden las objeciones reales del visitante y
// alimentan el rich snippet de FAQ.
const FAQ = [
  {
    q: "¿Franky es gratis?",
    a: "Sí. Crear tu cuenta, consultar notas de corte, buscar becas, explorar universidades y usar FOMO y Crush es gratis. Solo se paga en cosas concretas como las entradas de algunos eventos.",
  },
  {
    q: "¿De dónde salen las notas de corte?",
    a: `Las notas de corte proceden de las publicaciones oficiales de cada universidad y de las consejerías de educación, con el curso de referencia indicado en cada ficha. No usamos agregadores de terceros.`,
  },
  {
    q: "¿Necesito cuenta para consultar carreras o becas?",
    a: "No. Los catálogos de universidades, carreras, notas de corte, becas, alojamiento y ocio se pueden consultar sin cuenta. La cuenta hace falta para la parte de comunidad: FOMO, Crush, eventos y mensajes.",
  },
  {
    q: "¿Qué es FOMO?",
    a: "FOMO es el muro de tu universidad: lo que se está comentando hoy en tu campus, publicado por gente de tu propia universidad. Puedes leer los últimos hilos sin cuenta y necesitas registrarte para publicar o responder.",
  },
  {
    q: "¿Quién puede ver mi perfil?",
    a: "Solo gente registrada de la comunidad. Tu email, tu teléfono y tu fecha de nacimiento nunca se muestran a otros usuarios, y puedes eliminar tu cuenta cuando quieras desde tu perfil.",
  },
];

// Universidades que aparecen en la cinta del hero. Es una muestra decorativa
// del catálogo (el número real va en las cifras de abajo).
const UNIS_CINTA = [
  "Complutense de Madrid", "Universitat de Barcelona", "Universidad de Alicante", "Politècnica de València",
  "Universidad de Granada", "Universidad de Sevilla", "Autónoma de Madrid", "Universidad de Zaragoza",
  "Carlos III", "Pompeu Fabra", "Universidad de Salamanca", "Miguel Hernández", "Universidad del País Vasco",
  "Universidad de Murcia", "Universitat de València", "Politécnica de Madrid", "Universidad de Málaga",
];

export const metadata: Metadata = {
  title:
    "Franky · Comunidad de estudiantes de España: carreras, becas, alojamiento y eventos",
  description:
    "Conecta con la comunidad universitaria de España. Descubre tu carrera ideal, encuentra becas MEC y autonómicas, busca piso o residencia, y vive los mejores eventos universitarios. Todo en un solo sitio.",
  alternates: {
    canonical: "https://franky.es/",
    languages: hreflangAlternates({ es: "/", en: "/en" }),
  },
  openGraph: {
    title: "Franky · Tu vida universitaria, en un solo lugar",
    description:
      "Carreras, becas, alojamiento universitario, eventos y RoomieMatch. Únete gratis.",
    url: "https://franky.es/",
    siteName: "Franky",
    type: "website",
    locale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "Franky · Comunidad universitaria de España",
    description:
      "Carreras, becas, alojamiento y eventos universitarios. Únete gratis.",
  },
};

/* ---------- Piezas del visual del hero (HTML puro, sin imágenes) ---------- */

function MockFomo() {
  return (
    <div className="w-[300px] rounded-2xl border border-border bg-bg-primary p-4 shadow-float">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-deep">
          UA
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">FOMO · Universidad de Alicante</p>
          <p className="text-[11px] text-text-muted">hace 4 min · 32 respuestas</p>
        </div>
        <Flame className="ml-auto h-4 w-4 text-violet" />
      </div>
      <p className="mt-3 text-[13.5px] leading-snug text-text-primary">
        ¿Alguien sabe si la biblioteca general abre el domingo antes del parcial de Cálculo?
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">#exámenes</span>
        <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary">#biblioteca</span>
      </div>
    </div>
  );
}

function MockNota({ name, uni, score }: { name: string; uni: string; score: string }) {
  return (
    <div className="w-[260px] rounded-2xl border border-border bg-bg-primary p-4 shadow-card-hover">
      <p className="eyebrow">Nota de corte 25/26</p>
      <p className="mt-1.5 text-[14px] font-semibold leading-snug text-text-primary">{name}</p>
      <p className="text-[12px] text-text-muted">{uni}</p>
      <div className="mt-3 flex items-end justify-between">
        <span className="font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular">{score}</span>
        <span className="mb-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Fuente oficial
        </span>
      </div>
    </div>
  );
}

function MockCrush() {
  return (
    <div className="flex w-[230px] items-center gap-3 rounded-2xl border border-border bg-bg-primary p-3.5 shadow-card-hover">
      <div className="relative">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia/15 text-[12px] font-bold text-fuchsia">M</span>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet text-white ring-2 ring-bg-primary">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-text-primary">¡Es un match!</p>
        <p className="truncate text-[11.5px] text-text-muted">Instagram compartido con Marta</p>
      </div>
      <Heart className="ml-auto h-4 w-4 fill-fuchsia text-fuchsia animate-heartbeat" />
    </div>
  );
}

function MockPiso() {
  return (
    <div className="w-[240px] overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="flex h-20 items-end bg-[linear-gradient(135deg,#e9e5f5,#d9d3ee)] p-2.5 dark:bg-[linear-gradient(135deg,#221f2e,#2b2740)]">
        <span className="rounded-md bg-bg-primary/90 px-1.5 py-0.5 text-[11px] font-semibold text-text-primary">320 €/mes</span>
      </div>
      <div className="p-3">
        <p className="text-[13px] font-semibold text-text-primary">Habitación en San Vicente</p>
        <p className="text-[11.5px] text-text-muted">A 6 min del campus · 3 compañeros</p>
      </div>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Bifurcación de la home: con sesión, franky.es ES la red social; sin
  // sesión, la landing. Fail-soft: si la sesión no resuelve, landing.
  let sessionUserId: string | null = null;
  try {
    const authed = await createServerSupabase();
    const { data: { user } } = await authed.auth.getUser();
    sessionUserId = user?.id ?? null;
  } catch {
    sessionUserId = null;
  }
  if (sessionUserId) return <HomeSocial userId={sessionUserId} />;

  const {
    uniCount,
    careerCount,
    scholarshipsCount,
    leisureCount,
    topCareers,
    community,
    nextEvent,
  } = await getHomeData();

  // Hero adaptado a la visita que llega desde Instagram/TikTok o una campaña.
  // Se resuelve en el servidor con searchParams: la home ya se renderiza por
  // petición (lee la sesión y el nonce), así que no se pierde ninguna caché
  // de HTML, y los datos siguen en unstable_cache. Hacerlo en cliente habría
  // pintado primero el hero de catálogo y luego saltado al otro (CLS).
  const socialVisit = isSocialCampaignVisit(await searchParams);
  const nextEventLabel = nextEvent
    ? new Date(nextEvent.start_date).toLocaleDateString("es-ES", {
        timeZone: MADRID_TZ,
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  const features = buildFeatures({
    uni: uniCount,
    career: careerCount,
    scholarship: scholarshipsCount,
    leisure: leisureCount,
  });

  // Solo se enseñan cifras cuando la BD ha devuelto números reales.
  const haveAllStats =
    uniCount != null &&
    careerCount != null &&
    scholarshipsCount != null &&
    leisureCount != null;
  const dynamicStats = haveAllStats
    ? [
        { number: uniCount as number, label: "universidades" },
        { number: careerCount as number, label: "carreras con nota de corte" },
        { number: scholarshipsCount as number, label: "becas y ayudas" },
        { number: leisureCount as number, label: "zonas de ocio" },
      ]
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://franky.es/#org",
        name: "Franky",
        url: "https://franky.es/",
        logo: "https://franky.es/img/franky-logo.png",
        description:
          "Comunidad de estudiantes universitarios de España: carreras, becas, notas de corte, alojamiento, eventos y RoomieMatch.",
        sameAs: SOCIAL_SAME_AS,
      },
      {
        "@type": "WebSite",
        "@id": "https://franky.es/#website",
        url: "https://franky.es/",
        name: "Franky",
        inLanguage: "es-ES",
        publisher: { "@id": "https://franky.es/#org" },
        potentialAction: {
          "@type": "SearchAction",
          // /buscar no existe: el buscador real del catálogo es /notas-corte?buscar=.
          target: "https://franky.es/notas-corte?buscar={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "EducationalOrganization",
        name: "Franky, plataforma universitaria",
        url: "https://franky.es/",
        areaServed: { "@type": "Country", name: "España" },
        knowsAbout: [
          "Universidades de España",
          "Notas de corte EvAU",
          "Becas MEC",
          "Becas Erasmus+",
          "Alojamiento universitario",
          "Test vocacional",
          "Eventos universitarios",
        ],
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

  const topName = topCareers?.[0]?.name ?? "Medicina";
  const topUni =
    (topCareers?.[0]?.universities as unknown as { name?: string; short_name?: string } | null)?.short_name ??
    (topCareers?.[0]?.universities as unknown as { name?: string } | null)?.name ??
    "Universidad";
  const topScore = topCareers?.[0]?.cut_off_score ? formatAcademicScore(topCareers[0].cut_off_score) : "13,512";

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-16 lg:pt-24 lg:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-6">
              {socialVisit ? (
                <>
              <p className="eyebrow animate-slide-up">Tu campus, hoy</p>
              <h1 className="mt-4 text-fluid-display font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
                Lo que se cuece
                <br />
                hoy en <span className="text-violet">tu campus.</span>
              </h1>
              <p className="mt-6 max-w-lg text-fluid-lead text-text-secondary animate-slide-up [animation-delay:120ms]">
                El muro FOMO de tu universidad, los planes y fiestas de esta
                semana y la gente que te cruzas en clase. Escrito por gente de
                tu uni, no por marcas.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-up [animation-delay:180ms]">
                <Magnetic>
                  <Link href="/fomo" className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}>
                    <Flame className="h-4 w-4" aria-hidden="true" />
                    Ver el FOMO de mi campus
                    <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
                  </Link>
                </Magnetic>
                <Link href="/registro?next=%2Ffomo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}>
                  Crear cuenta gratis
                </Link>
              </div>

              {nextEvent && nextEventLabel && (
                <Link
                  href={`/eventos/${nextEvent.id}`}
                  className="group mt-6 flex max-w-lg items-center gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card transition-colors hover:border-text-primary/20 animate-slide-up [animation-delay:220ms]"
                >
                  <CalendarDays className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-text-muted">Próximo plan</span>
                    <span className="block truncate text-[15px] font-semibold text-text-primary">{nextEvent.title}</span>
                    <span className="block truncate text-[13px] capitalize text-text-secondary">
                      {nextEventLabel}
                      {nextEvent.city ? ` · ${nextEvent.city}` : ""}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" aria-hidden="true" />
                </Link>
              )}

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-text-muted animate-slide-up [animation-delay:240ms]">
                {["Gratis para estudiantes", "Solo gente de tu uni", "Lees sin cuenta"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-violet" strokeWidth={2.5} />
                    {t}
                  </li>
                ))}
              </ul>
                </>
              ) : (
                <>
              <p className="eyebrow animate-slide-up">Comunidad universitaria de España</p>
              <h1 className="mt-4 text-fluid-display font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
                Tu carrera,
                <br />
                tu piso,
                <br />
                <span className="text-violet">tu gente.</span>
              </h1>
              <p className="mt-6 max-w-lg text-fluid-lead text-text-secondary animate-slide-up [animation-delay:120ms]">
                Notas de corte oficiales, becas, alojamiento y zonas de ocio para
                elegir bien. Y cuando ya estás dentro, lo que de verdad se cuece
                en tu campus.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-up [animation-delay:180ms]">
                <Magnetic>
                  <Link href="/notas-corte" className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}>
                    Explorar carreras y notas
                    <ArrowRight className="h-4 w-4 arrow-nudge" />
                  </Link>
                </Magnetic>
                <Link href="/test-vocacional" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}>
                  <Compass className="h-4 w-4 text-violet" />
                  Test vocacional
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-text-muted animate-slide-up [animation-delay:240ms]">
                {["Gratis para estudiantes", "Fuentes oficiales", "Sin cuenta para consultar"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-violet" strokeWidth={2.5} />
                    {t}
                  </li>
                ))}
              </ul>
                </>
              )}
            </div>

            {/* Visual: tarjetas reales del producto flotando. */}
            <div className="relative hidden lg:col-span-6 lg:block" aria-hidden="true">
              <TiltCard className="relative mx-auto h-[520px] w-full max-w-[560px]">
                <div className="absolute left-4 top-6 animate-slide-up">
                  <div className="animate-float [animation-delay:-2s]"><MockFomo /></div>
                </div>
                <div className="absolute right-0 top-0 animate-slide-up [animation-delay:120ms]">
                  <div className="animate-float-slow"><MockNota name={topName} uni={topUni} score={topScore} /></div>
                </div>
                <div className="absolute bottom-16 right-6 animate-slide-up [animation-delay:200ms]">
                  <div className="animate-float [animation-delay:-4s]"><MockPiso /></div>
                </div>
                <div className="absolute bottom-6 left-10 animate-slide-up [animation-delay:280ms]">
                  <div className="animate-float-slow [animation-delay:-1s]"><MockCrush /></div>
                </div>
                {/* Marca de agua de la retícula detrás del visual. */}
                <div className="absolute inset-0 -z-10 rounded-[2rem] bg-bg-secondary/60" />
              </TiltCard>
            </div>
          </div>
        </div>

        {/* Cinta de universidades. */}
        <div className="border-y border-border-light py-5">
          <Marquee duration={70} gap="3.5rem">
            {UNIS_CINTA.map((u) => (
              <span key={u} className="whitespace-nowrap font-heading text-[15px] font-semibold tracking-tight text-text-muted">
                {u}
              </span>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ============ CIFRAS ============ */}
      {dynamicStats.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <Reveal stagger className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
            {dynamicStats.map((s, i) => (
              <RevealItem key={s.label} index={i} className="md:border-l md:border-border-light md:pl-8 md:first:border-l-0 md:first:pl-0">
                <p className="font-heading text-4xl font-extrabold tracking-tight text-text-primary lg:text-5xl">
                  <CountUp value={s.number} suffix="+" />
                </p>
                <p className="mt-2 text-sm text-text-muted">{s.label}</p>
              </RevealItem>
            ))}
          </Reveal>
        </section>
      )}

      {/* ============ COMUNIDAD: FOMO + CRUSH ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        <Reveal variant="fade" className="relative overflow-hidden rounded-[2rem] border border-transparent bg-bg-dark text-white dark:border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.12]" aria-hidden="true" />
          <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-12 lg:gap-14 lg:p-16">
            <div className="lg:col-span-5">
              <p className="eyebrow text-white/70">La comunidad</p>
              <h2 className="mt-4 text-fluid-h2 font-extrabold text-white">
                Lo que pasa hoy en tu universidad.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65">
                Franky no es solo un buscador de carreras. Es donde tu campus
                habla: dudas de examen, fiestas, cotilleos, avisos que no salen
                en ningún tablón oficial. Y la gente que te cruzas en la biblioteca.
              </p>

              {community && community.threads_30d > 0 && (
                <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                  {[
                    { v: community.students, l: "estudiantes" },
                    { v: community.active_universities, l: "campus activos" },
                    { v: community.threads_30d, l: "hilos en 30 días" },
                  ].map((s) => (
                    <div key={s.l}>
                      <dt className="text-[11px] uppercase tracking-wider text-white/65">{s.l}</dt>
                      <dd className="mt-1 font-heading text-2xl font-extrabold tabular">
                        <CountUp value={s.v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
              <SpotlightCard asChild>
                <Link
                  href="/fomo"
                  className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-[border-color,background-color] duration-300 hover:border-white/20 hover:bg-white/[0.07]"
                  style={{ ["--spot-color" as string]: "rgba(255,255,255,0.08)" }}
                >
                  <Flame className="h-6 w-6 text-violet-light" />
                  <h3 className="mt-6 font-heading text-xl font-bold">FOMO</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    El muro de tu campus. Escrito por gente de tu universidad, hoy.
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-white">
                    Ver los últimos hilos <ArrowRight className="h-4 w-4 arrow-nudge" />
                  </span>
                </Link>
              </SpotlightCard>
              <SpotlightCard asChild>
                <Link
                  href="/crush"
                  className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-[border-color,background-color] duration-300 hover:border-white/20 hover:bg-white/[0.07]"
                  style={{ ["--spot-color" as string]: "rgba(232,121,249,0.10)" }}
                >
                  <Heart className="h-6 w-6 text-fuchsia" />
                  <h3 className="mt-6 font-heading text-xl font-bold">Crush</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    Si os dais like los dos, se intercambian los Instagram. Solo cuando ambos aceptáis.
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-white">
                    Cómo funciona <ArrowRight className="h-4 w-4 arrow-nudge" />
                  </span>
                </Link>
              </SpotlightCard>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============ PISO + ROOMIE ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Antes de septiembre</p>
          <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
            ¿Te mudas a la ciudad de tu uni?
          </h2>
          <p className="mt-3 text-text-muted">
            Las dos cosas que hay que resolver antes de que empiece el curso.
          </p>
        </Reveal>

        <Reveal stagger className="mt-10 grid gap-5 md:grid-cols-2">
          {[
            {
              href: "/alojamiento",
              icon: Home,
              title: "Buscar piso",
              desc: "Pisos compartidos, estudios, residencias y colegios mayores cerca de tu campus. Filtra por precio y compara los que te gusten.",
              cta: "Ver pisos disponibles",
              note: null,
            },
            {
              href: "/roomie-match",
              icon: Users,
              title: "Buscar compañero de piso",
              desc: "RoomieMatch te empareja con gente de tu ciudad según horarios, presupuesto y manías. Antes de firmar, no después.",
              cta: "Encontrar mi roomie",
              note: "Necesita cuenta (es gratis)",
            },
          ].map((c, i) => (
            <RevealItem key={c.href} index={i} asChild>
              <SpotlightCard asChild>
                <Link
                  href={c.href}
                  className="group hover-lift flex flex-col rounded-3xl border border-border bg-bg-primary p-7 shadow-card hover:border-text-primary/15"
                >
                  <c.icon className="h-6 w-6 text-violet" />
                  <h3 className="mt-6 font-heading text-xl font-bold text-text-primary">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{c.desc}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                    {c.cta} <ArrowRight className="h-4 w-4 arrow-nudge" />
                  </span>
                  {c.note && <span className="mt-2 text-xs text-text-muted">{c.note}</span>}
                </Link>
              </SpotlightCard>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {/* ============ TODO LO QUE HAY ============ */}
      <section className="border-y border-border-light bg-bg-secondary/60" style={DIFERIR_PINTADO}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow">Todo en un sitio</p>
              <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
                Desde elegir carrera hasta el último plan del curso.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-text-muted">
              Doce herramientas que cubren cada etapa. Las de catálogo se consultan sin cuenta.
            </p>
          </Reveal>

          <Reveal stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <RevealItem key={f.href} index={i} asChild>
                <SpotlightCard asChild>
                  <Link
                    href={f.href}
                    className="group hover-lift flex min-h-[188px] flex-col rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15"
                  >
                    <div className="flex items-center justify-between">
                      <f.icon className="h-5 w-5 text-text-primary transition-colors duration-200 group-hover:text-violet" />
                      <ArrowUpRight className="h-4 w-4 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:-translate-y-px group-hover:translate-x-px" />
                    </div>
                    <h3 className="mt-5 font-heading text-[15px] font-bold text-text-primary">{f.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{f.desc}</p>
                    {"requiresAccount" in f && f.requiresAccount && (
                      <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Requiere cuenta
                      </span>
                    )}
                  </Link>
                </SpotlightCard>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* In-content ad slot. Renders nothing until consent + AdSense client are set. */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AdSlot
          slot="home-features-mid"
          className="my-4 min-h-[100px] flex items-center justify-center"
          style={{ minHeight: 100 }}
        />
      </div>

      {/* ============ NOTAS MÁS ALTAS ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24" style={DIFERIR_PINTADO}>
        <Reveal className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Referencia</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              Las notas de corte más altas
            </h2>
            <p className="mt-2 text-text-muted">
              Consulta el curso y la convocatoria de cada nota en su ficha.
            </p>
          </div>
          <Link
            href="/notas-corte"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-text-primary sm:inline-flex"
          >
            <span className="link-underline">Ver todas</span>
            <ArrowRight className="h-4 w-4 arrow-nudge" />
          </Link>
        </Reveal>

        <Reveal stagger className="mt-8 overflow-hidden rounded-2xl border border-border">
          {topCareers?.map((career, i) => {
            const uni = career.universities as unknown as { name?: string; short_name?: string } | null;
            return (
              <RevealItem key={career.id ?? i} index={i} variant="fade" asChild>
                <Link
                  href={`/carreras/${career.slug || career.id}`}
                  className="group flex items-center gap-4 border-b border-border-light bg-bg-primary px-5 py-4 transition-colors duration-200 last:border-b-0 hover:bg-bg-secondary"
                >
                  <span className="w-6 font-heading text-sm font-bold text-text-muted tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-text-primary transition-colors group-hover:text-violet">
                      {career.name}
                    </h3>
                    <p className="truncate text-sm text-text-muted">{uni?.name || uni?.short_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-lg font-bold text-text-primary tabular">
                      {formatAcademicScore(career.cut_off_score)}
                    </p>
                    <p className="text-[11px] text-text-muted">{cutOffCourse(career.cut_off_year)}</p>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-text-muted arrow-nudge sm:block" />
                </Link>
              </RevealItem>
            );
          })}
        </Reveal>

        <Link
          href="/notas-corte"
          className="mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold text-text-primary sm:hidden"
        >
          Ver todas las carreras <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* ============ FAQ ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 lg:pb-24" style={DIFERIR_PINTADO}>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <p className="eyebrow">Preguntas frecuentes</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              Lo que suele preguntar la gente antes de entrar.
            </h2>
            <p className="mt-3 text-sm text-text-muted">
              ¿Otra duda?{" "}
              <Link href="/ayuda" className="link-underline font-medium text-text-primary">
                Centro de ayuda
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
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
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
      <section className="border-t border-border-light bg-bg-secondary/60" style={DIFERIR_PINTADO}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <Reveal variant="blur" className="mx-auto max-w-2xl text-center">
            <h2 className="text-fluid-h1 font-extrabold text-text-primary">
              Empieza hoy. Es gratis.
            </h2>
            <p className="mt-4 text-fluid-lead text-text-muted">
              Crea tu cuenta en un minuto y entra en la comunidad de tu universidad.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Magnetic>
                <Link href="/registro" className={cn(buttonVariants({ size: "lg" }), "btn-shine")}>
                  Crear cuenta gratis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Magnetic>
              <Link href="/universidades" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Explorar sin cuenta
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
