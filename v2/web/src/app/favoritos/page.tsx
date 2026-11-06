import type { Metadata } from "next";
import FavoritosClient from "./client";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Mis Favoritos",
  description: "Tus carreras, becas y universidades guardadas en Franky.",
};

export default function FavoritosPage() {
  return <FavoritosClient />;
}
