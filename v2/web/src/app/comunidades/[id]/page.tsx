import type { Metadata } from "next";
import ComunidadDetailClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comunidad",
  robots: { index: false, follow: false },
};

export default async function ComunidadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-bg-primary">
      <ComunidadDetailClient id={id} />
    </div>
  );
}
