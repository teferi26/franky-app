import Link from "next/link";
import { CalendarDays, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { CrushAgeGate } from "@/lib/legal-age";

/**
 * Pantalla de la puerta de edad de Crush (18+). Se pinta en servidor antes de
 * cargar Crush: sin fecha de nacimiento en el perfil, o con menos de 18 años,
 * no se entra. En base de datos lo vuelve a comprobar public.is_adult().
 */
export default function CrushAgeGateScreen({
  reason,
  embedded = false,
}: {
  reason: Exclude<CrushAgeGate, "ok">;
  embedded?: boolean;
}) {
  const missing = reason === "missing_birth_date";
  const Icon = missing ? CalendarDays : Lock;
  return (
    <div
      className={`mx-auto flex ${embedded ? "min-h-[360px]" : "min-h-[calc(100dvh-4rem)]"} max-w-md flex-col items-center justify-center px-6 text-center`}
    >
      <Icon className="h-8 w-8 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
      <p className="eyebrow mt-5">Crush</p>
      <h1 className="mt-2 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
        {missing ? "Completa tu fecha de nacimiento" : "Solo para mayores de 18"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        {missing
          ? "Crush es solo para mayores de 18 años y lo comprobamos con la fecha de nacimiento de tu perfil. Añádela para poder entrar. Nunca publicamos tu fecha exacta."
          : "Crush es una función exclusiva para personas que ya han cumplido 18 años. Cuando los cumplas, te esperamos aquí. Mientras tanto tienes FOMO, eventos y todo lo demás de Franky."}
      </p>
      {!missing && (
        <p className="mt-2 text-xs text-text-muted">
          Tu edad se calcula con la fecha de nacimiento de tu perfil. Si la introdujiste mal, puedes corregirla.
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/onboarding?edit=1" className={buttonVariants({ variant: "dark" })}>
          {missing ? "Completar mi perfil" : "Revisar mi perfil"}
        </Link>
        <Link href="/fomo" className={buttonVariants({ variant: "ghost" })}>
          Ir a FOMO
        </Link>
      </div>
    </div>
  );
}
