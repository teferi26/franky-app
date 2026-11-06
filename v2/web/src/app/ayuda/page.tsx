import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Mail, ArrowRight, ShieldCheck, Trash2, KeyRound, Flag, Lightbulb, Plus } from "lucide-react";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import { Reveal } from "@/components/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Centro de ayuda. Portado de la app movil (app/ayuda.tsx), donde ya existia.
 *
 * En web hace ademas dos cosas que en la app no puede hacer: es indexable (la
 * gente busca "como borrar mi cuenta de X" en Google, no dentro de la app) y
 * reduce el correo que llega a contacto@, que hoy es el unico canal de soporte.
 */
export const dynamic = "force-static";

type Section = {
  icon: typeof KeyRound;
  title: string;
  items: { q: string; a: string; href?: { label: string; url: string } }[];
};

const SECTIONS: Section[] = [
  {
    icon: KeyRound,
    title: "Cuenta y acceso",
    items: [
      {
        q: "No puedo entrar y no recuerdo mi contraseña",
        a: "Pide un enlace de restablecimiento desde la pantalla de recuperación. Te llegará al correo con el que te registraste. Si no lo ves, mira en spam y en promociones antes de volver a pedirlo.",
        href: { label: "Recuperar contraseña", url: "/recuperar" },
      },
      {
        q: "Me registré con Google y ahora me pide contraseña",
        a: "Las cuentas creadas con Google no tienen contraseña propia: entra siempre con el botón de Google. Si estás dentro de Instagram o TikTok, ese navegador bloquea el acceso con Google: abre franky.es en tu navegador normal (Chrome o Safari).",
      },
      {
        q: "¿Por qué me pedís confirmar el email?",
        a: "Para que puedas recuperar tu cuenta si pierdes la contraseña, y para que nadie cree cuentas con correos inventados en el muro de tu universidad. Puedes navegar por todo mientras tanto; para publicar, chatear o entrar en Crush con una cuenta nueva hace falta confirmarlo.",
      },
      {
        q: "Puse mal mi email al registrarme",
        a: "Escríbenos desde el correo correcto y te lo cambiamos. No podemos hacerlo solos porque no hay forma de comprobar que la cuenta es tuya.",
      },
    ],
  },
  {
    icon: ShieldCheck,
    title: "Privacidad y seguridad",
    items: [
      {
        q: "¿Quién ve lo que publico en FOMO?",
        a: "El muro completo solo lo ve gente registrada de esa universidad. Fuera de Franky se publica una muestra muy recortada de algunos hilos, sin autor, sin fotos, con el texto cortado y con retraso. Si publicas en anónimo, tu nombre no aparece en ningún caso.",
      },
      {
        q: "¿Se ve mi email o mi teléfono?",
        a: "No. El email, el teléfono y la fecha de nacimiento nunca se muestran a otros usuarios ni salen en ninguna consulta pública.",
      },
      {
        q: "Alguien me está molestando",
        a: "Puedes bloquear a esa persona desde su perfil y reportar el contenido con el botón de denuncia. Tres denuncias ocultan un hilo automáticamente mientras lo revisamos. Si hay amenazas o algo grave, escríbenos y actuamos el mismo día.",
        href: { label: "Ver mis cuentas bloqueadas", url: "/perfil/bloqueados" },
      },
    ],
  },
  {
    icon: Flag,
    title: "Contenido y moderación",
    items: [
      {
        q: "¿Qué no se puede publicar?",
        a: "Nada que identifique a alguien sin su permiso, acoso, amenazas, contenido sexual de terceros, venta de trabajos académicos ni spam. Lo que se salte esto se retira y la cuenta puede quedar suspendida.",
      },
      {
        q: "Me han borrado un hilo y creo que es un error",
        a: "Escríbenos con la universidad y aproximadamente cuándo lo publicaste. Revisamos las retiradas una a una.",
      },
      {
        q: "Han ocultado o retirado contenido de mi espacio y no estoy de acuerdo",
        a: "Si gestionas un espacio (comunidad, local o piso) y Franky ha ocultado o retirado una publicación, puedes ver cada decisión con su motivo y pedir una revisión desde Revisiones y apelaciones. Te respondemos allí mismo.",
        href: { label: "Ir a Revisiones y apelaciones", url: "/apelaciones" },
      },
    ],
  },
  {
    icon: Trash2,
    title: "Borrar mis datos",
    items: [
      {
        q: "¿Cómo borro mi cuenta?",
        a: "Desde tu perfil, en la sección de cuenta. El borrado es inmediato para el resto de usuarios: dejas de aparecer en cualquier sitio. Si cambias de idea, al volver a iniciar sesión te ofrecemos recuperarla.",
        href: { label: "Ir a mi perfil", url: "/perfil" },
      },
      {
        q: "¿Qué pasa con lo que publiqué?",
        a: "Tus hilos y mensajes se retiran contigo. Lo que otra gente escribió respondiéndote se mantiene, pero sin ninguna referencia a ti.",
      },
      {
        q: "Quiero una copia de mis datos",
        a: "Tienes derecho a pedirla (RGPD, artículo 15). Escríbenos desde el email de tu cuenta y te la mandamos.",
      },
    ],
  },
];

