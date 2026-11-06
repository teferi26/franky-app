import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Inter, Outfit } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import AttributionTracker from "@/components/AttributionTracker";
import RouteAnalytics from "@/components/RouteAnalytics";
import AppProviders from "@/components/AppProviders";
import { createServerSupabase } from "@/lib/supabase-server";
import AnalyticsLoader from "@/components/AnalyticsLoader";
import LazyChrome from "@/components/LazyChrome";
import SmartAppBanner from "@/components/SmartAppBanner";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Chrome Android: redimensiona el layout cuando el teclado aparece
  // iOS Safari: lo ignora pero ya redimensiona por defecto desde 15.4
  interactiveWidget: "resizes-content",
  // Tinta la barra del navegador en móvil con el violeta de marca en lugar del
  // blanco genérico. Sin esto la web se veía "de plantilla" nada más abrirla.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e16" },
  ],
  // "light dark": la web ya soporta ambos (ver globals.css y ThemeToggle), así
  // el navegador pinta con el esquema correcto los controles nativos.
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://franky.es"),
  title: {
    default: "Franky: FOMO, eventos y carreras para universitarios en España",
    template: "%s | Franky",
  },
  description:
    "Lo que se cuece hoy en tu campus (FOMO), eventos universitarios con entradas, notas de corte oficiales, becas y alojamiento para estudiantes en España.",
  keywords: [
    "universidad", "carreras", "becas", "notas de corte", "alojamiento",
    "estudiantes", "España", "test vocacional",
  ],
  // Los ficheros icon-192 / icon-512 eran en realidad el mismo PNG de 217x208,
  // asi que ni el favicon ni el icono de iOS salian nitidos. Ahora son iconos
  // reales de su tamano (ver public/icons) y el de Apple va sin transparencia,
  // que iOS pinta de negro.
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Franky",
    statusBarStyle: "black-translucent",
  },
  // AdSense site verification — Google needs this meta tag in <head> on
  // every page to confirm we own the property. Harmless if AdSense isn't
  // active yet; doesn't load any script by itself.
  other: {
    "google-adsense-account": "ca-pub-3294076776393263",
  },
  // Google Search Console — URL-prefix property verification for
  // https://franky.es/. Renders <meta name="google-site-verification" …>
  // into <head> on every page (the homepage `/` is the one Googlebot reads).
  verification: {
    google: "AAHWi8NO9MHW11wXojXN0EKgXgiIt3Y3VQfbHdrhiNc",
  },
  openGraph: {
    title: "Franky - Tu Compañero Universitario",
    description: "Todo lo que necesitas para tu vida universitaria en España.",
    type: "website",
    locale: "es_ES",
    // franky-logo.png medía 617x230: fuera de la especificación de OG (1200x630)
    // y se recortaba mal en WhatsApp, Instagram y X. og-default.png sí la cumple.
    images: [{ url: "/img/og-default.png", width: 1200, height: 630 }],
  },
};

// Aplica el tema guardado antes de pintar. Solo actúa si el usuario eligió
// explícitamente claro u oscuro: en 'auto' (o sin preferencia) no toca nada y
// manda el `@media (prefers-color-scheme)` del CSS, que no necesita JS.
const THEME_BOOT = `(function(){try{var p=localStorage.getItem("franky_theme");if(p==="dark"||p==="light"){document.documentElement.setAttribute("data-theme",p);document.documentElement.style.colorScheme=p;}}catch(e){}})();`;

// Origen de Supabase para el preconnect. Se deriva de la URL pública ya
// existente; si falta la variable, sencillamente no se emite la etiqueta.
const supabaseOrigin = (() => {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
})();

/**
 * NO quites el `headers()` de aqui. Se intento y rompe la web entera.
 *
 * El razonamiento tentador es: leer el nonce marca la ruta como dinamica, y al
 * estar en el layout RAIZ contagia a todo el arbol (solo 4 de 60 rutas se
 * prerenderizan y los `export const revalidate` de los catalogos quedan
 * decorativos). Parece que basta con sacar los scripts inline a ficheros
 * externos y dejar que Next ponga el nonce por su cuenta.
 *
 * No es asi, y se comprobo en el navegador contra el build de produccion real:
 *   * Sin `headers()` aqui, Next NO aplica el nonce a sus propios scripts.
 *     Medido: 0 de 47 etiquetas <script> del HTML lo llevaban.
 *   * La CSP usa `strict-dynamic`, y esa directiva hace que el navegador
 *     IGNORE `'self'` y las listas de origenes en script-src. Sin nonce no se
 *     salva ni un script del propio dominio.
 *   * Resultado: cero JavaScript en toda la web. Nada de hidratacion, ningun
 *     boton funcionando, y sin un solo error visible en consola.
 *
 * Para recuperar el prerender hay que cambiar antes la estrategia de CSP
 * (hashes en vez de nonce, o renunciar a `strict-dynamic`). Es un trabajo con
 * su propia verificacion, no un efecto colateral de tocar el layout.
 */
/**
 * Best-effort: si Supabase falla o no hay cookie, se devuelve sesion vacia y la
 * navegacion se pinta como anonima; el cliente la corrige en cuanto hidrata.
 * Nunca debe tumbar el layout entero.
 */
