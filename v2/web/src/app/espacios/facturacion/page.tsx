import type { Metadata } from "next";
import ProfessionalBilling from "@/components/professional/ProfessionalBilling";
export const metadata: Metadata = {
  title: "Plan de tu negocio",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string; order?: string }>;
}) {
  const { organization, order } = await searchParams;
  const valid = (value?: string) =>
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value
      : undefined;
  return (
    <ProfessionalBilling
      organizationId={valid(organization)}
      orderId={valid(order)}
    />
  );
}
