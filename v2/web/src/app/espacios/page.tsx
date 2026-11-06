import type { Metadata } from "next";
import { redirect } from "next/navigation";
import WorkspaceDashboard from "./workspace-dashboard";
import { validOrganizationId } from "@/lib/sector-workspace-access";

export const metadata: Metadata = {
  title: "Mis espacios",
  robots: { index: false, follow: false },
};

/** Los sectores que conservan este panel reciben una selección, nunca permisos. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; organization?: string | string[] }>;
}) {
  const { panel, organization } = await searchParams;
  if (panel !== "1") redirect("/pro");
  const initialOrganization = validOrganizationId(organization);
  return (
    <WorkspaceDashboard
      key={initialOrganization ?? "default"}
      initialOrganization={initialOrganization}
    />
  );
}
