"use client";
import { useEffect, useState } from 'react';
import { DEMO_POSTS, PARTY_DEMO, type PartyFeed } from './model';

/** intervalMs: venue screens poll fast; phones in the club poll slower to spare the network. */
export function usePartyFeed(slug: string, demo = false, enabled = true, intervalMs = 4000) {
  const key = `${slug}:${demo}:${enabled}:${intervalMs}`;
  const [state, setState] = useState<{ key: string; data: PartyFeed | null; loading: boolean; error: string }>({ key, data: null, loading: !demo && enabled, error: '' });
  useEffect(() => {
    if (demo || !enabled) return;
    setState({ key, data: null, loading: true, error: '' });
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || !alive) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch(`/api/crush/fiesta/${encodeURIComponent(slug)}/feed`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data?.party || !Array.isArray(data.posts)) throw new Error('feed_unavailable');
        if (alive) setState({ key, data, loading: false, error: '' });
      } catch {
        // Remove stale public posts as soon as a refresh fails: a hidden/deleted
        // message must not remain on the venue display during a network outage.
        if (alive) setState({ key, data: null, loading: false, error: 'Reconectando con el muro…' });
      } finally {
        clearTimeout(timeout); inFlight = false;
        if (alive) timer = setTimeout(refresh, document.hidden ? Math.max(15000, intervalMs * 3) : intervalMs);
      }
    };
    const wake = () => { if (!document.hidden) { clearTimeout(timer); void refresh(); } };
    void refresh(); document.addEventListener('visibilitychange', wake); window.addEventListener('franky-party-posted', wake);
    return () => { alive = false; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', wake); window.removeEventListener('franky-party-posted', wake); };
  }, [slug, demo, enabled, intervalMs, key]);
  if (!enabled) return { data: null, loading: false, error: '' };
  if (demo) return { data: { party: { ...PARTY_DEMO, slug }, posts: DEMO_POSTS, generated_at: '', matches: 12, requests: 27 }, loading: false, error: '' };
  return state.key === key ? state : { data: null, loading: true, error: '' };
}
