import type { Metadata } from "next";
import Link from "next/link";
import {
  Beer, Home, Users, BarChart3, Shield, ArrowRight, Check, Building2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, SpotlightCard, CountUp, Magnetic } from "@/components/motion";
import { OWNER_PLAN } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Negocios y locales",
  description:
    "Publica tu local, piso o cartera de pisos en Franky y llega a miles de universitarios en toda España. Plan por ficha desde 9,99 €/mes, locales también por 100 €/año, o Plan Inmobiliarias (hasta 40 pisos) por 80 €/mes. Consulta las condiciones de cada plan antes de contratar.",
  alternates: { canonical: "/negocio" },
};

const benefits = [
  {
    icon: Users,
    title: "Llega a miles de universitarios",
    desc: "Estudiantes activos en cada ciudad universitaria descubren tu negocio cuando buscan dónde ir o dónde vivir.",
  },
  {
    icon: BarChart3,
    title: "Visibilidad geolocalizada",
    desc: "Apareces en el mapa, en la lista de la ciudad y en los filtros por categoría. Sin competir con plataformas saturadas.",
  },
  {
    icon: Shield,
    title: "Sin permanencia",
    desc: "9,99 €/mes. Cancela cuando quieras desde tu panel. Si dejas de pagar, simplemente dejas de aparecer.",
  },
];

const includes = [
  "Ficha completa con fotos, horarios y contacto",
  "Posición en el mapa interactivo",
  "Filtros por categoría y ciudad",
  "Enlace directo a Google Maps, web y teléfono",
  "Panel para ver tu ficha y gestionar tu suscripción",
  "Soporte por email",
];

// Cifras que resumen la oferta. Las de cuota salen de OWNER_PLAN para que
// nunca se desalineen con lo que cobra Stripe.
const stats = [
  { value: 9.99, decimals: 2, suffix: " €", label: "al mes por ficha, sin permanencia" },
  { value: OWNER_PLAN.maxListings, decimals: 0, suffix: "", label: "pisos con el Plan Inmobiliarias" },
  { value: OWNER_PLAN.monthly, decimals: 0, suffix: " €", label: "al mes con el Plan Inmobiliarias" },
  { value: OWNER_PLAN.introDiscountPct, decimals: 0, suffix: " %", label: "de descuento en el primer trimestre" },
];

// Comparativa: a partir de cuántos pisos compensa la cuota única.
const comparison = [
  { pisos: "1 piso", porFicha: "9,99 €/mes", plan: `${OWNER_PLAN.monthly} €/mes`, gana: "ficha" },
  { pisos: "5 pisos", porFicha: "49,95 €/mes", plan: `${OWNER_PLAN.monthly} €/mes`, gana: "ficha" },
  { pisos: "10 pisos", porFicha: "99,90 €/mes", plan: `${OWNER_PLAN.monthly} €/mes`, gana: "plan" },
  { pisos: `${OWNER_PLAN.maxListings} pisos`, porFicha: "399,60 €/mes", plan: `${OWNER_PLAN.monthly} €/mes`, gana: "plan" },
];

