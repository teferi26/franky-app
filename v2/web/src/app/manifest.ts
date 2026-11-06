import type { MetadataRoute } from "next";

/**
 * Web App Manifest.
 *
 * No existia: la web no se podia instalar como app, no habia `theme-color`
 * (la barra del navegador en movil salia blanca generica) y los iconos que
 * declaraba el layout eran de 217x208 px pese a llamarse 192x192 y 512x512.
 *
 * Con esto Android e iOS ofrecen "Anadir a pantalla de inicio", que es la via
 * de "app" mas barata mientras la nativa no este publicada en las tiendas.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Franky · Comunidad universitaria de España",
    short_name: "Franky",
    description:
      "Carreras, notas de corte, becas, alojamiento, ocio y la comunidad de tu universidad.",
    start_url: "/?utm_source=pwa&utm_medium=homescreen",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Mismos valores que pinta la web al arrancar (ver globals.css v3): con el
    // velo violeta anterior se veia un salto de tono al abrir la app instalada.
    background_color: "#FFFFFF",
    theme_color: "#6D3DF0",
    lang: "es-ES",
    dir: "ltr",
    categories: ["education", "social", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "FOMO", short_name: "FOMO", url: "/fomo" },
      { name: "Notas de corte", short_name: "Notas", url: "/notas-corte" },
      { name: "Becas", short_name: "Becas", url: "/becas" },
    ],
  };
}
