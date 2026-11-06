import type { SectorSite } from "../types";

/** Web comercial de propietarios.franky.es (Propietarios). */
const site: SectorSite = {
  slug: "propietarios",
  vertical: "landlord",
  name: "Propietarios",
  audienceLabel: "propietario",
  eyebrow: "Franky para propietarios",
  title: "Tu piso puede ser",
  accent: "su primer hogar universitario.",
  description:
    "Presenta tu alojamiento a estudiantes y reúne sus visitas y conversaciones. Un espacio de propietario conectado con la vida universitaria de Franky.",
  seoTitle: "Franky para propietarios | Alquila a estudiantes",
  seoDescription:
    "Da a conocer tu piso o habitación a estudiantes con Franky. Consulta tus alojamientos, visitas y conversaciones desde un espacio de propietario.",
  benefits: [
    {
      title: "Tu alojamiento bien presentado",
      body: "Prepara la información del anuncio para que los estudiantes entiendan el piso antes de consultarte.",
    },
    {
      title: "Visitas en el mismo lugar",
      body: "Accede a las visitas relacionadas con tus alojamientos sin perder de vista el anuncio correspondiente.",
    },
    {
      title: "Consultas con contexto",
      body: "Reúne las conversaciones del espacio para retomar cada consulta con su información a mano.",
    },
  ],
  workflow: [
    {
      title: "Prepara el anuncio",
      body: "Reúne las fotos, la ubicación y las características del piso o de la habitación.",
    },
    {
      title: "Presenta tu alojamiento",
      body: "Solicita el alta y revisa la información que van a consultar los estudiantes.",
    },
    {
      title: "Gestiona las consultas",
      body: "Accede a tus conversaciones y visitas desde el espacio del propietario.",
    },
  ],
  studentTitle: "Una búsqueda que empieza antes de la mudanza.",
  studentBody:
    "Quien prepara el próximo curso necesita información clara para decidir dónde vivir. Acerca tu alojamiento a estudiantes que ya utilizan Franky para explorar su etapa universitaria.",
  faq: [
    {
      question: "¿Puedo usarlo si solo tengo un piso?",
      answer:
        "Sí. El espacio de propietario también está pensado para quien gestiona un único alojamiento.",
    },
    {
      question: "¿Puedo entrar sin tener una cuenta de estudiante?",
      answer:
        "Sí. Accede con tu cuenta al espacio de propietario. Tu gestión se centra en alojamientos, visitas y conversaciones.",
    },
    {
      question: "¿Franky elige al inquilino por mí?",
      answer:
        "La decisión es tuya. Franky te ayuda a presentar el alojamiento y organizar la relación con las personas interesadas.",
    },
  ],
  keywords: [
    "alquilar piso estudiantes",
    "Franky propietarios",
    "publicar habitación estudiantes",
    "gestión visitas alquiler",
  ],
};

export default site;
