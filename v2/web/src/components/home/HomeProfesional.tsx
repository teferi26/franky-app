import Link from "next/link";
import {
  Home as HomeIcon,
  CalendarCheck,
  FileText,
  Wallet,
  Building2,
  ArrowRight,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, SpotlightCard, Magnetic } from "@/components/motion";
import { cn } from "@/lib/utils";

// ─── Home de quien NO es estudiante ───────────────────────────────────────
// Un propietario entra a franky.es y hasta ahora se encontraba la home social
// de estudiante, que empieza exigiéndole "dinos en qué uni estudias". No
// estudia: publica pisos. Esta pantalla le da lo suyo (sus pisos, sus visitas,
// sus contratos, su facturación) y ni menciona universidad, carrera, becas,
// notas de corte, test vocacional, RoomieMatch ni Crush.
//
// Mismo criterio para un gestor de universidad: su sitio es el panel de su
// campus, no el feed de estudiantes.
//
// Diseño v3: cabecera tipográfica grande, un solo CTA principal (con imán) y
// una rejilla de tarjetas blancas con elevación y foco de luz.

type Props = {
  /** profiles.role: 'propietario' o 'university_admin'. */
  role: string;
  fullName: string | null;
};

type Card = {
  href: string;
  title: string;
  desc: string;
  icon: React.ElementType;
};

const PROPIETARIO_CARDS: Card[] = [
  {
    href: "/propietario/dashboard",
    title: "Mis pisos",
    desc: "Tus anuncios, cómo van de visitas y quién ha mostrado interés.",
    icon: HomeIcon,
  },
  {
    href: "/propietario/dashboard/visitas",
    title: "Mis visitas",
    desc: "Las citas que tienes acordadas y tu horario disponible.",
    icon: CalendarCheck,
  },
  {
    href: "/propietario/dashboard/contratos",
    title: "Contratos",
    desc: "Contratos de alquiler e inquilinos de cada piso.",
    icon: FileText,
  },
  {
    href: "/propietario/dashboard/pagos",
    title: "Cobros y facturación",
    desc: "Tus cobros, tu cuenta de pagos y tus facturas.",
    icon: Wallet,
  },
];

const UNIVERSIDAD_CARDS: Card[] = [
  {
    href: "/uni",
    title: "Panel de mi universidad",
    desc: "La ficha de tu campus y las métricas de tus estudiantes.",
    icon: Building2,
  },
  {
    href: "/colaboradores",
    title: "Colaboración con Franky",
    desc: "Qué incluye el acuerdo y cómo sacarle partido.",
    icon: FileText,
  },
];

export default function HomeProfesional({ role, fullName }: Props) {
  const esPropietario = role === "propietario";
  const cards = esPropietario ? PROPIETARIO_CARDS : UNIVERSIDAD_CARDS;
  const nombre = fullName?.trim().split(/\s+/)[0] ?? "";

  return (
    <main className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-24">
        <header>
          <p className="eyebrow animate-slide-up">
            {esPropietario ? "Tu espacio de propietario" : "Tu espacio de gestión"}
          </p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
            {nombre ? (
              <>
                Hola, <span className="text-violet">{nombre}</span>.
              </>
            ) : (
              "Hola."
            )}
          </h1>
          <p className="mt-3 max-w-xl text-fluid-lead text-text-muted animate-slide-up [animation-delay:120ms]">
            {esPropietario
              ? "Este es tu espacio de propietario: tus pisos, tus visitas y tus cobros."
              : "Este es tu espacio de gestión: la ficha de tu universidad y sus métricas."}
          </p>

          {esPropietario && (
            <div className="mt-7 animate-slide-up [animation-delay:180ms]">
              <Magnetic>
                <Link
                  href="/negocio/registro?type=housing"
                  className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}
                >
                  <Plus className="h-4 w-4" />
                  Publicar un piso
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </Magnetic>
            </div>
          )}
        </header>

        <Reveal stagger className="mt-10 grid gap-4 sm:grid-cols-2">
          {cards.map(({ href, title, desc, icon: Icon }, i) => (
            <RevealItem key={href} index={i} asChild>
              <SpotlightCard asChild>
                <Link
                  href={href}
                  className="group hover-lift flex min-h-[176px] flex-col rounded-2xl border border-border bg-bg-primary p-6 shadow-card hover:border-text-primary/15"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-text-primary transition-colors duration-200 group-hover:text-violet" />
                    <ArrowUpRight className="h-4 w-4 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:-translate-y-px group-hover:translate-x-px" />
                  </div>
                  <span className="mt-6 font-heading text-lg font-bold text-text-primary">
                    {title}
                  </span>
                  <span className="mt-1.5 text-sm leading-relaxed text-text-muted">
                    {desc}
                  </span>
                </Link>
              </SpotlightCard>
            </RevealItem>
          ))}
        </Reveal>

        <Reveal className="mt-10 flex flex-col gap-3 border-t border-border-light pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            {esPropietario
              ? "¿Quieres ver cómo se anuncia la competencia en tu ciudad?"
              : "¿Quieres ver Franky como lo ve un estudiante de tu campus?"}
          </p>
          <Link
            href={esPropietario ? "/alojamiento" : "/universidades"}
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-text-primary"
          >
            <span className="link-underline">
              {esPropietario ? "Ver el catálogo de pisos" : "Ver el catálogo de universidades"}
            </span>
            <ArrowRight className="h-4 w-4 arrow-nudge" />
          </Link>
        </Reveal>
      </div>
    </main>
  );
}