export default function NegocioLanding() {
  return (
    <div className="bg-bg-primary">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-b border-border-light">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-14 lg:pt-24 lg:pb-20">
          <div className="max-w-3xl">
            <p className="eyebrow animate-slide-up">Para negocios y propietarios</p>
            <h1 className="mt-4 text-fluid-display font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
              Pon tu local o piso delante de{" "}
              <span className="text-violet">miles de universitarios</span>.
            </h1>
            <p className="mt-6 max-w-xl text-fluid-lead text-text-secondary animate-slide-up [animation-delay:120ms]">
              Franky es la app que están usando los estudiantes para descubrir su ciudad
              universitaria. Por <strong className="text-text-primary">9,99 €/mes</strong> tu negocio
              aparece en la sección de zonas de ocio o de alojamiento. Para locales también puedes elegir <strong>100 €/año</strong>.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center animate-slide-up [animation-delay:180ms]">
              <Magnetic>
                <Link
                  href="/negocio/alta"
                  className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}
                >
                  Crear cuenta de propietario
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </Magnetic>
              <Link
                href="/login?next=%2Fnegocio%2Fregistro"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Ya tengo cuenta: publicar ficha
              </Link>
              <Link
                href="/negocio/dashboard"
                className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "group")}
              >
                Ya soy cliente
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
            </div>

            <p className="mt-5 max-w-xl text-sm text-text-muted animate-slide-up [animation-delay:240ms]">
              Para publicar hace falta una cuenta: se crea en un minuto, sin
              universidad y sin onboarding de estudiante. Elige el plan que se ajuste a tus pisos.
            </p>
          </div>
        </div>
      </section>

      {/* ============ FRANKY PRO ============ */}
      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <Link
          href="/pro"
          className="group flex flex-col gap-4 rounded-[2rem] bg-bg-dark px-6 py-7 text-white transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between sm:px-10"
        >
          <div className="max-w-2xl">
            <p className="eyebrow text-white/60">Nuevo · Franky Pro</p>
            <p className="mt-2 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
              La app para llevar tu negocio, con los estudiantes dentro.
            </p>
            <p className="mt-2 text-white/70">
              Agenda, reservas, sala, puerta, socios, pisos y asociaciones: una app para cada sector, sin comisión por cliente. Pruébala por dentro.
            </p>
          </div>
          <span className={cn(buttonVariants({ variant: "onBrand", size: "lg" }), "shrink-0")}>
            Ver las demos <ArrowRight className="h-4 w-4 arrow-nudge" />
          </span>
        </Link>
      </section>

      {/* ============ CIFRAS ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <Reveal stagger className="grid grid-cols-2 gap-y-10 md:grid-cols-4">
          {stats.map((s, i) => (
            <RevealItem
              key={s.label}
              index={i}
              className="md:border-l md:border-border-light md:pl-8 md:first:border-l-0 md:first:pl-0"
            >
              <p className="font-heading text-4xl font-extrabold tracking-tight text-text-primary tabular lg:text-5xl">
                <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm text-text-muted">{s.label}</p>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {/* ============ DOS CAMINOS ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 lg:pb-24">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Qué puedes publicar</p>
          <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
            Un local, un piso o toda tu cartera.
          </h2>
          <p className="mt-3 text-text-muted">
            El formulario de alta pide una cuenta: primero se crea (un minuto) y después se
            publica la ficha. Quien ya la tiene entra directo.
          </p>
        </Reveal>

        <Reveal stagger className="mt-10 grid gap-5 md:grid-cols-2">
          <RevealItem index={0} asChild>
            <SpotlightCard className="hover-lift flex flex-col rounded-3xl border border-border bg-bg-primary p-7 shadow-card hover:border-text-primary/15">
              <Beer className="h-6 w-6 text-violet" strokeWidth={1.75} />
              <h3 className="mt-6 font-heading text-xl font-bold text-text-primary">Zonas de ocio</h3>
              <p className="mt-1 text-sm text-text-muted">Bares, restaurantes, discotecas, cafeterías…</p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Aparece en la sección de ocio de tu ciudad universitaria. Estudiantes
                filtran por categoría, precio y zona, y descubren tu local con foto,
                horarios y teléfono. Elige <strong>9,99 €/mes</strong> o <strong>100 €/año</strong> por local, IVA incluido.
              </p>
              {/* El formulario de /negocio/registro exige sesión (crea la ficha a
                  nombre de una cuenta). Mandar ahí directamente al empresario que
                  llega de un anuncio le estrellaba contra el login de estudiante
                  sin explicación: el CTA lleva primero al alta de propietario, y
                  debajo queda el atajo para quien ya tiene cuenta. */}
              <Link
                href="/negocio/alta"
                className={cn(buttonVariants({ variant: "dark" }), "group mt-6 w-full")}
              >
                Crear cuenta y registrar mi local
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
              <p className="mt-3 text-center text-xs text-text-muted">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href="/login?next=%2Fnegocio%2Fregistro%3Ftype%3Dleisure"
                  className="link-underline font-semibold text-text-primary"
                >
                  Inicia sesión y publica tu ficha
                </Link>
              </p>
            </SpotlightCard>
          </RevealItem>

          <RevealItem index={1} asChild>
            <SpotlightCard className="hover-lift flex flex-col rounded-3xl border border-border bg-bg-primary p-7 shadow-card hover:border-text-primary/15">
              <Home className="h-6 w-6 text-violet" strokeWidth={1.75} />
              <h3 className="mt-6 font-heading text-xl font-bold text-text-primary">Propietario</h3>
              <p className="mt-1 text-sm text-text-muted">Pisos, habitaciones, residencias…</p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                ¿Tienes un piso? Publícalo con la tarifa individual de 9,99 €/mes. Aparece en la sección de
                alojamiento con galería, precio, ubicación y filtros, y los estudiantes
                te contactan directamente.
              </p>
              <Link
                href="/negocio/alta"
                className={cn(buttonVariants({ variant: "dark" }), "group mt-6 w-full")}
              >
                Crear cuenta y registrar mi piso
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
              <p className="mt-3 text-center text-xs text-text-muted">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href="/login?next=%2Fnegocio%2Fregistro%3Ftype%3Dhousing"
                  className="link-underline font-semibold text-text-primary"
                >
                  Inicia sesión y publica tu piso
                </Link>
              </p>
            </SpotlightCard>
          </RevealItem>
        </Reveal>
      </section>

      {/* ============ PRECIOS ============ */}
      <section className="border-y border-border-light bg-bg-secondary/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Precios</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              Un precio por ficha, o una cuota para toda la cartera.
            </h2>
            <p className="mt-3 text-text-muted">
              Sin permanencia en los dos casos. IVA incluido. Cancela cuando quieras desde tu panel.
            </p>
            <p className="mt-3 font-semibold text-text-primary">Para pisos: tarifa por anuncio o Plan Inmobiliarias. Revisa las condiciones y el importe final antes de contratar.</p>
          </Reveal>

          <Reveal stagger className="mt-10 grid gap-5 lg:grid-cols-2">
            {/* Plan por ficha */}
            <RevealItem index={0} className="flex flex-col rounded-3xl border border-border bg-bg-primary p-7 shadow-card sm:p-8">
              <p className="eyebrow">Plan por ficha</p>
              <p className="mt-4 font-heading text-5xl font-extrabold tracking-tight text-text-primary tabular">
                9,99 €<span className="ml-1 text-base font-semibold text-text-muted">/mes</span>
              </p>
              <p className="mt-2 text-sm text-text-muted">por ficha · IVA incluido</p><p className="mt-2 text-sm">Solo zonas de ocio y locales: también <strong>100 €/año</strong>. Ahorras 19,88 € al año. Cancela la renovación cuando quieras.</p>
              <ul className="mt-6 space-y-2.5 border-t border-border-light pt-6">
                {includes.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={2.25} />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  href="/negocio/alta"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group w-full")}
                >
                  Crear mi cuenta y empezar
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
                <p className="mt-3 text-center text-xs text-text-muted">
                  ¿Inmobiliaria con varios pisos? Plan Inmobiliarias: {OWNER_PLAN.monthly} €/mes.
                </p>
              </div>
            </RevealItem>

            {/* Plan Inmobiliarias (destacado con borde oscuro, no de color) */}
            <RevealItem index={1} className="relative flex flex-col rounded-3xl border-2 border-text-primary bg-bg-primary p-7 shadow-card-hover sm:p-8">
              <span className="absolute right-6 top-6 rounded-full bg-text-primary px-2.5 py-0.5 text-[11px] font-semibold text-bg-primary">
                0 € hoy
              </span>
              <p className="eyebrow">Plan Inmobiliarias</p>
              <p className="mt-4 font-heading text-5xl font-extrabold tracking-tight text-text-primary tabular">
                {OWNER_PLAN.monthly} €<span className="ml-1 text-base font-semibold text-text-muted">/mes</span>
              </p>
              <p className="mt-2 text-sm text-text-muted">
                hasta {OWNER_PLAN.maxListings} pisos · sin permanencia
              </p>
              <p className="mt-6 border-t border-border-light pt-6 text-sm leading-relaxed text-text-secondary">
                Para inmobiliarias y gestores con varios pisos. Publica hasta{" "}
                <strong className="text-text-primary">{OWNER_PLAN.maxListings} pisos</strong> con una sola cuota,
                sin pagar 9,99 € por cada anuncio y sin pasar por la pasarela de pago al subirlos.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Consulta la prueba disponible para tu cuenta y consigue un{" "}
                {OWNER_PLAN.introDiscountPct}% de descuento si pagas los {OWNER_PLAN.introMonths} primeros
                meses de golpe ({OWNER_PLAN.introQuarterTotal} €), después {OWNER_PLAN.monthly} €/mes.
              </p>
              <div className="mt-auto pt-8">
                <Link
                  href="/negocio/propietario"
                  className={cn(buttonVariants({ variant: "dark", size: "lg" }), "group w-full")}
                >
                  Empezar gratis
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </div>
            </RevealItem>
          </Reveal>

          {/* Comparativa: cuándo compensa el Plan Inmobiliarias */}
          <Reveal className="mt-12 max-w-3xl">
            <h3 className="font-heading text-xl font-bold text-text-primary">¿Cuál me conviene?</h3>
            <p className="mt-1 text-sm text-text-muted">
              El Plan Inmobiliarias ({OWNER_PLAN.monthly} €/mes) sale a cuenta a partir de 9 pisos:
              por debajo es más barato pagar 9,99 € por ficha.
            </p>
            <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-bg-primary">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-muted">
                    <th className="px-4 py-3 font-semibold">Nº de pisos</th>
                    <th className="px-4 py-3 font-semibold">Por ficha (9,99 €)</th>
                    <th className="px-4 py-3 font-semibold">Plan Inmobiliarias</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.pisos} className="border-b border-border-light last:border-b-0 hover:bg-bg-secondary">
                      <td className="px-4 py-3 font-medium text-text-primary">{row.pisos}</td>
                      <td className={cn("px-4 py-3 tabular", row.gana === "ficha" ? "font-semibold text-text-primary" : "text-text-muted")}>
                        {row.porFicha}
                      </td>
                      <td className={cn("px-4 py-3 tabular", row.gana === "plan" ? "font-semibold text-text-primary" : "text-text-muted")}>
                        {row.plan}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ POR QUÉ FRANKY ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Por qué Franky</p>
          <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
            Donde los estudiantes ya están mirando.
          </h2>
        </Reveal>
        <Reveal stagger className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
          {benefits.map((b, i) => (
            <RevealItem key={b.title} index={i} className="md:border-l md:border-border-light md:pl-6 md:first:border-l-0 md:first:pl-0">
              <b.icon className="h-6 w-6 text-text-primary" strokeWidth={1.75} />
              <h3 className="mt-5 font-heading text-lg font-bold text-text-primary">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{b.desc}</p>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {/* ============ CTA FINAL (único bloque oscuro) ============ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 lg:pb-24">
        <Reveal variant="fade" className="relative overflow-hidden rounded-[2rem] bg-bg-dark text-white">
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.12]" aria-hidden="true" />
          <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-12 lg:items-center lg:p-16">
            <div className="lg:col-span-7">
              <p className="eyebrow text-white/50">Empieza hoy</p>
              <h2 className="mt-4 text-fluid-h2 font-extrabold text-white">
                Tu ficha, visible para los estudiantes de tu ciudad esta misma semana.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65">
                Cuenta en un minuto, ficha con fotos y contacto, y pago seguro con Stripe.
                Si dejas de pagar, simplemente dejas de aparecer.
              </p>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/60">
                <li className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Pagos seguros con Stripe
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Cancela cuando quieras
                </li>
                <li className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Consulta las condiciones del Plan Inmobiliarias
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-3 lg:col-span-5 lg:items-end">
              <Link
                href="/negocio/alta"
                className={cn(buttonVariants({ variant: "onBrand", size: "xl" }), "group w-full sm:w-auto")}
              >
                Crear mi cuenta y empezar
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
              <p className="text-xs text-white/55 lg:text-right">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href="/login?next=%2Fnegocio%2Fregistro"
                  className="link-underline font-semibold text-white"
                >
                  Inicia sesión y publica tu ficha
                </Link>
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
