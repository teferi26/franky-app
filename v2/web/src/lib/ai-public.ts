/** Public product copy only. This module is also used by the offline navigator. */
export type AssistantAction = { label: string; href: string };
export type AssistantReply = { reply: string; actions: AssistantAction[]; mode: 'ai' | 'basic' };
export const normalizeQuestion = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f\u200B-\u200D\uFEFF]/g, '').toLowerCase();

export const PUBLIC_SERVICES = [
  { id: 'becas', label: 'Ir a BecarIA', href: '/becas', match: /\b(beca\w*|becaria|ayudas?|erasmus|mec|matricula)\b/, description: 'BecarIA reúne becas y ayudas. Puedes filtrar por nombre, entidad, comunidad, tipo y plazo, responder preguntas para orientarte y consultar los requisitos, documentos y la convocatoria oficial. Las coincidencias no garantizan la concesión.' },
  { id: 'roomies', label: 'Buscar compañeros de piso', href: '/roomie-match', match: /\b(roomi\w*|companero\w*|convivir|convivencia|compartir piso)\b/, description: 'RoomieMatch te ayuda a buscar compañeros de piso según tus preferencias. Entra en la sección para consultar las opciones de tu cuenta.' },
  { id: 'pisos', label: 'Buscar alojamiento', href: '/alojamiento', match: /\b(piso\w*|alojamiento\w*|habitacion\w*|alquiler\w*|residencia\w*)\b/, description: 'En Alojamiento puedes explorar pisos, habitaciones y residencias, filtrar opciones y consultar sus fichas. La disponibilidad y las condiciones se comprueban en cada anuncio.' },
  { id: 'eventos', label: 'Explorar eventos', href: '/eventos', match: /\b(evento\w*|fiesta\w*|planes|entradas?|concierto\w*)\b/, description: 'Eventos permite descubrir planes universitarios y consultar la información y las entradas de cada evento. Tus entradas están en Mis entradas.' },
  { id: 'estudio', label: 'Organizar mi estudio', href: '/agenda', match: /\b(estudi\w*|agenda|examen\w*|apuntes|organizar\w*|horario\w*|pomodoro|asignatura\w*)\b/, description: 'La agenda ayuda a organizar tu día a día de estudio. Puedo ayudarte a dividir tareas, proponer sesiones de repaso y preparar un plan a partir de lo que me cuentes, sin leer tu agenda ni tus documentos.' },
  { id: 'notas', label: 'Consultar notas de corte', href: '/notas-corte', match: /\b(notas?|corte|evau|ebau|pau|selectividad|admision)\b/, description: 'Notas de corte permite consultar referencias de admisión por estudios y universidad. Comprueba siempre el curso, el cupo y la fuente; una nota anterior no garantiza una plaza futura.' },
  { id: 'universidades', label: 'Explorar universidades', href: '/universidades', match: /\b(universidad\w*|campus|facultad\w*)\b/, description: 'Universidades reúne fichas de universidades españolas y sus estudios, con comparador y fuentes institucionales.' },
  { id: 'vocacion', label: 'Hacer el test vocacional', href: '/test-vocacional', match: /\b(carrera\w*|grado\w*|vocacion\w*|profesion\w*|trabajar|salidas)\b/, description: 'El test vocacional ayuda a explorar carreras según tus intereses. Es orientativo; puedes contrastar opciones en las fichas de universidades.' },
  { id: 'simulador', label: 'Simular mi admisión', href: '/simulador', match: /\b(simula\w*|pondera\w*|nota de admision)\b/, description: 'El simulador permite explorar la nota de admisión. La calculadora de nota media está en Nota media. Revisa las ponderaciones y el curso aplicable.' },
  { id: 'ocio', label: 'Explorar ocio', href: '/ocio', match: /\b(ocio|restaurante\w*|bar\w*|comer|descuento\w*)\b/, description: 'Ocio reúne lugares y propuestas para estudiantes. Consulta las condiciones que publique cada establecimiento.' },
  { id: 'fomo', label: 'Entrar en FOMO', href: '/fomo', match: /\b(fomo|anonim\w*|foro\w*)\b/, description: 'FOMO es un espacio de conversación universitaria. Respeta la privacidad de otras personas y utiliza las opciones de denuncia o bloqueo ante abusos.' },
  { id: 'crush', label: 'Descubrir Crush', href: '/crush', match: /\b(crush|ligar|citas|pareja)\b/, description: 'Crush te permite descubrir personas y conocer sus opciones de conexión desde tu propia cuenta.' },
  { id: 'comunidades', label: 'Ver comunidades', href: '/comunidades', match: /\b(comunidad\w*|asociacion\w*|club\w*|grupo\w*)\b/, description: 'Comunidades permite descubrir grupos e intereses compartidos en Franky.' },
  { id: 'mercado', label: 'Ir al mercado', href: '/mercado', match: /\b(mercado|comprar|vender|segunda mano)\b/, description: 'Mercado es la sección para consultar publicaciones de compraventa. Comprueba cada anuncio y sus condiciones.' },
  { id: 'noticias', label: 'Leer noticias', href: '/noticias', match: /\b(noticia\w*|novedad\w*|actualidad)\b/, description: 'Noticias reúne publicaciones sobre la vida universitaria y novedades de Franky.' },
  { id: 'negocio', label: 'Colaborar con Franky', href: '/negocio', match: /\b(negocio\w*|propietari\w*|publicar|colaborar|anunciar\w*)\b/, description: 'La sección de negocios explica las opciones públicas para establecimientos y propietarios. Consulta allí las condiciones vigentes.' },
  { id: 'precios', label: 'Ver planes y precios', href: '/negocio', match: /\b(precio\w*|premium|suscripcion\w*|cuesta|tarifa\w*|gratis)\b/, description: 'Franky es gratis para estudiantes; solo se pagan cosas concretas como algunas entradas de eventos. Los planes de pago para propietarios, inmobiliarias y locales se consultan en la sección de negocios. No puedo consultar tus pagos ni confirmar cargos de tu cuenta.' },
  { id: 'ayuda', label: 'Abrir el centro de ayuda', href: '/ayuda', match: /\b(ayuda|cuenta|acceso|entrar|contrasena|borrar|bloque\w*|denunci\w*|soporte|problema\w*|error\w*)\b/, description: 'El centro de ayuda explica cómo acceder a la cuenta, recuperar la contraseña, denunciar, bloquear y gestionar tus datos. Para un caso personal, utiliza Contacto. No puedo consultar cuentas, chats, pagos ni expedientes.' },
  { id: 'app', label: 'Ver la app de Franky', href: '/app', match: /\b(app|movil|android|iphone|ios|descargar)\b/, description: 'La app móvil está pensada para una experiencia más cómoda en eventos, búsqueda de compañeros y alojamiento, y organización diaria del estudio. Consulta su disponibilidad en la página de la app; no presupongas que ya se puede descargar en todas las tiendas.' },
] as const;

