import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ProfessionalDashboard from "@/components/professional/ProfessionalDashboard";

export const metadata: Metadata = {
  title: "Tu negocio",
  robots: { index: false, follow: false },
};

/** Redirige a Franky Pro; el panel antiguo solo se abre con ?panel=1. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string; panel?: string }>;
}) {
  const { organization, panel } = await searchParams;
  const valid = organization && /^[0-9a-f-]{36}$/.test(organization) ? organization : undefined;
  if (panel !== "1") redirect(valid ? `/pro/${valid}` : "/pro");
  return <ProfessionalDashboard organizationId={valid} />;
}
