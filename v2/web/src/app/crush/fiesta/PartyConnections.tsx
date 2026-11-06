"use client";
import { SocialInstagramLink } from "@/components/SocialDemoNotice";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Heart, Instagram, Loader2, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import type { PartyAccount } from './usePartyAccount';

// Same mechanics as the Crush tabs on /crush (LigarRequests, LigarMatches): the
// canonical RPCs decide reciprocity, blocks and quarantine. This only renders them
// inside the party page so nobody has to leave the QR flow to accept a request.
type IncomingRequest = { id: string; full_name: string | null; avatar_url: string | null; age: number | null; requested_at: string };
type Match = { id: string; full_name: string | null; avatar_url: string | null; age: number | null; instagram_handle: string | null; matched_at: string };
type Tab = 'requests' | 'matches';
const HANDLE = /^[a-zA-Z0-9._]{1,30}$/;

export default function PartyConnections({ account }: { account: PartyAccount }) {
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<IncomingRequest[] | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string | null>>({});
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!account.isCurrent()) return;
    setError('');
    let incoming: { data: unknown; error: unknown }, mutual: { data: unknown; error: unknown };
    try {
      const client = createClient();
      [incoming, mutual] = await Promise.all([
        client.rpc('get_ig_incoming_requests', { p_limit: 100 }).abortSignal(signal ?? new AbortController().signal),
        client.rpc('get_ig_matches').abortSignal(signal ?? new AbortController().signal),
      ]);
    } catch { incoming = mutual = { data: null, error: true }; }
    if (signal?.aborted || !account.isCurrent()) return;
    if (incoming.error || mutual.error) { setError('No se han podido cargar tus solicitudes. Vuelve a intentarlo.'); setRequests(current => current ?? []); setMatches(current => current ?? []); return; }
    setRequests((incoming.data as IncomingRequest[]) ?? []);
    setMatches((mutual.data as Match[]) ?? []);
  }, [account]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const refresh = () => { if (!document.hidden) void load(controller.signal); };
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh); window.addEventListener('franky-party-posted', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('franky-party-posted', refresh); };
  }, [load]);
  async function accept(request: IncomingRequest) {
    if (lock.current || !account.isCurrent()) return;
    lock.current = true; setBusyId(request.id); setError('');
    try {
      const { data, error } = await createClient().rpc('request_ig', { p_target: request.id });
      if (!account.isCurrent()) return;
      if (error || !data) throw new Error('No se pudo aceptar la solicitud. Inténtalo de nuevo.');
      const result = data as { matched: boolean; instagram_handle: string | null };
      const handle = result.matched && typeof result.instagram_handle === 'string' && HANDLE.test(result.instagram_handle) ? result.instagram_handle : null;
      setRevealed(current => ({ ...current, [request.id]: handle }));
      window.dispatchEvent(new Event('franky-party-posted'));
    } catch (error) { if (account.isCurrent()) setError(error instanceof Error ? error.message : 'No se pudo aceptar la solicitud.'); }
    finally { lock.current = false; if (account.isCurrent()) setBusyId(null); }
  }
  const pending = (requests ?? []).filter(request => !(request.id in revealed));
  const loading = requests === null || matches === null;
  return <section className="party-connections" aria-label="Solicitudes y matches">
    <div className="party-connections-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}><Instagram /> Solicitudes{pending.length > 0 && <span className="party-connections-badge">{pending.length}</span>}</button>
      <button type="button" role="tab" aria-selected={tab === 'matches'} onClick={() => setTab('matches')}><Heart /> Matches{(matches?.length ?? 0) > 0 && <span className="party-connections-badge">{matches?.length}</span>}</button>
    </div>
    {error && <p className="party-entry-error" role="alert">{error} <button type="button" onClick={() => void load()}>Reintentar</button></p>}
    {loading ? <p className="party-entry-small" role="status"><Loader2 className="party-spin" /> Cargando…</p>
    : tab === 'requests' ? <div className="party-connections-list">
      {!requests?.length ? <p className="party-connections-empty"><Sparkles /> Cuando alguien te pida el Instagram aparecerá aquí. Acepta y hacéis match.</p>
      : requests.map(request => { const done = request.id in revealed; const handle = revealed[request.id]; return <article key={request.id} className="party-connection">
        <Avatar url={request.avatar_url} name={request.full_name} />
        <div className="party-connection-body"><strong>{request.full_name || 'Alguien de la fiesta'}{request.age != null && <span> · {request.age}</span>}</strong><span>{done ? (handle ? '¡Match! Ya podéis veros.' : 'Solicitud enviada. Se mostrará si ambos seguís participando.') : 'Quiere intercambiar Instagram contigo'}</span></div>
        {done ? (handle ? <InstagramLink handle={handle} /> : <span className="party-connection-ok"><Check /> Aceptada</span>)
          : <button type="button" className="party-connection-accept" disabled={busyId !== null} onClick={() => void accept(request)}>{busyId === request.id ? <Loader2 className="party-spin" /> : <Check />} Aceptar</button>}
      </article>; })}
    </div>
    : <div className="party-connections-list">
      {!matches?.length ? <p className="party-connections-empty"><Heart /> Todavía no tienes matches de esta noche. Pide un Instagram desde el muro o acepta una solicitud.</p>
      : matches.map(match => <article key={match.id} className="party-connection">
        <Avatar url={match.avatar_url} name={match.full_name} />
        <div className="party-connection-body"><strong>{match.full_name || 'Alguien de la fiesta'}{match.age != null && <span> · {match.age}</span>}</strong><span>Match mutuo</span></div>
        {match.instagram_handle && HANDLE.test(match.instagram_handle) ? <InstagramLink handle={match.instagram_handle} /> : <span className="party-connection-ok">Sin Instagram visible</span>}
      </article>)}
    </div>}
    <a className="party-entry-secondary" href="/crush?tab=matches">Ver todo en Crush <ArrowUpRight /></a>
  </section>;
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="party-connection-avatar" src={url} alt={name ?? ''} /> : <span className="party-connection-avatar party-connection-avatar--empty"><Heart /></span>;
}

function InstagramLink({ handle }: { handle: string }) {
  return <SocialInstagramLink className="party-shared-ig" href={`https://www.instagram.com/${encodeURIComponent(handle)}/`} target="_blank" rel="noopener noreferrer"><Instagram /><span>@{handle}</span><ArrowUpRight /></SocialInstagramLink>;
}
