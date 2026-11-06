import React from "react";
import { useLocalSearchParams } from "expo-router";
import { SectionView } from "@/pro/registry";
import type { ProSectionId } from "../../../../shared/pro/types";

export default function ProSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  return <SectionView section={String(section ?? "hoy") as ProSectionId} />;
}
