"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Mail, Lock, ArrowUpRight } from "lucide-react";
import { SOCIAL_LINKS } from "@/lib/social";
import ThemeToggle from "@/components/ThemeToggle";
import { useSession } from "@/components/SessionProvider";
import { isNonStudentRole } from "@/lib/roles";

// `gated: true` = necesita cuenta. Se marca por dos motivos: para avisar al
// visitante con un candado en vez de dejarle chocar contra el login, y para
// enviar rel="nofollow" a Googlebot (esas rutas están en disallow del
// robots.txt, así que enlazarlas sin nofollow desde todas las páginas del sitio
// era gastar presupuesto de rastreo en URLs prohibidas).
type FooterLink = { href: string; label: string; gated?: boolean };

const footerSections: { title: string; links: FooterLink[] }[] = [
  {
    title: "Explorar",
    links: [
      { href: "/universidades", label: "Universidades" },
      { href: "/universidades/comparar", label: "Comparar universidades" },
      { href: "/colaboradores", label: "Universidades colaboradoras" },
      // El listado de carreras vive en /notas-corte desde agosto 2026 (un
      // solo enlace: antes salía dos veces, como "Carreras" y "Notas de corte").
      { href: "/notas-corte", label: "Carreras y notas de corte" },
      { href: "/becas", label: "Becas y ayudas" },
      { href: "/alojamiento", label: "Alojamiento" },
      { href: "/ocio", label: "Zonas de ocio" },
    ],
  },
  {
    title: "Comunidad",
    links: [
      { href: "/fomo", label: "FOMO" },
      // Eventos es público (listado y fichas): sin candado ni nofollow.
      { href: "/eventos", label: "Eventos" },
      { href: "/crush", label: "Crush", gated: true },
      { href: "/mercado", label: "Mercado", gated: true },
      { href: "/comunidades", label: "Comunidades", gated: true },
      { href: "/roomie-match", label: "RoomieMatch", gated: true },
      // Smart link: store en móvil, web en escritorio.
      { href: "/app", label: "App móvil" },
    ],
  },
  {
    title: "Herramientas",
    links: [
      { href: "/test-vocacional", label: "Test vocacional" },
      { href: "/nota-media", label: "Calculadora de nota media" },
      { href: "/simulador", label: "¿A qué carreras llego con mi nota?" },
      { href: "/noticias", label: "Noticias" },
    ],
  },
  {
    // Embudo B2B: antes no había ningún enlace desde el pie de estudiante.
    title: "Para negocios",
    links: [
      { href: "/pro", label: "Franky Pro" },
      { href: "/sectores", label: "Franky para tu sector" },
      { href: "/negocio/alta", label: "Publicar piso" },
      { href: "/negocio/propietario", label: "Plan Inmobiliarias" },
      { href: "/pro/empezar", label: "Locales y ocio" },
      { href: "/negocio", label: "Todos los planes" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacidad", label: "Política de privacidad" },
      { href: "/terminos", label: "Términos de uso" },
      { href: "/cookies", label: "Cookies" },
      { href: "/aviso-legal", label: "Aviso legal" },
      { href: "/ayuda", label: "Centro de ayuda" },
      { href: "/contacto", label: "Contacto" },
    ],
  },
];

const LEGAL_SECTION = footerSections[footerSections.length - 1];

/**
 * Pie para las cuentas que no son de estudiante (propietario, gestor de
 * universidad): solo lo suyo y lo legal.
 */
const OWNER_SECTIONS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Alojamiento",
    links: [
      { href: "/propietario/dashboard", label: "Mi panel", gated: true },
      { href: "/negocio/registro?type=housing", label: "Publicar un piso", gated: true },
      { href: "/alojamiento", label: "Buscar piso" },
      { href: "/negocio/propietario", label: "Plan Inmobiliarias" },
    ],
  },
  LEGAL_SECTION,
];

