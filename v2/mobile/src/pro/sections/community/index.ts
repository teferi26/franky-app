import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Actividades from "./actividades";
import Miembros from "./miembros";
import Avisos from "./avisos";
import Patrocinios from "./patrocinios";
import Subvenciones from "./subvenciones";
import Junta from "./junta";

/** Pantallas nativas del motor "community" (asociaciones y comunidades de estudiantes). */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  actividades: Actividades,
  miembros: Miembros,
  avisos: Avisos,
  patrocinios: Patrocinios,
  subvenciones: Subvenciones,
  junta: Junta,
};
