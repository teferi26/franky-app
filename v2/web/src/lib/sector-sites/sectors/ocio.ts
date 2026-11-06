import type { SectorSite } from "../types";

/** Web comercial de ocio.franky.es (Espacios de ocio). */
const site: SectorSite = {
  slug: "ocio",
  vertical: "culture",
  name: "Espacios de ocio",
  audienceLabel: "zona de ocio",
  eyebrow: "Franky para escape rooms y experiencias",
  title: "Tú preparas la experiencia.",
  accent: "Ellos encuentran su próximo plan.",
  description:
    "Organiza sesiones, plazas y reservas para tu espacio de ocio. Presenta tu escape room, taller o actividad a estudiantes que buscan algo que hacer juntos.",
  seoTitle: "Reservas para escape rooms y actividades de ocio | Franky",
  seoDescription:
    "Gestiona sesiones y reservas de tu escape room, taller o espacio de ocio con Franky Pro. Conecta tus experiencias con estudiantes y grupos.",
  benefits: [
    {
      title: "Sesiones con capacidad clara",
      body: "Define tus actividades y las plazas de cada sesión para organizar lo que puedes ofrecer.",
    },
    {
      title: "Reservas junto a la actividad",
      body: "Consulta a los participantes y gestiona los cambios desde la sesión que han reservado.",
    },
    {
      title: "La llegada bien organizada",
      body: "Registra la asistencia para saber quién ha llegado antes de empezar la experiencia.",
    },
  ],
  workflow: [
    {
      title: "Prepara tu actividad",
      body: "Define la duración, la capacidad y los recursos que requiere cada experiencia.",
    },
    {
      title: "Programa las sesiones",
      body: "Abre los horarios que puedes atender y revisa las reservas de cada pase.",
    },
    {
      title: "Recibe al grupo",
      body: "Consulta a los participantes y marca su llegada para empezar con todo preparado.",
    },
  ],
  studentTitle: "El plan que sale del grupo de clase.",
  studentBody:
    "Un reto entre amigos, un taller o una tarde diferente. Explica qué incluye tu experiencia y para quién está pensada para ayudar a un grupo a decidirse.",
  faq: [
    {
      question: "¿Está pensado solo para escape rooms?",
      answer:
        "No. También encaja con talleres y actividades organizadas por sesiones. En el alta revisamos cómo se reserva tu experiencia.",
    },
    {
      question: "¿Puedo limitar las plazas de cada pase?",
      answer:
        "Sí. Cada sesión tiene su propia capacidad para organizar las reservas según el espacio disponible.",
    },
    {
      question: "¿Puedo gestionar las llegadas desde el móvil?",
      answer:
        "Sí. Accede desde el navegador del móvil al espacio del negocio y consulta la sesión para registrar la asistencia.",
    },
  ],
  keywords: [
    "software escape room",
    "reservas actividades ocio",
    "gestión talleres",
    "ocio grupos universitarios",
  ],
};

export default site;
