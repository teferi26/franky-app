/** Only fixed screen names: never collect IDs, search text or query parameters. */
export function screenName(pathname: string): string {
  const parts = pathname.split(/[/?#]/).filter(Boolean).filter(part => !part.startsWith("("));
  const root = parts[0] ?? "";
  const aliases: Record<string, string> = {
    "": "inicio", feed: "fomo", crush: "crush", fomo: "fomo", "fomo-uni": "fomo",
    "roomie-match": "roomie", roomie: "roomie", "roomie-conexiones": "roomie_conexiones",
    universidades: "universidades", uni: "universidades", carreras: "carreras", carrera: "carreras",
    "notas-corte": "notas_corte", becas: "becas", beca: "becas", "test-vocacional": "carrera_ideal",
    alojamiento: "alojamiento", pisos: "alojamiento", piso: "alojamiento", eventos: "eventos", evento: "eventos",
    chats: "chats", chat: "chats", perfil: "perfil", noticias: "novedades", noticia: "novedades", novedades: "novedades",
    comunidades: "comunidades", comunidad: "comunidades", mercado: "mercado", ocio: "ocio", agenda: "agenda", estudio: "agenda",
    favoritos: "favoritos", notificaciones: "notificaciones", sugerencias: "sugerencias", contacto: "contacto",
    "mis-entradas": "entradas", entradas: "entradas", onboarding: "onboarding", "onboarding-perfil": "onboarding",
    "nota-media": "nota_media", simulador: "simulador", explorar: "explorar", ayuda: "ayuda",
  };
  if (root === "crush" && parts[1] === "live") return "crush_live";
  if (root === "fomo" && parts.length > 2) return "fomo_hilo";
  return aliases[root] ?? "otra";
}
