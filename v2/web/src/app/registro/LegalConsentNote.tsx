import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Aviso de aceptación de los textos legales bajo los botones que crean una
 * cuenta (email, Google o Apple). Informa del contrato (Términos) y de la
 * política de privacidad antes del alta (art. 13 RGPD y art. 27 LSSI).
 */
export default function LegalConsentNote({
  className,
  action = "crear la cuenta",
}: {
  className?: string;
  /** Verbo de la acción: "crear la cuenta", "continuar con Google o Apple"… */
  action?: string;
}) {
  return (
    <p className={cn("text-center text-xs leading-relaxed text-text-muted", className)}>
      Al {action} aceptas los{" "}
      <Link href="/terminos" target="_blank" className="link-underline font-medium text-text-primary">
        Términos
      </Link>{" "}
      y la{" "}
      <Link href="/privacidad" target="_blank" className="link-underline font-medium text-text-primary">
        Política de privacidad
      </Link>
      .
    </p>
  );
}
