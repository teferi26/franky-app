import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Eventos from "./eventos";
import Rrpp from "./rrpp";
import Puerta from "./puerta";
import Reservados from "./reservados";
import Caja from "./caja";
import Barra from "./barra";
import Carta from "./carta";
import Cuadrante from "./cuadrante";
import Incidencias from "./incidencias";

/** Pantallas nativas del motor "night" (pubs y discotecas). */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  eventos: Eventos,
  rrpp: Rrpp,
  puerta: Puerta,
  reservados: Reservados,
  caja: Caja,
  barra: Barra,
  carta: Carta,
  cuadrante: Cuadrante,
  incidencias: Incidencias,
};
