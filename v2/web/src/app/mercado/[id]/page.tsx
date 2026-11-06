import type { Metadata } from "next";
import ListingDetailClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anuncio del mercado",
  robots: { index: false, follow: false },
};

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-bg-primary">
      <ListingDetailClient id={id} />
    </div>
  );
}
