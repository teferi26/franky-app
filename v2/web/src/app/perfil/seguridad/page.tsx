import type { Metadata } from "next";
import { Suspense } from "react";
import SeguridadClient from "./client";

/**
 * Seguridad de la cuenta: gestión del segundo factor (MFA).
 *
 * Privada (bajo el muro de auth del middleware) y no indexable. El grueso es
 * client-side porque el SDK de MFA de Supabase vive en el navegador.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seguridad",
  robots: { index: false, follow: false },
};

export default function SeguridadPage() {
  return (
    <Suspense fallback={null}>
      <SeguridadClient />
    </Suspense>
  );
}
