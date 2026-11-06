import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Distintivo de estudiante verificado ─────────────────────────────────────
// El dato es profiles.student_email_verified (migración 025): la persona ha
// confirmado un correo de dominio universitario reconocido. NO es el correo de
// la cuenta (ese es otro flujo, el de EmailVerifyBanner): aquí se distingue
// "quién es universitario de verdad".
//
// Reglas de la casa:
//   - Fail-soft: si el dato no viene (columna no seleccionada, consulta que
//     falla, perfil ajeno sin permiso) NO se pinta nada. Solo el true explícito
//     enseña el distintivo; nunca se insinúa una verificación que no existe.
//   - Sin estado, sin efectos y sin dependencias nuevas: se puede usar tanto en
//     Server Components como dentro de componentes de cliente.
//   - Mismo lenguaje visual que la app móvil (icono BadgeCheck en el violeta de
//     marca, ver mobile/app/perfil/[id].tsx).

const TITULO = "Estudiante verificado: ha confirmado su correo universitario";

type Props = {
  /** profiles.student_email_verified. Solo `true` pinta el distintivo. */
  verified: boolean | null | undefined;
  /** sm (junto a un nombre en una lista) o md (cabeceras de perfil). */
  size?: "sm" | "md";
  /** Añade el texto "Estudiante verificado" al lado del icono. */
  withLabel?: boolean;
  /** Ajustes puntuales de hueco desde quien lo usa. */
  className?: string;
};

export default function VerifiedBadge({
  verified,
  size = "sm",
  withLabel = false,
  className,
}: Props) {
  if (verified !== true) return null;

  const iconSize = size === "md" ? "h-5 w-5" : "h-4 w-4";

  // Solo icono: el significado lo lleva el aria-label (para lectores de
  // pantalla) y el title (para quien pasa el ratón por encima).
  if (!withLabel) {
    return (
      <span
        role="img"
        aria-label={TITULO}
        title={TITULO}
        className={cn("inline-flex shrink-0 text-violet", className)}
      >
        <BadgeCheck className={cn(iconSize, "fill-violet/10")} aria-hidden="true" />
      </span>
    );
  }

  // Con texto: el propio texto ya lo cuenta, así que el icono es decorativo.
  return (
    <span
      title={TITULO}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-semibold text-violet",
        size === "md" ? "text-sm" : "text-xs",
        className
      )}
    >
      <BadgeCheck className={cn(iconSize, "shrink-0 fill-violet/10")} aria-hidden="true" />
      Estudiante verificado
    </span>
  );
}
