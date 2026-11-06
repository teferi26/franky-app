import React, { type ComponentType } from "react";
import { Compass } from "lucide-react-native";
import type { ProEngine, ProSectionId } from "../../../shared/pro/types";
import { hasSection } from "../../../shared/pro/verticals";
import { usePro } from "./store";
import { Empty } from "./kit";
import { ProPage } from "./shell";
import { SECTIONS as agenda } from "./sections/agenda";
import { SECTIONS as tables } from "./sections/tables";
import { SECTIONS as night } from "./sections/night";
import { SECTIONS as classes } from "./sections/classes";
import { SECTIONS as courts } from "./sections/courts";
import { SECTIONS as housing } from "./sections/housing";
import { SECTIONS as community } from "./sections/community";
import { SECTIONS as university } from "./sections/university";
import { SECTIONS as common } from "./sections/common";
import { useSpaceAccess } from "./billing/access";
import { ProLockScreen } from "./billing/ui";

/**
 * Qué pantalla pinta cada sección. Igual que en la web: primero la del motor
 * del sector ("tables:hoy") y después la común. Las pistas comparten la
 * pantalla de socios con las clases.
 */
const ENGINES: Record<ProEngine, Partial<Record<ProSectionId, ComponentType>>> = {
  agenda,
  tables,
  night,
  classes,
  courts: { socios: classes.socios, ...courts },
  housing,
  community,
  university,
};

export function SectionView({ section }: { section: ProSectionId }) {
  const { spaceId, vertical, canView } = usePro();
  const { locked } = useSpaceAccess();
  if (!canView(section)) {
    return (
      <ProPage>
        <Empty icon={Compass} title="Esta sección no está disponible" body="Elige una de las herramientas de tu negocio en el menú." />
      </ProPage>
    );
  }
  const View = ENGINES[vertical.engine][section] ?? common[section];
  if (!View || (section !== "hoy" && !hasSection(vertical.id, section))) {
    return (
      <ProPage>
        <Empty icon={Compass} title="Esta sección no es de tu sector" body="Usa el menú para ir a las herramientas de tu negocio." />
      </ProPage>
    );
  }
  // Negocio real sin Pro: las secciones de pago enseñan lo que ganaría.
  if (locked(section)) {
    return (
      <ProPage>
        <ProLockScreen spaceId={spaceId} vertical={vertical.id} section={section} />
      </ProPage>
    );
  }
  return <View />;
}
