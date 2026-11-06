import type { Metadata } from "next";
import ProfessionalBooking from "@/components/professional/ProfessionalBooking";
export const metadata: Metadata = {
  title: "Reserva con Franky",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const { organization } = await searchParams;
  return (
    <ProfessionalBooking
      organizationId={
        organization && /^[0-9a-f-]{36}$/.test(organization)
          ? organization
          : undefined
      }
    />
  );
}
