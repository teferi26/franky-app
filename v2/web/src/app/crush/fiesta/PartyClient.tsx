"use client";
import { ensureCommunityTerms } from '@/lib/community-terms-client';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, Heart, Instagram, Loader2, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { ALICANTE_UNIVERSITY_ID, partyPath } from '@/lib/crush-party-route';
import { isInAppBrowser, openInExternalBrowser } from '@/lib/in-app-browser';
import { usePartyAccount, type PartyAccount } from './usePartyAccount';
import { usePartyFeed } from './usePartyFeed';
import PartyConnections from './PartyConnections';
import { normaliseInstagram, validInstagram, type OwnPartyPost, type PartyPost, type PartyState, type PartyUniversity } from './model';
import './party-entry.css';

const prompts = ['Nos cruzamos bailando y…', 'Si estás leyendo esto…', 'Mi próxima canción contigo sería…'];
const message = (error: unknown) => error instanceof Error ? error.message : 'No se ha completado. Inténtalo de nuevo.';
// The party has its own root chrome. Full document navigation also restores
// the normal app layout when leaving it (Next root layouts persist on client navigation).
function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }

export default function PartyClient({ slug, universities }: { slug: string; universities: PartyUniversity[] }) {
  const account = usePartyAccount();
  const [snapshot, setSnapshot] = useState<{ key: string; state: PartyState } | null>(null);
  const snapshotKey = `${slug}:${account.key}`;
  const receiveState = useCallback((state: PartyState) => setSnapshot({ key: snapshotKey, state }), [snapshotKey]);
  const personal = snapshot?.key === snapshotKey ? snapshot.state : null;
  return <div className="party-entry">
    <header className={`party-entry-hero ${account.userId ? 'party-entry-hero--compact' : ''}`}><div className="party-entry-eyebrow"><span className="party-entry-dot" /> FRANKY EVENT · ALICANTE</div><h1>{account.userId ? <>Crush de <em>la fiesta.</em></> : <>La mirada fue casual.<br /><em>El hola lo pones tú.</em></>}</h1><p>{account.userId ? 'Tus mensajes, en el Crush de la Universidad de Alicante y en las pantallas.' : 'El Crush de la fiesta. Escribe aquí y tu mensaje aparecerá en las pantallas y en el muro de la Universidad de Alicante.'}</p><div className="party-entry-chips"><span><Heart /> Crush de Alicante</span><span>Viernes 11 de septiembre</span></div></header>
    <div className="party-entry-layout">
      <section className="party-entry-compose" aria-label="Participar en Crush">
        {!account.ready ? <div className="party-entry-card party-entry-loading" role="status"><Loader2 /> Preparando tu entrada…</div>
          : account.userId ? <Participant key={snapshotKey} slug={slug} account={account} universities={universities} onState={receiveState} />
          : <Guest slug={slug} />}
      </section>
      <PartyWall slug={slug} account={account} personal={personal} />
    </div>
  </div>;
}

function Guest({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('error')) setError('No se ha completado el acceso con Google. Puedes volver a intentarlo.'); }, []);
  async function login() {
    if (lock.current) return;
    // Links shared through Instagram/TikTok open in their in-app browser, where
    // Google OAuth is blocked (403 disallowed_useragent). Jump to the real browser
    // first; if the app blocks the jump, show the manual exit and the email path.
    if (isInAppBrowser()) {
      setError('');
      openInExternalBrowser(undefined, () => { if (alive.current) setError('¿No se ha abierto tu navegador? Toca el menú ⋯ de arriba y elige «Abrir en el navegador», o entra con tu email desde el enlace de abajo.'); });
      return;
    }
    lock.current = true; setBusy(true); setError('');
    try {
      const next = partyPath(slug);
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error } = await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
      if (!alive.current) return;
      if (error || !data.url) throw new Error('No se ha podido abrir Google. Inténtalo de nuevo o entra con tu email.');
      window.location.assign(data.url);
    } catch (error) { if (alive.current) setError(message(error)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <div className="party-entry-card"><span className="party-entry-step">01 / ENTRA EN LA FIESTA</span><h2>Tu primer hola<br />empieza aquí.</h2><p>Entra con Google, confirma tus datos básicos y ya puedes escribir. Sin descargar nada.</p><button className="party-entry-primary party-google" disabled={busy} onClick={login}>{busy ? <Loader2 className="party-spin" /> : <GoogleMark />}{busy ? 'Abriendo Google…' : 'Continuar con Google'}<ArrowUpRight /></button><Link className="party-entry-secondary" href={`/login?next=${encodeURIComponent(partyPath(slug))}`}>Prefiero entrar con mi email</Link>{error && <p className="party-entry-error" role="alert">{error}</p>}<div className="party-entry-note"><ShieldCheck /><p>Tu Instagram no se publica al registrarte. Tú decides si lo compartes en un mensaje o mediante una solicitud mutua.</p></div><a className="party-entry-scroll" href="#muro-fiesta">Mira qué está pasando <ArrowDown /></a></div>;
}

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}

