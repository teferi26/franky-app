import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Interesados from "./interesados";
import Cartera from "./cartera";
import Visitas from "./visitas";
import Inquilinos from "./inquilinos";
import Curso from "./curso";
import Cuentas from "./cuentas";

/** Pantallas nativas del motor "housing" (inmobiliarias y propietarios). */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  interesados: Interesados,
  cartera: Cartera,
  visitas: Visitas,
  inquilinos: Inquilinos,
  curso: Curso,
  cuentas: Cuentas,
};
