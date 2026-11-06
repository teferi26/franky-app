import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Franky Pro", template: "%s · Franky Pro" },
  description: "La app de tu negocio conectada con los estudiantes: agenda, reservas, clientes y estudiantes que llegan sin comisión.",
  manifest: "/pro.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Franky Pro", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#121019",
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return children;
}