function Participant({ slug, account, universities, onState }: { slug: string; account: PartyAccount; universities: PartyUniversity[]; onState: (state: PartyState) => void }) {
  const { request, isCurrent } = account;
  const [state, setState] = useState<PartyState | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const base = `/api/crush/fiesta/${encodeURIComponent(slug)}`;
  const revision = useRef(0);
  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    const current = ++revision.current;
    if (!background) setLoading(true); setError('');
    try { const result = await request<PartyState>(`${base}/state`, undefined, signal); if (current === revision.current && isCurrent() && !signal?.aborted) { setState(result); onState(result); return true; } return false; }
    catch (error) { if (current === revision.current && isCurrent() && !signal?.aborted) setError(message(error)); return false; }
    finally { if (current === revision.current && isCurrent() && !signal?.aborted) setLoading(false); }
  }, [request, isCurrent, base, onState]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { const controller = new AbortController(); const refresh = () => { void load(controller.signal, true); }; window.addEventListener('franky-party-posted', refresh); return () => { controller.abort(); window.removeEventListener('franky-party-posted', refresh); }; }, [load]);
  if (loading) return <div className="party-entry-card party-entry-loading" role="status"><Loader2 className="party-spin" /> Recuperando tus datos…</div>;
  if (!state) return <div className="party-entry-card"><p role="alert" className="party-entry-error">{error || 'No se han podido cargar tus datos.'}</p><button className="party-entry-primary" onClick={() => void load()}>Reintentar</button></div>;
  let content: React.ReactNode;
  if (!state.party.active || new Date(state.party.ends_at).getTime() <= Date.now()) content = <div className="party-entry-card"><Heart /><h2>El envío está cerrado.</h2><p>Puedes seguir conociendo gente en Crush y retirar tus mensajes de esta fiesta aquí.</p><Link className="party-entry-primary" href="/crush">Ir a Crush <ArrowUpRight /></Link></div>;
  else if (state.ineligibility_reasons?.some(reason => ['adult_required', 'account_inactive', 'underage', 'account_discarded', 'role_not_allowed', 'not_adult', 'non_student_role'].includes(reason))) content = <div className="party-entry-card"><ShieldCheck /><h2>Esta cuenta no puede participar.</h2><p>Crush requiere una cuenta activa y tener al menos 18 años. Si tus datos no son correctos, revísalos en tu perfil.</p><Link className="party-entry-secondary" href="/perfil">Revisar mi perfil</Link></div>;
  else if (state.ineligibility_reasons.includes('email_verification_required')) content = <div className="party-entry-card"><ShieldCheck /><h2>Confirma tu email.</h2><p>Abre el enlace que recibiste al registrarte y vuelve a esta página. Así protegemos el muro frente a cuentas falsas.</p><button className="party-entry-primary" onClick={() => void load()}>Ya lo he confirmado</button><Link className="party-entry-secondary" href="/perfil">Revisar mi cuenta</Link></div>;
  else if (state.ineligibility_reasons.includes('instagram_quarantined')) content = <div className="party-entry-card"><Instagram /><h2>Revisa tu Instagram.</h2><p>Tu cuenta de Instagram necesita una revisión antes de participar.</p><Link className="party-entry-primary" href="/crush">Revisar mi perfil de Crush</Link></div>;
  else if (!state.joined || !state.eligible) content = <QuickProfile state={state} universities={universities} account={account} base={base} onSaved={async () => { if (await load(undefined, true)) setEditing(false); }} />;
  else content = <><div hidden={editing}><Composer state={state} account={account} base={base} onEdit={() => setEditing(true)} /></div>{editing && <QuickProfile state={state} universities={universities} account={account} base={base} onSaved={async () => { if (await load(undefined, true)) setEditing(false); }} onCancel={() => setEditing(false)} />}</>;
  return <>{content}{error && <p role="alert" className="party-entry-error">No se han actualizado tus mensajes: {error} <button onClick={() => void load(undefined, true)}>Reintentar</button></p>}{state.joined && state.eligible && <PartyConnections account={account} />}<OwnMessages posts={state.my_posts ?? []} deletableIds={state.my_post_ids ?? []} account={account} slug={slug} /></>;
}

