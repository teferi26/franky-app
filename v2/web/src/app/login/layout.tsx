import type { Metadata } from "next";

// Force the login route to be fully dynamic so it is never prerendered or
// cached at the CDN layer. Prerendering here caused Hostinger's edge cache
// to serve the RSC payload as if it were the HTML response, rendering the
// page as raw text for some users.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Metadata propia para no heredar el title/description del root (evita dos URLs
// indexables clonicas) y noindex + canonical fijo para que las variantes
// /login?next=... no se indexen (ver M-SEO-007).
export const metadata: Metadata = {
  title: "Iniciar sesión",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
