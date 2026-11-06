import type { SectorSite } from "../types";

/** Web comercial de bares.franky.es (Bares). */
const site: SectorSite = {
  slug: "bares",
  vertical: "bar",
  name: "Bares",
  audienceLabel: "bar",
  eyebrow: "Franky para bares y tapas",
  title: "La próxima quedada",
  accent: "puede empezar en tu bar.",
  description:
    "Mesas, reservas y peticiones de grupo organizadas en un mismo sitio. Acerca tu bar a quienes buscan dónde reunirse después de clase.",
  seoTitle: "Gestión de reservas para bares y tapas | Franky",
  seoDescription:
    "Organiza mesas, reservas y peticiones de grupo en tu bar con Franky Pro. Da a conocer tu local a estudiantes y gestiona desde el móvil o la web.",
  benefits: [
    {
      title: "Reservas localizadas",
      body: "Consulta las mesas y las reservas del día para saber quién viene, a qué hora y con cuántas personas.",
    },
    {
      title: "Grupos con contexto",
      body: "Revisa las peticiones de grupo y responde con una propuesta desde el espacio del negocio.",
    },
    {
      title: "Llegadas sin perder el hilo",
      body: "Registra llegadas, asigna mesa y actualiza el estado para que el equipo vea cómo va el servicio.",
    },
  ],
  workflow: [
    {
      title: "Organiza tus mesas",
      body: "Define los recursos del local y su capacidad para que las reservas tengan un sitio concreto.",
    },
    {
      title: "Revisa el día",
      body: "Consulta las reservas y las peticiones de grupos antes de abrir.",
    },
    {
      title: "Acompaña el servicio",
      body: "Sienta a los clientes, actualiza las mesas y gestiona la espera desde el mismo panel.",
    },
  ],
  studentTitle: "El bar que recomienda la clase.",
  studentBody:
    "Una ronda al salir de la facultad, un cumpleaños o una cena de compañeros. Presenta tu bar y facilita que un grupo entienda qué ofreces antes de ponerse en contacto.",
  faq: [
    {
      question: "¿Puedo apuntar a alguien que llega sin reserva?",
      answer:
        "Sí. La gestión de mesas permite registrar llegadas sin reserva y asignarles una mesa disponible.",
    },
    {
      question: "¿Sirve para grupos de estudiantes?",
      answer:
        "Puedes revisar peticiones de grupo y responder con una propuesta. Tú decides la disponibilidad y las condiciones de cada encuentro.",
    },
    {
      question: "¿Podemos consultar las reservas desde varios dispositivos?",
      answer:
        "Sí. Las personas autorizadas pueden acceder al espacio del negocio con su cuenta y consultar los datos guardados.",
    },
  ],
  keywords: [
    "reservas bares",
    "software bar tapas",
    "gestión mesas bar",
    "bares grupos universitarios",
  ],
};

export default site;
