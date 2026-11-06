// ─── Noticias editoriales (tabla news, migración 001) ────────────────────
// Mismas consultas que web/src/app/noticias: solo lo publicado, lo más
// reciente primero. La RLS ya limita a is_published = true para cualquiera
// que no sea admin, pero el filtro se repite para que la lista no dependa de
// con qué cuenta se mire.
//
// El cuerpo (content) lo escribe el admin en markdown sencillo, y en algún
// caso antiguo en HTML. Aquí se convierte a bloques planos (título, párrafo,
// elemento de lista) que la pantalla pinta con Text nativos: no hay motor de
// markdown en la app y no hace falta uno para lo que se publica.
import { supabase } from '@/lib/supabase';

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  category: string | null;
  created_at: string;
  is_featured: boolean | null;
};

export type NewsArticle = NewsItem & {
  content: string | null;
  tags: string[] | null;
  updated_at: string | null;
  author_name: string | null;
};

/** Etiquetas del CHECK de news.category (001). */
export const NEWS_CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  becas: 'Becas',
  universidades: 'Universidades',
  empleo: 'Empleo',
  eventos: 'Eventos',
  tecnologia: 'Tecnología',
  alojamiento: 'Alojamiento',
};

export function categoryLabel(cat: string | null | undefined): string | null {
  if (!cat) return null;
  return NEWS_CATEGORY_LABEL[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export async function listNews(): Promise<NewsItem[]> {
  const rows: NewsItem[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('news')
      .select('id, slug, title, excerpt, image_url, category, created_at, is_featured')
      .eq('is_published', true).order('created_at', { ascending: false }).order('id').range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as NewsItem[]);
    if (!data || data.length < 500) break;
  }
  return rows;
}

/** Texto seguro para un patrón ILIKE dentro de un filtro .or() de PostgREST. */
export const newsSearchTerm = (v: string) => v.replace(/[%_,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Una página del listado, con la categoría y la búsqueda resueltas en el
 * servidor: la pantalla ya no trae la tabla entera para filtrar en el móvil.
 */
export async function listNewsPage(opts: {
  offset: number;
  limit: number;
  category?: string | null;
  search?: string | null;
}): Promise<NewsItem[]> {
  let query = supabase.from('news')
    .select('id, slug, title, excerpt, image_url, category, created_at, is_featured')
    .eq('is_published', true);
  if (opts.category) query = query.eq('category', opts.category);
  const term = newsSearchTerm(opts.search ?? '');
  if (term) query = query.or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`);
  const { data, error } = await query
    .order('created_at', { ascending: false }).order('id')
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as NewsItem[];
}

export async function getNewsBySlug(slug: string): Promise<NewsArticle | null> {
  const { data, error } = await supabase
    .from('news')
    .select('id, slug, title, excerpt, image_url, category, created_at, updated_at, is_featured, content, tags, profiles(full_name)')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as Omit<NewsArticle, 'author_name'> & {
    profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  };
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt,
    image_url: row.image_url, category: row.category, created_at: row.created_at,
    updated_at: row.updated_at ?? null, is_featured: row.is_featured,
    content: row.content ?? null, tags: row.tags ?? null,
    author_name: prof?.full_name ?? null,
  };
}

/** Otras noticias recientes para el pie de la ficha (mismo criterio que la web). */
export async function listRelatedNews(excludeId: string, limit = 3): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('news')
    .select('id, slug, title, excerpt, image_url, category, created_at, is_featured')
    .eq('is_published', true)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as NewsItem[];
}

// ─── Cuerpo: markdown/HTML sencillo a bloques ─────────────────────────────

/** Trozo de texto en línea: normal o en negrita. */
export type InlineRun = { text: string; bold: boolean };

export type ContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'list'; ordered: boolean; items: InlineRun[][] };

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í',
  '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ', '&Aacute;': 'Á', '&Eacute;': 'É',
  '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&Ntilde;': 'Ñ', '&iquest;': '¿', '&iexcl;': '¡',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-zA-Z]+;|&#\d+;/g, (m) => ENTITIES[m] ?? m);
}

/** ¿Parece HTML? Basta con una etiqueta de bloque o de formato conocida. */
function looksLikeHtml(s: string): boolean {
  return /<\s*(p|br|h[1-6]|ul|ol|li|div|strong|b|em|a|span)\b[^>]*>/i.test(s);
}

/**
 * Pasa HTML a un markdown mínimo (títulos, listas, negritas y saltos) y deja
 * que el parser de markdown haga el resto. Todo lo que no se reconoce se
 * quita: nunca se pinta una etiqueta en pantalla.
 */
function htmlToMarkdown(html: string): string {
  let s = html.replace(/\r\n?/g, '\n');
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*h([1-6])[^>]*>/gi, (_, n: string) => `\n\n${'#'.repeat(Math.min(3, Number(n)))} `);
  s = s.replace(/<\s*\/\s*h[1-6]\s*>/gi, '\n\n');
  s = s.replace(/<\s*(strong|b)\b[^>]*>/gi, '**').replace(/<\s*\/\s*(strong|b)\s*>/gi, '**');
  s = s.replace(/<\s*li\b[^>]*>/gi, '\n- ').replace(/<\s*\/\s*li\s*>/gi, '');
  s = s.replace(/<\s*\/?\s*(ul|ol)\b[^>]*>/gi, '\n\n');
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\s*\/\s*(p|div)\s*>/gi, '\n\n').replace(/<\s*(p|div)\b[^>]*>/gi, '');
  s = s.replace(/<[^>]+>/g, '');
  return decodeEntities(s);
}

/** Negritas (**x** o __x__), enlaces [texto](url) y código `x` en línea. */
export function parseInline(text: string): InlineRun[] {
  let s = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
  s = s.replace(/__(.+?)__/g, '**$1**');
  const runs: InlineRun[] = [];
  const parts = s.split('**');
  parts.forEach((part, i) => {
    if (!part) return;
    // Sin cierre: el último trozo impar se pinta normal, no en negrita.
    const bold = i % 2 === 1 && i < parts.length - 1;
    const clean = part.replace(/(^|\s)[*_](\S[^*_]*?\S|\S)[*_](?=\s|$|[.,;:!?)])/g, '$1$2');
    runs.push({ text: clean, bold });
  });
  return runs.length ? runs : [{ text: '', bold: false }];
}

export function parseContent(raw: string | null | undefined): ContentBlock[] {
  if (!raw) return [];
  const md = looksLikeHtml(raw) ? htmlToMarkdown(raw) : raw.replace(/\r\n?/g, '\n');
  const lines = md.split('\n');
  const blocks: ContentBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', runs: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    }
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushPara(); flushList(); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = Math.min(3, h[1].length) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, runs: parseInline(h[2].replace(/\s#+$/, '')) });
      continue;
    }

    const ul = /^[-*+•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]);
      continue;
    }

    // Separadores y citas: se pintan como texto normal sin el adorno.
    if (/^([-*_]\s*){3,}$/.test(line)) { flushPara(); flushList(); continue; }
    const quoted = line.replace(/^>\s?/, '');

    // Una línea suelta después de una lista sigue perteneciendo al último ítem
    // solo si va indentada; si no, empieza un párrafo nuevo.
    if (list && /^\s{2,}/.test(rawLine)) { list.items[list.items.length - 1] += ` ${quoted}`; continue; }
    flushList();
    para.push(quoted);
  }
  flushPara(); flushList();
  return blocks;
}
