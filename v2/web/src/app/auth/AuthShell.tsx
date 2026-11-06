import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * Marco compartido de las pantallas de acceso (login, registro, recuperar,
 * restablecer, email verificado), sistema de diseño v3 "Editorial".
 *
 * Escritorio: dos columnas. A la izquierda el formulario (ancho máximo
 * max-w-sm), a la derecha un panel neutro con una frase grande tipográfica
 * sobre la retícula (sin foto ni degradado). Móvil: una sola columna.
 *
 * Es puramente visual: no sabe nada de auth, cookies ni redirecciones. Los
 * formularios entran como `children` con sus handlers intactos.
 */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  aside,
  asideEyebrow = "Franky",
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Frase grande del panel derecho. */
  aside: React.ReactNode;
  asideEyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-[calc(100dvh-4rem)] lg:grid-cols-2", className)}>
      {/* Columna del formulario */}
      <div className="flex flex-col px-4 py-10 sm:px-6 lg:px-12 lg:py-14">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 text-text-primary animate-slide-up"
          >
            <GraduationCap className="h-5 w-5 text-violet" />
            <span className="font-heading text-lg font-bold tracking-tight">Franky</span>
          </Link>

          <div className="mt-10 animate-slide-up [animation-delay:60ms]">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-text-muted">{subtitle}</p>}
          </div>

          <div className="mt-8 animate-slide-up [animation-delay:120ms]">{children}</div>
        </div>
      </div>

      {/* Panel tipográfico (solo escritorio) */}
      <aside
        className="relative hidden overflow-hidden border-l border-border-light bg-bg-secondary lg:flex lg:items-end lg:p-14 xl:p-20"
        aria-hidden="true"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-80" />
        <Reveal variant="blur" delay={120} className="relative max-w-lg">
          <p className="eyebrow">{asideEyebrow}</p>
          <p className="mt-5 font-heading text-fluid-h1 font-extrabold text-text-primary">{aside}</p>
        </Reveal>
      </aside>
    </div>
  );
}

/** Separador con rótulo centrado ("o continúa con"). */
export function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-bg-primary px-3 text-xs text-text-muted">{children}</span>
      </div>
    </div>
  );
}

/** Aviso inline (error, éxito o aviso) con el mismo trazo en todas las pantallas. */
export function AuthNotice({
  tone = "error",
  icon,
  children,
  role,
}: {
  tone?: "error" | "success" | "warning";
  icon?: React.ReactNode;
  children: React.ReactNode;
  role?: "alert" | "status";
}) {
  const tones = {
    error: "border-error/20 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
    success: "border-success/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    warning: "border-warning/20 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  } as const;
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm font-medium", tones[tone])}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

/** Icono de Google (colores oficiales, sin cuadrado tintado). */
export function GoogleMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/** Pantalla de resultado (éxito, aviso o error) centrada y sin tarjeta. */
export function AuthResult({
  tone,
  icon,
  title,
  children,
  actions,
}: {
  tone: "success" | "warning" | "error";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-error";
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center animate-slide-up">
        <div className={cn("mx-auto inline-flex", color)}>{icon}</div>
        <p className="eyebrow mt-6">Franky</p>
        <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">{title}</h1>
        <div className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-text-muted">{children}</div>
        {actions && <div className="mt-8 flex flex-col items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
