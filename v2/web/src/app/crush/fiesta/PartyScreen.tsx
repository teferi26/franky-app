"use client";
import { useEffect, useState } from 'react';
import { usePartyFeed } from './usePartyFeed';
import type { PartyScreenMode } from './model';
import { groupScreenPosts } from './screen-layout';
import './party.css';

// Venue screen: read from the dance floor. Only what matters, in big type.
const HeartIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
const InstagramIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>;
const ScanIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2" /><path d="M16 4h2a2 2 0 0 1 2 2v2" /><path d="M20 16v2a2 2 0 0 1-2 2h-2" /><path d="M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M3 12h18" /></svg>;
const SparkIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;

export default function PartyScreen({ slug, qr, mode, demo = false }: { slug: string; qr: string; mode: PartyScreenMode; demo?: boolean }) {
  const { data, loading, error } = usePartyFeed(slug, demo, mode !== 'qr');
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 650px)');
    const update = () => setCompact(media.matches); update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const posts = data?.posts ?? [];
  const groups = groupScreenPosts(posts, compact);
  const pages = Math.max(1, groups.length);
  useEffect(() => {
    const interval = setInterval(() => setPage(value => (value + 1) % pages), 14000);
    return () => clearInterval(interval);
  }, [pages]);
  const visible = groups[page % pages] ?? [];
  const paused = data?.party.screen_paused === true;
  const matches = data?.matches ?? 0;
  const flash = useMatchFlash(matches, loading || !!error);
  const status = demo ? 'VISTA DE PRUEBA' : error ? 'RECONECTANDO' : loading ? 'CONECTANDO' : paused ? 'PAUSA DE PANTALLA' : 'EN DIRECTO · CRUSH DE LA FIESTA';
  return <div className={`party-scene party-scene--${mode}`}>
    <div className="party-glow party-glow--violet" aria-hidden="true" /><div className="party-glow party-glow--fuchsia" aria-hidden="true" />
    <div className="party-beam party-beam--1" aria-hidden="true" /><div className="party-beam party-beam--2" aria-hidden="true" />
    <svg className="party-grain" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"><filter id="party-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0" /></filter><rect width="1920" height="1080" filter="url(#party-noise)" /></svg>
    {mode !== 'muro' && <aside className="party-qr-panel">
      <div className="party-brand"><img src="/img/franky-icon.png" alt="" /><span><span className="party-brand-name">Franky</span><span className="party-brand-sub">EVENT · ALICANTE</span></span></div>
      <h1 className="party-qr-heading">Tu crush<br />puede leer<br /><em>esto.</em></h1>
      <div className="party-qr-frame"><img src={qr} alt="Escanea para entrar al Crush de la fiesta" /></div>
      <div className="party-qr-caption"><strong><ScanIcon /> Escanea con la cámara</strong><p>franky.es/crush/fiesta</p></div>
    </aside>}
    {mode !== 'qr' && <section className="party-wall-panel" aria-label="Muro de Crush de la fiesta">
      <header className="party-wall-header">
        <span className={`party-live-status ${error ? 'party-live-status--error' : ''}`}><span className="party-live-dot" />{status}</span>
        {matches > 0 && <span className="party-match-pill"><HeartIcon />{matches === 1 ? '1 match esta noche' : `${matches} matches esta noche`}</span>}
      </header>
      <div className="party-screen-posts" aria-live="off">
        {paused ? <div className="party-screen-empty"><SparkIcon /><h2>Seguimos en la pista.</h2><p>El muro vuelve en un momento.</p></div>
        : visible.length ? visible.map((post, index) => <article className={`party-screen-post party-screen-post--${index}`} key={post.id}>
          <p className={post.body.length > 140 ? 'party-post-long' : ''}>{post.body}</p>
          <footer><span><HeartIcon />{post.is_anonymous ? 'Alguien de la fiesta' : post.display_name || 'Alguien de la fiesta'}</span>{post.instagram_handle ? <strong><InstagramIcon />@{post.instagram_handle}</strong> : (post.request_count ?? 0) > 0 ? <em><InstagramIcon />{post.request_count === 1 ? '1 persona le ha pedido el Instagram' : `${post.request_count} le han pedido el Instagram`}</em> : null}</footer>
        </article>) : <div className="party-screen-empty"><HeartIcon /><h2>{error ? 'Recuperando la conexión.' : loading ? 'Preparando el muro…' : 'El primer hola puede ser el tuyo.'}</h2><p>{error ? 'El QR sigue funcionando.' : 'Escanea el QR y escribe el primero.'}</p></div>}
      </div>
      <footer className="party-wall-footer"><span>{demo ? 'Mensajes de ejemplo · no se publican' : 'Tu mensaje puede ser el siguiente.'}</span><span><SparkIcon /> Escanea y escribe</span></footer>
    </section>}
    {flash && mode !== 'qr' && <div className="party-match-flash" role="status"><HeartIcon /><strong>¡Nuevo match!</strong><span>Dos personas de la fiesta acaban de compartir su Instagram.</span></div>}
    {demo && mode === 'qr' && <span className="party-demo-label">VISTA DE PRUEBA</span>}
  </div>;
}

/** Shows a short celebration when the match count grows while the screen is live. */
function useMatchFlash(matches: number, unsettled: boolean) {
  const [flash, setFlash] = useState(false);
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    if (unsettled) return;
    if (seen === null) { setSeen(matches); return; }
    if (matches > seen) { setSeen(matches); setFlash(true); const timer = setTimeout(() => setFlash(false), 7000); return () => clearTimeout(timer); }
    if (matches < seen) setSeen(matches);
  }, [matches, unsettled, seen]);
  return flash;
}
