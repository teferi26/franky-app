import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Security Headers ─────────────────────────────────────────────────────────
// Content-Security-Policy is generated dynamically per request in
// `src/middleware.ts` because it needs a fresh nonce. The static headers
// below cover everything else.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  output: "standalone",
  webpack(config) {
    // El núcleo compartido resuelve sus dependencias desde la app que lo usa.
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      zod: path.resolve(__dirname, "node_modules/zod"),
    };
    return config;
  },
  // El build de produccion NO debe romperse por deuda de lint preexistente
  // (no-explicit-any, no-unused-vars). El lint sigue disponible via
  // `npm run lint` y en CI; el gate de produccion son types + tests + build.
  eslint: { ignoreDuringBuilds: true },
  // isomorphic-dompurify pulls jsdom, which ships a `default-stylesheet.css`
  // at runtime. If Next bundles it for SSR, the build fails during page-data
  // collection with ENOENT default-stylesheet.css. Keeping it external means
  // node loads it from node_modules at request time, which works.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  // Rendimiento (sep-2026):
  // - poweredByHeader: la cabecera X-Powered-By no aporta nada y son bytes en
  //   cada respuesta (además de anunciar el framework).
  // - compress: Next ya comprime por defecto; se deja explícito para que nadie
  //   lo quite sin querer al tocar la configuración.
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Reescribe las importaciones "barrel" a la ruta del módulo concreto:
    // lucide-react exporta más de 1.500 iconos y date-fns cientos de funciones
    // desde un único índice. Sin esto cada chunk que importa un icono pasa por
    // ese índice entero (compilación más lenta y, en desarrollo, mucho más JS
    // en el navegador). Next ya trae ambos en su lista por defecto; dejarlos
    // aquí evita perderlos en un cambio de versión.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  images: {
    // AVIF primero y WebP de respaldo: entre un 30 y un 50 % menos de bytes que
    // el JPEG de origen en las fotos de pisos, eventos y universidades, que son
    // el grueso del peso de las páginas de catálogo. El navegador elige el
    // formato con la cabecera Accept.
    formats: ["image/avif", "image/webp"],
    // Las imágenes optimizadas se cachean 30 días en la CDN en vez de los 60 s
    // por defecto. Todas las subidas de Franky llevan nombre único (avatar con
    // timestamp, fotos con uuid), así que una URL nunca cambia de contenido y
    // reoptimizar cada minuto solo gastaba cuota de Vercel y latencia.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Lista blanca explícita. Con hostname "**" el endpoint /_next/image
    // funcionaba como proxy/optimizador de imágenes abierto para cualquier
    // URL de internet (coste de Vercel + vector de abuso).
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikimedia.org" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "*.picsum.photos" },
    ],
  },
  async redirects() {
    return [
      // www → apex. Sin esto, www.franky.es sirve la app como host separado y
      // el PKCE de Google se rompe: el code_verifier queda en una cookie
      // host-only de www y la vuelta de Supabase aterriza en franky.es, que no
      // la ve → /login?error=callback_failed sin explicación.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.franky.es" }],
        destination: "https://franky.es/:path*",
        permanent: true,
      },
      { source: "/mensajes", destination: "/chats", permanent: false },
      {
        source: "/mensajes/:path*",
        destination: "/chats/:path*",
        permanent: false,
      },
      // La sección "Ligar" se renombró a "Crush". Redirección permanente para no
      // romper carteles/QR ni enlaces antiguos que apunten a /ligar.
      { source: "/ligar", destination: "/crush", permanent: true },
      {
        source: "/ligar/:path*",
        destination: "/crush/:path*",
        permanent: true,
      },
      // El listado /carreras se fusionó en /notas-corte (agosto 2026): hacían
      // casi lo mismo y notas-corte tiene mejores filtros. Ojo, es un redirect
      // de la ruta EXACTA: las fichas /carreras/[slug] siguen vivas (contenido
      // único: salidas, valoraciones, comparativa entre universidades).
      { source: "/carreras", destination: "/notas-corte", permanent: true },
      // /buscar era una búsqueda pobre (5 resultados por tabla, enlaces a
      // listados genéricos) sin un solo enlace entrante. Cada catálogo tiene su
      // propio buscador, que es mejor.
      { source: "/buscar", destination: "/notas-corte", permanent: true },
      // /pricing vendía planes Pro/Premium que no desbloquean nada (fuera del
      // sitemap desde agosto 2026). Lo que se vende hoy vive en /negocio. Se
      // conserva la vuelta del checkout (?success / ?canceled), que la genera
      // /api/stripe/checkout, para no dejar a nadie sin su confirmación.
      {
        source: "/pricing",
        missing: [
          { type: "query", key: "success" },
          { type: "query", key: "canceled" },
        ],
        destination: "/negocio",
        permanent: false,
      },
      // Los links cortos de embajador (/tafa, /pau, /new) NO van aquí: los
      // gestiona middleware.ts (cookie de atribución + redirect a la home
      // limpia). Los redirects de next.config se ejecutan ANTES que el
      // middleware, así que añadirlos aquí lo rompería.
    ];
  },
  async rewrites() {
    return [
      // Los dos archivos de enlaces de apps se sirven desde una ruta para poder
      // leer el Team ID de Apple y la huella de firma de Android del ENTORNO.
      // Antes eran archivos estáticos en public/ con marcadores sin rellenar
      // ("TEAMID.es.franky.app", "REEMPLAZAR_CON_SHA256_DE_LA_FIRMA"), así que
      // ni iOS ni Android abrían la app con los enlaces de franky.es.
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
    ];
  },
  async headers() {
    const noCacheHeaders = [
      {
        key: "Cache-Control",
        value: "private, no-cache, no-store, must-revalidate",
      },
      { key: "Vary", value: "RSC, Next-Router-State-Tree, Next-Url, Cookie" },
    ];

    return [
      { source: "/(.*)", headers: securityHeaders },
      // Kill-switch service worker (public/sw.js): never let it be cached, and
      // allow it to control the whole origin. If a browser cached a stale copy
      // of this file we'd lose the ability to push future fixes through it.
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
      // El apple-app-site-association no tiene extension, asi que Vercel lo
      // sirve como octet-stream. iOS lo tolera via su CDN, pero lo dejamos
      // como application/json para que valide sin dudas (universal links).
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      { source: "/login", headers: noCacheHeaders },
      { source: "/registro", headers: noCacheHeaders },
      { source: "/onboarding", headers: noCacheHeaders },
      { source: "/onboarding/:path*", headers: noCacheHeaders },
      { source: "/auth/:path*", headers: noCacheHeaders },
    ];
  },
};

export default nextConfig;
