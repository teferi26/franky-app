"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, MessageCircle, Heart, Home, Newspaper, ArrowUpRight, RefreshCw, Settings2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationInbox } from '@/hooks/useNotificationInbox';
import { notificationWebDestination } from '@/lib/notification-links';
import { openInboxNotification, type InboxNotification } from '@/lib/notification-inbox';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

function iconFor(type: string | null) {
  if (type === 'message' || type === 'comment') return MessageCircle;
  if (type === 'match' || type === 'roomie_like') return Heart;
  if (type === 'accommodation') return Home;
  if (type === 'news') return Newspaper;
  return Bell;
}

// Etiqueta del grupo: "Hoy", "Ayer" o la fecha con día de la semana.
function dayLabel(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const mismo = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismo(d, hoy)) return 'Hoy';
  if (mismo(d, ayer)) return 'Ayer';
  const s = dia.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupByDay(items: InboxNotification[]) {
  const groups: { label: string; rows: InboxNotification[] }[] = [];
  for (const row of items) {
    const label = dayLabel(row.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

export default function NotificationsClient() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main role="status" aria-label="Cargando tus avisos" className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-10 w-64" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <p className="eyebrow">Notificaciones</p>
        <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold text-text-primary">Tus avisos, aquí</h1>
        <Link href="/login?next=%2Fnotificaciones" className={cn(buttonVariants({ variant: 'dark', size: 'lg' }), 'mt-8')}>
          Iniciar sesión
        </Link>
      </main>
    );
  }
  return <OwnedInbox key={user.id} owner={user.id} />;
}

function OwnedInbox({ owner }: { owner: string }) {
  const { items, loading, loadingMore, hasMore, error, moreError, readError, marking, inbox, isCurrent } = useNotificationInbox(owner);
  const router = useRouter();
  const unread = items.filter(row => !row.is_read);
  const open = async (row: InboxNotification) => {
    await openInboxNotification(row, { isCurrent, markRead: inbox.markRead, destination: notificationWebDestination(row.data, row.type), navigate: path => router.push(path) });
  };
  const groups = groupByDay(items);
  let index = 0;

  return (
    <main className="animate-page-in mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      {/* Cabecera editorial */}
      <header className="border-b border-border-light pb-8">
        <p className="eyebrow">Tu campus, al día</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-fluid-h1 font-extrabold text-text-primary">Notificaciones</h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Conversaciones, conexiones, novedades y pisos. Abre un aviso para seguir justo donde toca.
            </p>
          </div>
          <Link href="/perfil/notificaciones" className={buttonVariants({ variant: 'outline' })}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Personalizar avisos
          </Link>
        </div>
        <nav aria-label="Accesos desde tus avisos" className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {[['/noticias', 'Novedades'], ['/alojamiento', 'Pisos'], ['/roomie-match?tab=connections#roomie-likes', 'Roomie'], ['/chats', 'Conversaciones']].map(([href, label]) => (
            <Link key={href} href={href} className="group inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary">
              <span className="link-underline">{label}</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </header>

      {/* Acciones de la bandeja */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-sm text-text-muted">
          {unread.length > 0 ? `${unread.length} sin leer` : 'Todo leído'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={loading || loadingMore} onClick={() => void inbox.refresh()}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            Actualizar
          </Button>
          {unread.length > 0 && (
            <Button variant="outline" size="sm" disabled={marking.length > 0} onClick={() => void inbox.markRead(unread.map(row => row.id))}>
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              {marking.length ? 'Guardando…' : `Leer visibles (${unread.length})`}
            </Button>
          )}
        </div>
      </div>

      {(error || moreError || readError) && (
        <div role="alert" className="mt-4 rounded-2xl border border-warning/20 bg-amber-50 p-4 text-sm font-medium text-amber-800 animate-fade-in dark:bg-amber-950/30 dark:text-amber-300">
          <p>
            {readError
              ? 'No hemos podido guardar el estado de lectura. Vuelve a intentarlo.'
              : moreError
                ? 'No se han cargado los avisos anteriores. Los que ya tenías siguen aquí.'
                : 'No hemos podido actualizar la bandeja. Lo que ves es lo último que cargamos.'}
          </p>
          {error && (
            <button onClick={() => void inbox.refresh()} className="link-underline mt-2 font-semibold text-amber-900">
              Reintentar
            </button>
          )}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div role="status" aria-label="Cargando tus avisos" className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="mt-8 rounded-3xl border border-border bg-bg-secondary/60">
          <EmptyState
            icon={Bell}
            title="Cuando pase algo para ti, estará aquí."
            description="Los nuevos mensajes, conexiones y avisos que tengas activados se guardarán en esta bandeja."
            action={{ href: '/', label: 'Volver a mi campus' }}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="eyebrow">{group.label}</h2>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {group.rows.map((row) => {
                  const i = index++;
                  const Icon = iconFor(row.type);
                  const link = notificationWebDestination(row.data, row.type);
                  const clickable = !!link || !row.is_read;
                  const content = (
                    <>
                      {/* Punto violeta: solo en los avisos sin leer. */}
                      <span className="flex w-3 shrink-0 justify-center pt-2" aria-hidden="true">
                        {!row.is_read && <span className="h-2 w-2 rounded-full bg-violet" />}
                      </span>
                      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', row.is_read ? 'text-text-muted' : 'text-violet')} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[15px] leading-snug', row.is_read ? 'font-medium text-text-secondary' : 'font-semibold text-text-primary')}>
                          {row.title}
                          {!row.is_read && <span className="sr-only"> (sin leer)</span>}
                        </span>
                        {row.body && <span className="mt-1 block text-sm leading-relaxed text-text-muted">{row.body}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 pt-0.5">
                        <time dateTime={row.created_at} className="tabular text-xs text-text-muted">{hora.format(new Date(row.created_at))}</time>
                        {link && <ArrowUpRight className="h-4 w-4 text-text-muted transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true" />}
                      </span>
                    </>
                  );
                  return (
                    <li key={row.id} className="animate-list-in" style={{ '--i': i } as React.CSSProperties}>
                      {clickable ? (
                        <button
                          onClick={() => open(row)}
                          disabled={marking.length > 0}
                          className="group -mx-3 flex w-[calc(100%+1.5rem)] items-start gap-3 rounded-xl px-3 py-4 text-left transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30 disabled:opacity-60"
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-start gap-3 py-4">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <Button variant="outline" size="lg" disabled={loading || loadingMore} loading={loadingMore} onClick={() => void inbox.loadMore()} className="mt-8 w-full">
          {loadingMore ? 'Cargando anteriores…' : 'Ver avisos anteriores'}
        </Button>
      )}
      {items.length > 0 && (
        <p className="tabular mt-4 text-center text-xs text-text-muted">
          {items.length} avisos cargados. «Leer visibles» solo marca los que aparecen en esta lista.
        </p>
      )}
    </main>
  );
}
