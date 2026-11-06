import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decodeAal } from "@/lib/aal";
import { getRequestBearer } from "@/lib/request-auth";
import { isCrushPartyEntry, isCrushPartyScreen, isCrushPartyPublicApi } from '@/lib/crush-party-route';
import {
  isSectorPublicPath,
  resolveSectorSurface,
  sectorMetadataHost,
  SECTOR_SITE_HEADER,
} from "@/lib/sector-sites/routing";

// Public routes (exact match). Anything not in this list requires authentication.
// Keep this list short on purpose — it's the only entry point for anonymous visitors.
const PUBLIC_ROUTES = new Set<string>([
  "/",
  "/login",
  "/registro",
  // Recuperación de contraseña (M-UX-029): accesibles sin sesión.
  "/recuperar",
  "/restablecer",
  // Aterrizaje del enlace de verificación de email (hallazgo M3): se abre
  // desde el cliente de correo, muchas veces sin sesión web (siempre, en
  // usuarios solo-móvil), así que tiene que ser público.
  "/email-verificado",
  "/auth/callback",
  "/privacidad",
  "/terminos",
  // Aviso legal (LSSI art. 10): tiene que verse sin cuenta.
  "/aviso-legal",
  "/franky-card/condiciones",
  "/franky-card/retorno",
  "/cookies",
  "/contacto",
  // Escaparate público de universidades colaboradoras.
  "/colaboradores",
  // Smart link de los carteles y QR físicos: manda a la store o a la web según
  // el dispositivo. TIENE que ser público: quien escanea un cartel no tiene
  // cuenta todavía, y rebotarlo al login se carga justo la captación.
  "/app",
  // El test vocacional ya estaba escrito para funcionar sin sesión (guarda el
  // resultado en sessionStorage y pide login solo al final, para guardarlo),
  // pero el muro lo rebotaba a /login. Era el CTA secundario del hero y una
  // tarjeta de la home: un callejón sin salida en el embudo principal.
  // OJO: /test-vocacional/resultado NO se abre (necesita el resultado guardado).
  "/test-vocacional",
  // Calculadora de nota media (portada de la app móvil). Es 100% de cliente,
  // no toca la BD y no necesita cuenta: cerrarla solo servía para perder
  // tráfico orgánico con muchísima intención de búsqueda.
  "/nota-media",
  // Centro de ayuda (portado de la app movil). Indexable a proposito: la gente
  // busca "como borrar mi cuenta de X" en Google, no dentro del producto.
  "/ayuda",
  // Landing en ingles para estudiantes internacionales/Erasmus. Publica e
  // indexable: capta la busqueda en ingles que la web solo-espanol perdia.
  "/en",
  // Simulador de admision: la pieza compartible de junio. Publico e indexable.
  "/simulador",
  // Embudo B2B de inmobiliarias/propietarios: la landing de negocio, la del
  // Plan Inmobiliarias (con su prueba de 7 días) y el alta de propietario
  // tienen que poder verse SIN cuenta — el empresario que llega de un anuncio
  // o de un email de outreach aún no tiene ninguna. Publicar/pagar ya exige
  // sesión dentro de cada flujo.
  "/negocio",
  "/negocio/propietario",
  "/negocio/alta",
  // Next.js metadata routes (OG image, sitemap, robots). Must be reachable
  // by Googlebot / Twitter / Facebook crawlers without authentication.
  "/opengraph-image",
  "/twitter-image",
  "/sitemap.xml",
  "/robots.txt",
  // Kill-switch service worker — MUST be reachable (as real JS, never a /login
  // redirect) by every browser, including logged-out ones, so the old Workbox
  // worker's update check can install it and self-destruct. See public/sw.js.
  "/sw.js",
]);