export const PUBLIC_EXTRA_ACTIONS: AssistantAction[] = [
  { label: 'Contactar con Franky', href: '/contacto' }, { label: 'Mis entradas', href: '/mis-entradas' },
  { label: 'Calcular mi nota media', href: '/nota-media' }, { label: 'Ver privacidad', href: '/privacidad' },
];
export const NO_ACCESS = 'No tengo acceso a esa información. Puedo ayudarte con la información pública de Franky y a encontrar la sección que necesitas.';

// Defense in depth: the real boundary is the public-only data loader and lack of tools.
export function asksForPrivateInformation(text: string): boolean {
  const normalized = normalizeQuestion(text);
  return /\b(vulnerabil\w*|exploit\w*|hack\w*|inyeccion|prompt|system message|instrucciones internas|instrucciones del sistema|codigo fuente|source code|base de datos|database|credencial\w*|api.?key|service.?role|supabase|vercel|variables de entorno|\.env|secret\w*|informacion interna|datos internos|informacion privada|datos privados|panel de admin\w*|back.?end|arquitectura interna|rls|token\w*)\b/.test(normalized)
    || /\b(ignora|ignore|olvida|revela|reveal|muestra|imprime|print)\b.{0,60}\b(instrucciones|instructions|sistema|system|reglas|rules|configuracion)\b/.test(normalized)
    || /\b(lee|leer|muestra|dime|consulta|accede|revela)\b.{0,50}\b(chats?|mensajes privados|conversaciones|pagos|expediente|usuarios|correos)\b/.test(normalized);
}

