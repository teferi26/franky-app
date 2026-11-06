import type { SectorSite } from "../types";

/** Web comercial de gimnasios.franky.es (Gimnasios). */
const site: SectorSite = {
  slug: "gimnasios",
  vertical: "sports",
  name: "Gimnasios",
  audienceLabel: "gimnasio",
  eyebrow: "Franky para gimnasios, estudios y boxes",
  title: "Organiza las clases.",
  accent: "Acompaña cada entrenamiento.",
  description:
    "Horarios, sesiones y asistencia en un mismo lugar. Coordina tu gimnasio, estudio de yoga o box y presenta tus actividades a estudiantes de tu zona.",
  seoTitle: "Gestión de clases para gimnasios y estudios | Franky",
  seoDescription:
    "Organiza horarios, sesiones, plazas y asistencia en tu gimnasio, box o estudio con Franky Pro. Conecta tus clases con la comunidad universitaria.",
  benefits: [
    {
      title: "Un horario que se puede seguir",
      body: "Crea tipos de clase y sesiones con su duración, horario y capacidad para organizar la semana.",
    },
    {
      title: "La asistencia, a mano",
      body: "Consulta las reservas de cada sesión y registra quién ha venido desde el propio horario.",
    },
    {
      title: "Cambios bajo control",
      body: "Gestiona las reservas y las cancelaciones de clase con la información reunida en el mismo espacio.",
    },
  ],
  workflow: [
    {
      title: "Prepara tus actividades",
      body: "Define las clases que impartes, su duración y las plazas que puedes ofrecer.",
    },
    {
      title: "Organiza la semana",
      body: "Crea sesiones y repite su programación cuando el horario se mantenga.",
    },
    {
      title: "Pasa lista",
      body: "Abre la sesión para consultar las reservas y marcar la asistencia de cada participante.",
    },
  ],
  studentTitle: "Entrenar también puede formar parte del curso.",
  studentBody:
    "Ayuda a quienes llegan a la ciudad a descubrir tu gimnasio. Un horario claro y actividades bien explicadas facilitan encontrar una clase que encaje entre estudios y vida social.",
  faq: [
    {
      question: "¿Sirve para yoga, baile o un box?",
      answer:
        "Sí. Puedes definir tus propios tipos de clase y crear sesiones con el horario y la capacidad que necesites.",
    },
    {
      question: "¿Puedo repetir un horario semanal?",
      answer:
        "Sí. La creación de sesiones permite repetir la programación durante varias semanas.",
    },
    {
      question: "¿Franky cobra las cuotas de mis socios?",
      answer:
        "La gestión de clases y asistencia no implica un cobro automático de cuotas. Consulta en el alta las opciones disponibles para tu centro.",
    },
  ],
  keywords: [
    "software clases gimnasio",
    "gestión estudio yoga",
    "horario gimnasio",
    "control asistencia clases",
  ],
};

export default site;
