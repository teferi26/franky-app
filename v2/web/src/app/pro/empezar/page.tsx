import StartFlow from "./start-flow";
import {
  sectorOnboardingContext,
  type SectorSearchParams,
} from "@/lib/sector-onboarding";

export const metadata = {
  title: "Empieza con Franky Pro",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SectorSearchParams>;
}) {
  const context = sectorOnboardingContext(await searchParams);
  return <StartFlow key={context.initialVertical ?? "all"} {...context} />;
}
