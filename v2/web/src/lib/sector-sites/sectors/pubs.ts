import type { SectorSite } from "../types";

/** Web comercial de pubs.franky.es (Pubs). */
const site: SectorSite = {
  slug: "pubs",
  vertical: "pub",
  name: "Pubs",
  audienceLabel: "pub",
  eyebrow: "Franky para pubs",
  title: "Tu local tiene una noche propia.",
  accent: "Haz que la conozcan.",
  description:
    "Presenta tu pub, organiza su contenido y reúne los eventos que le dan personalidad. Un espacio para conectar tu programación con la comunidad de Franky.",
  seoTitle: "Franky para pubs | Local, eventos y comunidad",
  seoDescription:
    "Da a conocer tu pub y organiza su presencia y sus eventos en Franky. Solicita tu espacio de negocio y conoce las herramientas para tu equipo.",
  benefits: [
    {
      title: "Tu ambiente bien contado",
      body: "Reúne la información del local para que quien busca un plan entienda qué tipo de noche le espera.",
    },
    {
      title: "Eventos en tu espacio",
      body: "Consulta y gestiona los eventos vinculados a tu negocio junto al resto de su contenido.",
    },
    {
      title: "Un acceso para el equipo",
      body: "Organiza quién participa en el espacio y qué puede gestionar cada persona según su rol.",
    },
  ],
  workflow: [
    {
      title: "Presenta tu pub",
      body: "Prepara la ubicación, el horario y el contenido que describe tu local.",
    },
    {
      title: "Organiza la programación",
      body: "Reúne tus eventos y revisa la información que necesita quien está eligiendo un plan.",
    },
    {
      title: "Entra con tu equipo",
      body: "Accede al panel del negocio y trabaja con las herramientas activadas para tu espacio.",
    },
  ],
  studentTitle: "Un sitio para volver a encontrarse.",
  studentBody:
    "Música, ambiente y un plan que compartir. Tu presencia en Franky ayuda a que los estudiantes conozcan el pub antes de decidir dónde reunirse.",
  faq: [
    {
      question: "¿Puedo gestionar el contenido con mi equipo?",
      answer:
        "Sí. El espacio admite miembros con distintos roles para repartir el trabajo sin compartir una única cuenta.",
    },
    {
      question: "¿Están incluidas todas las herramientas de la demo?",
      answer:
        "La demo te permite explorar la propuesta de Franky Pro para pubs. En el alta revisamos contigo las herramientas disponibles y cuáles se activan para tu local.",
    },
    {
      question: "¿Dónde entro si ya tengo un espacio de negocio?",
      answer:
        "Accede con tu cuenta de Franky y elige el espacio del pub. Las herramientas actuales siguen disponibles desde tu panel.",
    },
  ],
  keywords: [
    "Franky pubs",
    "gestión pub",
    "eventos pub",
    "pubs comunidad universitaria",
  ],
};

export default site;
