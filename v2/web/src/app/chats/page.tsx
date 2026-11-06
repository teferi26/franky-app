import type { Metadata } from "next";
import ChatsClient from "./client";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Mensajes",
  description: "Mensajería en tiempo real con otros estudiantes en Franky.",
  robots: { index: false, follow: false },
};

export default function ChatsPage() {
  return <ChatsClient />;
}