export function redactPersonalText(text: string): string {
  return text
    .replace(/\b(?:sk-[a-z0-9_-]{12,}|eyJ[a-zA-Z0-9_.-]{20,})\b/gi, '[dato omitido]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email omitido]')
    .replace(/\b(?:[XYZ]\d{7}|\d{8})[A-Z]\b/gi, '[documento omitido]')
    .replace(/\b(?:ES\d{2}[\s-]?(?:\d[\s-]?){20})\b/gi, '[cuenta omitida]')
    .replace(/(?:\+34[\s.-]?)?\b[6789](?:[\s.-]?\d){8}\b/g, '[teléfono omitido]')
    .replace(/https?:\/\/\S+/gi, '[enlace omitido]');
}

export function relevantServices(message: string, previousQuestion = '') {
  const current = normalizeQuestion(message);
  const matched = PUBLIC_SERVICES.filter(service => service.match.test(current));
  return matched.length ? matched : PUBLIC_SERVICES.filter(service => service.match.test(normalizeQuestion(previousQuestion)));
}

export function basicReply(message: string, count: number | null = null, previousQuestion = '', scholarshipId?: string): AssistantReply {
  if (asksForPrivateInformation(message)) return { reply: NO_ACCESS, actions: [{ label: 'Abrir el centro de ayuda', href: '/ayuda' }], mode: 'basic' };
  const services = relevantServices(message, previousQuestion);
  if (scholarshipId && /^[a-f0-9-]{36}$/i.test(scholarshipId)) {
    return { reply: 'Puedes consultar los requisitos, documentos y plazos publicados en la ficha de esta beca. No tengo acceso a más información para resolver esa duda ahora. Comprueba las bases del organismo convocante antes de solicitarla.', actions: [{ label: 'Consultar esta beca', href: `/becas/${scholarshipId}` }, { label: 'Ir a BecarIA', href: '/becas' }], mode: 'basic' };
  }
  const chosen = services.slice(0, 3);
  const paragraphs = chosen.map(service => service.id === 'becas'
    ? `${count === null ? 'En BecarIA puedes explorar becas y ayudas' : `Tenemos ${count.toLocaleString('es-ES')} becas y ayudas en el catálogo de BecarIA`}. Filtra las opciones y consulta requisitos, plazos y la convocatoria oficial. El catálogo también incluye convocatorias cerradas o pendientes de confirmar.`
    : service.description);
  const actions: AssistantAction[] = chosen.map(({ label, href }) => ({ label, href }));
  if (chosen.some(s => ['roomies', 'pisos', 'eventos', 'estudio'].includes(s.id))) {
    paragraphs.push('La app móvil está pensada para ayudarte con estos servicios en tu día a día. Puedes consultar su disponibilidad en la página de la app.');
    actions.push({ label: 'Ver la app de Franky', href: '/app' });
  }
  return { reply: paragraphs.join('\n\n') || '¡Hola! Te ayudo a encontrar becas, estudios, alojamiento, compañeros de piso y planes en Franky. No tengo acceso a esa información concreta ahora. Dime qué buscas y te indicaré por dónde empezar.', actions: actions.length ? actions : [{ label: 'Ir a BecarIA', href: '/becas' }, { label: 'Explorar universidades', href: '/universidades' }, { label: 'Abrir el centro de ayuda', href: '/ayuda' }], mode: 'basic' };
}

/** Never navigate to model-generated destinations or execute response HTML. */
export function safeAssistantActions(value: unknown): AssistantAction[] {
  if (!Array.isArray(value)) return [];
  const paths = new Set<string>([...PUBLIC_SERVICES, ...PUBLIC_EXTRA_ACTIONS].map(s => s.href));
  return value.filter((action): action is AssistantAction => !!action && typeof action === 'object'
    && typeof action.label === 'string' && action.label.length > 0 && action.label.length <= 160
    && typeof action.href === 'string' && (paths.has(action.href) || /^\/becas\/[a-f0-9-]{36}$/i.test(action.href)))
    .slice(0, 6);
}
