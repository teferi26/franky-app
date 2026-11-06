// Placeholder textual unificado para datos sin valor (precios, fechas, stats).
export const SIN_DATO = 's/d';

export const eur = (n: number | null | undefined) =>
  n == null ? SIN_DATO : n === 0 ? 'Gratis' : `${n.toLocaleString('es-ES')} €`;

export const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  // Reloj desincronizado o fecha futura: tratar como recién publicado.
  if (diff < 0) return 'ahora';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo === 1 ? 'hace 1 mes' : `hace ${mo} meses`;
  const y = Math.floor(d / 365);
  return y === 1 ? 'hace 1 año' : `hace ${y} años`;
};

export const dateShort = (iso: string | null | undefined) => {
  if (!iso) return SIN_DATO;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

export const dateLong = (iso: string | null | undefined) => {
  if (!iso) return SIN_DATO;
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

export const branchLabel: Record<string, string> = {
  ciencias: 'Ciencias',
  ciencias_salud: 'C. de la Salud',
  ingenieria_arquitectura: 'Ingeniería y Arq.',
  artes_humanidades: 'Artes y Hum.',
  ciencias_sociales_juridicas: 'Sociales y Jur.',
};

export const typeLabel: Record<string, string> = {
  piso_completo: 'Piso completo', habitacion: 'Habitación', estudio: 'Estudio', residencia: 'Residencia',
  bar: 'Bar', restaurante: 'Restaurante', cafeteria: 'Cafetería', discoteca: 'Discoteca',
  parque: 'Aire libre', cultural: 'Cultural', deportivo: 'Deporte', coworking: 'Coworking',
  fiesta: 'Fiesta', academico: 'Académico', networking: 'Networking', feria: 'Feria', otro: 'Otro',
  nacional: 'Nacional', autonomica: 'Autonómica', privada: 'Privada', europea: 'Europea', internacional: 'Internacional',
};

// Emoji por categoría de EVENTO: el tipo se reconoce de un vistazo en pines,
// tarjetas y filtros sin leer la etiqueta.
export const eventEmoji: Record<string, string> = {
  fiesta: '🎉', academico: '📚', deportivo: '⚽', cultural: '🎭',
  networking: '🤝', feria: '🏢', otro: '📌',
};

// Emoji por categoría de ZONA DE OCIO (catálogo Wikidata).
export const zoneEmoji: Record<string, string> = {
  discoteca: '🪩', pub: '🍺', bar: '🍻', restaurante: '🍽️', cafeteria: '☕',
  cultural: '🎭', parque: '🌳', deportivo: '⚽', coworking: '💻',
};

// ─── Texto enriquecido: #hashtags y @menciones (mejora 22) ──────────────────
// Trocea un texto en fragmentos planos + hashtags/menciones para que la UI
// pinte cada uno con su propio estilo (y, en el caso de #hashtag, navegación).
// El parseo es puro (sin JSX) para poder vivir en un .ts; el render va en
// src/components/fomo.tsx (RichText), que sí es .tsx.
export type RichToken = { type: 'text' | 'hashtag' | 'mention'; value: string };

export function parseRichText(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  const re = /([#@][\p{L}\d_]{2,40})/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) });
    tokens.push({ type: m[1][0] === '#' ? 'hashtag' : 'mention', value: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

// ─── Cita de un comentario al responder (mejora 19) ─────────────────────────
// El backend (migración 129) tiene fomo_replies.parent_id, pero las RPCs de
// lectura/escritura del hilo (create_fomo_reply / get_fomo_thread) todavía no
// lo exponen: por eso la cita va incrustada como texto en el propio cuerpo,
// con un prefijo reconocible que luego se puede separar al pintar la respuesta.
// Así funciona YA con el backend actual, sin depender de que nadie amplíe la RPC.
const QUOTE_RE = /^↩ (.+?): "([\s\S]*?)"\n([\s\S]*)$/;

export function buildQuotedReply(quotedName: string, quotedBody: string, reply: string): string {
  const flat = quotedBody.replace(/\s+/g, ' ').trim();
  const snippet = flat.length > 100 ? `${flat.slice(0, 100)}…` : flat;
  return `↩ ${quotedName}: "${snippet}"\n${reply}`;
}

export function splitQuotedReply(body: string): { quoteAuthor: string; quoteText: string; text: string } | null {
  const m = QUOTE_RE.exec(body);
  if (!m) return null;
  return { quoteAuthor: m[1], quoteText: m[2], text: m[3] };
}
