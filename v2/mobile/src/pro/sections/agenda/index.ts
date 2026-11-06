import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Agenda from "./agenda";
import Servicios from "./servicios";
import Caja from "./caja";

/** Pantallas nativas del motor "agenda" (peluquerías y estética). */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  agenda: Agenda,
  servicios: Servicios,
  caja: Caja,
};
