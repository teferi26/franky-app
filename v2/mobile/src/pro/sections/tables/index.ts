import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Reservas from "./reservas";
import Sala from "./sala";
import Carta from "./carta";
import Validar from "./validar";
import Caja from "./caja";
import Pedidos from "./pedidos";
import Bonos from "./bonos";
import Grupos from "./grupos";
import Partidos from "./partidos";
import Turnos from "./turnos";
import Appcc from "./appcc";
import Compras from "./compras";
import Costes from "./costes";

/** Pantallas nativas del motor "tables" (cafetería, bar, restaurante). */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  reservas: Reservas,
  sala: Sala,
  carta: Carta,
  validar: Validar,
  caja: Caja,
  pedidos: Pedidos,
  bonos: Bonos,
  grupos: Grupos,
  eventos: Partidos,
  cuadrante: Turnos,
  appcc: Appcc,
  compras: Compras,
  costes: Costes,
};