async function leerSesion(): Promise<{
  user: Record<string, unknown> | null;
  role: string | null;
}> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, role: null };
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    // Se pasa el usuario ENTERO, no solo el id: Navbar y compania leen email,
    // user_metadata.avatar_url, etc. Un objeto recortado los dejaria pintando
    // huecos en el HTML del servidor y rellenandolos al hidratar.
    return { user: user as unknown as Record<string, unknown>, role: data?.role ?? null };
  } catch {
    return { user: null, role: null };
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce por peticion, generado en middleware.ts y propagado por la cabecera
  // `x-nonce`. Todo <Script> que se sirva en el HTML DEBE llevarlo.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const sectorSite = Boolean(requestHeaders.get("x-franky-sector-site"));
  if (requestHeaders.get('x-franky-surface') === 'crush-party-screen') {
    return <html lang="es" className={`${inter.variable} ${outfit.variable}`}><body><main id="main-content">{children}</main></body></html>;
  }
  if (requestHeaders.get('x-franky-surface') === 'crush-party-entry') {
    return <html lang="es" className={`${inter.variable} ${outfit.variable}`} style={{ colorScheme:'light' }}><body className="min-h-screen bg-[#faf6fd] text-[#251333]">
      <Script id="legacy-sw-cleanup" src="/js/legacy-sw-cleanup.js" strategy="afterInteractive" nonce={nonce} />
      {/* Superficie aislada de la fiesta (sin Navbar ni providers): recarga completa a propósito. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <header className="mx-auto flex h-16 max-w-[1560px] items-center justify-between gap-4 px-5 sm:px-10"><a href="/" className="flex items-center gap-2 font-heading text-xl font-bold text-violet"><img src="/img/franky-icon.png" width={34} height={34} alt="" />Franky<span className="rounded-full bg-violet/10 px-2 py-1 font-body text-[9px] font-semibold tracking-wider">EVENT</span></a><a href="/universidades/universidad-de-alicante" className="flex min-h-11 items-center text-xs font-semibold text-violet">Campus UA ↗</a></header>
      <main id="main-content">{children}</main>
      <footer className="mx-auto flex max-w-[1560px] flex-wrap justify-center gap-5 px-5 pb-8 text-xs text-[#786786]"><a className="flex min-h-11 items-center" href="/terminos">Condiciones</a><a className="flex min-h-11 items-center" href="/privacidad">Privacidad</a><a className="flex min-h-11 items-center" href="/contacto">Ayuda</a></footer>
    </body></html>;
  }

  // Sesion resuelta EN EL SERVIDOR para sembrar el contexto. Sin esto, el menu
  // y el pie salian como esqueleto en el HTML inicial y sus enlaces internos
  // (universidades, becas, alojamiento, eventos...) desaparecian para cualquier
  // rastreador que no ejecute JavaScript. El layout ya era dinamico por
  // `headers()`, asi que esto no quita cache a ninguna pagina.
  const sesion = await leerSesion();

  return (
    // suppressHydrationWarning: public/js/theme-boot.js escribe `data-theme` y
    // `style.colorScheme` en <html> antes de hidratar, asi que el HTML del
    // servidor y el del cliente difieren a proposito en ese atributo.
    <html
      lang={requestHeaders.get("x-franky-lang") === "en" ? "en" : "es"}
      className={`${inter.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Tema antes del primer pintado.
            El CSS ya resuelve el caso mayoritario con `prefers-color-scheme`
            (ver globals.css), así que esto solo cubre a quien ha elegido un
            tema distinto al de su sistema: sin este script, esa persona vería
            un fogonazo del tema equivocado en cada carga.
            Inline con nonce: es lo único que `strict-dynamic` acepta, y tiene
            que ser síncrono para ejecutarse antes de pintar. */}
        <script
          nonce={nonce}
          // Browsers hide the nonce attribute after parsing; the nonce property
          // and CSP protection remain intact. Ignore only that hydration delta.
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
        />
        {/* Supabase es el origen que bloquea el primer dato en cliente (sesión,
            perfil, contadores). Abrir la conexión TCP+TLS en paralelo con el
            HTML ahorra ~100-300 ms en móvil. */}
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
        {/* Las entradas al hacer scroll (data-reveal) arrancan invisibles y
            las revela JS. Sin JavaScript, todo se ve desde el principio. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-screen flex flex-col">
        {/* Limpieza del service worker antiguo (Workbox). Externo, no inline:
            ver la nota de arriba y public/js/legacy-sw-cleanup.js. */}
        <Script
          id="legacy-sw-cleanup"
          src="/js/legacy-sw-cleanup.js"
          strategy="afterInteractive"
          nonce={nonce}
        />
        {/* Skip link for keyboard users / screen readers — jumps over the
            Navbar dropdowns straight to the main content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[10000] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-violet focus:text-white focus:shadow-lg"
        >
          Saltar al contenido
        </a>
        <AppProviders
          initialUser={sesion.user}
          initialRole={sesion.role}
          seeded
        >
          <AttributionTracker />
          <RouteAnalytics />
          {requestHeaders.get("x-franky-surface") === "pro" || sectorSite ? (
            // Franky Pro pinta su propia estructura (barra lateral y barra
            // inferior); el menú, el pie y los avisos de la app de
            // estudiantes estorbarían mientras se trabaja.
            <main id="main-content" tabIndex={-1} className="flex-1">
              {children}
            </main>
          ) : (
            <>
              <Navbar />
              <main id="main-content" tabIndex={-1} className="flex-1 pt-16">
                {children}
              </main>
              <Footer />
              <SmartAppBanner />
            </>
          )}
          <CookieConsent />
          <AnalyticsLoader nonce={nonce} />
          {requestHeaders.get("x-franky-surface") === "pro" || sectorSite ? null : <LazyChrome nonce={nonce} />}
        </AppProviders>
      </body>
    </html>
  );
}