// Public API prefixes — endpoints reachable without auth.
const PUBLIC_API_PREFIXES = [
  "/api/partners/origin/", // Catalogue is public; checkout/order require the partner secret.
  "/api/account/recover",
  "/api/locations/structure",
  "/api/stripe/webhook",
  // El webhook de Connect (cuentas conectadas) faltaba aquí: Stripe llega sin
  // cookies, así que el muro le respondía 401 y los eventos de las cuentas de
  // los vendedores no llegaban al handler. No abre nada: la ruta valida la
  // firma con STRIPE_CONNECT_WEBHOOK_SECRET antes de tocar nada.
  "/api/stripe/connect/webhook",
  // App Store Server Notifications V2 de Franky Pro: Apple llega sin cookies
  // ni JWT, igual que Stripe. No abre nada: la ruta solo cree lo firmado por
  // Apple (cadena x5c hasta Apple Root CA G3 y firma ES256).
  "/api/apple/notifications",
  "/api/negocio/registro",
  "/api/csp-report",  // CSP violation collector — must accept unauth POSTs from browsers
  "/api/auth/precheck", // rate-limit gate para los formularios de login/recuperar
  // Buzon de la plataforma: /contacto es publico y se puede escribir sin cuenta,
  // asi que su ruta tambien. Tiene rate limit por IP y por email, y honeypot.
  "/api/contacto",
  "/api/auth/signup", // registro sin email de confirmación (el visitante aún no tiene sesión)
  // Alta de propietario/inmobiliaria: mismo caso que /api/auth/signup, el
  // empresario todavía no tiene sesión cuando se registra.
  "/api/auth/signup-propietario",
  // Enlace de verificación de email (migración 141): se abre desde el cliente
  // de correo SIN cookies de sesión (siempre, en usuarios del móvil). La ruta
  // valida su propio token firmado; sin esta línea el muro devolvía 401 y la
  // verificación no funcionaba justo cuando la 145 empieza a exigirla.
  "/api/auth/verify-email",
  // Rutas internas BD→web (pg_net): las llama Postgres sin cookies ni JWT y se
  // autentican con el secreto compartido DENTRO de cada ruta. Sin esta línea,
  // el muro 401 se comía los emails (notify-email) y los push (notify-push).
  "/api/internal/",
  // Vercel Cron Jobs: llegan con Authorization: Bearer <CRON_SECRET> (no es un
  // JWT de Supabase, así que el muro 401 se los comería). Cada ruta /api/cron/*
  // valida el secreto con timingSafeEqual y es fail-closed sin CRON_SECRET.
  "/api/cron/",
  // Honeypot routes — must reach the handler (which logs + 404s) instead of
  // bouncing on the 401 wall, otherwise attackers learn that the path is
  // gated rather than missing.
  "/api/users/dump",
  "/api/users/export",
  "/api/admin/all",
];

// Catálogos públicos indexables (M-SEO-001/002): el visitante anónimo (y
// Googlebot) puede ver listados y fichas de catálogo. Son datos públicos (la
// RLS de estas tablas ya permite lectura anónima), no hay PII. Se abren por
// prefijo para cubrir las fichas con slug/id ([slug], [id]). NO se abren las
// sub-rutas de autoría o transaccionales (crear, editar, swipe, entradas):
// Desde agosto de 2026 /eventos SÍ es público: la lista y la ficha de cada
// evento son el mejor contenido que tiene Franky para captar por búsqueda, y
// dejarlas detrás del muro las hacía invisibles para Google y para cualquiera
// que llegara desde un cartel o una historia de Instagram. Las sub-rutas de
// autoría y compra (crear, editar, entradas, asistentes, swipe) siguen
// cerradas: se listan abajo en PRIVATE_OVERRIDES.
const PUBLIC_PREFIXES = [
  "/universidades",
  "/carreras",
  "/becas",
  "/notas-corte",
  "/ocio",
  "/noticias",
  "/alojamiento",
  "/eventos",
  // FOMO en modo vista previa pública: /fomo/[slug] sirve una landing
  // indexable con una muestra recortada y anonimizada (get_fomo_public_preview,
  // migración 144) cuando NO hay sesión, y el feed real cuando la hay. La
  // decisión de qué enseñar la toma la página, no el muro.
  //
  // No se abre /fomo/[slug]/[threadId]: la ficha de hilo sigue siendo privada.
  "/fomo",
  // Perfil público del organizador de eventos: se enlaza desde cada ficha de
  // evento pública. La página devuelve notFound() si el perfil no existe.
  "/organizador",
];

