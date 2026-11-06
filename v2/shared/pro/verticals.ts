import type { ProEngine, ProSectionId, ProVerticalId } from "./types";

/**
 * Catálogo de sectores de Franky Pro.
 *
 * Cada sector define QUÉ ve su dueño: navegación, acción principal, pasos de
 * arranque y capítulos de la guía. Las pantallas no preguntan "¿soy una
 * peluquería?": leen esta ficha. Añadir un sector nuevo es añadir una entrada.
 */

export type ProNavItem = {
  id: ProSectionId;
  /** Etiqueta propia del sector (p. ej. "Alumnos" en vez de "Clientes"). */
  label?: string;
};

export type ProChecklistStep = {
  id: string;
  title: string;
  detail: string;
  section: ProSectionId;
};

export type ProGuideChapter = {
  id: string;
  title: string;
  when: "Primer día" | "Cada día" | "Cada semana" | "Cada temporada";
  body: string[];
};

export type ProVertical = {
  id: ProVerticalId;
  label: string;
  /** Cómo se llama al negocio en frases ("tu peluquería"). */
  noun: string;
  engine: ProEngine;
  group:
    | "Belleza"
    | "Comer y beber"
    | "Noche"
    | "Deporte y aprendizaje"
    | "Vivienda"
    | "Comunidades";
  tagline: string;
  /** Qué resuelve, en tres frases que se leen en la entrada y en la demo. */
  promises: [string, string, string];
  nav: ProNavItem[];
  /** Accesos de la barra inferior en el móvil (máximo 4; el resto va en "Más"). */
  mobileNav: ProSectionId[];
  primary: { label: string; section: ProSectionId };
  clientsLabel: string;
  checklist: ProChecklistStep[];
  guide: ProGuideChapter[];
  price: { monthly: number; annual: number; founder: number; note?: string };
  studentHook: string;
};

const common = {
  estudiantes: { id: "estudiantes" } as ProNavItem,
  equipo: { id: "equipo" } as ProNavItem,
  ajustes: { id: "ajustes" } as ProNavItem,
  guia: { id: "guia" } as ProNavItem,
};

function step(
  id: string,
  title: string,
  detail: string,
  section: ProSectionId,
): ProChecklistStep {
  return { id, title, detail, section };
}

/* Capítulos de guía que comparten todos los negocios de ocio. */
const guideStudents: ProGuideChapter = {
  id: "estudiantes",
  title: "Cómo te trae clientes Franky",
  when: "Cada semana",
  body: [
    "Tu ficha aparece en Ocio para los estudiantes de tu zona. Cuantas más fotos y servicios con precio tenga, más reservas recibe.",
    "Los Huecos relámpago convierten tus horas muertas en clientes: eliges el hueco, el descuento y a quién se enseña. Solo lo ven estudiantes verificados cerca de ti.",
    "Las horas valle son descuentos fijos en las franjas flojas de la semana. Úsalas en vez de bajar el precio a todo el mundo.",
    "En Resultados ves cuántos clientes y euros te ha traído Franky cada mes, medidos con reservas y validaciones reales.",
  ],
};
const guideTeam: ProGuideChapter = {
  id: "equipo",
  title: "Tu equipo dentro de Franky",
  when: "Primer día",
  body: [
    "Invita a cada persona con su propio acceso. Nadie comparte la contraseña del dueño.",
    "Cada rol ve lo suyo: recepción agenda y cobros, un profesional su columna, el encargado todo menos la facturación.",
    "El fichaje se hace desde el móvil al entrar y al salir. Queda guardado cuatro años y se exporta en un clic si lo pide una inspección.",
  ],
};
/* Capítulos de guía del motor de noche (pub y discoteca). */
const guideNightClose: ProGuideChapter = {
  id: "cierre",
  title: "El cierre de cada noche",
  when: "Cada día",
  body: [
    "Al cerrar, quien hace la caja apunta el fondo, lo que dice el ticket Z del TPV y lo que ha contado en el cajón y en el datáfono.",
    "Franky suma la taquilla cobrada en puerta, calcula el descuadre y lo guarda con su nombre y la hora.",
    "El lunes ves noche a noche la gente, las entradas, las señales, el descuadre y si cada noche ganó o perdió dinero con sus costes.",
    "Cada copa regalada se apunta en Invitaciones con quién invita, a quién y por qué. El cierre la trae sumada y ves quién invita más.",
  ],
};
const guideNightBar: ProGuideChapter = {
  id: "barra",
  title: "Barra sin mermas",
  when: "Cada semana",
  body: [
    "Cuenta la barra al cerrar con los botones de más y menos. Las botellas se cuentan por cuartos.",
    "Franky compara con el recuento anterior y marca lo que ha bajado bastante más de lo normal.",
    "Lo que queda por debajo del mínimo pasa al pedido: sale escrito por proveedor y se envía por WhatsApp en un toque.",
  ],
};
const guideNightIncidents: ProGuideChapter = {
  id: "incidencias",
  title: "Incidencias y vetados",
  when: "Cada día",
  body: [
    "Apunta en el momento cualquier pelea, expulsión, queja de vecinos, visita de la policía u objeto perdido. Queda con la hora y quién lo apuntó.",
    "Si alguien no puede volver a entrar, añádelo a Vetados con el motivo. En Puerta sale en rojo al buscarlo o escanearlo.",
    "Al vetar, elige la condición de acceso de tu local que no cumple. Queda también en el libro de esa noche con la hora y quién lo decide.",
  ],
};
const guideNightShifts: ProGuideChapter = {
  id: "turnos",
  title: "Turnos y fichajes de noche",
  when: "Cada semana",
  body: [
    "En Turnos reparte los puestos de cada noche, copia la semana anterior y mándalo al grupo en un toque.",
    "Debajo, cada fichaje se compara con su turno: quién llegó tarde, quién no fichó y quién fichó sin turno. Fichar a las 00:30 cuenta en la noche anterior.",
    "Descarga el registro por noche para tu gestoría. Si tu local necesita controlador de acceso habilitado, apunta el número de cada portero y te avisamos de las noches sin ninguno.",
  ],
};

const guideCard: ProGuideChapter = {
  id: "card",
  title: "Validar Franky Card en tres toques",
  when: "Cada día",
  body: [
    "El estudiante abre su tarjeta y te enseña un código que cambia cada 30 segundos.",
    "Tocas Validar, escaneas el código y escribes el importe del ticket. Franky calcula el descuento.",
    "El estudiante confirma en su móvil y los dos veis el mismo comprobante. Si tienes tarjeta de sellos, el sello se suma solo.",
  ],
};

