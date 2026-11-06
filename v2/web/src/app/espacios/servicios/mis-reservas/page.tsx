import type { Metadata } from "next";
import ProfessionalBooking from "@/components/professional/ProfessionalBooking";
export const metadata: Metadata = {
  title: "Mis reservas",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <ProfessionalBooking myBookings />;
}
