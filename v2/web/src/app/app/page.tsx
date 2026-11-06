import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Smartphone, ArrowRight } from "lucide-react";
import { detectPlatformFromUA, storeUrlForPlatform } from "@/lib/device";

// Smart link para los QR físicos (carteles de captación): detecta el
// dispositivo del visitante y lo manda a donde toca (App Store en iOS, Play
// Store en Android, la propia web en escritorio).
//
// Se resuelve en SERVIDOR, no en cliente, por dos motivos:
// 1. Un QR se abre en el navegador del móvil antes de que cargue ningún JS;
//    resolverlo en servidor evita el parpadeo de "ver la home un instante y
//    saltar después" y funciona igual si el visitante bloquea JS.
// 2. El user agent ya viaja en la cabecera de la petición HTTP: no hace
//    falta esperar a la hidratación de React para leerlo.
//
// IMPORTANTE: esta ruta debe ser pública (accesible sin sesión) para que
// funcione al escanear un QR sin estar logueado. src/middleware.ts NO está
// entre los ficheros que puedo tocar en este encargo: hay que añadir "/app"
// a PUBLIC_ROUTES (o a PUBLIC_PREFIXES) para que un visitante anónimo no
// acabe en /login en vez de en la tienda/la web. Ver nota en el informe.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Abrir Franky",
  robots: { index: false, follow: false },
};

// Parámetros de atribución que puede traer un cartel/QR (ver lib/attribution.ts).
// Se reenvían tal cual al destino final para no perder el rastro de campaña.
const FORWARDED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
] as const;

export default async function AppSmartLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ua = (await headers()).get("user-agent") || "";
  const platform = detectPlatformFromUA(ua);

  const qs = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const raw = sp[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  const homeUrl = query ? `/?${query}` : "/";

  // Escritorio: directo a la web, con los UTMs intactos para que
  // lib/attribution.ts los capture como first-touch al aterrizar en "/".
  if (platform === "desktop") {
    redirect(homeUrl);
  }

  // Móvil con tienda ya publicada para su plataforma: directo a la ficha.
  const storeUrl = storeUrlForPlatform(platform);
  if (storeUrl) {
    redirect(storeUrl);
  }

  // Móvil pero la app TODAVÍA no está publicada en esa tienda (APP_STORE_ID
  // o ANDROID_PACKAGE_NAME a null en lib/device.ts): en vez de enlazar a una
  // URL de tienda inventada (que daría 404), avisamos y dejamos continuar en
  // la web, conservando los UTMs del cartel.
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-sm w-full text-center rounded-2xl border border-border bg-white shadow-card p-8">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center">
          <Smartphone className="w-6 h-6 text-violet" />
        </div>
        <h1 className="text-lg font-bold text-text-primary mb-2">
          Muy pronto en las tiendas
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          Todavía estamos publicando la app de Franky. Mientras tanto, puedes
          usarla igual desde el navegador.
        </p>
        <Link
          href={homeUrl}
          className="inline-flex items-center gap-1.5 justify-center w-full rounded-full gradient-bg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition-all"
        >
          Continuar en franky.es
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
