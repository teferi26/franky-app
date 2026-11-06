/** Professional operations v1. All prices, limits and authorization are rechecked by SQL. */
export const PROFESSIONAL_CATEGORIES = [
  "hairdresser",
  "beauty",
  "cafe",
  "bar",
  "restaurant",
  "pub",
  "nightclub",
  "sports",
  "sports_facility",
  "academy",
  "culture",
  "coworking",
] as const;
export type ProfessionalCategory = (typeof PROFESSIONAL_CATEGORIES)[number];
export type ProfessionalMode = "appointment" | "resource" | "session" | "group";
export const PROFESSIONAL_SECTORS: Record<
  ProfessionalCategory,
  {
    label: string;
    headline: string;
    action: string;
    mode: ProfessionalMode;
    tabs: readonly string[];
    benefits: readonly string[];
    monthly: number;
    annual: number;
    founder: number;
  }
> = {
  hairdresser: {
    label: "Peluquería / Barbería",
    headline: "Tus citas, a punto",
    action: "Añadir cita",
    mode: "appointment",
    tabs: ["Hoy", "Agenda", "Servicios", "Clientes", "Gestión"],
    benefits: [
      "Agenda por profesional",
      "Reservas con disponibilidad real",
      "Cancelaciones y huecos recuperables",
      "Sellos por servicios completados",
    ],
    monthly: 2900,
    annual: 29000,
    founder: 19900,
  },
  beauty: {
    label: "Estética no médica",
    headline: "Cada cita y cabina, coordinadas",
    action: "Añadir cita",
    mode: "appointment",
    tabs: ["Hoy", "Agenda", "Servicios", "Clientes", "Gestión"],
    benefits: [
      "Agendas y cabinas",
      "Servicios con tiempo de preparación",
      "Bonos con historial de sesiones",
      "Fidelización propia",
    ],
    monthly: 2900,
    annual: 29000,
    founder: 19900,
  },
  cafe: {
    label: "Cafetería",
    headline: "Premia a quien vuelve",
    action: "Validar Franky Card",
    mode: "group",
    tabs: ["Hoy", "Carta", "Card", "Clientes", "Gestión"],
    benefits: [
      "Grupos bajo solicitud",
      "Agenda compartida con tu equipo",
      "Historial de reservas",
      "Horarios y bloqueos por recurso",
    ],
    monthly: 1900,
    annual: 19000,
    founder: 14900,
  },
  bar: {
    label: "Bar",
    headline: "Todo preparado para recibirles",
    action: "Añadir reserva",
    mode: "group",
    tabs: ["Hoy", "Reservas", "Carta", "Card", "Gestión"],
    benefits: [
      "Reservas de grupos",
      "Menús y condiciones acordadas",
      "Control de llegadas",
      "Fidelización propia",
    ],
    monthly: 1900,
    annual: 19000,
    founder: 14900,
  },
  restaurant: {
    label: "Restaurante",
    headline: "Tu próximo servicio, organizado",
    action: "Añadir reserva",
    mode: "group",
    tabs: ["Hoy", "Reservas", "Carta", "Card", "Gestión"],
    benefits: [
      "Reservas y mesas",
      "Grupos con menú acordado",
      "Resumen del servicio",
      "Condiciones de cancelación claras",
    ],
    monthly: 3900,
    annual: 39000,
    founder: 29900,
  },
  pub: {
    label: "Pub",
    headline: "Prepara la noche",
    action: "Reservar zona",
    mode: "group",
    tabs: ["Esta noche", "Reservas", "Planes", "Card", "Gestión"],
    benefits: [
      "Cumpleaños y grupos",
      "Zonas con disponibilidad",
      "Eventos y entradas existentes",
      "Resultados por sesión",
    ],
    monthly: 2900,
    annual: 29000,
    founder: 19900,
  },
  nightclub: {
    label: "Discoteca / Promotor",
    headline: "Tu próxima sesión",
    action: "Gestionar evento",
    mode: "group",
    tabs: ["Esta noche", "Eventos", "Acceso", "Resultados", "Gestión"],
    benefits: [
      "Eventos y entradas",
      "Control de acceso autorizado",
      "Reservados por horario",
      "Ventajas Card independientes de entrada",
    ],
    monthly: 5900,
    annual: 59000,
    founder: 44900,
  },
  sports: {
    label: "Clases deportivas",
    headline: "Cada clase, con su grupo",
    action: "Crear sesión",
    mode: "session",
    tabs: ["Hoy", "Horarios", "Alumnos", "Bonos", "Gestión"],
    benefits: [
      "Sesiones repetidas",
      "Aforo y lista de espera",
      "Asistencia",
      "Bonos y reversión registrada",
    ],
    monthly: 3900,
    annual: 39000,
    founder: 29900,
  },
  sports_facility: {
    label: "Pistas / Instalación deportiva",
    headline: "Espacios disponibles, sin solapamientos",
    action: "Reservar pista",
    mode: "resource",
    tabs: ["Hoy", "Reservas", "Espacios", "Clientes", "Gestión"],
    benefits: [
      "Disponibilidad por pista",
      "Bloqueos y mantenimiento",
      "Reservas por franja",
      "Historial de clientes",
    ],
    monthly: 3900,
    annual: 39000,
    founder: 29900,
  },
  academy: {
    label: "Academia",
    headline: "Tus próximas clases",
    action: "Crear sesión",
    mode: "session",
    tabs: ["Hoy", "Horarios", "Alumnos", "Bonos", "Gestión"],
    benefits: [
      "Grupos y clases de prueba",
      "Sesiones con plazas",
      "Lista de espera",
      "Bonos de sesiones",
    ],
    monthly: 3900,
    annual: 39000,
    founder: 29900,
  },
  culture: {
    label: "Taller / Cultura",
    headline: "Tu próxima actividad",
    action: "Crear actividad",
    mode: "session",
    tabs: ["Resumen", "Actividades", "Asistentes", "Ingresos", "Gestión"],
    benefits: [
      "Actividades repetidas",
      "Inscripciones y aforo",
      "Asistencia y espera",
      "Condiciones claras",
    ],
    monthly: 2900,
    annual: 29000,
    founder: 19900,
  },
  coworking: {
    label: "Coworking / Sala de estudio",
    headline: "Cada puesto y sala, disponibles",
    action: "Crear reserva",
    mode: "resource",
    tabs: ["Hoy", "Reservas", "Espacios", "Clientes", "Gestión"],
    benefits: [
      "Salas exclusivas",
      "Puestos con aforo",
      "Horarios y excepciones",
      "Registro de llegadas",
    ],
    monthly: 3900,
    annual: 39000,
    founder: 29900,
  },
};
export function professionalCategory(
  value: string | null | undefined,
): ProfessionalCategory | null {
  const aliases: Record<string, ProfessionalCategory> = {
    peluqueria: "hairdresser",
    barberia: "hairdresser",
    estetica: "beauty",
    cafeteria: "cafe",
    restaurante: "restaurant",
    discoteca: "nightclub",
    deportivo: "sports",
    cultural: "culture",
  };
  return value &&
    PROFESSIONAL_CATEGORIES.includes(value as ProfessionalCategory)
    ? (value as ProfessionalCategory)
    : value
      ? (aliases[value] ?? null)
      : null;
}
export type ProfessionalSettings = {
  organization_id: string;
  category: ProfessionalCategory;
  timezone: string;
  enabled: boolean;
  public_booking: boolean;
  require_approval: boolean;
  booking_horizon_days: number;
  cancellation_hours: number;
  terms: string;
  staff_limit: number;
  resource_limit: number;
  service_limit: number;
  sales_enabled: boolean;
  demo: boolean;
};
export type ProfessionalService = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  mode: ProfessionalMode;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number;
  price_basis: "booking" | "person";
  deposit_cents: number;
  capacity: number;
  required_resource_ids: string[];
  staff_required: boolean;
  active: boolean;
  menu: string;
  version: number;
};
export type ProfessionalResource = {
  id: string;
  organization_id: string;
  name: string;
  kind: "staff" | "room" | "equipment" | "table" | "court" | "desk";
  capacity: number;
  active: boolean;
};
export type ProfessionalAvailability = {
  id: string;
  organization_id: string;
  resource_id: string | null;
  weekday: number;
  start_minute: number;
  end_minute: number;
};
export type ProfessionalException = {
  id: string;
  organization_id: string;
  resource_id: string | null;
  local_date: string;
  reason: string;
};
export type ProfessionalSession = {
  id: string;
  organization_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  resource_ids: string[];
  status: "open" | "cancelled";
  series_id: string | null;
  reserved_seats?: number;
  waitlisted_seats?: number;
};
export type ProfessionalCustomer = {
  id: string;
  organization_id: string;
  user_id: string | null;
  display_name: string;
  contact: string | null;
  created_at: string;
};
export type ProfessionalBooking = {
  id: string;
  organization_id: string;
  service_id: string;
  session_id: string | null;
  customer_id: string;
  customer_user_id: string | null;
  customer_name?: string;
  service_name?: string;
  starts_at: string;
  ends_at: string;
  blocked_until?: string;
  resource_ids: string[];
  party_size: number;
  status:
    | "requested"
    | "confirmed"
    | "waitlisted"
    | "attended"
    | "cancelled"
    | "no_show";
  total_cents: number;
  deposit_cents: number;
  deposit_status: "not_required" | "pending" | "paid" | "refunded";
  price_snapshot: {
    service_name: string;
    menu: string;
    terms: string;
    version: number;
    unit_cents: number;
    price_basis: string;
    card?: {
      quote_id: string;
      discount_cents: number;
      final_cents: number;
      protected_until?: string;
    };
  };
  created_at: string;
  attended_at: string | null;
  reschedule?: { starts_at: string; expires_at: string } | null;
  bundle_id: string | null;
  card_quote_id: string | null;
  timezone?: string;
  waitlist_offer_status?:
    | "none"
    | "offered"
    | "accepted"
    | "expired"
    | "declined";
  waitlist_offer_expires_at?: string | null;
  waitlist_offer_version?: number;
  lifecycle_version?: number;
};
export type ProfessionalWaitlistAcceptance = {
  offer_version: number;
  expected_total_cents: number;
  expected_terms: string;
};
export type ProfessionalNotice = {
  id: string;
  organization_id: string;
  booking_id: string;
  recipient_user_id: string;
  recipient_kind: "customer" | "operator";
  lifecycle_version: number;
  kind:
    | "requested"
    | "confirmed"
    | "waitlisted"
    | "waitlist_offer"
    | "waitlist_expired"
    | "cancelled"
    | "reschedule_proposed"
    | "rescheduled"
    | "reminder_24h"
    | "reminder_2h";
  title: string;
  body: string;
  payload: {
    booking_id: string;
    organization_id: string;
    starts_at: string;
    timezone: string;
    offer_expires_at: string | null;
    offer_version: number;
    url: string;
    channel: "in_app";
  };
  due_at: string;
  expires_at: string;
  created_at: string;
  ready_at: string | null;
  read_at: string | null;
};
export type ProfessionalNoticePage = {
  items: ProfessionalNotice[];
  next_cursor: string | null;
  unread_count: number;
};
export type ProfessionalBundle = {
  id: string;
  organization_id: string;
  customer_id: string;
  service_id: string;
  remaining: number;
  granted: number;
  label: string;
};
export type ProfessionalWorkspace = {
  settings: ProfessionalSettings | null;
  services: ProfessionalService[];
  resources: ProfessionalResource[];
  availability: ProfessionalAvailability[];
  exceptions: ProfessionalException[];
  sessions: ProfessionalSession[];
  bookings: ProfessionalBooking[];
  customers: ProfessionalCustomer[];
  bundles: ProfessionalBundle[];
  permissions: string[];
  pricing: {
    monthly_cents: number;
    annual_cents: number;
    founder_cents: number;
    currency: "EUR";
    tax_included: false;
    sales_enabled: false;
  } | null;
  has_more: boolean;
  demo: boolean;
};
export type ProfessionalCatalog = {
  organization: { id: string; name: string; city: string | null };
  settings: Pick<
    ProfessionalSettings,
    | "timezone"
    | "require_approval"
    | "booking_horizon_days"
    | "cancellation_hours"
    | "terms"
  >;
  services: ProfessionalService[];
  resources: Pick<ProfessionalResource, "id" | "name" | "kind" | "capacity">[];
  sessions: ProfessionalSession[];
};
export type ProfessionalEntity =
  | "settings"
  | "service"
  | "resource"
  | "availability"
  | "exception"
  | "session";
