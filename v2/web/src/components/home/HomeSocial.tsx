import { Suspense } from "react";
import Link from "next/link";
import {
  GraduationCap, ArrowRight, ArrowUpRight, CalendarDays, Home, Users, Flame,
} from "lucide-react";
import { createServerSupabase, createPublicSupabase } from "@/lib/supabase-server";
import HomeFeedLazy from "@/components/home/HomeFeedLazy";
import HomeSidebarLeft from "@/components/home/HomeSidebarLeft";
import HomeSidebarRight from "@/components/home/HomeSidebarRight";
import HomeProfesional from "@/components/home/HomeProfesional";
import { isNonStudentRole } from "@/lib/roles";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { SpotlightCard, Magnetic } from "@/components/motion";
import { cn } from "@/lib/utils";

// ─── Home de quien YA tiene cuenta ────────────────────────────────────────
// franky.es deja de ser una landing de marketing en cuanto hay sesión: pasa a
// ser la red social (stories, feed del campus, tu perfil, tu gente, planes),
// igual que la app. La landing sigue intacta para visitantes y para Googlebot,
// que entran sin sesión: el SEO no se toca.
//
// Tres estados, según lo "universitario" que sea la cuenta:
//   1. SIN universidad  -> no puede haber feed de campus (el RPC lo rechaza):
//      se enseña un paso único y grande para elegirla.
//   2. CON universidad, email de estudiante SIN verificar -> experiencia
//      completa, con una banda discreta para verificar y ganar el distintivo.
//   3. VERIFICADO -> todo, con su distintivo de estudiante.
//
// La distinción de "universitario de verdad" es profiles.student_email_verified
// (correo de la uni confirmado, migración 025), no basta con haber elegido una
// universidad en el onboarding: elegirla es decir dónde estudias, verificarla
// es demostrarlo.
//
// Diseño v3 "Editorial": la cabecera es tipográfica (saludo grande, sin cajas
// de color), las cuatro acciones rápidas son tarjetas blancas con elevación y
// foco de luz, y todo lo que está por encima del pliegue entra con animaciones
// CSS puras (animate-slide-up / animate-list-in) para verse aunque el JS tarde.

/**
 * Las cuatro cosas que se vienen a hacer a Franky, en la cabecera y siempre las
 * mismas. No son "más contenido": son la respuesta a "¿y ahora qué hago?", que
 * es lo que faltaba cuando la página empezaba directamente con el feed y dos
 * columnas de datos.
 */
const ACCIONES: { href: string; label: string; hint: string; icon: React.ElementType }[] = [
  { href: "/eventos", label: "Planes", hint: "Fiestas y quedadas", icon: CalendarDays },
  { href: "/alojamiento", label: "Pisos", hint: "Cerca de tu campus", icon: Home },
  { href: "/roomie-match", label: "Roomie", hint: "Con quién vivir", icon: Users },
  { href: "/crush", label: "Crush", hint: "Gente de tu uni", icon: Flame },
];

// Silueta de una columna lateral mientras sus consultas terminan. Ver el
// porqué en los <Suspense> de abajo.
function ColumnaCargando({ alturas }: { alturas: string[] }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {alturas.map((h) => (
        <Skeleton key={h} className={`w-full ${h} rounded-2xl`} />
      ))}
    </div>
  );
}

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  university_id: string | null;
  career: string | null;
  city: string | null;
  student_email_verified: boolean | null;
  role: string | null;
};

/**
 * Pantalla de un solo paso (sin universidad, o universidad huérfana). Misma
 * composición editorial que el CTA final de la landing: icono suelto, título
 * grande y un único botón.
 */
function PasoUnico({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <div className="relative min-h-[70vh] overflow-hidden bg-bg-primary">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl px-4 py-20 text-center sm:py-28">
        <GraduationCap className="mx-auto h-8 w-8 text-violet animate-slide-up" />
        <p className="eyebrow mt-6 animate-slide-up [animation-delay:60ms]">Un momento y listo</p>
        <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary animate-slide-up [animation-delay:120ms]">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-fluid-lead text-text-muted animate-slide-up [animation-delay:180ms]">
          {description}
        </p>
        <div className="mt-8 animate-slide-up [animation-delay:240ms]">
          <Magnetic>
            <Link
              href="/onboarding"
              className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}
            >
              {cta}
              <ArrowRight className="h-4 w-4 arrow-nudge" />
            </Link>
          </Magnetic>
        </div>
      </div>
    </div>
  );
}

