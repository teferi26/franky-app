import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Clientes from "./clientes";
import Grupos from "./grupos";
import Estudiantes from "./estudiantes";
import Equipo from "./equipo";
import Ajustes from "./ajustes";
import Guia from "./guia";

/**
 * Pantallas nativas del motor "common", compartidas por todos los sectores.
 * "validar" no va aquí: la aporta el motor tables.
 */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  clientes: Clientes,
  grupos: Grupos,
  estudiantes: Estudiantes,
  equipo: Equipo,
  ajustes: Ajustes,
  guia: Guia,
};
