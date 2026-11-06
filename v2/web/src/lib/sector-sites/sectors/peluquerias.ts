import type { SectorSite } from "../types";

/**
 * Web comercial de peluquerias.franky.es (Peluquerías y barberías).
 *
 * Todo lo que se cuenta aquí existe hoy en Franky Pro (motor agenda, web en
 * `components/pro/sections/agenda` y `common`). Los precios de la tabla de
 * ahorro son tarifas públicas consultadas en septiembre de 2026; las fuentes
 * están en `docs/producto/sectores/peluquerias/INVESTIGACION.md`.
 */
const site: SectorSite = {
  slug: "peluquerias",
  vertical: "hairdresser",
  name: "Peluquerías",
  audienceLabel: "peluquería",
  eyebrow: "Franky para peluquerías y barberías",
  title: "Todo tu salón en una pantalla.",
  accent: "Y tus huecos, llenos.",
  description:
    "Agenda por profesional, la fórmula de cada color, caja, productos, equipo y recordatorios por WhatsApp. Por una cuota fija, y con los estudiantes de tu zona a un toque para llenar las horas flojas.",
  seoTitle: "Software para peluquerías y barberías | Franky",
  seoDescription:
    "Agenda por profesional, fichas con fórmulas de color, recordatorios por WhatsApp, caja, stock, bonos, fichaje y comisiones. Cuota fija, sin comisión por cliente nuevo y sin permanencia.",
  benefits: [
    {
      title: "Menos sillas vacías",
      body: "Recordatorios de mañana por WhatsApp, señal para quien falla, lista de espera y huecos ofrecidos a estudiantes cerca. Cada hora libre tiene salida.",
    },
    {
      title: "Todo el salón en un sitio",
      body: "Agenda, fichas, caja, productos, bonos, equipo y comisiones. Lo que hoy llevas entre varios programas, una libreta y la calculadora.",
    },
    {
      title: "Tus clientes son tuyos",
      body: "Cuota fija, cero comisión por cliente nuevo y sin permanencia. Tus fichas se exportan cuando quieras.",
    },
  ],
  workflow: [
    {
      title: "Prepara tu salón",
      body: "Pon tu horario, tus servicios con su tiempo y su precio, y tu equipo. Si vienes de otro programa, subes tus clientes en un archivo y listo.",
    },
    {
      title: "Abre las reservas",
      body: "Pon tu enlace en la bio de Instagram y en WhatsApp, y el QR en el espejo. Las citas por teléfono las apuntas tú en dos toques.",
    },
    {
      title: "Trabaja tranquilo",
      body: "Recuerda las citas de mañana, cobra, ofrece tus huecos y cierra caja. A final de mes, el resumen para tu gestoría sale solo.",
    },
  ],
  studentTitle: "Un corte entre clase y clase.",
  studentBody:
    "Los estudiantes tienen huecos por la mañana y a primera hora de la tarde, justo cuando tu silla está vacía. Y quien se corta el pelo cada pocas semanas, si le gusta tu trabajo, vuelve. Franky te pone delante de ellos sin cobrarte por cada uno.",
  faq: [
    {
      question: "¿Sirve también para una barbería?",
      answer:
        "Sí. Pones tus propios servicios, tiempos y profesionales, para un solo sillón o para un equipo. Y si trabajas sin cita, tienes una cola de turnos que calcula la espera con tu agenda real y se puede ver en la tele del local.",
    },
    {
      question: "¿Puedo apuntar una cita que me llega por teléfono o por WhatsApp?",
      answer:
        "Sí. Tocas un hueco de la agenda, eliges el servicio y escribes el nombre. El cliente no necesita tener Franky y el teléfono es opcional.",
    },
    {
      question: "Tengo mis clientes en otro programa o en una libreta. ¿Los pierdo?",
      answer:
        "No. Si tu programa te deja sacar un archivo de clientes (o los tienes en una hoja de cálculo), lo subes y antes de guardar ves quién entra. Los bonos que estén a medias entran con las sesiones que les quedan. Si los tienes en libreta, los vas apuntando según vienen.",
    },
    {
      question: "¿Los recordatorios se mandan solos?",
      answer:
        "Franky te prepara cada WhatsApp ya escrito, con el día, la hora y el servicio. Tú lo envías con un toque desde tu móvil, así que no pagas mensajes. Cuando el cliente contesta, marcas que ha confirmado.",
    },
    {
      question: "¿Cómo funciona la señal para los que no vienen?",
      answer:
        "Tú pones la regla: por ejemplo, a partir de dos faltas se pide señal, y el importe. Al citar a esa persona, Franky te lo recuerda. La pides por Bizum, la apuntas en la cita y se descuenta sola al cobrar.",
    },
    {
      question: "¿Franky se queda una comisión por cada cliente nuevo?",
      answer:
        "No. Pagas una cuota fija y los clientes que te llegan por Franky son tuyos, con su teléfono y su historial, igual que los de siempre.",
    },
    {
      question: "¿Cuánto cuesta si somos más de tres?",
      answer:
        "La cuota incluye hasta 3 profesionales. Cada profesional más suma 5 € al mes. Si pagas el año entero, te ahorras dos meses.",
    },
    {
      question: "¿Tengo permanencia?",
      answer:
        "No. Cancelas cuando quieras y te llevas tus datos. Si dejas de pagar, tu ficha sigue en Franky y la Franky Card sigue funcionando.",
    },
    {
      question: "¿Cada profesional ve solo lo suyo?",
      answer:
        "Tú decides. Cada persona entra con su propio acceso y un rol: un profesional ve su columna y sus clientes, recepción ve la agenda de todos y cobra, y los números del negocio quedan para ti.",
    },
    {
      question: "Tengo un sillón alquilado a un autónomo. ¿Cómo lo llevo?",
      answer:
        "Le pones su cuota de alquiler en Equipo. Tiene su columna en la agenda como los demás, no lleva comisión y a final de mes ves lo que te corresponde.",
    },
    {
      question: "¿Sustituye a mi TPV o a mi gestoría?",
      answer:
        "No. Caja es tu control del día: registras lo cobrado y cuadras el cajón. Las facturas las siguen haciendo tu TPV o tu gestoría, y a final de mes les pasas el resumen que te prepara Franky.",
    },
    {
      question: "¿Puedo llevarlo en el móvil?",
      answer:
        "Sí. Franky Pro se abre en el navegador del móvil, de la tablet del mostrador o del ordenador, con los mismos datos. Lo guardas en la pantalla de inicio y se abre como una app más.",
    },
    {
      question: "¿Cómo llegan los estudiantes a mi peluquería?",
      answer:
        "Tu ficha aparece en Franky para los estudiantes de tu zona, con tus servicios y precios. Además puedes ofrecer tus huecos libres con el descuento que tú eliges, solo a estudiantes verificados cerca de ti.",
    },
    {
      question: "¿Quién me ayuda a ponerlo en marcha?",
      answer:
        "Nosotros. Te acompañamos con el horario, los servicios y los accesos de tu equipo, y resolvemos tus dudas por WhatsApp o por teléfono con una persona.",
    },
  ],
  keywords: [
    "software peluquerías",
    "programa para peluquería",
    "agenda barbería",
    "reservas peluquería online",
    "gestión peluquería",
    "fichas técnicas peluquería",
  ],

  highlights: [
    "Agenda, caja, stock y equipo en una cuota",
    "Recordatorios y mensajes por WhatsApp",
    "Cero comisión por cliente nuevo",
  ],

  modules: [
    {
      id: "hoy",
      name: "Hoy",
      icon: "CalendarCheck",
      summary:
        "Lo primero que ves al abrir: cómo va el día y qué necesita tu atención ahora.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Ahora y a continuación",
          body: "Quién está en cada sillón, quién llega después, cuántas citas te quedan y cuánto tiempo libre tienes hoy.",
        },
        {
          title: "Recuerda las citas de mañana",
          body: "Por la tarde te sale la lista de mañana. Tocas Recordar y se abre el WhatsApp con el día, la hora y el servicio escritos. Cuando contesta, marcas Confirma.",
        },
        {
          title: "Solicitudes por responder",
          body: "Las citas pedidas online que necesitan tu visto bueno salen arriba. Aceptas o propones otra hora.",
        },
        {
          title: "Un hueco para quien espera",
          body: "Si se queda libre un hueco que encaja con alguien de tu lista de espera, te lo enseña con el mensaje listo para mandar.",
        },
        {
          title: "Avisos antes de que llegue",
          body: "Prueba de tinte pendiente, firma por hacer, señal sin cobrar, última sesión del bono o un cumpleaños. Lo sabes antes de que se siente.",
        },
        {
          title: "Turnos sin cita",
          body: "Quien entra por la puerta se apunta en la cola. Franky calcula la espera con tu agenda real y la puedes enseñar en la tele del local.",
        },
        {
          title: "Pantalla de recepción",
          body: "La agenda del día a pantalla completa para la tablet del mostrador: quién está con quién y quién viene después. Los datos de salud no se ven.",
        },
        {
          title: "Apertura y cierre",
          body: "Las tareas de cada día, como reponer o cuadrar caja, se marcan con un toque y queda quién lo hizo y a qué hora.",
        },
      ],
    },
    {
      id: "agenda",
      name: "Agenda",
      icon: "CalendarDays",
      summary:
        "Una columna por profesional, en vista de día o de semana. El centro de tu salón.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Cita en dos toques",
          body: "Tocas un hueco, eliges el servicio y escribes el nombre. El cliente no necesita tener Franky y el teléfono es opcional.",
        },
        {
          title: "Solo huecos reales",
          body: "La disponibilidad sale de tu horario, los descansos, las vacaciones y las citas ya puestas. Dos clientes nunca se pisan.",
        },
        {
          title: "Mientras el color posa",
          body: "Un color se divide en aplicación, pose y aclarado. Durante la pose la agenda te deja libre y puedes meter un corte o una barba.",
        },
        {
          title: "Bloquea en un gesto",
          body: "Mantén pulsado un hueco para bloquearlo: comida, médico o formación. También días enteros, y nadie puede reservar ahí, tampoco online.",
        },
        {
          title: "Mueve una cita sin líos",
          body: "Cambia el día, la hora o el profesional desde la propia cita. Franky solo te enseña los huecos donde cabe.",
        },
        {
          title: "Citas que se repiten",
          body: "Para quien viene cada pocas semanas: dejas reservadas sus próximas citas, el mismo día y a la misma hora, de una vez.",
        },
        {
          title: "Dos profesionales en una cita",
          body: "Una novia o un evento puede ocupar a dos personas del equipo a la vez, cada una en su columna.",
        },
        {
          title: "Llegada, atendida o no vino",
          body: "Marcas cada cita. Quien falla queda anotado y, si pasa de tu límite, la próxima vez Franky te recuerda pedirle señal.",
        },
      ],
    },
    {
      id: "clientes",
      name: "Clientes",
      icon: "Contact",
      summary:
        "La ficha de cada cliente, con su historial, sus fórmulas y lo que solo sabe tu equipo.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Fórmulas de color con fecha",
          body: "Marca, tonos y proporción, oxidante, tiempo de pose y resultado. Al abrir su próxima cita la tienes delante, con el botón Repetir fórmula.",
        },
        {
          title: "Prueba de sensibilidad",
          body: "Apuntas cuándo se hizo la prueba del tinte. Si le falta, la cita de color te avisa y te deja citar la prueba 48 horas antes.",
        },
        {
          title: "Antes y después",
          body: "Haces las fotos con el móvil y quedan en su ficha. Solo las enseñas si el cliente te da permiso.",
        },
        {
          title: "Firmas con el dedo",
          body: "Los consentimientos de cada servicio se firman en la pantalla y quedan en la ficha con su fecha.",
        },
        {
          title: "Salud y alergias",
          body: "Alergias y medicación, visibles solo para tu equipo. En la pantalla del mostrador solo aparece un aviso para mirar la ficha.",
        },
        {
          title: "Historial de visitas",
          body: "Cuándo vino, qué se hizo, con quién y si alguna vez faltó, en una sola ficha.",
        },
        {
          title: "Trae tus clientes",
          body: "Subes el archivo de tu programa anterior o de una hoja de cálculo y ves quién entra antes de guardar. Los bonos a medias entran con sus sesiones.",
        },
        {
          title: "Tu lista es tuya",
          body: "Exportas todos tus clientes cuando quieras, con quién acepta recibir mensajes.",
        },
      ],
    },
    {
      id: "vuelven",
      name: "Vuelven",
      icon: "HeartHandshake",
      summary:
        "A quién le toca volver, quién se está yendo y quién espera un hueco. Cada nombre, con su WhatsApp ya escrito.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Les toca volver",
          body: "Dices cada cuánto vuelve cada servicio (un degradado, cada tres semanas) y Franky te enseña a quién le toca esta semana, con un hueco sugerido.",
        },
        {
          title: "Clientes que se están yendo",
          body: "Quien venía con su ritmo y lleva demasiado sin aparecer sale aquí, con su último servicio y los días que lleva sin venir.",
        },
        {
          title: "Lista de espera",
          body: "Apuntas quién quiere hueco, para qué servicio, con quién y en qué franja. Si alguien cancela o no viene, te enseñamos quién lo quería.",
        },
        {
          title: "Cumpleaños",
          body: "Quién cumple en las dos próximas semanas y un toque para felicitarle por WhatsApp.",
        },
        {
          title: "Huecos recuperados",
          body: "Cuántas citas has salvado con la lista de espera y cuántas faltas llevas este mes.",
        },
      ],
    },
    {
      id: "servicios",
      name: "Servicios y productos",
      icon: "Scissors",
      summary:
        "Tu carta de servicios y tu estantería, con tiempos, precios y existencias.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Tiempo y precio de cada servicio",
          body: "Cada servicio ocupa en la agenda lo que de verdad lleva, y puedes poner lo que tarda cada profesional.",
        },
        {
          title: "Precio estudiante",
          body: "Un precio para estudiantes que, si quieres, solo vale en tus horas más flojas.",
        },
        {
          title: "Señal en los servicios largos",
          body: "Pide señal en unas mechas o un recogido de novia. Se apunta en la cita y se descuenta al cobrar.",
        },
        {
          title: "Cuidados para casa",
          body: "Escribes los cuidados de cada servicio y al cobrar se los mandas al cliente por WhatsApp.",
        },
        {
          title: "Productos y existencias",
          body: "Champús, ceras y tintes con su precio, su coste y un mínimo. Al vender o gastar material en un servicio, el stock baja solo.",
        },
        {
          title: "Pedido al proveedor",
          body: "Lo que está bajo mínimo se agrupa por proveedor y el pedido sale por WhatsApp en un toque.",
        },
        {
          title: "Online o solo en el salón",
          body: "Decides qué servicios se reservan por internet y cuáles prefieres cerrar en persona.",
        },
      ],
    },
    {
      id: "caja",
      name: "Caja",
      icon: "Wallet",
      summary:
        "Cobros, bonos, tarjetas regalo, el cierre del día y el mes listo para tu gestoría.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Cobro completo en una pantalla",
          body: "Servicio, productos, descuento, bono, señal ya pagada, tarjeta regalo y propina. Si paga una parte con tarjeta y otra en efectivo, también.",
        },
        {
          title: "Bonos y tarjetas regalo",
          body: "Vendes un bono de cortes o una tarjeta regalo y se descuenta solo cuando el cliente lo usa.",
        },
        {
          title: "Pide la reseña al cobrar",
          body: "Con un toque se abre el WhatsApp de gracias con tu enlace para dejar reseña.",
        },
        {
          title: "Tarjeta, efectivo y Bizum",
          body: "Totales separados por método de pago para saber qué entra por cada vía.",
        },
        {
          title: "Cierre en un minuto",
          body: "Cuentas el cajón, escribes el efectivo y Franky te dice si cuadra con lo esperado.",
        },
        {
          title: "Comisiones sin calculadora",
          body: "Un porcentaje para servicios y otro para productos por persona, sobre lo cobrado y sin contar propinas.",
        },
        {
          title: "El mes para tu gestoría",
          body: "Cobros por día y método, propinas, comisiones y horas fichadas, en un archivo y en un texto listo para mandar.",
        },
        {
          title: "Rentabilidad por silla",
          body: "Lo ocupada que está cada silla, lo que factura cada hora, cuántos repiten y las franjas que se quedan vacías.",
        },
      ],
    },
    {
      id: "franky-card",
      name: "Franky Card y sellos",
      icon: "QrCode",
      summary:
        "Fidelidad para estudiantes sin tarjetas de cartón ni aparatos nuevos.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Validar en tres toques",
          body: "El estudiante enseña su código, escribes el importe y Franky aplica el descuento que tú has elegido.",
        },
        {
          title: "Tarjeta de sellos",
          body: "Tú eliges cuántos sellos y el premio, por ejemplo un arreglo de barba. Los sellos se suman solos al validar y el premio se canjea en la misma pantalla.",
        },
        {
          title: "Sin trampas",
          body: "El código de la tarjeta cambia cada 30 segundos, así que una captura de pantalla no sirve.",
        },
        {
          title: "Sin comisión por uso",
          body: "El descuento lo decides tú, del 5 al 20 %. Franky no cobra nada por cada validación.",
        },
      ],
    },
    {
      id: "estudiantes",
      name: "Estudiantes",
      icon: "GraduationCap",
      summary:
        "Todo lo que Franky hace para traerte clientes nuevos de la universidad.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Tu ficha en Franky",
          body: "Apareces en el mapa y en las búsquedas de los estudiantes de tu zona, con tus servicios y tus precios.",
        },
        {
          title: "Huecos de última hora",
          body: "Eliges un hueco libre, el descuento y a qué distancia se enseña: 1, 2 o 5 km. Solo lo ven estudiantes verificados.",
        },
        {
          title: "Horas valle",
          body: "Tu precio estudiante solo en las franjas flojas que tú eliges, en vez de bajar el precio a todo el mundo.",
        },
        {
          title: "Graduaciones y orlas",
          body: "Una delegación te pide peinados para la graduación. Aceptas y Franky reparte las citas entre tu equipo y te da el horario para mandarlo.",
        },
        {
          title: "Calendario académico",
          body: "Franky conoce el inicio de curso, los exámenes y las fiestas de cada universidad y te propone campañas para cada momento. Tú las programas con un toque.",
        },
        {
          title: "Reseñas de verdad",
          body: "Solo opina quien ha venido. Lees lo que dicen de ti y respondes desde el mismo sitio.",
        },
        {
          title: "Resultados medidos",
          body: "Cuántas reservas y cuánto facturado te llega por Franky, contado con citas y validaciones reales.",
        },
      ],
    },
    {
      id: "equipo",
      name: "Equipo",
      icon: "UsersRound",
      summary:
        "Personas, permisos, fichaje, vacaciones y comisiones, sin compartir contraseñas.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Un acceso por persona",
          body: "Invitas a cada profesional con su móvil o su correo. Nadie usa la cuenta del dueño.",
        },
        {
          title: "Cada uno ve lo suyo",
          body: "Profesional, recepción, encargado o responsable. Quien no tiene permiso para algo no lo ve.",
        },
        {
          title: "Fichaje desde el móvil",
          body: "Entrada y salida con un toque. Ves quién está trabajando ahora.",
        },
        {
          title: "Registro de jornada",
          body: "Lo descargas listo para tu gestoría o para una inspección.",
        },
        {
          title: "Vacaciones y bajas",
          body: "Cierran la columna de esa persona esos días, también para las reservas online.",
        },
        {
          title: "Reglas de cobro por persona",
          body: "Comisión en servicios, comisión en productos o alquiler de sillón. Cada uno con lo suyo.",
        },
        {
          title: "Su día por WhatsApp",
          body: "A cada profesional le mandas sus citas del día con los avisos de cada cliente, sin datos de salud.",
        },
      ],
    },
    {
      id: "ajustes",
      name: "Ficha, enlace y mensajes",
      icon: "Link2",
      summary:
        "Tu horario, tu enlace para reservar y la forma de hablar con tus clientes.",
      where: ["web", "app"],
      capabilities: [
        {
          title: "Horario con descansos",
          body: "Días, horas y pausas. De aquí salen los huecos de la agenda y las reservas online.",
        },
        {
          title: "Enlace de reservas",
          body: "Para la bio de Instagram, tu ficha de Google y WhatsApp. Abre tu ficha con el botón Reservar.",
        },
        {
          title: "QR para el salón",
          body: "Para el espejo o el mostrador: quien lo escanea reserva su próxima cita.",
        },
        {
          title: "Tus mensajes, a tu manera",
          body: "Recordatorio, cambio de cita, gracias, te toca volver, cumpleaños y lista de espera. Escribes el texto una vez y el nombre, la hora y el servicio se rellenan solos.",
        },
        {
          title: "Tu regla de señal",
          body: "A partir de cuántas faltas se pide y de cuánto. Franky te lo recuerda al citar a esa persona.",
        },
        {
          title: "Tu escaparate",
          body: "Los antes y después que tus clientes te dejan enseñar, juntos y listos para descargar y subir a tus redes.",
        },
      ],
    },
  ],

  dayWithFranky: [
    {
      time: "09:00",
      title: "Abres Hoy",
      body: "Citas del día, una solicitud online por aceptar y un hueco a las 12:00 que encaja con alguien de tu lista de espera. Le escribes con un toque.",
    },
    {
      time: "09:05",
      title: "Fichas al entrar",
      body: "Un toque en el móvil y tu entrada queda registrada. Marcas la apertura y el resto del equipo hace lo mismo.",
    },
    {
      time: "10:30",
      title: "El color posa, tú no paras",
      body: "Mientras posa el color de las 10:00, la agenda te deja libre y metes un degradado en ese rato.",
    },
    {
      time: "11:30",
      title: "Ofreces el hueco de la tarde",
      body: "Lo lanzas a estudiantes verificados a 2 km, con el descuento que tú eliges.",
    },
    {
      time: "13:30",
      title: "Entra alguien sin cita",
      body: "Se apunta en la cola y ve su espera en la pantalla del local. Cuando le toca, pasa a ser una cita más.",
    },
    {
      time: "17:00",
      title: "Vuelve una clienta de color",
      body: "Abres su cita: la prueba de tinte está al día y su fórmula de la última vez, delante. Tocas Repetir fórmula.",
    },
    {
      time: "18:30",
      title: "Recuerdas las citas de mañana",
      body: "Cada WhatsApp sale escrito. Los mandas en un rato y vas marcando quién confirma.",
    },
    {
      time: "19:30",
      title: "Cobras y pides la reseña",
      body: "Servicio, un champú y la propina en el mismo cobro. Sale el WhatsApp de gracias con tu enlace de reseña y, si es estudiante, suma su sello.",
    },
    {
      time: "20:30",
      title: "Cierras caja",
      body: "Cuentas el cajón, Franky te dice si cuadra y ves lo facturado por cada profesional.",
    },
  ],

  gains: {
    title: "Lo que hoy pagas por separado, en una sola cuota.",
    intro:
      "Un salón de tres profesionales que quiere programa de gestión, registro de jornada y tarjeta de fidelización suele pagar tres cuotas. Y si usa una plataforma que le trae clientes, además una comisión por cada uno. En Franky va todo junto.",
    rows: [
      {
        category: "Programa de gestión con agenda, fichas, caja y stock",
        usualPrice: "29 a 55 € al mes",
        monthly: { min: 29, max: 55 },
        inFranky:
          "Agenda por profesional, fichas con fórmulas, caja, bonos, productos y comisiones",
      },
      {
        category: "Registro de jornada para un equipo de 3",
        usualPrice: "5 a 15 € al mes",
        monthly: { min: 5, max: 15 },
        inFranky: "Fichaje desde el móvil y registro listo para descargar",
      },
      {
        category: "Tarjeta de fidelización digital",
        usualPrice: "25 a 49 € al mes",
        monthly: { min: 25, max: 49 },
        inFranky: "Tarjeta de sellos y Franky Card",
      },
      {
        category: "Plataforma de reservas que trae clientes nuevos",
        usualPrice: "Del 25 al 30 % de la primera visita",
        inFranky: "Ficha en Franky y huecos para estudiantes, sin comisión",
      },
    ],
    note: "Precios orientativos de tarifas públicas en España, consultados en septiembre de 2026, sin IVA y para un salón de 3 profesionales.",
    time: [
      {
        title: "Menos teléfono",
        body: "Las citas online entran solas en la agenda y los recordatorios salen escritos.",
      },
      {
        title: "Cierre sin libreta",
        body: "Tarjeta, efectivo y Bizum separados y el cajón cuadrado en un minuto.",
      },
      {
        title: "Comisiones sin calculadora",
        body: "Lo de cada profesional se calcula solo con lo cobrado.",
      },
      {
        title: "Papeles al día",
        body: "El registro de jornada y el resumen del mes, listos cuando los pide la gestoría.",
      },
    ],
  },

  studentSection: {
    eyebrow: "Clientes nuevos, sin comisión",
    points: [
      {
        title: "Te encuentran",
        body: "Tu peluquería aparece en el mapa y en las búsquedas de Franky para los estudiantes de tu zona.",
      },
      {
        title: "Llenas huecos",
        body: "Tus horas muertas se ofrecen a estudiantes verificados cerca de ti, cuando tú quieres y con el descuento que tú pones.",
      },
      {
        title: "Vienen en grupo",
        body: "Graduaciones, orlas y fiestas de facultad: te piden el grupo y tú lo montas en la agenda de una vez.",
      },
      {
        title: "Vuelven",
        body: "Con la Franky Card, tu tarjeta de sellos y el aviso de que le toca volver, el primer corte se convierte en costumbre.",
      },
      {
        title: "Lo ves en números",
        body: "Cuántas reservas y cuánto facturado te llega por Franky cada mes.",
      },
    ],
  },

  mobileApp: {
    title: "Tu peluquería, en el bolsillo.",
    body: "Franky Pro funciona en el móvil, en la tablet del mostrador y en el ordenador, con los mismos datos. Lo guardas en la pantalla de inicio y se abre como una app, pensado para usarlo de pie y con una mano.",
    actions: [
      "Ver la agenda de hoy y de la semana por profesional",
      "Crear, mover o bloquear una cita en el momento",
      "Aceptar una solicitud online o proponer otra hora",
      "Mandar los recordatorios de mañana por WhatsApp",
      "Abrir la fórmula de color antes de empezar",
      "Hacer las fotos de antes y después",
      "Cobrar con productos, bono y propina",
      "Ofrecer un hueco libre a estudiantes cerca",
      "Fichar la entrada y la salida",
      "Validar una Franky Card y sumar sellos",
    ],
  },

  planIncludes: [
    "Agenda por profesional con reservas online",
    "Recordatorios, lista de espera y señal para quien falla",
    "Fichas con fórmulas de color, fotos y firmas",
    "Caja con bonos, tarjetas regalo y cierre",
    "Productos, stock y pedido al proveedor",
    "Equipo con roles, fichaje y comisiones",
    "Ficha en Franky y huecos para estudiantes",
    "Franky Card y tarjeta de sellos",
    "Enlace de reservas y QR para el salón",
    "Ayuda por WhatsApp con una persona",
  ],
};

export default site;
