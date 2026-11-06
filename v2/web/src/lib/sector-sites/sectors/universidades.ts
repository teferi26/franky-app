import type { SectorSite } from "../types";

/** Web comercial de universidades.franky.es (Universidades). */
const site: SectorSite = {
  slug: "universidades",
  vertical: "university",
  name: "Universidades",
  audienceLabel: "universidad",
  eyebrow: "Franky para universidades y facultades",
  title: "El campus también vive",
  accent: "fuera del aula.",
  description:
    "Conecta la información, las publicaciones y los eventos de tu universidad con la experiencia estudiantil. Un espacio para los equipos que acompañan esa vida de campus.",
  seoTitle: "Franky para universidades | Comunidad y vida de campus",
  seoDescription:
    "Conoce el espacio de Franky para universidades y facultades. Organiza contenido, eventos y accesos del equipo dentro de la experiencia estudiantil.",
  benefits: [
    {
      title: "Información con un lugar propio",
      body: "Reúne los recursos académicos y el contenido vinculados al espacio de tu universidad.",
    },
    {
      title: "Eventos cerca del alumnado",
      body: "Gestiona publicaciones y eventos dentro de una plataforma que acompaña distintas etapas de la vida universitaria.",
    },
    {
      title: "Roles para cada equipo",
      body: "Organiza quién edita, quién modera y quién consulta la información del espacio según sus responsabilidades.",
    },
  ],
  workflow: [
    {
      title: "Define el ámbito",
      body: "Cuéntanos si representas a una universidad, una facultad o un servicio y qué quieres acercar al alumnado.",
    },
    {
      title: "Prepara al equipo",
      body: "Revisamos la representación del centro y los accesos de las personas que van a gestionarlo.",
    },
    {
      title: "Organiza el contenido",
      body: "Reúne la información y los eventos que quieres incorporar a la experiencia de tu campus.",
    },
  ],
  studentTitle: "Desde elegir carrera hasta encontrar su sitio.",
  studentBody:
    "Estudios, alojamiento, asociaciones y ocio forman parte de la misma etapa. Franky reúne esas necesidades para que la universidad pueda acercar su información a ese recorrido.",
  faq: [
    {
      question: "¿Puede participar una facultad o un servicio?",
      answer:
        "Sí. La propuesta puede estudiarse para un ámbito concreto. Indica a quién representas y qué necesidades quieres cubrir al solicitar información.",
    },
    {
      question: "¿Cualquier cuenta puede publicar como universidad?",
      answer:
        "El acceso institucional requiere revisar la representación del centro y asignar los permisos correspondientes.",
    },
    {
      question: "¿Qué incluye la colaboración?",
      answer:
        "El alcance se acuerda con el centro: equipos participantes, contenido, eventos y herramientas disponibles. La demo permite explorar la propuesta antes de concretarlo.",
    },
  ],
  keywords: [
    "Franky universidades",
    "plataforma vida campus",
    "comunidad universitaria",
    "gestión eventos universidad",
  ],
};

export default site;
