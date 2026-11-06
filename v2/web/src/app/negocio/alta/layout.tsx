import type { Metadata } from "next";

// La página es un componente cliente (formulario): la metadata vive aquí.
export const metadata: Metadata = {
  title: "Alta de propietarios y negocios",
  description:
    "Crea tu cuenta de propietario, inmobiliaria o local en Franky sin pasar por el registro de estudiante y publica tu piso o tu negocio para universitarios de toda España.",
  alternates: { canonical: "/negocio/alta" },
};

export default function NegocioAltaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
