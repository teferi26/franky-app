import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Horario from "./horario";
import Socios from "./socios";

/**
 * Pantallas nativas del motor "classes". Las pistas (courts) reutilizan
 * `socios` desde el registro, igual que en la web.
 */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  horario: Horario,
  socios: Socios,
};