export const PROFESSIONAL_BOOKING_LABELS: Record<
  ProfessionalBooking["status"],
  string
> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  waitlisted: "Lista de espera",
  attended: "Asistencia registrada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
export function professionalError(message: string): string {
  return (
    (
      {
        professional_resource_in_use:
          "Archiva primero los servicios que utilizan este recurso, o retíralo de esos servicios.",
        professional_waitlist_changed:
          "La oferta ha cambiado. Actualiza antes de aceptarla.",
        professional_waitlist_acceptance_required:
          "La plaza debe aceptarla su titular antes del plazo indicado.",
        professional_deposits_unavailable:
          "Las reservas con señal aún no están disponibles. Configura este servicio sin señal.",
        professional_card_reversal_required:
          "Este consumo tiene un descuento o sello registrado. Finanzas debe ajustar todas sus líneas en Franky Card antes de corregir la asistencia.",
        professional_unavailable:
          "Este servicio está en preparación. Su acceso lo habilita Franky para el piloto.",
        professional_forbidden: "Tu acceso ha cambiado. Actualiza el espacio.",
        professional_slot_unavailable:
          "Ese horario acaba de ocuparse o no está disponible. Elige otro.",
        professional_quote_changed:
          "El precio o las condiciones han cambiado. Actualiza y vuelve a aceptarlos antes de reservar.",
        professional_card_quote_unavailable:
          "Esta ventaja no puede aplicarse a la reserva. Revisa la oferta o entra en espera sin ventaja.",
        professional_refund_review_required:
          "Esta reserva tiene una señal pagada. Revisa su devolución antes de cancelarla.",
        professional_invalid_input: "Revisa los datos del formulario.",
        professional_limit:
          "Has alcanzado el límite de este espacio. Archiva un elemento o consulta una ampliación.",
        professional_payment_pending:
          "La señal está pendiente de confirmación del proveedor. La reserva sigue siendo una solicitud.",
        professional_booking_closed: "Esta reserva ya no admite esa operación.",
        professional_cancellation_late:
          "El plazo de cancelación ha terminado. Contacta con el establecimiento.",
        professional_bundle_empty: "El bono no tiene sesiones disponibles.",
        professional_customer_required:
          "Selecciona una persona válida o escribe el nombre del cliente.",
        professional_reschedule_expired:
          "La propuesta de cambio ha caducado. Tu reserva anterior se mantiene.",
        professional_has_bookings:
          "Hay reservas activas. Resuélvelas antes de cambiar la sesión.",
        professional_resource_required:
          "Selecciona un profesional o recurso compatible.",
        professional_idempotency_conflict:
          "Este intento corresponde a otros datos. Actualiza y vuelve a intentarlo.",
        auth_required: "Inicia sesión para continuar.",
      } as Record<string, string>
    )[message] ??
    "No se pudo completar la operación. Revisa los datos y vuelve a intentarlo."
  );
}
export function professionalMoney(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
}
