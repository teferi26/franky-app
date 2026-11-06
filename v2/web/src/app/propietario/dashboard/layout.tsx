"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Navegación común del panel de propietario.
 *
 * Las cinco secciones de detalle (/visitas, /tenants, /contratos, /horario,
 * /pagos) no tenían NI UN enlace de vuelta ni entre ellas: se entraba desde el
 * resumen y la única salida era el botón "atrás" del navegador. Con este layout
 * la barra viaja con el propietario esté donde esté.
 *
 * Es un layout de cliente solo por `usePathname` (marcar la sección activa);
 * las páginas que envuelve siguen siendo de servidor y conservan sus guardas de
 * rol, que son las que de verdad protegen la ruta.
 *
 * Visual (v3): enlaces de texto limpios, el activo en negro con subrayado, sin
 * pastillas tintadas.
 */
const SECCIONES = [
  { href: "/propietario/dashboard", label: "Resumen" },
  { href: "/propietario/dashboard/visitas", label: "Visitas" },
  { href: "/propietario/dashboard/tenants", label: "Inquilinos" },
  { href: "/propietario/dashboard/contratos", label: "Contratos" },
  { href: "/propietario/dashboard/horario", label: "Horario" },
  { href: "/propietario/dashboard/pagos", label: "Cobros" },
] as const;

export default function PropietarioDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* overflow-x-auto: en móvil las seis pestañas no caben, y es preferible
          que se deslicen a que se recorten sin aviso. */}
      <nav
        aria-label="Secciones del panel de propietario"
        className="sticky top-16 z-30 border-b border-border-light bg-bg-primary/95 backdrop-blur-sm"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <ul className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {SECCIONES.map(({ href, label }) => {
              // "Resumen" es prefijo de todas las demás: coincidencia exacta.
              const activa = pathname === href;
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={activa ? "page" : undefined}
                    className={cn(
                      "relative inline-flex items-center whitespace-nowrap px-3 py-3.5 text-sm font-semibold transition-colors",
                      "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-text-primary after:transition-transform after:duration-300 after:ease-[var(--ease-out-quart)] after:origin-left",
                      activa
                        ? "text-text-primary after:scale-x-100"
                        : "text-text-muted after:scale-x-0 hover:text-text-primary"
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      {children}
    </>
  );
}