// Sub-rutas que quedan privadas aunque su prefijo esté abierto arriba.
// Se comprueban ANTES que PUBLIC_PREFIXES.
const PRIVATE_OVERRIDES = [
  "/test-vocacional/resultado",
  // Todo lo transaccional de eventos: crear, comprar y gestionar exige cuenta
  // aunque el catálogo sea público.
  "/eventos/crear",
  "/eventos/swipe",
];

// Primer segmento de cada ruta que existe en la app. Sirve para distinguir
// "esta ruta existe pero necesitas cuenta" (→ /login) de "esta ruta no existe"
// (→ 404 de verdad). Sin esto, cualquier URL inventada devolvía un redirect a
// /login: soft-404 para Google y un mensaje confuso para el visitante.
const KNOWN_SEGMENTS = new Set<string>([
  "espacios", "recompensas", "creadores", "r", "pago", "apelaciones", "pro", "n",
  // /agenda exige sesión: sin esta entrada el anónimo recibía un 200 y el
  // salto al login lo hacía la página; ahora es un 307 desde aquí. /sugerencias
  // NO se añade a propósito: es pública para anónimos y aquí la mandaría al
  // login (no está en PUBLIC_ROUTES/PUBLIC_PREFIXES).
  "agenda", "organizador", "aviso-legal",
  "mis-visitas", "devoluciones", "novedades-ciudad",
  "admin", "alojamiento", "api", "app", "auth", "ayuda", "becas",
  "carreras",
  "chats", "cobros", "colaboradores", "comunidades", "contacto", "contratos",
  "cookies",
  "crush",
  "en", "eventos", "favoritos", "fomo", "franky-card", "login", "mis-entradas", "negocio",
  "mercado", "nota-media", "notas-corte", "noticias", "notificaciones", "ocio",
  "onboarding", "perfil",
  "pricing", "privacidad", "propietario", "recuperar", "registro",
  "restablecer", "roomie-match", "simulador", "terminos", "test-vocacional",
  "uni", "sectores",
  "universidades",
]);

function isKnownRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  const first = pathname.split("/")[1] ?? "";
  return KNOWN_SEGMENTS.has(first);
}

// Onboarding/role logic only applies to authenticated users; these paths skip those extra checks.
const ONBOARDING_BYPASS = [
  "/pro",
  "/franky-card/retorno",
  "/franky-card/condiciones",
  "/espacios",
  "/onboarding",
  "/login",
  "/registro",
  "/recuperar",
  "/restablecer",
  "/auth/callback",
  "/api/",
  "/privacidad",
  "/terminos",
  "/aviso-legal",
  "/cookies",
  "/contacto",
];

const ADMIN_ROUTES = ["/admin"];
const PROPIETARIO_ROUTES = ["/propietario"];

function isPublicPath(pathname: string): boolean {
  if (isSectorPublicPath(pathname)) return true;
  if (/^\/r\/[A-Za-z0-9_-]{3,64}$/.test(pathname)) return true;
  // Franky Pro: la entrada y las demos de cada sector son públicas (se enseñan
  // en la visita comercial); un espacio real (/pro/<uuid>) exige sesión.
  if (pathname === "/pro" || pathname === "/pro/empezar" || /^\/pro\/demo-[a-z-]{2,32}(\/[a-z-]{2,32})?$/.test(pathname)) return true;
  // Ficha pública de un negocio de Franky Pro: franky.es/n/<slug>.
  if (/^\/n\/[a-z0-9-]{3,50}$/.test(pathname)) return true;
  if (pathname === '/api/growth/touch' || pathname === '/api/billing/revenuecat' || pathname === '/pago/retorno') return true;
  if (pathname.startsWith('/api/workspaces/media/')) return true;
  if (isCrushPartyPublicApi(pathname)) return true;
  if (isCrushPartyEntry(pathname) || isCrushPartyScreen(pathname) || pathname === '/crush/fiesta') return true;
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith("/api/")) {
    return PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  }
  // Sub-rutas que siguen cerradas aunque su prefijo esté abierto.
  if (PRIVATE_OVERRIDES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return false;
  }
  // /fomo/[slug] es público (landing con vista previa), pero la ficha de un
  // hilo concreto (/fomo/[slug]/[threadId]) no lo es. La imagen OG de la
  // landing (/fomo/[slug]/opengraph-image) SÍ tiene que ser pública: la piden
  // los bots de WhatsApp/Twitter al desplegar el enlace, sin sesión.
  if (pathname.startsWith("/fomo/")) {
    const segs = pathname.split("/").filter(Boolean);
    if (segs.length === 2) return true;
    if (segs.length === 3 && segs[2] === "opengraph-image") return true;
    return false;
  }
  // /eventos/[id] es público, pero no sus pestañas de gestión y compra.
  if (pathname.startsWith("/eventos/")) {
    const segs = pathname.split("/").filter(Boolean);
    if (segs.length >= 3 && ["editar", "entradas", "asistentes"].includes(segs[2])) {
      return false;
    }
  }
  // Catálogos públicos: la ruta exacta o cualquier ficha bajo ella.
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  return false;
}

