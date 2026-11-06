import React from "react";
import { Slot, useLocalSearchParams } from "expo-router";
import { ProProvider } from "@/pro/store";
import { ProShell, ProShellSkeleton } from "@/pro/shell";

/** Un negocio de Franky Pro: datos, cabecera y barra inferior propia. */
export default function ProSpaceLayout() {
  const { space } = useLocalSearchParams<{ space: string }>();
  const spaceId = String(space ?? "");
  return (
    <ProProvider spaceId={spaceId} fallback={<ProShellSkeleton />}>
      <ProShell>
        <Slot />
      </ProShell>
    </ProProvider>
  );
}
