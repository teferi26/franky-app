import { notFound } from "next/navigation";
import SectionView from "@/components/pro/registry";
import { SECTION_META } from "@/components/pro/sections";
import type { ProSectionId } from "@/lib/pro/types";

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in SECTION_META) || section === "hoy") notFound();
  return <SectionView section={section as ProSectionId} />;
}
