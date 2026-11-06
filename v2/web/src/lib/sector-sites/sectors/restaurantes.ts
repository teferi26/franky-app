import type { SectorSite } from "../types";

/** Web comercial de restaurantes.franky.es (Restaurantes). */
const site: SectorSite = {
  slug: "restaurantes",
  vertical: "restaurant",
  name: "Restaurantes",
  audienceLabel: "restaurante",
  eyebrow: "Franky para restaurantes",
  title: "Una sala que se entiende.",
  accent: "Un servicio que se comparte.",
  description:
    "Reúne el plano de mesas, las reservas y la lista de espera. Tu equipo sabe qué ocurre en sala y tus próximos comensales pueden encontrarte en Franky.",
  seoTitle: "Software de reservas y mesas para restaurantes | Franky",
  seoDescription:
    "Gestiona el plano de sala, las reservas, los grupos y la lista de espera de tu restaurante con Franky Pro. Descubre la conexión con estudiantes.",
  benefits: [
    {
      title: "Tu sala, de un vistazo",
      body: "Distribuye las mesas y sus capacidades en un plano para consultar la ocupación durante el servicio.",
    },
    {
      title: "Una espera ordenada",
      body: "Registra a quienes esperan, asígnales una mesa y actualiza su situación cuando puedan sentarse.",
    },
    {
      title: "Grupos bien preparados",
      body: "Centraliza las peticiones de grupo y tus propuestas para tener el contexto antes de la cena.",
    },
  ],
  workflow: [
    {
      title: "Dibuja tu sala",
      body: "Organiza mesas y zonas con la capacidad que utilizas en cada servicio.",
    },
    {
      title: "Prepara las reservas",
      body: "Revisa horarios, comensales y grupos para coordinar la jornada con el equipo.",
    },
    {
      title: "Sigue cada mesa",
      body: "Marca la llegada, la salida y la preparación de la mesa para saber cuándo vuelve a estar disponible.",
    },
  ],
  studentTitle: "También hay grandes ocasiones en el campus.",
  studentBody:
    "Cenas de clase, encuentros de asociaciones y celebraciones de fin de curso. Enseña tu restaurante a una comunidad que busca lugares donde reunirse y celebrar.",
  faq: [
    {
      question: "¿Puedo organizar el plano por zonas?",
      answer:
        "Sí. La sala permite distribuir las mesas por zonas y consultar su capacidad y estado.",
    },
    {
      question: "¿Qué pasa cuando el restaurante está lleno?",
      answer:
        "Puedes incorporar a los clientes a la lista de espera y asignarles una mesa cuando haya disponibilidad.",
    },
    {
      question: "¿Franky sustituye mi TPV?",
      answer:
        "Franky te ayuda con reservas, sala y relación con clientes. Mantén tu TPV y tu sistema de facturación para las funciones que ya cubren.",
    },
  ],
  keywords: [
    "software reservas restaurante",
    "plano mesas restaurante",
    "lista espera restaurante",
    "gestión sala restaurante",
  ],
};

export default site;
