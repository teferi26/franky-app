import Link from 'next/link';
import type { Metadata } from 'next';
import { Home, Search, ArrowRight, Flame, CalendarDays } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// 404 global. Es un Server Component a propósito (antes llevaba "use client"
// sin necesitarlo): así no envía JavaScript para una página que solo tiene
// dos enlaces.
//
// Diseño v3: el "404" es tipografía pura (Outfit enorme, tracking negativo,
// violeta como único acento) sobre la retícula fina del sistema; ya no lleva
// texto en degradado ni ilustración. Entra en cascada con CSS puro.
export const metadata: Metadata = {
  // Sin `robots`: Next ya añade noindex a la respuesta 404.
  title: 'Página no encontrada',
};

export default function NotFound() {
  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
      <p className="eyebrow relative animate-slide-up">Error 404</p>
      <p
        className="relative mt-2 font-heading text-[clamp(5rem,4rem+8vw,10rem)] font-extrabold leading-none tracking-[-0.06em] text-violet animate-slide-up [animation-delay:60ms] tabular"
        aria-hidden="true"
      >
        404
      </p>
      <h1 className="relative mt-4 text-fluid-h2 font-extrabold text-text-primary animate-slide-up [animation-delay:120ms]">
        Página no encontrada
      </h1>
      <p className="relative mt-3 max-w-md text-text-muted animate-slide-up [animation-delay:180ms]">
        Puede que el enlace esté mal escrito o que la hayamos movido. Lo que buscas
        seguramente está a un clic.
      </p>
      <div className="relative mt-8 flex flex-col gap-3 sm:flex-row animate-slide-up [animation-delay:240ms]">
        <Link href="/" className={cn(buttonVariants({ variant: 'dark', size: 'lg' }), 'btn-shine group')}>
          <Home className="h-4 w-4" aria-hidden="true" />
          Volver al inicio
          <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
        </Link>
        <Link href="/universidades" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          <Search className="h-4 w-4 text-violet" aria-hidden="true" />
          Explorar universidades
        </Link>
      </div>
      <nav aria-label="Otras secciones" className="relative mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm animate-slide-up [animation-delay:300ms]">
        <Link href="/fomo" className="link-underline inline-flex items-center gap-1.5 font-semibold text-text-primary">
          <Flame className="h-4 w-4 text-violet" aria-hidden="true" />
          FOMO de tu campus
        </Link>
        <Link href="/eventos" className="link-underline inline-flex items-center gap-1.5 font-semibold text-text-primary">
          <CalendarDays className="h-4 w-4 text-violet" aria-hidden="true" />
          Próximos eventos
        </Link>
      </nav>
    </div>
  );
}
