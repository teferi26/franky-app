import type { ComponentType } from "react";
import type { ProSectionId } from "../../../../../shared/pro/types";
import Hoy from "./hoy";
import Publicaciones from "./publicaciones";
import Bienvenida from "./bienvenida";
import Alojamiento from "./alojamiento";
import Asociaciones from "./asociaciones";
import Moderacion from "./moderacion";
import Atencion from "./atencion";
import Mentores from "./mentores";
import Calendario from "./calendario";
import Memoria from "./memoria";
import Preguntas from "./preguntas";

/** Pantallas nativas del motor "university". Mismas claves que web/src/components/pro/registry.tsx. */
export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  hoy: Hoy,
  publicaciones: Publicaciones,
  bienvenida: Bienvenida,
  alojamiento: Alojamiento,
  asociaciones: Asociaciones,
  moderacion: Moderacion,
  atencion: Atencion,
  mentores: Mentores,
  calendario: Calendario,
  memoria: Memoria,
  preguntas: Preguntas,
};
