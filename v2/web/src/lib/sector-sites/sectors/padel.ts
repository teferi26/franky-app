import type { SectorSite } from "../types";

/** Web comercial de padel.franky.es (Clubes de pádel). */
const site: SectorSite = {
  slug: "padel",
  vertical: "sports_facility",
  name: "Clubes de pádel",
  audienceLabel: "club de pádel",
  eyebrow: "Franky para pádel e instalaciones deportivas",
  title: "Cada pista tiene su hora.",
  accent: "Cada partido, su sitio.",
  description:
    "Consulta la disponibilidad de tus pistas y organiza las reservas en un calendario visual. Acerca tu club a estudiantes que quieren seguir jugando.",
  seoTitle: "Software de reservas de pistas de pádel | Franky",
  seoDescription:
    "Organiza pistas, disponibilidad y reservas de tu club de pádel con Franky Pro. Gestiona desde la web y presenta tu instalación a estudiantes.",
  benefits: [
    {
      title: "Disponibilidad por pista",
      body: "Consulta los recursos del club y los horarios reservados para encontrar el hueco adecuado.",
    },
    {
      title: "Reservas que puedes mover",
      body: "Crea, confirma o cambia una reserva y mantén actualizado el calendario del club.",
    },
    {
      title: "Seguimiento del partido",
      body: "Marca la llegada y registra el cobro asociado a la reserva para conservar el contexto.",
    },
  ],
  workflow: [
    {
      title: "Configura tus pistas",
      body: "Define los recursos y los servicios de reserva que ofrece tu instalación.",
    },
    {
      title: "Organiza los horarios",
      body: "Consulta las franjas disponibles y apunta cada reserva en la pista correspondiente.",
    },
    {
      title: "Recibe a los jugadores",
      body: "Confirma la llegada y actualiza el estado de la reserva desde el calendario.",
    },
  ],
  studentTitle: "Un partido después de clase.",
  studentBody:
    "Cuando alguien llega a una ciudad también busca dónde practicar su deporte. Presenta tu club en Franky y facilita que los estudiantes conozcan sus pistas y horarios.",
  faq: [
    {
      question: "¿Puedo gestionar varias pistas?",
      answer:
        "Sí. Cada pista se configura como un recurso para consultar su disponibilidad y organizar sus reservas.",
    },
    {
      question: "¿Sirve para otras instalaciones deportivas?",
      answer:
        "Puede encajar con espacios que se reservan por franjas. Al solicitar el alta revisamos los recursos y las reglas de tu instalación.",
    },
    {
      question: "¿Puedo registrar una reserva recibida por teléfono?",
      answer:
        "Sí. Puedes crearla desde el calendario y asociarla al cliente y a la pista correspondiente.",
    },
  ],
  keywords: [
    "software reservas pádel",
    "gestión pistas pádel",
    "calendario pistas",
    "reservas instalaciones deportivas",
  ],
};

export default site;
