"use client";

import dynamic from "next/dynamic";
import { usePathname } from 'next/navigation';
import { useSession } from "@/components/SessionProvider";
import { isNonStudentRole } from "@/lib/roles";

// Defer the assistant until after first paint. Plain-text replies avoid shipping
// markdown parsers; anonymous visitors can use the local public navigator.
const FrankyAIChat = dynamic(() => import("@/components/FrankyAIChat"), {
  ssr: false,
  loading: () => null,
});

// Same for the AdSense bootstrap — it's a third-party script and shouldn't
// participate in SSR; we only need it after hydration.
const AdSenseLoader = dynamic(() => import("@/components/AdSenseLoader"), {
  ssr: false,
  loading: () => null,
});

/**
 * Bundle the "chrome" pieces that don't need to render server-side so they
 * leave the critical path and download lazily after hydration. `nonce` is
 * forwarded to children that mount inline <Script> tags (AdSenseLoader).
 */
export default function LazyChrome({ nonce }: { nonce?: string }) {
  const { role } = useSession();
  const pathname = usePathname();

  // El asistente se presenta como "tu asistente universitario" y propone
  // carreras, notas de corte y becas: a un propietario no le aporta nada, así
  // que su burbuja no se le pinta (ni se descarga su chunk).
  const esProfesional = isNonStudentRole(role);

  return (
    <>
      {(!esProfesional || pathname?.startsWith('/becas')) && <FrankyAIChat />}
      <AdSenseLoader nonce={nonce} />
    </>
  );
}
