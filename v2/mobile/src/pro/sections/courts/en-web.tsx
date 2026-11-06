import React from "react";
import { Linking } from "react-native";
import { Activity, Armchair, ConciergeBell, ExternalLink, School, Trophy, type LucideIcon } from "lucide-react-native";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { sectionLabel } from "../../sections";
import type { ProSectionId } from "../../../../../shared/pro/types";
import { Empty, PButton, PageHeader, Panel } from "../../kit";

/**
 * Secciones del motor de pistas que todavía no tienen pantalla nativa
 * (mostrador, torneos, escuela, ocupación y puestos). En vez de un callejón
 * sin salida, explican qué hay dentro y abren la misma pantalla en el
 * navegador, con la sesión de franky.es.
 */

const COPY: Partial<Record<ProSectionId, { icon: LucideIcon; title: string; body: string }>> = {
  mostrador: {
    icon: ConciergeBell,
    title: "Tu mostrador",
    body: "Quién entra ahora, quién ha pagado su parte, qué está libre y la venta rápida del mostrador. Se usa mejor en la tableta o el ordenador de recepción.",
  },
  torneos: {
    icon: Trophy,
    title: "Americanas, liga y ranking",
    body: "Crea americanas, apunta resultados de la liga entre facultades y enseña el ranking en la tele del club.",
  },
  escuela: {
    icon: School,
    title: "Tu escuela",
    body: "Grupos por nivel, asistencia en dos toques, cuotas y las horas de cada monitor.",
  },
  ocupacion: {
    icon: Activity,
    title: "Ocupación de la semana",
    body: "El mapa de calor por media hora, las franjas frías que se repiten y una oferta para cada una.",
  },
  puestos: {
    icon: Armchair,
    title: "Plano, taquillas y horas",
    body: "Puestos numerados, puestos fijos, taquillas ligadas a la cuota y las horas que lleva cada socio.",
  },
};

function WebSection({ section }: { section: ProSectionId }) {
  const { spaceId, vertical } = usePro();
  const copy = COPY[section];
  const label = sectionLabel(vertical.id, section);
  const url = `https://franky.es/pro/${spaceId}/${section}`;
  return (
    <ProPage>
      <PageHeader eyebrow={label} title={copy?.title ?? label} />
      <Panel>
        <Empty
          icon={copy?.icon}
          title="Ábrelo en pantalla grande"
          body={copy?.body}
          action={<PButton label="Abrir en el navegador" icon={ExternalLink} onPress={() => void Linking.openURL(url)} />}
        />
      </Panel>
    </ProPage>
  );
}

export const Mostrador = () => <WebSection section="mostrador" />;
export const Torneos = () => <WebSection section="torneos" />;
export const Escuela = () => <WebSection section="escuela" />;
export const Ocupacion = () => <WebSection section="ocupacion" />;
export const Puestos = () => <WebSection section="puestos" />;
