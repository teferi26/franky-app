"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { usePro } from "@/lib/pro/store";
import type { ProEngine, ProSectionId } from "@/lib/pro/types";
import { hasSection } from "@/lib/pro/verticals";
import { Empty } from "./kit";
import { Compass } from "lucide-react";

/**
 * Qué pantalla pinta cada sección. Primero se busca la versión del motor del
 * sector (p. ej. "tables:hoy") y después la común ("hoy" no tiene común: cada
 * motor tiene su propio Hoy). Cada pantalla se carga por separado.
 */
const loading = () => <div className="h-72 rounded-2xl skeleton-shimmer" />;
const d = (loader: () => Promise<{ default: ComponentType }>) => dynamic(loader, { loading });

const ENGINE_SECTIONS: Partial<Record<`${ProEngine}:${ProSectionId}`, ComponentType>> = {
  "agenda:hoy": d(() => import("./sections/agenda/hoy")),
  "agenda:agenda": d(() => import("./sections/agenda/agenda")),
  "agenda:servicios": d(() => import("./sections/agenda/servicios")),
  "agenda:caja": d(() => import("./sections/agenda/caja")),
  "agenda:seguimiento": d(() => import("./sections/agenda/seguimiento")),

  "tables:hoy": d(() => import("./sections/tables/hoy")),
  "tables:reservas": d(() => import("./sections/tables/reservas")),
  "tables:sala": d(() => import("./sections/tables/sala")),
  "tables:carta": d(() => import("./sections/tables/carta")),
  "tables:validar": d(() => import("./sections/tables/validar")),
  "tables:pedidos": d(() => import("./sections/tables/pedidos")),
  "tables:grupos": d(() => import("./sections/tables/grupos")),
  "tables:eventos": d(() => import("./sections/tables/partidos")),
  "tables:caja": d(() => import("./sections/tables/caja")),
  "tables:cuadrante": d(() => import("./sections/tables/turnos")),
  "tables:appcc": d(() => import("./sections/tables/appcc")),
  "tables:compras": d(() => import("./sections/tables/compras")),
  "tables:costes": d(() => import("./sections/tables/costes")),
  "tables:bonos": d(() => import("./sections/tables/bonos")),

  "night:hoy": d(() => import("./sections/night/hoy")),
  "night:eventos": d(() => import("./sections/night/eventos")),
  "night:rrpp": d(() => import("./sections/night/rrpp")),
  "night:puerta": d(() => import("./sections/night/puerta")),
  "night:reservados": d(() => import("./sections/night/reservados")),
  "night:caja": d(() => import("./sections/night/caja")),
  "night:barra": d(() => import("./sections/night/barra")),
  "night:carta": d(() => import("./sections/night/carta")),
  "night:cuadrante": d(() => import("./sections/night/cuadrante")),
  "night:incidencias": d(() => import("./sections/night/incidencias")),

  "classes:hoy": d(() => import("./sections/classes/hoy")),
  "classes:horario": d(() => import("./sections/classes/horario")),
  "classes:socios": d(() => import("./sections/classes/socios")),
  "classes:clientes": d(() => import("./sections/classes/interesados")),
  "classes:torneos": d(() => import("./sections/classes/retos")),
  "classes:bonos": d(() => import("./sections/classes/bonos")),
  "classes:caja": d(() => import("./sections/classes/caja")),

  "courts:hoy": d(() => import("./sections/courts/hoy")),
  "courts:pistas": d(() => import("./sections/courts/pistas")),
  "courts:socios": d(() => import("./sections/classes/socios")),
  "courts:mostrador": d(() => import("./sections/courts/mostrador")),
  "courts:torneos": d(() => import("./sections/courts/torneos")),
  "courts:escuela": d(() => import("./sections/courts/escuela")),
  "courts:ocupacion": d(() => import("./sections/courts/ocupacion")),
  "courts:bonos": d(() => import("./sections/courts/bonos")),
  "courts:puestos": d(() => import("./sections/courts/puestos")),
  "courts:normas": d(() => import("./sections/courts/normas")),
  "courts:caja": d(() => import("./sections/courts/caja")),
  "courts:convenios": d(() => import("./sections/courts/convenios")),

  "housing:hoy": d(() => import("./sections/housing/hoy")),
  "housing:interesados": d(() => import("./sections/housing/interesados")),
  "housing:cartera": d(() => import("./sections/housing/cartera")),
  "housing:visitas": d(() => import("./sections/housing/visitas")),
  "housing:inquilinos": d(() => import("./sections/housing/inquilinos")),
  "housing:curso": d(() => import("./sections/housing/curso")),
  "housing:cuentas": d(() => import("./sections/housing/cuentas")),

  "community:hoy": d(() => import("./sections/community/hoy")),
  "community:actividades": d(() => import("./sections/community/actividades")),
  "community:miembros": d(() => import("./sections/community/miembros")),
  "community:avisos": d(() => import("./sections/community/avisos")),
  "community:patrocinios": d(() => import("./sections/community/patrocinios")),
  "community:subvenciones": d(() => import("./sections/community/subvenciones")),
  "community:junta": d(() => import("./sections/community/junta")),
  "community:caja": d(() => import("./sections/community/caja")),
  "community:asamblea": d(() => import("./sections/community/asamblea")),
  "community:material": d(() => import("./sections/community/material")),

  "university:hoy": d(() => import("./sections/university/hoy")),
  "university:publicaciones": d(() => import("./sections/university/publicaciones")),
  "university:bienvenida": d(() => import("./sections/university/bienvenida")),
  "university:alojamiento": d(() => import("./sections/university/alojamiento")),
  "university:asociaciones": d(() => import("./sections/university/asociaciones")),
  "university:moderacion": d(() => import("./sections/university/moderacion")),
  "university:calendario": d(() => import("./sections/university/calendario")),
  "university:memoria": d(() => import("./sections/university/memoria")),
  "university:atencion": d(() => import("./sections/university/atencion")),
  "university:mentores": d(() => import("./sections/university/mentores")),
  "university:preguntas": d(() => import("./sections/university/preguntas")),
};

const COMMON_SECTIONS: Partial<Record<ProSectionId, ComponentType>> = {
  validar: d(() => import("./sections/tables/validar")),
  clientes: d(() => import("./sections/common/clientes")),
  grupos: d(() => import("./sections/common/grupos")),
  estudiantes: d(() => import("./sections/common/estudiantes")),
  equipo: d(() => import("./sections/common/equipo")),
  ajustes: d(() => import("./sections/common/ajustes")),
  guia: d(() => import("./sections/common/guia")),
};

export default function SectionView({ section }: { section: ProSectionId }) {
  const { vertical, canView } = usePro();
  if (!canView(section)) {
    return <Empty icon={Compass} title="Esta sección no está disponible" body="Elige una de las herramientas de tu negocio en el menú." className="mt-10" />;
  }
  const View = ENGINE_SECTIONS[`${vertical.engine}:${section}`] ?? COMMON_SECTIONS[section];
  if (!View || (section !== "hoy" && !hasSection(vertical.id, section))) {
    return (
      <Empty
        icon={Compass}
        title="Esta sección no es de tu sector"
        body="Usa el menú para ir a las herramientas de tu negocio."
        className="mt-10"
      />
    );
  }
  return <View />;
}
