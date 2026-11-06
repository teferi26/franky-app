import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { sectorMetadataHost } from "@/lib/sector-sites/routing";

// Las rutas .txt no pasan por middleware; el Host se valida aquí y no se
// comparte una respuesta prerenderizada entre dominios.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = sectorMetadataHost((await headers()).get("host"));
  if (!site.indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  if (site.slug) {
    return {
      rules: {
        userAgent: "*",
        allow: ["/$", "/_next/", "/img/", "/icons/", "/fonts/"],
        disallow: "/",
      },
      host: site.origin,
      sitemap: `${site.origin}/sitemap.xml`,
    };
  }
  return {
    rules: [
      {
        userAgent: "*",
        // Catálogos públicos abiertos: son el motor de adquisición orgánica.
        // El resto sigue tras el muro de auth en middleware.ts; lo declaramos
        // aquí también para que los bots cooperativos no pierdan tiempo.
        allow: [
          "/",
          "/login",
          "/registro",
          "/contacto",
          "/privacidad",
          "/terminos",
          "/cookies",
          "/universidades",
          "/carreras",
          "/becas",
          "/notas-corte",
          "/ocio",
          "/noticias",
          "/alojamiento",
          // La agenda de eventos dejó de estar tras el muro (ago-2026): es el
          // contenido que más se busca y más se comparte. Las sub-rutas de
          // crear/comprar/gestionar siguen prohibidas más abajo.
          "/eventos",
          "/colaboradores",
          // Landing pública de FOMO por universidad: es la pieza de captación
          // orgánica (ver migración 144). La ficha de un hilo concreto sigue
          // prohibida más abajo.
          "/fomo",
          // El test vocacional funciona sin cuenta (pide login solo al guardar).
          "/test-vocacional",
          "/nota-media",
          "/ayuda",
          "/en",
          "/simulador",
          // Embudo B2B de inmobiliarias: son landings públicas de captación y
          // tienen que ser indexables (el panel /negocio/dashboard sigue
          // prohibido más abajo).
          "/negocio",
          "/negocio/propietario",
          "/negocio/alta",
          "/sectores",
        ],
        disallow: [
          "/admin",
          "/api/",
          "/auth/",
          "/sectores/*/acceder",
          "/onboarding",
          "/perfil",
          "/notificaciones",
          "/chats",
          "/favoritos",
          "/mis-entradas",
          "/eventos/crear",
          "/eventos/swipe",
          "/eventos/*/editar",
          "/eventos/*/entradas",
          "/eventos/*/asistentes",
          // El muro de una uni sí se indexa (/fomo y /fomo/[slug]); la ficha de
          // un hilo concreto no: es contenido de usuario, privado y sin valor
          // de búsqueda. El patrón cubre /fomo/<uni>/<threadId>.
          "/fomo/*/*",
          "/crush",
          "/roomie-match",
          "/propietario",
          // /pricing estaba a la vez amurallada (no está en PUBLIC_ROUTES, así
          // que Googlebot solo veía la redirección a /login) y anunciada aquí y
          // en el sitemap: un soft-404 declarado por nosotros. Encima vende
          // planes Pro/Premium que no desbloquean ninguna función y cuyo pago
          // ni siquiera se puede completar. Se prohíbe hasta que exista de
          // verdad algo que vender; tampoco se enlaza desde ninguna parte.
          "/pricing",
          // Solo el panel: las landings /negocio, /negocio/propietario y
          // /negocio/alta están en allow porque captan a las inmobiliarias.
          "/negocio/dashboard",
          "/negocio/registro",
          // El resultado guardado del test es privado (el test en sí, no).
          "/test-vocacional/resultado",
        ],
      },
    ],
    host: "https://franky.es",
    sitemap: "https://franky.es/sitemap.xml",
  };
}
