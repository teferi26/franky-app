import type { SectorSite } from "./types";
import peluquerias from "./sectors/peluquerias";
import estetica from "./sectors/estetica";
import cafeterias from "./sectors/cafeterias";
import bares from "./sectors/bares";
import restaurantes from "./sectors/restaurantes";
import pubs from "./sectors/pubs";
import discotecas from "./sectors/discotecas";
import gimnasios from "./sectors/gimnasios";
import academias from "./sectors/academias";
import ocio from "./sectors/ocio";
import padel from "./sectors/padel";
import coworking from "./sectors/coworking";
import inmobiliarias from "./sectors/inmobiliarias";
import propietarios from "./sectors/propietarios";
import comunidades from "./sectors/comunidades";
import universidades from "./sectors/universidades";

export type {
  SectorCapability,
  SectorGainRow,
  SectorGains,
  SectorIconName,
  SectorMobileApp,
  SectorModule,
  SectorMoment,
  SectorPoint,
  SectorProof,
  SectorQuestion,
  SectorSite,
  SectorStudentSection,
  SectorSurface,
} from "./types";

/**
 * Contenido propio de cada sector, un fichero por sector en `./sectors`.
 * Los precios viven en el catálogo de Pro (`shared/pro/verticals.ts`).
 */
export const SECTOR_SITES: SectorSite[] = [
  peluquerias,
  estetica,
  cafeterias,
  bares,
  restaurantes,
  pubs,
  discotecas,
  gimnasios,
  academias,
  ocio,
  padel,
  coworking,
  inmobiliarias,
  propietarios,
  comunidades,
  universidades,
];

export function getSectorSite(slug: string): SectorSite | undefined {
  return SECTOR_SITES.find((site) => site.slug === slug);
}
