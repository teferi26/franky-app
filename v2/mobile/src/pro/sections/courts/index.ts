import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Pistas from "./pistas";
import Normas from "./normas";
import Bonos from "./bonos";
import Caja from "./caja";
import Convenios from "./convenios";
import { Escuela, Mostrador, Ocupacion, Puestos, Torneos } from "./en-web";

/**
 * Pantallas nativas del motor "courts". "socios" lo aporta el motor classes
 * desde el registro. Mostrador, torneos, escuela, ocupación y puestos aún
 * abren la versión web (en-web.tsx) hasta tener su pantalla nativa.
 */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  pistas: Pistas,
  normas: Normas,
  bonos: Bonos,
  caja: Caja,
  convenios: Convenios,
  mostrador: Mostrador,
  torneos: Torneos,
  escuela: Escuela,
  ocupacion: Ocupacion,
  puestos: Puestos,
};