export default async function HomeSocial({ userId }: { userId: string }) {
  const supabase = await createServerSupabase();

  const { data: prof } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, university_id, career, city, student_email_verified, role")
    .eq("id", userId)
    .maybeSingle();

  const profile = (prof as Profile | null) ?? null;

  // Cuentas que no son de estudiante (propietario, gestor de universidad): su
  // home es la suya. Antes caían en el bloque de abajo y lo primero que veían
  // al entrar era "dinos en qué uni estudias", que a un propietario no le dice
  // nada. Va ANTES que cualquier otra comprobación a propósito.
  if (profile && isNonStudentRole(profile.role)) {
    return <HomeProfesional role={profile.role as string} fullName={profile.full_name} />;
  }

  // Sin universidad no hay campus del que leer: se pide antes que nada.
  if (!profile?.university_id) {
    return (
      <PasoUnico
        title="Dinos en qué uni estudias"
        description="Franky se organiza por campus: el FOMO, los planes y la gente que te encontrarás dependen de tu universidad. Es un momento y ya lo tienes todo."
        cta="Elegir mi universidad"
      />
    );
  }

  // Datos públicos de la universidad para el feed (nombre y slug).
  const anon = createPublicSupabase();
  const { data: uni } = await anon
    .from("universities")
    .select("id, name, slug, city")
    .eq("id", profile.university_id)
    .maybeSingle();

  const university = uni as { id: string; name: string; slug: string; city: string | null } | null;

  // Si la universidad del perfil no resuelve (dato huérfano), no dejamos la
  // home en blanco: se trata como "sin universidad" y se ofrece corregirla.
  if (!university) {
    return (
      <PasoUnico
        title="No encontramos tu universidad"
        description="Puede que haya cambiado de nombre en el catálogo. Vuelve a elegirla y listo."
        cta="Actualizar mi universidad"
      />
    );
  }

  const verified = profile.student_email_verified === true;
  // Solo el nombre de pila: "Hola, María" suena a persona; "Hola, María
  // Fernández Ruiz" suena a carta del banco.
  const nombre = (profile.full_name ?? "").trim().split(/\s+/)[0] || "";

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 lg:pt-12 lg:pb-16">
        {/* ── Cabecera ─────────────────────────────────────────────────────
            Antes se entraba directamente a tres columnas llenas de datos y no
            había forma de saber qué hacer aquí. Esta banda le pone sujeto a la
            página (tú, tu campus, hoy) y deja a la vista las cuatro cosas que
            de verdad se vienen a hacer. El empujón a verificar se cuela como
            una frase dentro del subtítulo en lugar de ocupar su propia caja:
            era un aviso más compitiendo por atención. */}
        <header className="mb-8 lg:mb-10">
          <p className="eyebrow animate-slide-up">Hoy en {university.name}</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
            {nombre ? (
              <>
                Hola, <span className="text-violet">{nombre}</span>.
              </>
            ) : (
              "Hola."
            )}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted animate-slide-up [animation-delay:120ms]">
            Lo que se cuece hoy en tu campus, tu gente y tus próximos planes.
            {!verified && (
              <>
                {" "}
                <Link
                  href="/perfil/verificar-estudiante"
                  className="link-underline font-semibold text-text-primary"
                >
                  Verifica tu correo de la uni
                </Link>{" "}
                y llévate el distintivo de estudiante.
              </>
            )}
          </p>

          {/* Acciones rápidas: tarjetas blancas con elevación y foco de luz.
              Entran en cascada con CSS puro (sin esperar a hidratar). */}
          <nav
            aria-label="Qué puedes hacer"
            className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {ACCIONES.map(({ href, label, hint, icon: Icon }, i) => (
              <SpotlightCard key={href} asChild>
                <Link
                  href={href}
                  className="group hover-lift animate-list-in flex flex-col rounded-2xl border border-border bg-bg-primary p-4 shadow-card hover:border-text-primary/15 sm:p-5"
                  style={{ ["--i" as string]: i + 3 }}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-text-primary transition-colors duration-200 group-hover:text-violet" />
                    <ArrowUpRight className="h-4 w-4 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:-translate-y-px group-hover:translate-x-px" />
                  </div>
                  <span className="mt-4 font-heading text-[15px] font-bold text-text-primary">{label}</span>
                  <span className="mt-0.5 text-[12.5px] text-text-muted">{hint}</span>
                </Link>
              </SpotlightCard>
            ))}
          </nav>
        </header>

        {/* Tres columnas en escritorio; en móvil solo el feed, porque la app
            nativa cubre ese caso mucho mejor y aquí sobra cromo. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              {/* Streaming: las dos columnas laterales suman una docena de
                  consultas a Supabase y, sin este límite, el servidor no podía
                  enviar NADA del HTML (ni la cabecera ni el feed) hasta que la
                  más lenta terminaba. Con Suspense la página se manda ya y cada
                  columna llega después, en su hueco. */}
              <Suspense fallback={<ColumnaCargando alturas={["h-56", "h-40"]} />}>
                <HomeSidebarLeft
                  userId={userId}
                  fullName={profile.full_name}
                  avatarUrl={profile.avatar_url}
                  career={profile.career}
                  universityName={university.name}
                  verified={verified}
                />
              </Suspense>
            </div>
          </aside>

          <section className="min-w-0 animate-fade-in [animation-delay:200ms]">
            <HomeFeedLazy
              universityId={university.id}
              universityName={university.name}
              universitySlug={university.slug}
            />
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <Suspense fallback={<ColumnaCargando alturas={["h-64", "h-56", "h-48"]} />}>
                <HomeSidebarRight
                  userId={userId}
                  universityId={university.id}
                  city={university.city ?? profile.city}
                />
              </Suspense>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
