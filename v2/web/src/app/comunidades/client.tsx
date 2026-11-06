"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import CityContentLink from "@/components/CityContentLink";
import Image from "next/image";
import { Loader2, Users, Plus, Hash } from "lucide-react";
import { communityRpc, communityAdmissionError, type CommunityInvitation } from '@/lib/community-admission-client';
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';
import { useSession } from "@/components/SessionProvider";
import { buttonVariants } from "@/components/ui/button";
import { SpotlightCard } from "@/components/motion";

/**
 * Comunidades (migración 138). Portado de la app móvil. Grupos temáticos
 * dentro de una universidad; el listado y la pertenencia los resuelve la RPC
 * get_communities con la sesión del usuario.
 */
type CommunitySummary = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  image_url: string | null;
  is_private: boolean;
  member_count: number;
  is_member: boolean;
};

const KINDS = [
  { value: "", label: "Todas" },
  { value: "estudio", label: "Estudio" },
  { value: "aficion", label: "Afición" },
  { value: "carrera", label: "Carrera" },
  { value: "residencia", label: "Residencia" },
];

const PAGE_SIZE = 30;

function ComunidadesClient() {
  const { user, loading: sessionLoading } = useSession();
  const { owner, isCurrent } = useAccountGuard();
  const [items, setItems] = useState<CommunitySummary[] | null>(null);
  const [kind, setKind] = useState("");
  const [invitations, setInvitations] = useState<CommunityInvitation[]>([]);
  const [error, setError] = useState(''); const [inviteError, setInviteError] = useState('');
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current; setError(''); setInviteError('');
    const [listing, pending] = await Promise.allSettled([communityRpc<CommunitySummary[]>("get_communities", {
      p_kind: kind || null,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    }, owner, isCurrent), communityRpc<CommunityInvitation[]>('list_my_community_invitations', {}, owner, isCurrent)]);
    if (!isCurrent() || sequence.current !== request) return;
    if (listing.status === 'fulfilled') setItems((listing.value ?? []).map(row => ({ ...row, member_count: Number(row.member_count) || 0 })));
    else { setError(communityAdmissionError(listing.reason)); setItems([]); }
    if (pending.status === 'fulfilled') setInvitations(pending.value ?? []);
    else setInviteError('No se han podido consultar tus invitaciones.');
  }, [kind, owner, isCurrent]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    setItems(null);
    load();
  }, [kind, user, sessionLoading, load]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-heading text-xl font-extrabold">Entra para ver las comunidades</h2>
        <Link href="/login?next=%2Fcomunidades" className={buttonVariants({ variant: "dark", size: "lg", className: "mt-5" })}>
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-border p-4">{error} <button className="underline" onClick={() => void load()}>Reintentar</button></p>}
      {inviteError && <p role="alert" className="mb-4 rounded-xl border border-border p-4">{inviteError} <button className="underline" onClick={() => void load()}>Reintentar</button></p>}
      {invitations.length > 0 && <section aria-label="Tus invitaciones" className="mb-6 space-y-3"><h2 className="font-heading text-lg font-bold">Tus invitaciones</h2>{invitations.map(invitation => <Link key={invitation.id} href={`/comunidades/${invitation.community_id}`} className="block rounded-xl border border-violet/20 bg-violet/5 p-4"><span className="font-semibold">{invitation.name}</span><p className="mt-1 text-sm text-text-secondary">Abre la comunidad para aceptar o declinar. Disponible hasta el {new Date(invitation.expires_at).toLocaleDateString('es-ES')}.</p></Link>)}</section>}
      <CityContentLink/><div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            aria-pressed={kind === k.value}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              kind === k.value
                ? "border-text-primary bg-text-primary text-bg-primary"
                : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : items.length === 0 && !error ? (
        /* Vacío del sistema con CTA a crear: sin comunidades no hay nada que
           explorar, así que la única acción útil es fundar la primera. */
        <EmptyState
          icon={Users}
          title="Aún no hay comunidades"
          description="Crea la primera de tu universidad: un grupo de tu carrera, de tu deporte o de lo que te dé la gana."
          action={{ href: "/comunidades/crear", label: "Crear una comunidad" }}
        />
      ) : (
        /* Rejilla (v3): tarjeta con la foto en marco si la hay y, si no,
           solo tipografía; el foco de luz sigue al cursor. */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c, i) => (
            <div key={c.id} className="animate-list-in" style={{ ["--i" as string]: i % PAGE_SIZE } as CSSProperties}>
            <SpotlightCard asChild>
            <Link
              href={`/comunidades/${c.id}`}
              className="group hover-lift flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
            >
              {c.image_url && (
                <div className="img-zoom relative aspect-[16/7] bg-bg-secondary">
                  <Image src={c.image_url} alt="" fill className="object-cover" sizes="33vw" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start gap-2">
                  <Hash className="mt-1 h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                  <h3 className="line-clamp-2 font-heading text-lg font-bold leading-snug text-text-primary">{c.name}</h3>
                </div>
                {c.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{c.description}</p>
                )}
                <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-text-muted tabular">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {c.member_count}
                  </span>
                  {c.is_private && <span>Privada</span>}
                  {c.is_member && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-deep">
                      Miembro
                    </span>
                  )}
                </div>
              </div>
            </Link>
            </SpotlightCard>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/comunidades/crear"
        // Se levanta por encima de la barra de pestañas móvil (ver globals.css).
        style={{ bottom: "calc(1.5rem + var(--tabbar-offset, 0px))" }}
        className="fixed right-6 z-40 inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-3.5 text-sm font-semibold text-bg-primary shadow-float transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2"
      >
        <Plus className="h-5 w-5" />
        <span className="hidden sm:inline">Crear comunidad</span>
      </Link>
    </div>
  );
}
export default withAccountScope(ComunidadesClient);
