import type { Metadata } from "next";
import { Suspense } from "react";
import VerificarEstudianteClient from "./client";

/**
 * Verificacion del correo UNIVERSITARIO (migracion 025): da el distintivo de
 * estudiante verificado. Nada que ver con el correo de la cuenta (ese flujo es
 * EmailVerifyBanner). Privada (muro de auth del middleware) y no indexable.
 *
 * El enlace del email llega aqui con ?token=...; el redirect a /login del
 * middleware conserva la query, asi que el token sobrevive al login.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificar estudiante",
  robots: { index: false, follow: false },
};

export default function VerificarEstudiantePage() {
  return (
    <Suspense fallback={null}>
      <VerificarEstudianteClient />
    </Suspense>
  );
}