/**
 * Build the per-request Content-Security-Policy.
 *
 * - script-src uses a per-request nonce + 'strict-dynamic'. This is the
 *   modern strict CSP pattern (Google CSP Evaluator recommended). No
 *   'unsafe-inline', no 'unsafe-eval'.
 * - style-src keeps 'unsafe-inline' because Tailwind / Next.js generated
 *   <style> tags don't carry our nonce; CSS injection is much lower risk
 *   than JS injection (not Turing-complete, no DOM access).
 * - All other directives lock down to known-good origins.
 * - report-uri sends violations to our own /api/csp-report endpoint.
 */
function buildCsp(nonce: string): string {
  // 'unsafe-eval' SOLO en desarrollo. El empaquetador de Next en `npm run dev`
  // envuelve cada módulo en un eval() para los mapas de código; sin esta
  // excepción el navegador bloquea main-app.js, React no llega a hidratar y la
  // web local queda muerta (los menús no abren, los formularios no responden).
  // En producción NO se añade: ahí no hay eval y abrirlo sería regalar el
  // vector clásico de XSS.
  const evalEnDesarrollo =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    // fundingchoicesmessages.google.com: el aviso de consentimiento RGPD de
    // AdSense (Privacy & messaging). Sin él, la CSP bloqueaba sus llamadas en
    // cada visita nueva (muy visible en webviews de IG/TikTok, que llegan sin
    // cookies) y llenaba /api/csp-report de ruido.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalEnDesarrollo} https://www.googletagmanager.com https://www.google-analytics.com https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com https://accounts.google.com https://challenges.cloudflare.com https://js.stripe.com https://tracker.metricool.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // *.tile.openstreetmap.org: teselas de los mapas de ocio (Leaflet).
    "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://lh3.googleusercontent.com https://*.googleusercontent.com https://avatars.githubusercontent.com https://upload.wikimedia.org https://*.wikimedia.org https://picsum.photos https://*.picsum.photos https://fastly.picsum.photos https://pagead2.googlesyndication.com https://*.gstatic.com https://api.qrserver.com https://tracker.metricool.com https://*.tile.openstreetmap.org",
    // Sin media-src, <audio>/<video> caen en default-src 'self' y el navegador
    // bloquea las notas de voz y los vídeos de FOMO servidos desde Supabase
    // Storage. blob: cubre la previsualización local del composer.
    "media-src 'self' blob: https://*.supabase.co",
    // router.project-osrm.org: rutas a pie y en coche del "cómo llegar" del
    // mapa (mismo servicio que usa la app móvil). Sin él, la CSP bloquearía el
    // cálculo de la ruta dentro de la web.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://api.unsplash.com https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com https://www.google-analytics.com https://api.pwnedpasswords.com https://challenges.cloudflare.com https://tracker.metricool.com https://router.project-osrm.org",
    "frame-src https://accounts.google.com https://googleads.g.doubleclick.net https://fundingchoicesmessages.google.com https://challenges.cloudflare.com https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    // `report-uri` está obsoleto y los navegadores lo van retirando: sin el
    // `report-to` de abajo, los informes de violación dejarían de llegar sin
    // que nos enterásemos. Se mantienen los dos mientras dure la transición.
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}