export const PRO_VERTICALS: Record<ProVerticalId, ProVertical> = {
  hairdresser: {
    id: "hairdresser",
    label: "Peluquería y barbería",
    noun: "tu peluquería",
    engine: "agenda",
    group: "Belleza",
    tagline: "La agenda que se llena sola con estudiantes",
    promises: [
      "Agenda por profesional en el móvil, con reservas online las 24 horas.",
      "Tus horas muertas se ofrecen a estudiantes cerca del campus con un toque.",
      "Cero comisión por cliente nuevo: pagas una cuota fija y el cliente es tuyo.",
    ],
    nav: [
      { id: "hoy" },
      { id: "agenda" },
      { id: "clientes" },
      { id: "seguimiento", label: "Vuelven" },
      { id: "servicios" },
      { id: "caja" },
      { id: "validar", label: "Franky Card" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "agenda", "clientes", "estudiantes"],
    primary: { label: "Nueva cita", section: "agenda" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "hours",
        "Pon tu horario",
        "Días y horas de apertura, y descansos.",
        "ajustes",
      ),
      step(
        "services",
        "Añade tus servicios",
        "Duración y precio de cada corte o tratamiento.",
        "servicios",
      ),
      step(
        "agenda_rhythm",
        "Di cada cuánto vuelve cada servicio",
        "Un degradado, cada 3 semanas. Así sabes a quién le toca volver.",
        "servicios",
      ),
      step(
        "team",
        "Invita a tu equipo",
        "Cada profesional tiene su columna en la agenda.",
        "equipo",
      ),
      step(
        "profile",
        "Completa tu ficha",
        "Fotos del local y del trabajo: es lo que ven los estudiantes.",
        "ajustes",
      ),
      step(
        "offer",
        "Lanza tu primer Hueco",
        "Llena un hueco de hoy con un descuento para estudiantes.",
        "estudiantes",
      ),
    ],
    guide: [
      {
        id: "primer-dia",
        title: "Tu primer día con Franky Pro",
        when: "Primer día",
        body: [
          "Sigue la lista de arranque de Hoy: horario, servicios, equipo, ficha y primer Hueco. Son unos 15 minutos.",
          "Pon el enlace de reservas en la bio de Instagram y el QR en el espejo o el mostrador. Lo tienes en Ajustes.",
          "Pasa las citas que ya tenías apuntadas: toca un hueco de la agenda y escribe el nombre. No hace falta que el cliente tenga Franky.",
        ],
      },
      {
        id: "agenda",
        title: "La agenda, sin llamadas",
        when: "Cada día",
        body: [
          "Cada profesional es una columna. Toca un hueco vacío para citar, toca una cita para marcar llegada, cobro o no presentado.",
          "Mantén pulsado un hueco para bloquearlo (descanso, médico, formación). Las vacaciones se ponen con Bloquear, en Varios días.",
          "Un color con pose deja al profesional libre mientras posa: en ese rato puedes citar un corte o una barba.",
          "Las citas online entran solas y te avisan. Si una necesita tu aprobación, aparece arriba en Hoy.",
        ],
      },
      {
        id: "faltas",
        title: "Menos no presentados",
        when: "Cada día",
        body: [
          "Por la tarde, Hoy te enseña las citas de mañana. Toca Recordar y sale el WhatsApp escrito; cuando conteste, toca Confirma.",
          "Quien falla dos veces te deja señal. La regla la cambias en Ajustes, en Mensajes y reglas.",
          "Si alguien cancela o no viene, te enseñamos quién de la lista de espera quería ese hueco. Un toque y la cita es suya.",
        ],
      },
      {
        id: "clientes",
        title: "Fichas que valen oro",
        when: "Cada día",
        body: [
          "Apunta la fórmula de cada color con fecha. Al abrir su próxima cita la tienes delante con el botón Repetir fórmula.",
          "Los servicios de color te avisan si falta la prueba de sensibilidad y te dejan citarla 48 horas antes.",
          "En Vuelven ves a quién le toca volver esta semana, con el mensaje escrito y un hueco sugerido.",
        ],
      },
      { ...guideStudents },
      {
        id: "caja",
        title: "Caja y fin de mes",
        when: "Cada día",
        body: [
          "Al cobrar puedes sumar productos, descuentos, bono, señal, tarjeta regalo, propina y pago mixto. El stock baja solo.",
          "Al final del día revisas el total por tarjeta, efectivo y Bizum. En la vista Mes tienes la comisión de cada profesional y el resumen para la gestoría.",
          "Caja es tu control interno: las facturas legales las sigue haciendo tu TPV o tu gestoría.",
        ],
      },
      guideTeam,
      guideCard,
    ],
    price: {
      monthly: 29,
      annual: 290,
      founder: 199,
      note: "Hasta 3 profesionales. Cada uno más, 5 €/mes.",
    },
    studentHook:
      "Martes universitario y huecos de última hora a estudiantes a 5 minutos del campus.",
  },
  beauty: {
    id: "beauty",
    label: "Centro de estética",
    noun: "tu centro",
    engine: "agenda",
    group: "Belleza",
    tagline: "Cabinas, bonos y citas en un solo sitio",
    promises: [
      "Agenda por profesional y cabina a la vez, con tiempo de preparación.",
      "Bonos de sesiones que se descuentan solos al marcar asistencia.",
      "Estudiantes en tus horas valle, sin pagar comisión por cada una.",
    ],
    nav: [
      { id: "hoy" },
      { id: "agenda" },
      { id: "clientes" },
      { id: "seguimiento", label: "Vuelven" },
      { id: "servicios", label: "Tratamientos" },
      { id: "caja" },
      { id: "validar", label: "Franky Card" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "agenda", "clientes", "estudiantes"],
    primary: { label: "Nueva cita", section: "agenda" },
    clientsLabel: "Clientas",
    checklist: [
      step("hours", "Pon tu horario", "Días, horas y descansos.", "ajustes"),
      step(
        "agenda_cabins",
        "Da de alta tus cabinas",
        "Y las máquinas, como el láser: nunca dos citas a la vez.",
        "servicios",
      ),
      step(
        "services",
        "Añade tus tratamientos",
        "Duración, precio y cabina que necesita.",
        "servicios",
      ),
      step(
        "team",
        "Invita a tu equipo",
        "Cada profesional con su agenda.",
        "equipo",
      ),
      step(
        "profile",
        "Completa tu ficha",
        "Fotos de cabinas y resultados.",
        "ajustes",
      ),
      step(
        "offer",
        "Lanza tu primer Hueco",
        "Ofrece una cabina libre de hoy.",
        "estudiantes",
      ),
    ],
    guide: [
      {
        id: "primer-dia",
        title: "Tu primer día",
        when: "Primer día",
        body: [
          "Da de alta tus cabinas y máquinas en Tratamientos y di en cada tratamiento cuál ocupa y cuánta preparación necesita: la agenda no dejará solapar dos citas en la misma.",
          "Da de alta los bonos que ya tenían tus clientas con las sesiones que les quedan, desde Caja con Vender.",
        ],
      },
      {
        id: "bonos",
        title: "Bonos sin papel",
        when: "Cada día",
        body: [
          "Al cobrar una cita, la sesión se descuenta del bono sola. Si te equivocas, la devuelves desde la ficha con un motivo.",
          "Hoy te avisa de quién gasta su última sesión: es el momento de ofrecerle otro.",
        ],
      },
      {
        id: "ficha",
        title: "Salud, pruebas y firmas",
        when: "Cada día",
        body: [
          "Marca en la ficha alergias, piel sensible, embarazo o medicación. Sale en rojo al abrir la cita.",
          "Pestañas, tintes y láser te avisan si falta la prueba de sensibilidad o el consentimiento. Se firma con el dedo en la pantalla y queda con fecha.",
          "Al cobrar, un toque manda los cuidados del tratamiento por WhatsApp y otro pide la reseña.",
        ],
      },
      {
        id: "faltas",
        title: "Menos citas perdidas",
        when: "Cada día",
        body: [
          "Por la tarde, Hoy te enseña las citas de mañana con el recordatorio escrito. Cuando contesten, toca Confirma.",
          "Los tratamientos largos pueden llevar señal, y quien falla dos veces también. Si no viene, la señal queda en caja.",
          "Si alguien cancela, ves quién de la lista de espera quería ese hueco y se lo das en un toque.",
        ],
      },
      guideStudents,
      guideTeam,
      guideCard,
    ],
    price: { monthly: 29, annual: 290, founder: 199 },
    studentHook:
      "Packs antes de la graduación y bonos de estudiante en horas valle.",
  },
  cafe: {
    id: "cafe",
    label: "Cafetería",
    noun: "tu cafetería",
    engine: "tables",
    group: "Comer y beber",
    tagline: "Clientes que vuelven cada día",
    promises: [
      "Tarjeta de sellos digital y Franky Card validadas en tres toques.",
      "Carta con alérgenos y menú del día publicados en un minuto.",
      "En época de exámenes, tu local aparece como sitio para estudiar.",
    ],
    nav: [
      { id: "hoy" },
      { id: "validar", label: "Sellos" },
      { id: "bonos" },
      { id: "pedidos" },
      { id: "carta" },
      { id: "grupos" },
      { id: "clientes" },
      { id: "caja", label: "Cierre" },
      { id: "cuadrante", label: "Turnos" },
      { id: "appcc" },
      { id: "compras" },
      { id: "costes", label: "Márgenes" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "validar", "pedidos", "carta"],
    primary: { label: "Validar tarjeta", section: "validar" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "hours",
        "Pon tu horario",
        "Y si tienes enchufes y wifi para estudiar.",
        "ajustes",
      ),
      step(
        "menu",
        "Sube tu carta",
        "Con los alérgenos de cada producto.",
        "carta",
      ),
      step(
        "loyalty",
        "Crea tu tarjeta de sellos",
        "Por ejemplo: el 10.º café gratis.",
        "validar",
      ),
      step(
        "profile",
        "Completa tu ficha",
        "Fotos de la barra y las mesas.",
        "ajustes",
      ),
      step(
        "offer",
        "Lanza tu primera oferta",
        "Café y dulce después de clase.",
        "estudiantes",
      ),
    ],
    guide: [
      guideCard,
      {
        id: "carta",
        title: "Carta y alérgenos",
        when: "Primer día",
        body: [
          "Marca los alérgenos de cada producto con un toque: la ley obliga a informar de los 14 antes de que el cliente pida.",
          "Imprime el QR de la carta para las mesas desde Ajustes.",
        ],
      },
      {
        id: "estudio",
        title: "Sitio para estudiar",
        when: "Cada temporada",
        body: [
          "En enero y junio los estudiantes buscan dónde estudiar. Si activas Sitio para estudiar, apareces en ese mapa.",
          "Tú decides los sitios, las horas, la consumición (ninguna, una al llegar o una cada dos horas) y qué días no se admiten portátiles.",
          "En Hoy tienes un contador: toca más o menos cuando alguien se sienta o se va y los estudiantes ven los sitios libres de verdad.",
        ],
      },
      {
        id: "sellos",
        title: "Sellos y bonos en la barra",
        when: "Cada día",
        body: [
          "Para el habitual de cada mañana, Sello rápido: lo buscas por el nombre y se sella sin escribir importe. Si le toca premio, la pantalla dice Invita la casa.",
          "Los bonos de diez cafés se cobran enteros en tu TPV. En Bonos los vendes y descuentas cada café; arriba ves lo que ya tienes cobrado y queda por servir.",
          "Un bono puede ser de un grupo de estudio: lo gastan varios y queda apuntado quién.",
        ],
      },
      {
        id: "vitrina",
        title: "Vitrina y sobras de la tarde",
        when: "Cada día",
        body: [
          "Por la mañana apunta en Hoy lo que ha llegado: tartas, bollería y bocadillos. Cuando se acaba algo, Agotar lo quita de la carta y del QR.",
          "Desde la hora que elijas, Hoy te propone ofrecer lo que queda a mitad de precio a los estudiantes de cerca. Cada sobra vendida se apunta sola en tu plan contra el desperdicio.",
        ],
      },
      {
        id: "cierre",
        title: "El cierre, aunque no estés",
        when: "Cada día",
        body: [
          "Quien cierra cuenta la caja, reparte las propinas por horas fichadas y deja una nota para mañana, que sale arriba en Hoy.",
          "Con Mandar resumen te llega por WhatsApp el total, el descuadre y lo que ha quedado pendiente.",
        ],
      },
      guideStudents,
      guideTeam,
    ],
    price: { monthly: 19, annual: 190, founder: 149 },
    studentHook:
      "Sitio para estudiar en exámenes y café de después del examen.",
  },
  bar: {
    id: "bar",
    label: "Bar y tapas",
    noun: "tu bar",
    engine: "tables",
    group: "Comer y beber",
    tagline: "Grupos, partidos y previas sin llamadas",
    promises: [
      "Reservas de mesa y de grupo con consumo mínimo opcional.",
      "Peticiones de clases y asociaciones que quieren hacer la previa en tu bar.",
      "Carta con alérgenos, menú del día y Franky Card.",
    ],
    nav: [
      { id: "hoy" },
      { id: "reservas" },
      { id: "sala" },
      { id: "eventos", label: "Partidos" },
      { id: "grupos" },
      { id: "carta" },
      { id: "validar", label: "Fidelidad" },
      { id: "bonos" },
      { id: "clientes" },
      { id: "caja", label: "Cierre" },
      { id: "cuadrante", label: "Turnos" },
      { id: "compras" },
      { id: "costes", label: "Márgenes" },
      { id: "appcc" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "reservas", "grupos", "caja"],
    primary: { label: "Nueva reserva", section: "reservas" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "hours",
        "Pon tu horario",
        "Y los días de partido o evento.",
        "ajustes",
      ),
      step(
        "tables",
        "Define tus mesas",
        "Cuántas y de cuántas personas.",
        "sala",
      ),
      step("menu", "Sube tu carta", "Con alérgenos.", "carta"),
      step("profile", "Completa tu ficha", "Fotos y ambiente.", "ajustes"),
      step(
        "offer",
        "Abre tu bar a grupos",
        "Menú de grupo para previas y cenas de clase.",
        "grupos",
      ),
    ],
    guide: [
      {
        id: "grupos",
        title: "Grupos de estudiantes",
        when: "Cada semana",
        body: [
          "Delegados y asociaciones piden presupuesto para previas, cenas y celebraciones. Te llegan con número de personas, fecha y presupuesto.",
          "Respondes con un precio por persona y lo que incluye. Si aceptan, la reserva entra sola en tu libro.",
        ],
      },
      {
        id: "confirmar",
        title: "Menos mesas guardadas para nadie",
        when: "Cada día",
        body: [
          "En Hoy y en Reservas tienes las reservas de hoy y mañana por confirmar. Un toque abre WhatsApp con el mensaje escrito; cuando conteste, marca Confirmó.",
          "Si alguien ya dejó una mesa vacía antes, lo verás en rojo al aceptar su reserva. Pídele que confirme el día antes o una señal.",
          "Si una mesa se cae, Hoy te propone avisar a quien espera o publicar un hueco relámpago para estudiantes cerca.",
        ],
      },
      {
        id: "partidos",
        title: "Partidos que se pagan solos",
        when: "Cada semana",
        body: [
          "Crea cada partido con su aforo, su menú y la señal que pides. Publicado, los estudiantes lo ven en Franky y reservan.",
          "El día del partido, Hoy te dice cuántas plazas quedan y qué señales faltan por cobrar.",
        ],
      },
      {
        id: "cierre",
        title: "Cierre de caja y turnos",
        when: "Cada día",
        body: [
          "Al cerrar, cuenta el cajón, apunta tarjeta y Bizum y el bote de propinas: Franky reparte las propinas por las horas fichadas.",
          "La nota para mañana sale arriba en Hoy para quien abre. Mandar resumen te lo lleva al WhatsApp si cierra otra persona.",
          "El cuadrante de la semana se manda al grupo del equipo con un toque, y en Hoy ves quién no ha fichado.",
        ],
      },
      guideStudents,
      guideCard,
      guideTeam,
    ],
    price: { monthly: 19, annual: 190, founder: 149 },
    studentHook:
      "Previas de las fiestas universitarias y grupos de clase entre semana.",
  },
  restaurant: {
    id: "restaurant",
    label: "Restaurante",
    noun: "tu restaurante",
    engine: "tables",
    group: "Comer y beber",
    tagline: "Tu libro de reservas, sin pagar por comensal",
    promises: [
      "Libro por turnos y plano de sala en directo, con lista de espera.",
      "Cenas de clase, graduaciones y asociaciones con menú cerrado y señal.",
      "Cero euros por comensal: la cuota es fija y el cliente es tuyo.",
    ],
    nav: [
      { id: "hoy" },
      { id: "reservas" },
      { id: "sala" },
      { id: "grupos" },
      { id: "carta" },
      { id: "clientes" },
      { id: "caja", label: "Cierre" },
      { id: "cuadrante", label: "Turnos" },
      { id: "appcc" },
      { id: "compras" },
      { id: "costes", label: "Márgenes" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "reservas", "sala", "grupos"],
    primary: { label: "Nueva reserva", section: "reservas" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "hours",
        "Define tus turnos",
        "Comida y cena, con su hora de corte.",
        "ajustes",
      ),
      step("tables", "Dibuja tu sala", "Mesas, capacidad y zonas.", "sala"),
      step("menu", "Sube carta y menú del día", "Con alérgenos.", "carta"),
      step(
        "profile",
        "Completa tu ficha",
        "Fotos de platos y sala.",
        "ajustes",
      ),
      step(
        "offer",
        "Abre tu restaurante a grupos",
        "Menús cerrados para cenas de clase.",
        "grupos",
      ),
    ],
    guide: [
      {
        id: "servicio",
        title: "Un servicio con Franky",
        when: "Cada día",
        body: [
          "Antes de abrir, mira Hoy: cubiertos por turno, grupos y alergias avisadas.",
          "Cuando llega una mesa, tócala en Sala y márcala como sentada. Al irse, se libera para la lista de espera.",
          "Las reservas que no se presentan quedan en la ficha del cliente.",
        ],
      },
      {
        id: "grupos",
        title: "Cenas de grupo",
        when: "Cada temporada",
        body: [
          "Noviembre y diciembre (Navidad de clase), mayo y junio (graduaciones) son temporada alta de grupos universitarios.",
          "Prepara dos o tres menús cerrados con precio por persona y señal. Responder el mismo día ayuda a que no se vayan a otro sitio.",
          "El día del grupo, Hoy enseña cuántos platos de cada hay que preparar y las alergias de cada persona. Si no caben en una mesa, únelas desde la ficha de la reserva.",
        ],
      },
      {
        id: "confirmar",
        title: "Confirmar y llenar mesas",
        when: "Cada día",
        body: [
          "Cada mañana, confirma por WhatsApp las reservas de hoy y mañana desde Hoy o Reservas. Cuando contesten, marca Confirmó.",
          "Quien ya no vino otras veces sale en rojo: pídele confirmación o señal.",
          "Si marcas No vino y queda servicio, Hoy te propone avisar a quien espera o publicar un hueco relámpago.",
        ],
      },
      {
        id: "trastienda",
        title: "Cierre, turnos, APPCC y márgenes",
        when: "Cada semana",
        body: [
          "Cierre: cuenta la caja, reparte propinas por horas fichadas y mira la semana entera con cubiertos, plantones y lo que trajo Franky.",
          "Turnos: el cuadrante de la semana con las horas previstas frente a las fichadas.",
          "APPCC: temperaturas y limpiezas apuntadas cada día, listas para imprimir si llega una inspección.",
          "Márgenes: cuánto te cuesta cada plato y aviso cuando un proveedor sube un precio.",
        ],
      },
      guideStudents,
      guideCard,
      guideTeam,
    ],
    price: { monthly: 39, annual: 390, founder: 299 },
    studentHook:
      "Cenas de clase y graduación, y menú estudiante en horas valle.",
  },
  pub: {
    id: "pub",
    label: "Pub",
    noun: "tu pub",
    engine: "night",
    group: "Noche",
    tagline: "Prepara la noche desde el móvil",
    promises: [
      "Reservados con señal y consumo mínimo, y lo que llevan gastado en directo.",
      "Caja cuadrada y firmada cada noche, y la barra contada en dos minutos.",
      "El jueves universitario llega a quien ya dijo que sale.",
    ],
    nav: [
      { id: "hoy", label: "Esta noche" },
      { id: "eventos" },
      { id: "reservados" },
      { id: "puerta" },
      { id: "caja", label: "Cierre" },
      { id: "barra" },
      { id: "carta", label: "Carta de copas" },
      { id: "cuadrante" },
      { id: "incidencias" },
      { id: "rrpp", label: "Embajadores" },
      { id: "grupos" },
      { id: "clientes" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "reservados", "puerta", "caja"],
    primary: { label: "Nuevo reservado", section: "reservados" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "hours",
        "Pon tu horario",
        "Noches de apertura y hora de cierre.",
        "ajustes",
      ),
      step(
        "zones",
        "Define tus zonas",
        "Reservados, capacidad y consumo mínimo.",
        "reservados",
      ),
      step(
        "event",
        "Crea tu próxima noche",
        "Con precio o gratis con lista.",
        "eventos",
      ),
      step(
        "team",
        "Invita a tu equipo",
        "Puerta y barra con su acceso.",
        "equipo",
      ),
      step(
        "offer",
        "Publica tu jueves universitario",
        "Llega a quien ya dijo que sale.",
        "estudiantes",
      ),
      step(
        "stock",
        "Cuenta tu barra una vez",
        "Botellas, barriles y cajas con su mínimo.",
        "barra",
      ),
    ],
    guide: [
      {
        id: "noche",
        title: "Una noche con Franky",
        when: "Cada día",
        body: [
          "Esta noche te enseña reservados, lista, entradas y aforo en directo, y el precio que toca si hay happy hour.",
          "En Puerta, cualquier persona del equipo escanea desde su móvil. El aforo se actualiza en todos los dispositivos y avisa al 90 %.",
          "Si alguien de la lista está vetado, la puerta lo marca en rojo con el motivo.",
          "Al reservar ves si esa persona ya vino, cuánto gasta de media y si alguna vez no se presentó. Si falló, te sugiere pedir señal.",
        ],
      },
      {
        id: "semana",
        title: "Tu semana de noches",
        when: "Cada semana",
        body: [
          "En Eventos, abre una noche y toca Repetir: crea las próximas semanas con los mismos tramos, lista y reservados.",
          "El calendario de la noche te avisa de festivos, vísperas y noches señaladas, con un botón para crear el evento ese día.",
          "En las noches de karaoke, la cola sale en Esta noche: quién canta, quién va después y una pantalla para la tele.",
        ],
      },
      guideNightClose,
      guideNightBar,
      guideNightShifts,
      guideNightIncidents,
      guideStudents,
      guideCard,
      guideTeam,
    ],
    price: { monthly: 29, annual: 290, founder: 199 },
    studentHook:
      "Jueves universitario y previa oficial de las grandes fiestas.",
  },
  nightclub: {
    id: "nightclub",
    label: "Discoteca y promotor",
    noun: "tu sala",
    engine: "night",
    group: "Noche",
    tagline: "RRPP que cobran por quien entra, no por quien apuntan",
    promises: [
      "Listas por RRPP con enlace propio y comisión calculada en puerta.",
      "Entradas por tramos, reservados y aforo en directo.",
      "Crush Live en tus pantallas: la fiesta que nadie más tiene.",
    ],
    nav: [
      { id: "hoy", label: "Esta noche" },
      { id: "eventos" },
      { id: "rrpp", label: "RRPP" },
      { id: "puerta" },
      { id: "reservados" },
      { id: "caja", label: "Cierre" },
      { id: "barra" },
      { id: "cuadrante" },
      { id: "incidencias" },
      { id: "grupos", label: "Fiestas de grupo" },
      { id: "clientes" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "puerta", "rrpp", "eventos"],
    primary: { label: "Abrir puerta", section: "puerta" },
    clientsLabel: "Asistentes",
    checklist: [
      step(
        "event",
        "Crea tu próxima fiesta",
        "Tramos de precio y hora de corte de lista.",
        "eventos",
      ),
      step(
        "rrpp",
        "Da de alta a tus RRPP",
        "Cada uno con su enlace y su comisión.",
        "rrpp",
      ),
      step(
        "zones",
        "Define tus reservados",
        "Mínimo, señal y capacidad.",
        "reservados",
      ),
      step(
        "team",
        "Invita a tus porteros",
        "Escanean desde su móvil.",
        "equipo",
      ),
      step(
        "offer",
        "Activa Crush Live",
        "La pantalla de matches de la fiesta.",
        "eventos",
      ),
      step(
        "close",
        "Cierra tu primera noche",
        "Caja cuadrada, firmada y comparada.",
        "caja",
      ),
    ],
    guide: [
      {
        id: "rrpp",
        title: "RRPP sin discusiones",
        when: "Cada semana",
        body: [
          "Cada RRPP tiene un enlace y un código. Todo lo que vende o apunta queda a su nombre.",
          "La comisión se calcula con las entradas escaneadas en puerta, no con la lista que mandan por WhatsApp.",
          "El lunes tienes la liquidación de cada uno lista para pagar.",
          "A cada RRPP le puedes poner un cupo por noche y su propia hora de corte. Su recibo sale por WhatsApp y el CSV del mes, listo para tu gestoría.",
          "Ponle un objetivo por noche: si va flojo lo ves arriba con un mensaje para animarle. Con Ver su panel ves lo mismo que él: su enlace, su lista y lo que gana.",
        ],
      },
      {
        id: "puerta",
        title: "Puerta y aforo",
        when: "Cada día",
        body: [
          "Abre Puerta y apunta la cámara al QR. Verde: entra. Rojo: ya usada o de otro evento.",
          "Los de lista se buscan por nombre. El aforo en directo lo ven todos los porteros y avisa al 90 %.",
          "Las entradas marcadas +18 piden comprobar documento. Si alguien está vetado, sale en rojo con el motivo.",
        ],
      },
      guideNightClose,
      guideNightBar,
      guideNightShifts,
      guideNightIncidents,
      guideStudents,
      guideTeam,
    ],
    price: {
      monthly: 49,
      annual: 490,
      founder: 349,
      note: "Más un 2,5 % por entrada vendida, que paga el comprador.",
    },
    studentHook:
      "RRPP universitarios, audiencia de cada facultad y Crush Live.",
  },
  sports: {
    id: "sports",
    label: "Gimnasio, box, yoga o baile",
    noun: "tu centro",
    engine: "classes",
    group: "Deporte y aprendizaje",
    tagline: "Clases llenas y cuotas que se cobran solas",
    promises: [
      "Horario de clases con aforo, lista de espera y check-in.",
      "Socios, cuotas y bonos con avisos de impago.",
      "Tarifa universitaria en horas valle y clase de prueba para quien llega.",
    ],
    nav: [
      { id: "hoy" },
      { id: "horario" },
      { id: "socios" },
      { id: "clientes", label: "Interesados" },
      { id: "torneos", label: "Retos" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "horario", "socios", "estudiantes"],
    primary: { label: "Nueva clase", section: "horario" },
    clientsLabel: "Interesados",
    checklist: [
      step(
        "classes",
        "Crea tus clases",
        "Duración, aforo y quién la da.",
        "horario",
      ),
      step(
        "plans",
        "Define tus cuotas y bonos",
        "Mensual, trimestral, bono de 10.",
        "socios",
      ),
      step(
        "team",
        "Invita a tus monitores",
        "Cada uno pasa lista de sus clases.",
        "equipo",
      ),
      step(
        "profile",
        "Completa tu ficha",
        "Fotos de sala y clases.",
        "ajustes",
      ),
      step(
        "offer",
        "Lanza tu tarifa universitaria",
        "Horas valle para estudiantes.",
        "estudiantes",
      ),
    ],
    guide: [
      {
        id: "clases",
        title: "Clases y lista de espera",
        when: "Cada día",
        body: [
          "Cuando una clase se llena, los siguientes entran en lista de espera. Si alguien cancela, la plaza se ofrece sola al primero.",
          "El monitor pasa lista desde su móvil. O imprime el QR de la puerta en Horario: cada socio lo escanea al llegar y su reserva queda como llegada, sin huellas ni tornos.",
        ],
      },
      {
        id: "cuotas",
        title: "Cuotas sin perseguir a nadie",
        when: "Cada semana",
        body: [
          "En Socios, Cobros te enseña lo cobrado, lo pendiente y los recibos devueltos del mes, con el aviso por WhatsApp ya escrito.",
          "Si alguien se quiere ir en verano o en exámenes, ofrécele pausar con fecha de vuelta: Hoy te avisa la semana que vuelve.",
        ],
      },
      {
        id: "cuidado",
        title: "Que nadie se vaya sin avisar",
        when: "Cada día",
        body: [
          "Hoy te dice quién lleva días sin venir y quién está en sus primeros 90 días, con el mensaje en primera persona listo para enviar.",
          "En Interesados tienes a quién llamar hoy, fase a fase, desde que pregunta hasta que se apunta.",
        ],
      },
      {
        id: "retos",
        title: "Retos, marcas y amigos",
        when: "Cada temporada",
        body: [
          "Crea un reto de un mes entre carreras: cada asistencia suma para la carrera del socio. Comparte la clasificación los lunes.",
          "Apunta las marcas personales en la ficha de cada socio. Cuando alguien bate una, Hoy te lo recuerda para felicitarle.",
          "Cada socio tiene su enlace de clase de prueba para traer a un amigo. Tú decides el premio.",
        ],
      },
      guideStudents,
      guideTeam,
    ],
    price: { monthly: 39, annual: 390, founder: 299 },
    studentHook: "Tarifa universitaria de 10 a 14 h y retos entre facultades.",
  },
  sports_facility: {
    id: "sports_facility",
    label: "Pistas y pádel",
    noun: "tu club",
    engine: "courts",
    group: "Deporte y aprendizaje",
    tagline: "Pistas llenas sin pagar por reserva",
    promises: [
      "Calendario por pista, precios por franja y bloqueos.",
      "Partidos abiertos que se completan con estudiantes de tu nivel.",
      "Ligas entre facultades y las mañanas vacías, llenas.",
    ],
    nav: [
      { id: "hoy" },
      { id: "pistas" },
      { id: "mostrador" },
      { id: "clientes", label: "Jugadores" },
      { id: "bonos" },
      { id: "torneos" },
      { id: "escuela" },
      { id: "ocupacion" },
      { id: "caja" },
      { id: "grupos", label: "Grupos y eventos" },
      { id: "convenios" },
      common.estudiantes,
      common.equipo,
      { id: "normas" },
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "pistas", "clientes", "estudiantes"],
    primary: { label: "Nueva reserva", section: "pistas" },
    clientsLabel: "Jugadores",
    checklist: [
      step(
        "courts",
        "Da de alta tus pistas",
        "Nombre, precio normal y precio valle.",
        "pistas",
      ),
      step(
        "hours",
        "Pon tu horario",
        "Y las franjas valle y punta.",
        "ajustes",
      ),
      step(
        "courts_rules",
        "Pon tus normas",
        "Preaviso para cancelar y lo que paga quien no viene.",
        "normas",
      ),
      step("team", "Invita a tu equipo", "Recepción y monitores.", "equipo"),
      step(
        "courts_passes",
        "Vende tu primer bono",
        "Partidos u horas cobrados por adelantado.",
        "bonos",
      ),
      step("profile", "Completa tu ficha", "Fotos de las pistas.", "ajustes"),
      step(
        "offer",
        "Abre tus mañanas a estudiantes",
        "Precio valle de 10 a 14 h.",
        "estudiantes",
      ),
    ],
    guide: [
      {
        id: "pistas",
        title: "Reservas y partidos abiertos",
        when: "Cada día",
        body: [
          "Toca una franja libre para reservar. Cada jugador paga su parte y ves al momento quién falta.",
          "Un partido abierto se publica a jugadores de nivel parecido. Si no se completa a tiempo, la pista se libera sola.",
          "Si alguien cancela, el primero de la lista de espera tiene su WhatsApp preparado con la hora y el precio.",
        ],
      },
      {
        id: "mostrador",
        title: "El mostrador",
        when: "Cada día",
        body: [
          "Quién entra en la próxima hora, quién ha pagado su parte, qué pista está libre ahora y cuándo encender las luces.",
          "Bolas, palas y bebidas se suman a la reserva. Al final del día, cierra la caja en Caja con lo que has contado.",
          "¿Llueve? El botón Llueve pasa las reservas exteriores a las pistas cubiertas y deja escrito el aviso para cada jugador.",
        ],
      },
      {
        id: "normas",
        title: "Normas y no presentados",
        when: "Primer día",
        body: [
          "En Normas pones el preaviso para cancelar gratis y cuánto paga quien cancela tarde o no viene.",
          "Al anular una reserva fuera de plazo, eliges cobrar o perdonar. A partir de las ausencias que marques, la ficha avisa en rojo.",
        ],
      },
      {
        id: "competir",
        title: "Bonos, torneos y escuela",
        when: "Cada semana",
        body: [
          "Un bono de partidos o un monedero se descuenta solo al reservar. En Bonos ves quién tiene que renovar esta semana.",
          "Una americana se monta en diez minutos: las pistas se bloquean solas y las rondas salen sin repetir pareja.",
          "La liga entre facultades llena tus mediodías todo el curso. En Escuela pasas lista en dos toques y ves las horas de cada monitor.",
        ],
      },
      {
        id: "curso",
        title: "Convenios y el curso universitario",
        when: "Cada temporada",
        body: [
          "En septiembre, Hoy te propone el pack de bienvenida: clínic de iniciación en valle, americana para conocerse y bono del primer mes, en un paso.",
          "En Convenios pactas un precio con la universidad o una asociación. Sus miembros reservan con él y a fin de mes mandas el resumen al responsable.",
          "En Ocupación tienes el calendario universitario con la campaña que encaja en cada momento, y Hoy te avisa de los jugadores habituales que han dejado de venir.",
        ],
      },
      guideStudents,
      guideTeam,
    ],
    price: { monthly: 39, annual: 390, founder: 299 },
    studentHook:
      "Mañanas a precio valle y partidos con gente de tu universidad.",
  },
  academy: {
    id: "academy",
    label: "Academia",
    noun: "tu academia",
    engine: "classes",
    group: "Deporte y aprendizaje",
    tagline: "Llega a quien tiene el examen, justo antes",
    promises: [
      "Grupos por asignatura, asistencia y cuotas en un sitio.",
      "Franky sabe qué estudia cada alumno y cuándo son sus exámenes.",
      "Clases de prueba y cursos intensivos que se llenan en enero y junio.",
    ],
    nav: [
      { id: "hoy" },
      { id: "horario", label: "Grupos" },
      { id: "socios", label: "Alumnos" },
      { id: "clientes", label: "Interesados" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "horario", "socios", "estudiantes"],
    primary: { label: "Nuevo grupo", section: "horario" },
    clientsLabel: "Interesados",
    checklist: [
      step(
        "classes",
        "Crea tus grupos",
        "Asignatura, carrera y horario.",
        "horario",
      ),
      step(
        "plans",
        "Define tus cuotas",
        "Mensual, intensivo o por horas.",
        "socios",
      ),
      step(
        "team",
        "Invita a tus profesores",
        "Pasan lista desde el móvil.",
        "equipo",
      ),
      step(
        "profile",
        "Completa tu ficha",
        "Asignaturas y resultados.",
        "ajustes",
      ),
      step(
        "offer",
        "Programa tu intensivo de enero",
        "Llega a quien tiene ese examen.",
        "estudiantes",
      ),
    ],
    guide: [
      {
        id: "examenes",
        title: "Campañas por examen",
        when: "Cada temporada",
        body: [
          "En Estudiantes eliges asignatura y carrera. Franky lo enseña a los alumnos de esa carrera las semanas antes del examen.",
          "Solo ven tu curso quienes tienen activadas las recomendaciones de estudio.",
        ],
      },
      {
        id: "alumnos",
        title: "Alumnos, recuperaciones y aprobados",
        when: "Cada semana",
        body: [
          "Al marcar que alguien no vino, su clase queda para recuperar. En Alumnos, Recuperaciones te propone el grupo con hueco más parecido.",
          "En julio, Curso que viene te dice quién sigue en septiembre y a quién preguntar.",
          "Tras cada convocatoria apunta quién aprobó: sale tu tasa de aprobados por asignatura, lista para imprimir en el tablón.",
        ],
      },
      {
        id: "grupo",
        title: "Notas, material y el grupo siguiente",
        when: "Cada semana",
        body: [
          "Abre una clase y entra en Grupo: apunta las notas del simulacro y verás quién necesita refuerzo antes del examen, con el mensaje listo.",
          "En el mismo sitio guardas los enlaces de apuntes y temario y los mandas al grupo por WhatsApp. Si eliges el grupo que va después, Hoy te avisa cuando toca proponerlo.",
          "En Grupos, Tablón imprime tus horarios, precios y matrícula con el QR de tu ficha.",
        ],
      },
      {
        id: "interesados",
        title: "De la pregunta a la matrícula",
        when: "Cada día",
        body: [
          "Apunta en Interesados a quien pregunta, con su asignatura y la fecha de su examen.",
          "Cada día tienes a quién llamar, con el mensaje escrito según la fase: nuevo, prueba reservada o ya vino a probar.",
        ],
      },
      guideStudents,
      guideTeam,
    ],
    price: { monthly: 39, annual: 390, founder: 299 },
    studentHook: "Intensivos por asignatura para cada examen de enero y junio.",
  },
  culture: {
    id: "culture",
    label: "Ocio, talleres y escape room",
    noun: "tu actividad",
    engine: "classes",
    group: "Deporte y aprendizaje",
    tagline: "Grupos de estudiantes entre semana",
    promises: [
      "Sesiones con plazas, reservas por grupo y control de llegada.",
      "Packs de cumpleaños, clases y Erasmus.",
      "Tardes entre semana a precio estudiante.",
    ],
    nav: [
      { id: "hoy" },
      { id: "horario", label: "Sesiones" },
      { id: "grupos" },
      { id: "socios", label: "Packs y normas" },
      { id: "caja" },
      { id: "bonos", label: "Bonos regalo" },
      { id: "torneos", label: "Ranking" },
      { id: "clientes" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "horario", "grupos", "estudiantes"],
    primary: { label: "Nueva sesión", section: "horario" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "classes",
        "Crea tus actividades",
        "Duración, plazas y precio.",
        "horario",
      ),
      step("hours", "Pon tu horario", "Y las franjas valle.", "ajustes"),
      step("team", "Invita a tu equipo", "Monitores y recepción.", "equipo"),
      step("profile", "Completa tu ficha", "Fotos y vídeo.", "ajustes"),
      step(
        "offer",
        "Crea un pack de grupo",
        "Para asociaciones y cumpleaños.",
        "grupos",
      ),
    ],
    guide: [
      {
        id: "salas",
        title: "Salas, llegadas y caja",
        when: "Cada día",
        body: [
          "En Packs y normas pones a cada sala su mínimo y máximo de jugadores, el precio por grupo y los minutos de montaje entre partidas.",
          "Por la tarde, Hoy te deja el recordatorio de mañana escrito para cada grupo. Al llegar, cobras desde la reserva con los jugadores reales y entra en Caja.",
          "Al salir, guarda el tiempo en la reserva y pide la reseña en el momento, que salen contentos.",
        ],
      },
      {
        id: "volver",
        title: "Que vuelvan",
        when: "Cada semana",
        body: [
          "El Ranking de cada sala se comparte en un toque. Por universidades ves qué facultades juegan más: ahí está tu próximo torneo.",
          "En Ranking, Su próxima sala te enseña a quién proponerle la sala que le falta.",
          "Vende bonos regalo con código en Bonos regalo y canjéalos en recepción escribiendo el código.",
          "Si una reserva es un cumpleaños, márcalo en la ficha: al año siguiente Hoy te recuerda felicitarle con el mensaje escrito.",
        ],
      },
      {
        id: "equipo-material",
        title: "Game masters, material y facturas",
        when: "Cada semana",
        body: [
          "En Packs y normas, Game masters: marca qué salas lleva cada persona y en qué idiomas. Hoy te avisa si una partida no tiene quien la pueda llevar.",
          "En cada taller pones cuánto material gasta cada plaza y lo que tienes en el almacén. Hoy te dice si falta para las reservas de la semana.",
          "Si una empresa pide factura, apunta sus datos en la reserva y emítela con tu numeración.",
        ],
      },
      guideStudents,
      guideTeam,
    ],
    price: { monthly: 29, annual: 290, founder: 199 },
    studentHook: "Packs de grupo para asociaciones, clases y Erasmus.",
  },
  coworking: {
    id: "coworking",
    label: "Coworking y sala de estudio",
    noun: "tu espacio",
    engine: "courts",
    group: "Deporte y aprendizaje",
    tagline: "Tu sala llena en época de exámenes",
    promises: [
      "Puestos y salas por horas, pases y bonos.",
      "Ocupación en directo en el mapa de estudio de Franky.",
      "Bono exámenes para la carrera que tiene exámenes esa semana.",
    ],
    nav: [
      { id: "hoy" },
      { id: "pistas", label: "Espacios" },
      { id: "mostrador", label: "Recepción" },
      { id: "puestos" },
      { id: "socios" },
      { id: "clientes" },
      { id: "ocupacion" },
      { id: "caja" },
      { id: "grupos", label: "Grupos y asociaciones" },
      common.estudiantes,
      common.equipo,
      { id: "normas" },
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "pistas", "socios", "estudiantes"],
    primary: { label: "Nueva reserva", section: "pistas" },
    clientsLabel: "Clientes",
    checklist: [
      step(
        "courts",
        "Da de alta puestos y salas",
        "Capacidad y precio por hora.",
        "pistas",
      ),
      step(
        "plans",
        "Define tus bonos",
        "Día, semana, mes, exámenes.",
        "socios",
      ),
      step(
        "hours",
        "Pon tu horario",
        "Y si abres de noche en exámenes.",
        "ajustes",
      ),
      step(
        "seats",
        "Numera tus puestos",
        "Y da puesto fijo a los socios de cuota mensual.",
        "puestos",
      ),
      step(
        "profile",
        "Completa tu ficha",
        "Fotos y normas de silencio.",
        "ajustes",
      ),
      step("offer", "Lanza tu bono exámenes", "Para enero.", "estudiantes"),
    ],
    guide: [
      {
        id: "recepcion",
        title: "La recepción",
        when: "Cada día",
        body: [
          "Marca Ha llegado y Se va desde Recepción: el bono de días se descuenta solo y quedan las horas reales de cada uno.",
          "Si alguien no llega en el tiempo que marcas en Normas, su puesto se libera para otra persona y la ausencia queda en su ficha.",
          "La tableta en modo mostrador deja que cada cliente entre solo escribiendo su nombre.",
        ],
      },
      {
        id: "puestos",
        title: "Puestos, taquillas y convivencia",
        when: "Primer día",
        body: [
          "En Puestos numeras cada zona, das puesto fijo a los socios de cuota mensual y agrupas mesas por carrera u oposición.",
          "Las taquillas van ligadas a la cuota: si vence, aparece para cobrar o vaciar.",
          "Los avisos de convivencia quedan en Normas. Al tercero, la ficha se marca.",
        ],
      },
      {
        id: "examenes",
        title: "Enero y junio",
        when: "Cada temporada",
        body: [
          "En Ocupación ves la previsión de llenos según el calendario de exámenes de la zona.",
          "Pon el horario de noche en Normas con tiempo y anúncialo con el mensaje preparado. Después, lanza tu bono exámenes en Estudiantes.",
        ],
      },
      {
        id: "socios-caja",
        title: "Que se queden todo el curso",
        when: "Cada semana",
        body: [
          "Hoy te avisa de los socios que llevan diez días sin venir, con un mensaje que recuerda su puesto y ofrece pausar la cuota en vez de perderlos.",
          "A fin de mes, en Puestos, Horas de estudio, mandas a cada uno lo que ha estudiado. Los avisos de convivencia salen en Recepción al entrar.",
          "En Caja haces la factura de cualquier cobro, simplificada o con NIF, con numeración correlativa y el libro del mes en CSV para tu gestoría.",
        ],
      },
      guideStudents,
      guideTeam,
    ],
    price: { monthly: 29, annual: 290, founder: 199 },
    studentHook: "Bono exámenes y horario nocturno en enero y junio.",
  },
  agency: {
    id: "agency",
    label: "Inmobiliaria",
    noun: "tu inmobiliaria",
    engine: "housing",
    group: "Vivienda",
    tagline: "Tus habitaciones, siempre llenas",
    promises: [
      "Interesados verificados con universidad, fecha de entrada y presupuesto.",
      "Grupos compatibles de Roomie para llenar pisos enteros.",
      "Contratos, fianzas, cobros e incidencias de cada habitación.",
    ],
    nav: [
      { id: "hoy", label: "Resumen" },
      { id: "interesados" },
      { id: "cartera" },
      { id: "visitas" },
      { id: "inquilinos" },
      { id: "curso" },
      { id: "cuentas" },
      common.estudiantes,
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "interesados", "visitas", "inquilinos"],
    primary: { label: "Añadir piso", section: "cartera" },
    clientsLabel: "Interesados",
    checklist: [
      step(
        "properties",
        "Sube tus pisos por habitación",
        "Precio y disponibilidad de cada una.",
        "cartera",
      ),
      step(
        "visits",
        "Abre franjas de visita",
        "Presenciales y por vídeo.",
        "visitas",
      ),
      step(
        "team",
        "Invita a tus agentes",
        "Cada uno con sus interesados.",
        "equipo",
      ),
      step(
        "tenants",
        "Pasa a tus inquilinos actuales",
        "Contratos, fianzas y cobros.",
        "inquilinos",
      ),
      step(
        "roomie",
        "Activa grupos de Roomie",
        "Pisos enteros para grupos compatibles.",
        "estudiantes",
      ),
    ],
    guide: [
      {
        id: "interesados",
        title: "Del interesado al contrato",
        when: "Cada día",
        body: [
          "Cada interesado llega con universidad verificada, fecha de entrada, meses y presupuesto.",
          "Muévelo por las fases: nuevo, contactado, visita, reserva y firmado. Contestar el mismo día duplica las visitas.",
          "Asigna cada interesado a un agente para que nadie se quede sin respuesta.",
        ],
      },
      {
        id: "inquilinos",
        title: "Inquilinos, fianzas y cobros",
        when: "Cada semana",
        body: [
          "Cada habitación tiene su contrato, su fianza y su recibo mensual.",
          "La fianza debe depositarse en la Generalitat. Franky te avisa del plazo y te lleva a la sede electrónica.",
          "Las incidencias las abre el inquilino desde su Franky con fotos.",
        ],
      },
      {
        id: "temporada",
        title: "Septiembre y febrero",
        when: "Cada temporada",
        body: [
          "En mayo y junio Franky ve a los admitidos que buscarán piso en septiembre. En noviembre, a los Erasmus de febrero.",
          "Cuando un inquilino avisa de que se va, Roomie te propone sustitutos compatibles con los que se quedan.",
        ],
      },
      {
        id: "curso",
        title: "El curso y las cuentas",
        when: "Cada temporada",
        body: [
          "En Curso ves cada habitación de septiembre a agosto. Toca un hueco y Franky te dice qué interesados pueden entrar esas fechas.",
          "En marzo, ofrece renovar a todos los que acaban de una vez y marca quién sigue y quién se va.",
          "En Cuentas apuntas gastos y facturas de suministros, y a mes vencido sacas la liquidación de cada propietario.",
        ],
      },
      {
        id: "compartir",
        title: "Cada piso, con su ficha y su cartel",
        when: "Cada temporada",
        body: [
          "En la ficha del piso, Compartir te da su enlace, el texto para WhatsApp o Instagram y un cartel A4 con QR.",
          "Quien abre el enlace ve las habitaciones libres y reserva la visita en una franja libre. Te llega a Visitas ya confirmada.",
          "En Inquilinos, Recordar abre WhatsApp con lo que debe cada uno, y en Incidencias tienes a tus técnicos por oficio.",
        ],
      },
      guideTeam,
    ],
    price: {
      monthly: 80,
      annual: 800,
      founder: 80,
      note: "Hasta 40 pisos. Es el Plan Inmobiliarias actual.",
    },
    studentHook:
      "Grupos de Roomie ya formados y admitidos que buscan piso antes que en Idealista.",
  },
  landlord: {
    id: "landlord",
    label: "Propietario particular",
    noun: "tus pisos",
    engine: "housing",
    group: "Vivienda",
    tagline: "Alquila a estudiantes sin perder tiempo",
    promises: [
      "Estudiantes verificados y grupos compatibles.",
      "Contrato, fianza y cobros paso a paso.",
      "Las incidencias llegan con fotos, no por WhatsApp a las 12 de la noche.",
    ],
    nav: [
      { id: "hoy", label: "Resumen" },
      { id: "interesados" },
      { id: "cartera", label: "Mis pisos" },
      { id: "visitas" },
      { id: "inquilinos" },
      { id: "curso" },
      { id: "cuentas" },
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "interesados", "cartera", "inquilinos"],
    primary: { label: "Añadir piso", section: "cartera" },
    clientsLabel: "Interesados",
    checklist: [
      step(
        "properties",
        "Sube tu piso",
        "Por habitaciones o entero.",
        "cartera",
      ),
      step(
        "visits",
        "Abre franjas de visita",
        "Cuándo puedes enseñarlo.",
        "visitas",
      ),
      step(
        "tenants",
        "Pasa a tus inquilinos",
        "Contrato, fianza y cobro.",
        "inquilinos",
      ),
      step(
        "profile",
        "Completa tu perfil",
        "Verificación y datos de contacto.",
        "ajustes",
      ),
      step(
        "roomie",
        "Acepta grupos de Roomie",
        "Para alquilar el piso entero de una vez.",
        "interesados",
      ),
    ],
    guide: [
      {
        id: "primer-dia",
        title: "Tu piso en Franky",
        when: "Primer día",
        body: [
          "Sube el piso por habitaciones: cada una con su precio y su fecha de disponibilidad.",
          "Los interesados llegan verificados por su universidad. Tú decides a quién enseñar el piso.",
        ],
      },
      {
        id: "fianza",
        title: "Contrato y fianza",
        when: "Cada temporada",
        body: [
          "Franky te guía para el contrato de temporada o de habitación y te recuerda depositar la fianza en la Generalitat dentro de plazo.",
        ],
      },
      {
        id: "cuentas",
        title: "Tus cuentas y la renta",
        when: "Cada semana",
        body: [
          "Apunta en Cuentas el IBI, la comunidad, el seguro y cada reparación. Las facturas de luz o agua se reparten solas por los días de cada inquilino.",
          "Al llegar la renta, descarga lo cobrado y los gastos de cada piso y pásaselo a tu asesor.",
        ],
      },
      {
        id: "compartir",
        title: "Visitas que se reservan solas",
        when: "Primer día",
        body: [
          "Abre tu piso y entra en Compartir: tienes su enlace, el texto para WhatsApp y un cartel con QR para el portal o la facultad.",
          "El estudiante, o sus padres, eligen una franja libre y la visita te llega confirmada.",
          "Pide los papeles que faltan en un toque y guarda la matrícula con el contrato de temporada.",
        ],
      },
    ],
    price: {
      monthly: 19,
      annual: 190,
      founder: 19,
      note: "O 9,99 € por anuncio.",
    },
    studentHook: "Grupos de Roomie compatibles para alquilar el piso entero.",
  },
  community: {
    id: "community",
    label: "Asociación o comunidad",
    noun: "tu asociación",
    engine: "community",
    group: "Comunidades",
    tagline: "Tu asociación sobrevive al cambio de junta",
    promises: [
      "Socios, cuotas, actividades con entrada y check-in.",
      "Asistencia verificada para créditos y justificación de subvenciones.",
      "Patrocinadores de Franky con informe de alcance.",
    ],
    nav: [
      { id: "hoy", label: "Resumen" },
      { id: "actividades" },
      { id: "miembros", label: "Socios" },
      { id: "avisos" },
      { id: "caja", label: "Caja" },
      { id: "asamblea" },
      { id: "patrocinios" },
      { id: "subvenciones" },
      { id: "junta" },
      { id: "material" },
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "actividades", "miembros", "avisos"],
    primary: { label: "Nueva actividad", section: "actividades" },
    clientsLabel: "Socios",
    checklist: [
      step(
        "members",
        "Importa a tus socios",
        "Con su cuota y su rol.",
        "miembros",
      ),
      step(
        "activity",
        "Publica tu próxima actividad",
        "Gratis o con entrada.",
        "actividades",
      ),
      step(
        "board",
        "Configura la junta",
        "Quién hace qué y hasta cuándo.",
        "junta",
      ),
      step(
        "announcement",
        "Envía tu primer aviso",
        "Llega a todos los socios.",
        "avisos",
      ),
      step(
        "sponsor",
        "Busca un patrocinador",
        "Negocios de Franky cerca de tu campus.",
        "patrocinios",
      ),
      step(
        "community_cash",
        "Apunta el primer gasto",
        "Con la foto del ticket y quién lo adelantó.",
        "caja",
      ),
    ],
    guide: [
      {
        id: "actividades",
        title: "Actividades con check-in",
        when: "Cada semana",
        body: [
          "Publica la actividad y llega a toda tu universidad, no solo a tus seguidores.",
          "En la puerta escaneas la entrada. La asistencia queda verificada para certificados y créditos.",
        ],
      },
      {
        id: "subvenciones",
        title: "Subvenciones sin sufrir",
        when: "Cada temporada",
        body: [
          "Franky prepara la memoria con actividades, asistentes y fotos para la convocatoria del Consejo de Estudiantes.",
          "Revisa la lista de lo que falta antes de cada ventana de solicitud.",
        ],
      },
      {
        id: "caja",
        title: "La caja del curso",
        when: "Cada semana",
        body: [
          "Cada gasto con su foto del ticket, su actividad y quién lo adelantó. Así sabes a quién le debes dinero.",
          "Al final del curso, las cuentas para la asamblea salen solas y el CSV va directo a la gestoría.",
        ],
      },
      {
        id: "asamblea",
        title: "Asambleas y reuniones de junta",
        when: "Cada temporada",
        body: [
          "Convoca con el orden del día, haz el check-in en la sala y el quórum se cuenta solo.",
          "Apuntas los votos de cada punto y el acta sale escrita. Los acuerdos se convierten en tareas con responsable.",
          "La asistencia de cada cargo a las reuniones de junta sale en un certificado para los créditos.",
        ],
      },
      {
        id: "registro",
        title: "Los papeles de octubre",
        when: "Cada temporada",
        body: [
          "En el primer trimestre el registro de asociaciones pide el certificado de la junta, la lista de socios y la memoria del curso anterior.",
          "En Junta los preparas en un paso, con el porcentaje de socios de tu universidad ya calculado.",
        ],
      },
      {
        id: "junta",
        title: "Cambio de junta",
        when: "Cada temporada",
        body: [
          "Al terminar el mandato traspasas los roles con un clic. Socios, historia, documentos y cuentas se quedan en la asociación.",
          "En Material ves quién tiene cada cosa. Antes del relevo, lo que está en casa de la junta saliente sale marcado.",
        ],
      },
      {
        id: "viajes",
        title: "Viajes pagados a plazos",
        when: "Cada temporada",
        body: [
          "En la actividad del viaje, pestaña Pagos, pones la señal y el resto con su fecha.",
          "Apuntas cada pago con un toque y ves quién va atrasado. El recordatorio sale por WhatsApp con el importe exacto.",
          "La lista de viajeros con DNI y contacto de emergencia se descarga para el autobús y el seguro.",
        ],
      },
      {
        id: "pedidos",
        title: "Sudaderas sin Excel",
        when: "Cada temporada",
        body: [
          "En Caja, Pedidos: la prenda, el precio y las tallas. Compartes el mensaje en el grupo y apuntas a cada socio.",
          "El total por talla se copia para el proveedor y lo cobrado entra en la caja sin apuntarlo dos veces.",
        ],
      },
    ],
    price: {
      monthly: 12,
      annual: 120,
      founder: 0,
      note: "Gratis para empezar. 5 % en entradas y cuotas cobradas.",
    },
    studentHook:
      "Tus actividades llegan a toda la universidad y los patrocinadores están dentro.",
  },
  university: {
    id: "university",
    label: "Universidad",
    noun: "tu universidad",
    engine: "university",
    group: "Comunidades",
    tagline: "El canal que tus estudiantes sí abren",
    promises: [
      "Avisos oficiales con “Lo he leído”: sabes quién los ha visto de verdad, por facultad.",
      "Bienvenida con pasaporte y QR, pisos verificados y créditos de asociaciones sin papeles.",
      "Alerta temprana de primero e informe de temporada, siempre con datos agregados.",
    ],
    nav: [
      { id: "hoy", label: "Resumen" },
      { id: "publicaciones" },
      { id: "calendario" },
      { id: "bienvenida" },
      { id: "mentores" },
      { id: "atencion" },
      { id: "preguntas" },
      { id: "alojamiento" },
      { id: "asociaciones" },
      { id: "moderacion" },
      { id: "memoria" },
      common.equipo,
      common.ajustes,
      common.guia,
    ],
    mobileNav: ["hoy", "publicaciones", "bienvenida", "asociaciones"],
    primary: { label: "Nueva publicación", section: "publicaciones" },
    clientsLabel: "Estudiantes",
    checklist: [
      step("team", "Invita a tu equipo", "Cada servicio con su rol.", "equipo"),
      step(
        "publication",
        "Publica tu primer aviso oficial",
        "Con distintivo verificado.",
        "publicaciones",
      ),
      step(
        "welcome",
        "Prepara la bienvenida",
        "Actividades y pasaporte.",
        "bienvenida",
      ),
      step(
        "housing",
        "Revisa el alojamiento",
        "Pisos verificados para quien llega.",
        "alojamiento",
      ),
      step(
        "associations",
        "Conecta tus asociaciones",
        "Registro y créditos.",
        "asociaciones",
      ),
      step(
        "calendar",
        "Apunta los plazos del curso",
        "Becas, matrícula, exámenes y Erasmus.",
        "calendario",
      ),
      step(
        "office",
        "Publica tus horas de atención",
        "Cita previa por mesa, sin colas.",
        "atencion",
      ),
    ],
    guide: [
      {
        id: "publicar",
        title: "Publicar como universidad",
        when: "Cada semana",
        body: [
          "Tus publicaciones llevan distintivo oficial y aparecen en el campus que elijas: todo el campus, primero, unas facultades, Erasmus, máster, residencias o quien no vino a la bienvenida.",
          "Mides alcance real: cuántos estudiantes lo vieron, no cuántos correos se enviaron. Por debajo de 10 personas no se puede publicar ni se enseña nada.",
        ],
      },
      {
        id: "leido",
        title: "Avisos que se leen",
        when: "Cada semana",
        body: [
          "Activa “Lo he leído” en becas, matrícula o exámenes. A los dos días ves el porcentaje por facultad.",
          "Con “Recordar a quien no lo ha leído” vuelve a llegar solo a quien falta, no a todo el campus.",
          "Si hay un cierre o una suspensión, publica un aviso urgente: queda fijado arriba y lo retiras con “Ya no aplica”.",
        ],
      },
      {
        id: "calendario",
        title: "El calendario del curso",
        when: "Primer día",
        body: [
          "Apunta los plazos clave del curso. Cada uno te propone su aviso con la plantilla que toca, programado dos días antes.",
          "En Resumen aparece cualquier plazo cercano que aún no tenga aviso.",
        ],
      },
      {
        id: "bienvenida",
        title: "La semana de bienvenida",
        when: "Cada temporada",
        body: [
          "Crea las paradas del pasaporte. En la entrada, proyecta el check-in: el QR cambia cada 30 segundos y el contador sube solo.",
          "Imprime el cartel A4 de cada parada para las paredes y los tablones.",
          "Elige qué comercios del campus premian a quien completa el pasaporte y mira la encuesta de cada parada.",
        ],
      },
      {
        id: "primero",
        title: "Alerta temprana de primero",
        when: "Cada temporada",
        body: [
          "A mitad de octubre revisa qué facultades tienen demasiado primero sin ninguna actividad.",
          "Con un toque escribes solo a primero de esa facultad que no vino a la bienvenida.",
        ],
      },
      {
        id: "mentores",
        title: "Mentores de primero",
        when: "Cada temporada",
        body: [
          "Da de alta a estudiantes de segundo en adelante como mentores, con cuántas personas pueden acompañar.",
          "Quien llega a primero pide mentor desde Franky. Con “Emparejar a todos” cada petición va a alguien de su facultad con hueco.",
          "Solo ves cifras: cuántos esperan, cuántos se han escrito. Las conversaciones son suyas.",
        ],
      },
      {
        id: "atencion",
        title: "Horas de atención con cita previa",
        when: "Primer día",
        body: [
          "Publica tus franjas por mesa: becas, matrícula, alojamiento o internacional. El estudiante pide hueco desde Franky y tú ves la agenda del día.",
          "Si alguien llama o pasa por el mostrador, apúntalo en un hueco libre con un toque.",
          "El contador de “Pedir ayuda” te dice cuántas veces se pulsó cada semana, nunca quién.",
        ],
      },
      {
        id: "preguntas",
        title: "Preguntas frecuentes",
        when: "Cada temporada",
        body: [
          "Escribe una vez lo que se pregunta cada octubre: padrón, fianza, NIE, pago de la matrícula. El estudiante lo busca en Franky antes de pedir cita.",
          "En Preguntas ves las más abiertas, las que no convencen y los temas que se repiten en la cita previa sin respuesta.",
          "Si alguien pide cita por algo que ya está respondido, envíale la pregunta desde la cita con un toque.",
        ],
      },
      {
        id: "pisos",
        title: "Pisos verificados y quejas",
        when: "Cada semana",
        body: [
          "Revisa las cinco comprobaciones y el historial del propietario antes de dar el sello.",
          "Si el anuncio se parece al de otro propietario, te avisamos: es el truco de las estafas de septiembre.",
          "Si hay quejas, abre un caso con plazo. Si vence sin respuesta, te lo decimos para que retires el sello.",
          "Los sellos caducan el 31 de agosto: en julio verás cuáles hay que renovar.",
        ],
      },
      {
        id: "creditos",
        title: "Créditos de asociaciones",
        when: "Cada temporada",
        body: [
          "Las horas salen de los check-in. Validas de una vez todas las solicitudes que cumplen la asistencia mínima.",
          "Descarga el archivo para secretaría con nombre, horas y ECTS de cada persona.",
          "Cada septiembre pide la renovación a todas de una vez. Si cambia la junta, registra el traspaso: la nueva hereda documentos, actividades y créditos.",
        ],
      },
      {
        id: "informe",
        title: "Informe de temporada",
        when: "Cada temporada",
        body: [
          "En Informe tienes alcance, bienvenida, pisos, créditos y convivencia del curso en un documento.",
          "Descárgalo en CSV o guárdalo en PDF para la memoria anual y para pedir el presupuesto del año siguiente.",
        ],
      },
      {
        id: "datos",
        title: "Datos que respetan la privacidad",
        when: "Cada temporada",
        body: [
          "Todas las cifras son agregadas y se ocultan con grupos de menos de 10 personas.",
          "Nunca ves recorridos individuales ni datos privados de un estudiante.",
        ],
      },
    ],
    price: {
      monthly: 0,
      annual: 14900,
      founder: 6000,
      note: "Piloto anual por servicio o facultad.",
    },
    studentHook: "Llega a tus estudiantes donde ya están cada día.",
  },
};

export const VERTICAL_ORDER: ProVerticalId[] = [
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
  "agency",
  "landlord",
  "community",
  "university",
];

/** Rutas de demo legibles: /pro/demo-peluqueria en vez de /pro/demo-hairdresser. */
export const DEMO_SLUGS: Record<ProVerticalId, string> = {
  hairdresser: "peluqueria",
  beauty: "estetica",
  cafe: "cafeteria",
  bar: "bar",
  restaurant: "restaurante",
  pub: "pub",
  nightclub: "discoteca",
  sports: "gimnasio",
  sports_facility: "padel",
  academy: "academia",
  culture: "escape-room",
  coworking: "sala-estudio",
  agency: "inmobiliaria",
  landlord: "propietario",
  community: "asociacion",
  university: "universidad",
};

/** Ficha pública (franky.es/n/<slug>) de cada negocio de demostración. */
export const DEMO_PUBLIC_SLUGS: Record<ProVerticalId, string> = {
  hairdresser: "barberia-nomada",
  beauty: "estudio-lia",
  cafe: "cafe-hilo",
  bar: "tasca-del-campus",
  restaurant: "casa-marea",
  pub: "the-loft",
  nightclub: "sala-aurora",
  sports: "box-levante",
  sports_facility: "padel-raspeig",
  academy: "academia-vertice",
  culture: "laberinto-escape",
  coworking: "sala-silencio",
  agency: "habitat-campus",
  landlord: "pisos-de-carmen",
  community: "hilo-rojo",
  university: "universidad-demo",
};

export function verticalFromPublicSlug(slug: string): ProVerticalId | null {
  const found = (Object.keys(DEMO_PUBLIC_SLUGS) as ProVerticalId[]).find(
    (k) => DEMO_PUBLIC_SLUGS[k] === slug,
  );
  return found ?? null;
}

export function verticalFromDemoSlug(slug: string): ProVerticalId | null {
  const found = (Object.keys(DEMO_SLUGS) as ProVerticalId[]).find(
    (k) => DEMO_SLUGS[k] === slug,
  );
  return found ?? null;
}

export function demoSpaceId(vertical: ProVerticalId): string {
  return `demo-${DEMO_SLUGS[vertical]}`;
}

export function navFor(vertical: ProVerticalId): ProNavItem[] {
  return PRO_VERTICALS[vertical].nav;
}

export function hasSection(
  vertical: ProVerticalId,
  section: ProSectionId,
): boolean {
  return PRO_VERTICALS[vertical].nav.some((n) => n.id === section);
}
