"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Flame, CalendarDays, MessageCircle, User, GraduationCap, Search, LogIn,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/SessionProvider";
import { isNonStudentRole } from "@/lib/roles";

/**
 * Barra de pestañas inferior para móvil y tablet (< lg), en paridad con la
 * app. Las cinco cosas que se usan a diario siempre a un toque; el CTA
 * principal (Inicio/FOMO con sesión, "Entrar" sin ella) no se pierde nunca.
 *
 * Se monta desde Navbar y marca el <body> con la clase `franky-tabbar`:
 * globals.css usa `body:has(.franky-tabbar)` para dar hueco al <main> y
 * publicar `--tabbar-offset` a los widgets flotantes.
 *
 * Se OCULTA donde estorba o no aplica (rutas con su propia barra inferior,
 * paneles de negocio, cuentas que no son de estudiante, login y registro).
 */
const HIDE_PREFIXES = [
  "/chats",
  "/crush/live",
  "/onboarding",
  "/login",
  "/registro",
  "/recuperar",
  "/restablecer",
  "/admin",
  "/negocio",
  "/propietario",
  "/uni",
  "/cobros",
  "/contratos",
  "/eventos/swipe",
  "/test-vocacional",
];

/** La ficha de piso lleva su propia barra de acción fija (mobile-action-bar). */
function isFlatDetail(pathname: string) {
  return /^\/alojamiento\/(?!comparar)[^/]+/.test(pathname);
}

type Tab = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const STUDENT_TABS: Tab[] = [
  { href: "/", label: "Inicio", icon: Home, match: (p) => p === "/" },
  { href: "/fomo", label: "FOMO", icon: Flame, match: (p) => p.startsWith("/fomo") },
  { href: "/eventos", label: "Eventos", icon: CalendarDays, match: (p) => p.startsWith("/eventos") },
  { href: "/chats", label: "Chats", icon: MessageCircle, match: (p) => p.startsWith("/chats") },
  { href: "/perfil", label: "Perfil", icon: User, match: (p) => p.startsWith("/perfil") },
];

const GUEST_TABS: Tab[] = [
  { href: "/", label: "Inicio", icon: Home, match: (p) => p === "/" },
  { href: "/notas-corte", label: "Notas", icon: GraduationCap, match: (p) => p.startsWith("/notas-corte") || p.startsWith("/carreras") },
  { href: "/alojamiento", label: "Pisos", icon: Search, match: (p) => p.startsWith("/alojamiento") },
  { href: "/fomo", label: "FOMO", icon: Flame, match: (p) => p.startsWith("/fomo") },
  { href: "/registro", label: "Entrar", icon: LogIn, match: () => false },
];

export default function MobileTabBar({ unreadChats = 0 }: { unreadChats?: number }) {
  const pathname = usePathname() ?? "/";
  const { user, role, loading } = useSession();

  if (loading) return null;
  if (isNonStudentRole(role)) return null;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"))) {
    return null;
  }
  if (isFlatDetail(pathname)) return null;

  const tabs = user ? STUDENT_TABS : GUEST_TABS;
  const activeIndex = tabs.findIndex((t) => t.match(pathname));

  return (
    <nav
      aria-label="Navegación rápida"
      className={cn(
        "franky-tabbar lg:hidden fixed inset-x-0 bottom-0 z-[45]",
        "border-t border-border bg-bg-primary/90 backdrop-blur-xl",
        "pb-[env(safe-area-inset-bottom,0px)]"
      )}
    >
      <ul className="relative grid h-16 grid-cols-5">
        {/* Indicador que se desliza entre pestañas. */}
        {activeIndex >= 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-0.5 w-1/5 transition-transform duration-300 ease-[var(--ease-out-quart)]"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          >
            <span className="mx-auto block h-full w-8 rounded-b-full bg-violet" />
          </span>
        )}
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          const isCta = !user && href === "/registro";
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150 active:scale-95",
                  active ? "text-text-primary" : "text-text-muted hover:text-text-primary"
                )}
              >
                {isCta ? (
                  // El CTA de registro va en píldora de marca: es la acción, no un sitio.
                  <span className="flex items-center gap-1.5 rounded-full bg-violet px-3.5 py-2 text-white shadow-[0_6px_16px_-6px_rgba(109,61,240,0.6)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="font-semibold">{label}</span>
                  </span>
                ) : (
                  <>
                    <span className="relative">
                      <Icon
                        className={cn(
                          "h-[22px] w-[22px] transition-transform duration-300 ease-[var(--ease-spring)]",
                          active && "-translate-y-px scale-110"
                        )}
                        aria-hidden="true"
                        strokeWidth={active ? 2.2 : 1.75}
                      />
                      {href === "/chats" && unreadChats > 0 && (
                        <span
                          className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-violet px-1 text-[10px] font-bold text-white ring-2 ring-bg-primary"
                          aria-label={`${unreadChats} sin leer`}
                        >
                          {unreadChats > 9 ? "9+" : unreadChats}
                        </span>
                      )}
                    </span>
                    <span className={cn("truncate", active && "font-semibold")}>{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