function QuickProfile({ state, universities, account, base, onSaved, onCancel }: { state: PartyState; universities: PartyUniversity[]; account: PartyAccount; base: string; onSaved: () => Promise<void>; onCancel?: () => void }) {
  const [university, setUniversity] = useState(state.profile.university_id || ALICANTE_UNIVERSITY_ID);
  const [career, setCareer] = useState(state.profile.career || '');
  const [instagram, setInstagram] = useState(state.profile.instagram_handle || '');
  const [displayName, setDisplayName] = useState(state.display_name || state.profile.full_name?.split(' ')[0] || '');
  const [birthDate, setBirthDate] = useState('');
  const [terms, setTerms] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [careers, setCareers] = useState<string[]>([]), [careerNotice, setCareerNotice] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let alive = true;
    setCareers([]); setCareerNotice('');
    createClient().from('careers').select('name').eq('university_id', university).order('name').limit(500).abortSignal(controller.signal).then(({ data, error }) => {
      if (!alive) return;
      if (error) setCareerNotice('Puedes escribir tu carrera aunque las sugerencias no estén disponibles.');
      else setCareers([...new Set((data ?? []).map(row => row.name as string))]);
    });
    return () => { alive = false; controller.abort(); };
  }, [university]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || !account.isCurrent()) return;
    if (!validInstagram(instagram)) { setError('Escribe tu usuario de Instagram, por ejemplo @tuusuario.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      await account.request(`${base}/join`, { university_id: university, career: career.trim(), instagram_handle: normaliseInstagram(instagram), display_name: displayName.trim(), birth_date: state.needs_birth_date ? birthDate : null, accept_terms: terms });
      if (account.isCurrent()) await onSaved();
    } catch (error) { if (account.isCurrent()) setError(message(error)); }
    finally { lock.current = false; if (account.isCurrent()) setBusy(false); }
  }
  return <form className="party-entry-card party-profile" onSubmit={submit}><span className="party-entry-step">02 / SOLO LO BÁSICO</span><h2>Casi estás dentro.</h2><p>Confirma estos datos para entrar en Crush. Podrás completarlos después en tu perfil.</p><fieldset disabled={busy}>
    <label htmlFor="party-name">Nombre para las pantallas<input id="party-name" autoComplete="given-name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} minLength={2} required placeholder="Cómo quieres que te llamen" /></label>
    <label htmlFor="party-university">Tu universidad<select id="party-university" value={university} onChange={e => { setUniversity(e.target.value); setCareer(''); }} required>{universities.map(uni => <option key={uni.id} value={uni.id}>{uni.name}</option>)}</select></label>
    <label htmlFor="party-career">Tu carrera<input id="party-career" list="party-careers" value={career} onChange={e => setCareer(e.target.value)} maxLength={160} minLength={2} required placeholder="Por ejemplo, Enfermería" /><datalist id="party-careers">{careers.map(name => <option key={name} value={name} />)}</datalist></label>
    {careerNotice && <p className="party-entry-small">{careerNotice}</p>}
    <label htmlFor="party-instagram">Tu Instagram<div className="party-input-icon"><span aria-hidden="true">@</span><input id="party-instagram" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" value={instagram} onChange={e => setInstagram(e.target.value)} maxLength={100} required placeholder="tuusuario" /></div><span className="party-entry-field-hint">Pon tu propia cuenta. No aparecerá en las pantallas salvo que decidas compartirla.</span></label>
    {state.needs_birth_date && <label htmlFor="party-birthday">Fecha de nacimiento<input id="party-birthday" type="date" autoComplete="bday" value={birthDate} onChange={e => setBirthDate(e.target.value)} required /><span className="party-entry-field-hint">Solo para comprobar que tienes 18 años. No se muestra en las pantallas.</span></label>}
    <label className="party-entry-check"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} required /><span>Quiero activar mi perfil de Crush y acepto las <Link href="/terminos" target="_blank">condiciones</Link> y la <Link href="/privacidad" target="_blank">política de privacidad</Link>. Tolerancia cero con el acoso, las amenazas, el odio, la explotación sexual y el contenido sexual explícito. Solo compartiré mis propios datos. Acepto las normas de la comunidad y autorizo enviar el texto, las encuestas y las imágenes de mis publicaciones a Google Gemini para detectar abusos, sin mi identificador interno de cuenta. Los audios y vídeos los revisa el equipo de Franky.</span></label>
    {error && <p className="party-entry-error" role="alert">{error}</p>}
    <button className="party-entry-primary" disabled={busy}>{busy ? <Loader2 className="party-spin" /> : <Heart />}{busy ? 'Guardando tu perfil…' : 'Entrar y escribir'}</button>
    {onCancel && <button type="button" className="party-entry-secondary" onClick={onCancel}>Volver al mensaje</button>}
  </fieldset></form>;
}