const UNI_ADMIN_SECTIONS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Mi universidad",
    links: [
      { href: "/uni", label: "Mi panel", gated: true },
      { href: "/colaboradores", label: "Universidades colaboradoras" },
      { href: "/universidades", label: "Todas las universidades" },
      { href: "/notas-corte", label: "Notas de corte" },
    ],
  },
  LEGAL_SECTION,
];

function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("franky:open-cookie-settings"));
}

/**
 * Pie (v3): claro, con línea hairline arriba y un cierre tipográfico grande.
 * Antes era un bloque negro que pesaba más que la propia página.
 */
export default function Footer() {
  const pathname = usePathname();
  const { role, loading } = useSession();
  const esProfesional = isNonStudentRole(role);
  const sections = loading
    ? null
    : role === "university_admin"
      ? UNI_ADMIN_SECTIONS
      : esProfesional
        ? OWNER_SECTIONS
        : footerSections;
  // Hide footer on full-screen chat-style pages so they can be fixed.
  if (pathname?.startsWith("/chats")) return null;

  const tagline =
    sections === null
      ? "La plataforma de la vida universitaria en España."
      : role === "university_admin"
        ? "Gestiona la ficha de tu campus y mira qué buscan los futuros alumnos."
        : esProfesional
          ? "Publica tus pisos, gestiona tus visitas y llega a los estudiantes de cada campus."
          : "Tu carrera, tu piso, tu gente. Todo lo que pasa en tu universidad, en un solo sitio.";

  return (
    <footer className="mt-auto border-t border-border bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3 lg:grid-cols-7 lg:gap-x-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href="/" prefetch={false} className="inline-flex items-center gap-2.5">
              <Image
                src="/img/franky-icon.png"
                alt=""
                width={30}
                height={30}
                className="rounded-[9px]"
              />
              <span className="text-lg font-bold font-heading tracking-tight text-text-primary">
                Franky
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-muted">{tagline}</p>

            {/* Perfiles sociales (lib/social.ts, por variable de entorno). */}
            {SOCIAL_LINKS.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.name}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="group inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-[color,border-color,background-color] duration-200 hover:border-text-primary/30 hover:bg-bg-secondary hover:text-text-primary"
                    >
                      {s.name}
                      <ArrowUpRight className="h-3 w-3 text-text-muted transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Links. Mientras no se sepa el tipo de cuenta se reservan columnas
              neutras en vez de pintar el mapa de estudiante y cambiarlo después. */}
          {sections === null &&
            [0, 1, 2, 3, 4].map((col) => (
              <div key={col} aria-hidden="true">
                <div className="mb-4 h-3 w-20 rounded skeleton-shimmer" />
                <ul className="space-y-3">
                  {[0, 1, 2, 3, 4].map((row) => (
                    <li key={row}>
                      <div className="h-3 w-28 rounded skeleton-shimmer" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {(sections ?? []).map((section) => (
            <div key={section.title}>
              <h2 className="eyebrow mb-4 font-body">{section.title}</h2>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      rel={link.gated ? "nofollow" : undefined}
                      className="link-underline inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
                    >
                      {link.label}
                      {link.gated && (
                        <>
                          <Lock className="h-3 w-3 text-text-muted" aria-hidden="true" />
                          <span className="sr-only">(requiere cuenta)</span>
                        </>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Cierre tipográfico: una sola palabra grande, muy ligera. */}
        <div
          aria-hidden="true"
          className="mt-16 select-none overflow-hidden border-t border-border-light pt-8 font-heading text-[clamp(3rem,12vw,9rem)] font-extrabold leading-[0.85] tracking-[-0.05em] text-text-primary/[0.06]"
        >
          Franky
        </div>

        {/* Bottom */}
        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-text-muted">
            © {new Date().getFullYear()} Franky. Hecho en España para estudiantes.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <ThemeToggle />
            <Link
              href="/en"
              prefetch={false}
              hrefLang="en"
              lang="en"
              className="text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              English
            </Link>
            <button
              type="button"
              onClick={openCookieSettings}
              className="text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              Gestionar cookies
            </button>
            <a
              href="mailto:contacto@franky.es"
              className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              <Mail className="h-3.5 w-3.5" />
              contacto@franky.es
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
