import type { SectorSite } from "../types";

/** Web comercial de coworking.franky.es (Coworkings). */
const site: SectorSite = {
  slug: "coworking",
  vertical: "coworking",
  name: "Coworkings",
  audienceLabel: "coworking",
  eyebrow: "Franky para coworkings y salas de estudio",
  title: "Un lugar para concentrarse.",
  accent: "Un espacio fácil de organizar.",
  description:
    "Gestiona la disponibilidad y las reservas de tus salas y espacios. Presenta tu coworking a quienes necesitan un sitio para estudiar, reunirse o trabajar.",
  seoTitle: "Reservas de salas para coworkings y estudio | Franky",
  seoDescription:
    "Organiza recursos, horarios y reservas de salas en tu coworking con Franky Pro. Conecta tus espacios de trabajo y estudio con universitarios.",
  benefits: [
    {
      title: "Cada sala, identificada",
      body: "Define tus espacios como recursos para diferenciar qué se puede reservar y cuándo.",
    },
    {
      title: "Un calendario compartido",
      body: "Consulta la disponibilidad y crea o mueve reservas desde el espacio de gestión.",
    },
    {
      title: "Reservas con contexto",
      body: "Mantén la información del cliente junto a su reserva para preparar la llegada y el uso del espacio.",
    },
  ],
  workflow: [
    {
      title: "Define los espacios",
      body: "Prepara las salas y recursos que ofreces, con los servicios de reserva correspondientes.",
    },
    {
      title: "Organiza la disponibilidad",
      body: "Configura los horarios de uso y consulta las franjas que ya están ocupadas.",
    },
    {
      title: "Gestiona cada estancia",
      body: "Revisa quién viene, confirma la llegada y registra el cobro de la reserva cuando corresponda.",
    },
  ],
  studentTitle: "Cuando la biblioteca se queda corta.",
  studentBody:
    "Un trabajo en grupo, la preparación de exámenes o un proyecto que está empezando. Enseña qué ofrece tu espacio y ayuda a elegir un lugar adecuado para concentrarse.",
  faq: [
    {
      question: "¿Puedo separar salas de reunión y de estudio?",
      answer:
        "Sí. Puedes configurar recursos distintos y los servicios que se reservan en cada uno.",
    },
    {
      question: "¿Hay una vista de la disponibilidad?",
      answer:
        "Sí. El calendario de espacios reúne reservas y disponibilidad para organizar los horarios.",
    },
    {
      question: "¿Incluye apertura automática de puertas?",
      answer:
        "No es una función incluida en esta propuesta. El acceso físico a tus espacios sigue con el sistema que utilices actualmente.",
    },
  ],
  keywords: [
    "reservas salas coworking",
    "software coworking",
    "gestión salas estudio",
    "calendario espacios trabajo",
  ],
};

export default site;