function Composer({ state, account, base, onEdit }: { state: PartyState; account: PartyAccount; base: string; onEdit: () => void }) {
  const confirm = useConfirm();
  const [body, setBody] = useState(''), [anonymous, setAnonymous] = useState(true);
  // Sharing and screen consent are tied to the exact name/@ shown when they were
  // ticked. If either changes (edited in «Mis datos»), both reset deterministically
  // on the same render instead of one effect later.
  const identity = `${state.profile.instagram_handle ?? ''}\u0000${state.display_name ?? ''}`;
  const [share, setShare] = useState({ for: identity, value: false }), [consentChoice, setConsentChoice] = useState({ for: identity, value: false });
  const shareInstagram = share.for === identity && share.value, consent = consentChoice.for === identity && consentChoice.value;
  const setShareInstagram = (value: boolean) => setShare({ for: identity, value });
  const setConsent = (value: boolean) => setConsentChoice({ for: identity, value });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const lock = useRef(false), attempt = useRef<{ payload: string; id: string } | null>(null), input = useRef<HTMLTextAreaElement>(null);
  async function publish(event: React.FormEvent) {
    event.preventDefault(); if (lock.current || !account.isCurrent()) return;
    const content = { body: body.trim(), is_anonymous: anonymous, share_instagram: shareInstagram, screen_consent: consent, expected_instagram_handle: shareInstagram ? state.profile.instagram_handle : null, expected_display_name: anonymous ? null : state.display_name };
    const payload = JSON.stringify(content);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      if (!account.userId || !await ensureCommunityTerms(account.userId, account.isCurrent, confirm)) return;
      const result = await account.request<{ id: string; available: boolean; review?: string }>(`${base}/posts`, { ...content, client_request_id: attempt.current.id });
      if (!result?.id) throw new Error('No se ha confirmado la publicación. Vuelve a intentarlo.');
      if (account.isCurrent()) { setBody(''); setConsent(false); attempt.current = null; setSuccess(result.review === 'pending' ? 'Enviado. Aparecerá en Crush y en las pantallas cuando supere la revisión.' : result.review === 'rejected' ? 'Este mensaje no se ha admitido. Revisa las normas antes de volver a publicar.' : result.available === false ? 'Ese envío ya se había procesado y su publicación se ha retirado.' : '¡Publicado! Ya está en Crush de Alicante. Aparecerá en la rotación de las pantallas cuando esté activa.'); window.dispatchEvent(new Event('franky-party-posted')); }
    } catch (error) { if (account.isCurrent()) setError(message(error)); }
    finally { lock.current = false; if (account.isCurrent()) setBusy(false); }
  }
  return <form className="party-entry-card party-composer" onSubmit={publish}><div className="party-composer-top"><span className="party-entry-step">03 / ROMPE EL HIELO</span><button type="button" onClick={onEdit} disabled={busy}>Mis datos</button></div><h2>Que no se quede<br />en una mirada.</h2><p>Un hola, una canción o esa persona con la que te has cruzado. Tú empiezas.</p>
    <fieldset disabled={busy || !state.posting_open}>
      <div className="party-prompts">{prompts.map(prompt => <button type="button" key={prompt} onClick={() => { setBody(prompt + ' '); input.current?.focus(); }}>{prompt}</button>)}</div>
      <label className="party-message-label" htmlFor="party-message">Tu mensaje<textarea ref={input} id="party-message" rows={5} maxLength={320} minLength={2} value={body} onChange={e => { setBody(e.target.value); setSuccess(''); }} required placeholder="A quien estaba cantando a mi lado…" aria-describedby="party-character-count" /></label><div id="party-character-count" className="party-character-count">{body.length}/320</div>
      <div className="party-publish-as" role="group" aria-label="Cómo quieres aparecer"><button type="button" aria-pressed={anonymous} onClick={() => { setAnonymous(true); setShareInstagram(false); }}>En anónimo</button><button type="button" aria-pressed={!anonymous} onClick={() => setAnonymous(false)}>Con mi nombre</button></div>
      {!anonymous && <p className="party-entry-small">En pantallas: {state.display_name || state.profile.full_name}. En el muro de Crush se verá el nombre y la foto de tu perfil.</p>}
      <label className="party-entry-check"><input type="checkbox" checked={shareInstagram} onChange={e => { setShareInstagram(e.target.checked); if (e.target.checked) setAnonymous(false); }} /><span>Compartir mi Instagram <strong>@{state.profile.instagram_handle}</strong> en este mensaje y en las pantallas.</span></label>
      <label className="party-entry-check party-screen-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>Quiero publicar este mensaje en el Crush de la Universidad de Alicante y en las pantallas públicas de la fiesta. No incluiré datos privados de otras personas.</span></label>
      {error && <p className="party-entry-error" role="alert">{error}</p>}
      <button className="party-entry-primary" disabled={busy || !state.posting_open}>{busy ? <Loader2 className="party-spin" /> : <Send />}{busy ? 'Publicando…' : 'Publicar en Crush y en pantalla'}</button>
    </fieldset>
    {!state.posting_open && <p className="party-entry-notice" role="status">El envío de mensajes está cerrado ahora. Puedes consultar el muro.</p>}
    {success && <div className="party-entry-success" role="status"><Check /><p>{success}</p></div>}
    <Link className="party-entry-secondary" href="/crush?tab=requests">Mis solicitudes y matches <ArrowUpRight /></Link>
  </form>;
}