// Ancla legible para el índice lateral ("Cuenta y acceso" -> "cuenta-y-acceso").
function toAnchor(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const metadata: Metadata = {
  title: "Centro de ayuda",
  description:
    "Respuestas a las dudas más habituales de Franky: entrar en tu cuenta, recuperar la contraseña, privacidad en FOMO, moderación, bloqueos y cómo borrar tu cuenta y tus datos.",
  alternates: { canonical: "/ayuda" },
};

export default function AyudaPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SECTIONS.flatMap((s) =>
      s.items.map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: { "@type": "Answer", text: i.a },
      }))
    ),
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={jsonLd} />

      {/* Cabecera editorial: eyebrow, titular grande, sin degradados. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Breadcrumbs
            className="mb-6"
            items={[{ name: "Inicio", href: "/" }, { name: "Ayuda" }]}
          />
          <Reveal>
            <p className="eyebrow">Soporte</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold text-text-primary">
              Centro de ayuda
            </h1>
            <p className="mt-4 max-w-xl text-fluid-lead text-text-muted">
              Lo que más nos preguntáis, respondido sin rodeos. Si no encuentras
              lo tuyo, escríbenos y te contestamos.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-14">
          {/* Índice lateral pegajoso (solo escritorio). */}
          <aside className="hidden lg:block">
            <nav aria-label="Secciones de ayuda" className="sticky top-24">
              <p className="eyebrow">Índice</p>
              <ol className="mt-4 space-y-1 border-l border-border">
                {SECTIONS.map((section) => (
                  <li key={section.title}>
                    <a
                      href={`#${toAnchor(section.title)}`}
                      className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-text-muted transition-colors hover:border-text-primary hover:text-text-primary"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="space-y-14">
            {SECTIONS.map((section, si) => (
              <Reveal key={section.title} as="section" id={toAnchor(section.title)} className="scroll-mt-28">
                <h2 className="flex items-center gap-3 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
                  <section.icon className="h-5 w-5 text-violet" aria-hidden="true" />
                  {section.title}
                </h2>
                <div className="mt-5 divide-y divide-border border-y border-border">
                  {section.items.map((item, i) => (
                    <details
                      key={item.q}
                      className="group animate-list-in py-1"
                      style={{ "--i": si * 3 + i } as CSSProperties}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-heading text-base font-semibold text-text-primary transition-colors hover:text-violet-deep [&::-webkit-details-marker]:hidden">
                        {item.q}
                        <Plus
                          className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-300 ease-[var(--ease-out-quart)] group-open:rotate-45"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="animate-fade-in pb-5">
                        <p className="prose-comfy text-[15px] leading-relaxed text-text-secondary">{item.a}</p>
                        {item.href && (
                          <Link
                            href={item.href.url}
                            className="group/link mt-3 inline-flex items-center gap-1 text-sm font-semibold text-text-primary"
                          >
                            <span className="link-underline">{item.href.label}</span>
                            <ArrowRight className="h-3.5 w-3.5 arrow-nudge" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </Reveal>
            ))}

            <Reveal className="rounded-3xl border border-border bg-bg-secondary/60 p-8 sm:p-10">
              <Mail className="h-6 w-6 text-violet" aria-hidden="true" />
              <h2 className="mt-5 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
                ¿No está tu duda aquí?
              </h2>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-text-secondary">
                Escríbenos y te contestamos. Somos poquísimos, así que responde una
                persona de verdad, no un bot.
              </p>
              <Link href="/contacto" className={cn(buttonVariants({ variant: "dark", size: "lg" }), "group mt-6")}>
                Contactar
                <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
              </Link>
            </Reveal>

            {/* Sugerencias: canal aparte del contacto para ideas y fallos, que
                van al mismo buzón del equipo pero llegan ya clasificadas. */}
            <Reveal className="flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
              <Lightbulb className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
              <div className="flex-1">
                <h2 className="font-heading text-base font-extrabold text-text-primary">¿Una idea o un fallo?</h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  Cuéntanos qué mejorarías o qué has visto que no funciona. Nos ayuda
                  a decidir qué construir después.
                </p>
              </div>
              <Link href="/sugerencias" className={cn(buttonVariants({ variant: "outline" }), "group shrink-0")}>
                Sugerir una mejora
                <ArrowRight className="h-3.5 w-3.5 arrow-nudge" aria-hidden="true" />
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </div>
  );
}