// Links cortos de embajador → atribución que debe contar en la analítica
// (admin_ambassador_leads agrupa por utm_source con utm_medium=ambassador).
// Se entregan por cookie, NO por parámetros en la URL: el usuario aterriza en
// la home limpia y el cliente (lib/attribution.ts) consume la cookie como
// first-touch, que acaba en profiles.utm_* al registrarse.
const AMBASSADOR_LINKS: Record<string, Record<string, string>> = {
  "/tafa": { utm_source: "tafa", utm_medium: "ambassador", utm_campaign: "leads", utm_content: "tafa", signup_landing_path: "/tafa" },
  "/pau": { utm_source: "pau", utm_medium: "ambassador", utm_campaign: "leads", utm_content: "pau", signup_landing_path: "/pau" },
  "/new": { utm_source: "pau", utm_medium: "ambassador", utm_campaign: "leads", utm_content: "new", signup_landing_path: "/new" },
};

export async function middleware(request: NextRequest) {
  const sectorSurface = resolveSectorSurface(
    request.nextUrl.pathname,
    request.headers.get("host"),
  );
  if (sectorSurface.redirectUrl) {
    const target = new URL(sectorSurface.redirectUrl, request.url);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  // Links cortos de embajador: cookie de atribución + redirect a la home
  // limpia (sin utm_* a la vista). 307 para poder reasignar destinos sin
  // redirects permanentes cacheados.
  const ambassador = AMBASSADOR_LINKS[request.nextUrl.pathname];
  if (ambassador) {
    // Etiqueta opcional por vídeo/cuenta (franky.es/tafa?v=reel-biblioteca):
    // va a utm_term y queda guardada por usuario, para medir qué contenido
    // concreto trae cada registro sin crear un link nuevo en código.
    const v = request.nextUrl.searchParams.get("v");
    const payload =
      v && /^[\w-]{1,60}$/.test(v) ? { ...ambassador, utm_term: v } : ambassador;
    const res = NextResponse.redirect(new URL("/", request.url), 307);
    // OJO: sin encodeURIComponent aquí; NextResponse ya codifica el valor y
    // el cliente (attribution.ts) hace un único decodeURIComponent.
    res.cookies.set("franky_landing_utm", JSON.stringify(payload), {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      // Sin httpOnly a propósito: la lee attribution.ts en el cliente.
    });
    return res;
  }

  // Generate a fresh nonce per request. Use the standard 16-byte random ID
  // encoded as URL-safe base64. crypto.randomUUID() is fine on Vercel Edge
  // too (no Node-only crypto required).
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  // Make the nonce visible to downstream React Server Components via a
  // mutated request header. The layout reads `headers().get('x-nonce')` and
  // passes it to every <Script nonce={…}> child.
  const requestHeaders = new Headers(request.headers);
  // No se acepta una pista de superficie enviada por el navegador.
  requestHeaders.delete(SECTOR_SITE_HEADER);
  requestHeaders.set(SECTOR_SITE_HEADER, sectorSurface.surface ?? "");
  requestHeaders.set("x-nonce", nonce);
  // Always overwrite an incoming hint: only the exact party routes use their own chrome.
  // Idioma del documento: /en es la landing en inglés y el layout pinta
  // <html lang> con esta cabecera (siempre se sobrescribe la entrante).
  requestHeaders.set('x-franky-lang', request.nextUrl.pathname === '/en' || request.nextUrl.pathname.startsWith('/en/') ? 'en' : 'es');
  // Franky Pro (/pro) es la app de los negocios: tiene su propia barra lateral
  // y no lleva el menú ni el pie de la app de estudiantes.
  const isProSurface = request.nextUrl.pathname === '/pro' || request.nextUrl.pathname.startsWith('/pro/');
  requestHeaders.set('x-franky-surface', isCrushPartyScreen(request.nextUrl.pathname) ? 'crush-party-screen' : isCrushPartyEntry(request.nextUrl.pathname) ? 'crush-party-entry' : isProSurface ? 'pro' : 'app');

  // Cada renovación de cookies debe conservar la reescritura y el nonce.
  const createPageResponse = () => {
    if (sectorSurface.rewritePath) {
      const destination = request.nextUrl.clone();
      destination.pathname = sectorSurface.rewritePath;
      return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
  let supabaseResponse = createPageResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = createPageResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = sectorSurface.rewritePath ?? request.nextUrl.pathname;

  // Private API handlers prefer Bearer credentials. Match that precedence even
  // when a browser also sends cookies, and never fall back for an invalid token.
  const bearerToken = pathname.startsWith("/api/") && !isPublicPath(pathname)
    ? getRequestBearer(request)
    : null;
  // OBS and the public projection are independent of whoever last logged into
  // this browser. They never refresh cookies or inspect private profile data.
  const isolatedPartySurface = isCrushPartyScreen(pathname) || isCrushPartyPublicApi(pathname);
  const authResult = isolatedPartySurface
    ? { data: { user: null }, error: null }
    : bearerToken !== null
    ? (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(bearerToken)
        ? await supabase.auth.getUser(bearerToken)
        : { data: { user: null }, error: null })
    : await supabase.auth.getUser();
  const user = authResult.error ? null : authResult.data.user;

  // Anonymous visitor trying to reach a private route. For API routes we want
  // a proper 401 JSON response — fetch() callers can react cleanly instead of
  // following a redirect and parsing the login HTML. Browser navigations still
  // get the friendly /login redirect.
  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({ error: "unauthorized", message: "Auth required" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }
    // URL que no corresponde a ninguna ruta de la app: dejarla pasar para que
    // Next sirva su 404 real. Antes se redirigía a /login, lo que producía
    // soft-404 en Search Console y le decía al visitante "inicia sesión" ante
    // un enlace roto.
    if (!isKnownRoute(pathname)) {
      supabaseResponse.headers.set("Content-Security-Policy", buildCsp(nonce));
      supabaseResponse.headers.set("x-nonce", nonce);
      return supabaseResponse;
    }
    const url = new URL("/login", request.url);
    // Only pass next= when it's a sensible internal path (not /, not /login itself)
    if (pathname && pathname !== "/" && !pathname.startsWith("/login") && !pathname.startsWith("/registro")) {
      url.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  // Segundo factor OBLIGATORIO también para las APIs de administración.
  //
  // Hallazgo de la revisión de seguridad pre-push (C1): el gate de MFA de más
  // abajo solo cubría la NAVEGACIÓN a /admin, porque ONBOARDING_BYPASS incluye
  // "/api/" y las rutas /api/admin/** se lo saltaban entero. Resultado: con una
  // sesión de solo contraseña (aal1) se podía llamar por fetch/curl a
  // set-role, hard-delete o users/lookup (PII completa por email) sin pasar
  // nunca por el TOTP — exactamente el escenario del incidente de junio.
  //
  // Este bloque es el chokepoint central: cubre todas las rutas /api/admin/**
  // actuales y futuras. Se excluye el honeypot público (/api/admin/all), que
  // debe llegar a su handler y responder 404 como si no existiera.
  if (
    user &&
    pathname.startsWith("/api/admin") &&
    !isPublicPath(pathname)
  ) {
    // Con cookies, el AAL va en el access token de la sesión; con Bearer (la
    // ruta de la app móvil), en el propio token de la cabecera.
    const rawToken = bearerToken !== null
      ? bearerToken
      : (await supabase.auth.getSession()).data.session?.access_token;
    if (decodeAal(rawToken) !== "aal2") {
      return new NextResponse(
        JSON.stringify({
          error: "mfa_required",
          message: "Esta acción requiere verificar el segundo factor. Ve a /perfil/seguridad.",
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
  }

  // If authenticated, run onboarding + role gates (unchanged)
  if (user) {
    const isBypass = ONBOARDING_BYPASS.some((r) => pathname.startsWith(r))
      || isSectorPublicPath(pathname)
      || isCrushPartyEntry(pathname) || isCrushPartyScreen(pathname) || pathname === '/crush/fiesta';

    if (!isBypass) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed, role, is_discarded")
        .eq("id", user.id)
        .single();

      if (profile?.is_discarded) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login", request.url));
      }

      if (profile && !profile.onboarding_completed) {
        // Conservar el destino (M-UX-014): quien llega de un QR a /crush debe
        // volver ahí tras completar (o saltar) el onboarding, no caer en la home.
        const onb = new URL("/onboarding", request.url);
        if (pathname && pathname !== "/" && !pathname.startsWith("/onboarding")) {
          onb.searchParams.set("next", pathname + request.nextUrl.search);
        }
        return NextResponse.redirect(onb);
      }

      // El panel /admin lo pueden abrir admin Y analyst (este último en modo
      // solo lectura + moderación; el control fino vive en las páginas, la RLS
      // y las RPCs). Sin esto, el middleware rebotaba al analista a la home
      // antes de que cargara ninguna página del panel.
      const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
      if (isAdminRoute && profile?.role !== "admin" && profile?.role !== "analyst") {
        return NextResponse.redirect(new URL("/", request.url));
      }

      // Segundo factor OBLIGATORIO para el panel de administración. Tras el
      // incidente de junio, un /admin con solo contraseña era la mayor
      // exposición que quedaba. Se lee el AAL del JWT:
      //   * next === "aal2" && current !== "aal2" → tiene MFA inscrito pero no
      //     lo ha completado en esta sesión → a la pantalla de verificación.
      //   * sin factor inscrito (next !== "aal2") → a inscribirlo antes de
      //     poder entrar. La página /perfil/seguridad guía el alta.
      if (isAdminRoute && !pathname.startsWith("/perfil")) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const current = decodeAal(session?.access_token);
        // El nextLevel no está en el JWT; se infiere: si la sesión ya es aal2,
        // está cubierta. Si es aal1, hay que comprobar si existe factor. Para
        // no pagar una llamada extra en cada request de admin, se delega la
        // distinción "inscribir vs. verificar" a la propia pantalla destino.
        if (current !== "aal2") {
          const url = new URL("/perfil/seguridad", request.url);
          url.searchParams.set("mfa", "required");
          url.searchParams.set("next", pathname + request.nextUrl.search);
          return NextResponse.redirect(url);
        }
      }

      if (PROPIETARIO_ROUTES.some((r) => pathname.startsWith(r)) && profile?.role !== "propietario") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  }

  // Attach the dynamic CSP + nonce header to the outgoing response.
  // (The header was already set on the request so RSCs can read it.)
  supabaseResponse.headers.set("Content-Security-Policy", buildCsp(nonce));
  supabaseResponse.headers.set("x-nonce", nonce);
  // Grupo de destino para `report-to` (Reporting API), el sustituto moderno de
  // `report-uri`. Apunta al mismo colector de siempre.
  supabaseResponse.headers.set("Reporting-Endpoints", 'csp-endpoint="/api/csp-report"');
  if (sectorSurface.hostSlug) {
    const metadataHost = sectorMetadataHost(request.headers.get("host"));
    if (!metadataHost.indexable || request.nextUrl.pathname !== "/") {
      supabaseResponse.headers.set("X-Robots-Tag", "noindex, follow");
    }
  }
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Se excluye .well-known para que apple-app-site-association y assetlinks.json
    // (universal links iOS y app links Android) se sirvan estaticos sin pasar por
    // el muro de auth ni recibir cabeceras de redireccion.
    //
    // Rendimiento (sep-2026): también quedan fuera js, css, map, webmanifest y
    // los formatos de audio/vídeo de public/. Cada petición que entra aquí
    // paga una invocación Edge y, si trae cookie de sesión, una llamada al
    // servidor de Auth de Supabase: para un fichero estático (sw.js,
    // /js/legacy-sw-cleanup.js, un mp4 de marketing) es trabajo tirado. Estos
    // ficheros nunca necesitaron el muro ni la CSP por petición.
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|woff|woff2|ttf|js|css|map|webmanifest|mp4|webm|mp3|m4a|ogg)$).*)",
  ],
};