function PartyWall({ slug, account, personal }: { slug: string; account: PartyAccount; personal: PartyState | null }) {
  const { data, loading, error } = usePartyFeed(slug, false, true, 8000);
  return <section className="party-entry-wall" id="muro-fiesta" aria-label="Muro de la fiesta"><div className="party-entry-wall-heading"><span className="party-entry-step"><Sparkles /> EL MURO DE LA FIESTA</span><h2>Aquí empiezan<br />las conversaciones.</h2><p>{data?.party.screen_paused ? 'Las pantallas están en pausa.' : 'Mensajes compartidos para las pantallas y Crush de Alicante.'}</p>{(data?.matches ?? 0) > 0 && <p className="party-wall-pulse"><Heart /> {data?.matches === 1 ? 'Ya hay un match esta noche.' : `Ya hay ${data?.matches} matches esta noche.`}</p>}</div>
    {error ? <div className="party-entry-card"><p role="status">Estamos reconectando con el muro. Se reintentará automáticamente.</p></div> : loading ? <div className="party-entry-card" role="status"><Loader2 className="party-spin" /> Cargando los mensajes…</div> : !data?.posts.length ? <div className="party-entry-card party-empty"><Heart /><h3>{data?.party.screen_paused ? 'Un momento para disfrutar de la fiesta.' : 'El primer hola puede ser el tuyo.'}</h3><p>{data?.party.screen_paused ? 'Los mensajes volverán cuando se reanude la pantalla.' : 'Entra, escribe y dale vida al muro.'}</p></div> : <div className="party-entry-posts">{data.posts.map(post => <PartyPostCard key={`${account.key}:${post.id}`} post={post} account={account} slug={slug} mine={personal?.my_post_ids?.includes(post.id) ?? false} canInteract={personal?.joined === true && personal.eligible} />)}</div>}
  </section>;
}

