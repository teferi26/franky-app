"use client";

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Bell, Newspaper, Search } from 'lucide-react';
import { foldSearch } from '@/lib/discovery-filters';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { SpotlightCard } from '@/components/motion';

export type NewsSummary = { id: string; slug: string; title: string; excerpt: string | null; image_url: string | null; category: string | null; created_at: string; is_featured: boolean | null };
const labels: Record<string, string> = { general: 'Franky y actualidad', becas: 'Becas', universidades: 'Universidades', empleo: 'Empleo', eventos: 'Eventos', tecnologia: 'Tecnología', alojamiento: 'Alojamiento' };
const date = (value: string) => new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

/* Portada del artículo: foto en marco con zoom suave, o un vacío neutro con
   el icono suelto si no hay imagen. */
function Cover({ item, large = false }: { item: NewsSummary; large?: boolean }) {
  return <div className={`img-zoom relative overflow-hidden bg-bg-secondary ${large ? 'min-h-64 h-full' : 'aspect-[16/10]'}`}>
    {item.image_url ? <Image src={item.image_url} alt="" fill sizes={large ? '(max-width: 768px) 100vw, 55vw' : '(max-width: 768px) 100vw, 33vw'} className="object-cover" priority={large} />
      : <div className="absolute inset-0 flex items-center justify-center"><Newspaper className="h-10 w-10 text-text-muted/50" aria-hidden="true" /></div>}
  </div>;
}

/* Metadatos de una noticia: fecha y tema en una sola línea gris. */
function Meta({ item }: { item: NewsSummary }) {
  return <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
    <time dateTime={item.created_at}>{date(item.created_at)}</time>
    {item.category && <><span aria-hidden="true">·</span><span className="font-medium text-text-secondary">{labels[item.category] || item.category}</span></>}
    {item.is_featured && <><span aria-hidden="true">·</span><span className="font-semibold text-violet">Destacado</span></>}
  </p>;
}

export default function NewsExplorer({ items }: { items: NewsSummary[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [visible, setVisible] = useState(12);
  const categories = useMemo(() => [...new Set(items.map(n => n.category || 'general'))], [items]);
  const filtered = useMemo(() => items.filter(n => (!category || (n.category || 'general') === category) && (!query || foldSearch(`${n.title} ${n.excerpt || ''}`).includes(foldSearch(query)))), [items, category, query]);
  // Revista: sin búsqueda ni tema, la primera noticia abre a lo grande y el
  // resto va en rejilla. Filtrando, todo va en rejilla.
  const filtering = Boolean(query || category);
  const featured = !filtering ? filtered[0] : undefined;
  const rest = featured ? filtered.slice(1) : filtered;
  return <div className="space-y-10">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
      <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1" aria-label="Temas de novedades">{['', ...categories].map(c => <button key={c} aria-pressed={category === c} onClick={() => { setCategory(c); setVisible(12); }} className={`min-h-10 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${category === c ? 'border-text-primary bg-text-primary text-bg-primary' : 'border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary'}`}>{c ? labels[c] || c : 'Todo'}</button>)}</div>
      <label className="relative shrink-0"><span className="sr-only">Buscar en novedades</span><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" /><Input value={query} onChange={e => { setQuery(e.target.value); setVisible(12); }} maxLength={120} placeholder="Encuentra una novedad" className="w-full pl-10 lg:w-72" /></label>
    </div>

    <div className="flex items-end justify-between gap-4 border-b border-border-light pb-4">
      <div>
        <p className="eyebrow">{filtering ? 'Resultados' : 'Portada'}</p>
        <h2 className="mt-1 font-heading text-2xl font-bold tracking-tight text-text-primary">{filtering ? 'Lo que estabas buscando' : 'Para estar al día'}</h2>
      </div>
      <p role="status" className="text-sm text-text-muted tabular">{filtered.length} {filtered.length === 1 ? 'novedad' : 'novedades'}</p>
    </div>

    {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center"><Newspaper className="mx-auto mb-4 h-8 w-8 text-text-muted" aria-hidden="true" /><h3 className="font-heading text-xl font-bold text-text-primary">{items.length ? 'No encontramos ese tema' : 'La próxima novedad aparecerá aquí'}</h3><p className="mt-2 text-text-secondary">{items.length ? 'Prueba otra búsqueda o vuelve a todos los temas.' : 'Mientras tanto, puedes explorar las becas y los planes de tu universidad.'}</p>{items.length ? <Button variant="outline" onClick={() => { setQuery(''); setCategory(''); }} className="mt-5">Ver todas</Button> : <Link href="/becas" className={buttonVariants({ variant: 'outline', className: 'mt-5' })}>Explorar becas</Link>}</div>}

    {featured && (
      <SpotlightCard asChild>
        <Link href={`/noticias/${featured.slug}`} className="group hover-lift grid overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15 md:grid-cols-[1.15fr_1fr]">
          <Cover item={featured} large />
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
            <Meta item={featured} />
            <h3 className="mt-3 font-heading text-2xl font-extrabold leading-tight tracking-tight text-text-primary sm:text-3xl lg:text-[2rem]">{featured.title}</h3>
            {featured.excerpt && <p className="mt-4 line-clamp-4 text-[15px] leading-relaxed text-text-secondary">{featured.excerpt}</p>}
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">Leer la noticia <ArrowRight className="arrow-nudge h-4 w-4 text-violet" aria-hidden="true" /></span>
          </div>
        </Link>
      </SpotlightCard>
    )}

    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {rest.slice(0, visible).map((article, i) => (
        <div key={article.id} className="animate-list-in" style={{ ['--i' as string]: i % 12 } as CSSProperties}>
          <SpotlightCard asChild>
            <Link
              href={`/noticias/${article.slug}`}
              className="group hover-lift flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
            >
              <Cover item={article} />
              <div className="flex flex-1 flex-col p-5">
                <Meta item={article} />
                <h3 className="mt-2 line-clamp-2 font-heading text-lg font-bold leading-snug text-text-primary">
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                    {article.excerpt}
                  </p>
                )}
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-text-muted transition-colors group-hover:text-text-primary">
                  Leer más <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </Link>
          </SpotlightCard>
        </div>
      ))}
    </div>
    {rest.length > visible && <Button variant="outline" size="lg" onClick={() => setVisible(n => n + 12)} className="mx-auto flex">Ver más novedades</Button>}

    <aside className="flex items-start gap-4 rounded-2xl border border-border bg-bg-secondary/60 p-6"><Bell className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" /><div><h2 className="font-heading font-bold text-text-primary">Las novedades, también en tus avisos</h2><p className="mt-1 text-sm text-text-secondary">Las nuevas publicaciones llegan a tu cuenta de Franky. Tú decides qué avisos recibes en el móvil.</p><Link href="/perfil/notificaciones" className="link-underline mt-3 inline-block text-sm font-semibold text-text-primary">Gestionar notificaciones</Link></div></aside>
  </div>;
}