function PartyPostCard({ post, account, slug, mine, canInteract }: { post: PartyPost; account: PartyAccount; slug: string; mine: boolean; canInteract: boolean }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [matchedInstagram, setMatchedInstagram] = useState<string | null>(null);
  const lock = useRef(false);
  async function action(kind: 'request' | 'report') {
    if (lock.current || !account.isCurrent()) return;
    if (kind === 'report' && !window.confirm('¿Reportar esta publicación para que se revise?')) return;
    lock.current = true; setBusy(true); setNotice(''); setError('');
    try {
      const result = await account.request<{ message: string; matched?: boolean; instagram_handle?: string | null }>(`/api/crush/fiesta/${encodeURIComponent(slug)}/action`, { post_id: post.id, action: kind });
      if (account.isCurrent()) { setNotice(result.message); if (kind === 'request' && result.matched === true && result.instagram_handle && /^[a-zA-Z0-9._]{1,30}$/.test(result.instagram_handle)) setMatchedInstagram(result.instagram_handle); }
    } catch (error) { if (account.isCurrent()) setError(message(error)); }
    finally { lock.current = false; if (account.isCurrent()) setBusy(false); }
  }
  return <article className="party-entry-post"><header><span><Heart />{post.is_anonymous ? 'Alguien de la fiesta' : post.display_name || 'Alguien de la fiesta'}</span><span>{mine ? 'TU MENSAJE' : 'CRUSH'}</span></header><p>{post.body}</p>{post.instagram_handle && <InstagramLink handle={post.instagram_handle} />}{(post.request_count ?? 0) > 0 && <p className="party-request-count"><Instagram /> {post.request_count === 1 ? 'Una persona le ha pedido el Instagram' : `${post.request_count} personas le han pedido el Instagram`}</p>}<footer>{account.userId && !mine && canInteract && <>{!post.instagram_handle && !matchedInstagram && <button disabled={busy} onClick={() => void action('request')}><Instagram /> Pedir su Instagram</button>}<button disabled={busy} onClick={() => void action('report')}>Reportar</button></>}{mine && <DeletePostButton postId={post.id} account={account} slug={slug} />}</footer>{notice && <div role="status" className="party-entry-small">{notice}</div>}{matchedInstagram && <div className="party-private-match"><span>Solo para ti · Habéis hecho match</span><InstagramLink handle={matchedInstagram} /></div>}{error && <div role="alert" className="party-entry-error">{error}</div>}</article>;
}

function InstagramLink({ handle }: { handle: string }) {
  return <a className="party-shared-ig" href={`https://www.instagram.com/${encodeURIComponent(handle)}/`} target="_blank" rel="noopener noreferrer"><Instagram /><span>@{handle}</span><ArrowUpRight /></a>;
}

function OwnMessages({ posts, deletableIds, account, slug }: { posts: OwnPartyPost[]; deletableIds: string[]; account: PartyAccount; slug: string }) {
  if (!posts.length) return null;
  return <details className="party-own-messages"><summary>Tus últimos mensajes <span>{posts.length}</span></summary><p>Puedes retirarlos de Crush y de las pantallas. Aquí aparecen tus últimos 60 envíos, incluidos los que ya no están visibles.</p><div>{posts.map(post => <article key={post.id}><p>{post.body}</p><div><span>{post.available ? (post.is_anonymous ? 'Publicado en anónimo' : 'Publicado con tu nombre') : 'Ya no está visible'}</span>{deletableIds.includes(post.id) && <DeletePostButton postId={post.id} account={account} slug={slug} />}</div></article>)}</div></details>;
}

function DeletePostButton({ postId, account, slug }: { postId: string; account: PartyAccount; slug: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  async function remove() {
    if (lock.current || !account.isCurrent() || !window.confirm('¿Retirar este mensaje de Crush y de las pantallas?')) return;
    if (!account.isCurrent()) return;
    lock.current = true; setBusy(true); setError('');
    try { const result = await account.request<{ message: string }>(`/api/crush/fiesta/${encodeURIComponent(slug)}/action`, { post_id: postId, action: 'delete' }); if (account.isCurrent()) { setNotice(result.message); window.dispatchEvent(new Event('franky-party-posted')); } }
    catch (error) { if (account.isCurrent()) setError(message(error)); }
    finally { lock.current = false; if (account.isCurrent()) setBusy(false); }
  }
  return <div className="party-delete-action">{!notice && <button type="button" disabled={busy} onClick={() => void remove()}><Trash2 />{busy ? 'Retirando…' : 'Retirar mensaje'}</button>}{notice && <p role="status">{notice}</p>}{error && <p className="party-entry-error" role="alert">{error}</p>}</div>;
}
