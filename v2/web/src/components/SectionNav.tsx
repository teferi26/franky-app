"use client";

import { useEffect, useRef, useState } from "react";

interface NavItem {
  id: string;
  label: string;
}

// Subnav pegajosa con anclas a las secciones de la ficha. Los enlaces son
// <a href="#id"> reales: funcionan aunque el JS no hidrate. El JS solo añade
// el resaltado de la sección activa y el scroll suave con offset.
export default function SectionNav({ items, label = 'Secciones de la carrera' }: { items: NavItem[]; label?: string }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);
  const pendingTarget = useRef<string | null>(null);
  const initialSectionIds = useRef(items.map(item => item.id));
  const cancelInitialRestore = useRef<(() => void) | null>(null);

  useEffect(() => {
    const readHash = () => { try { return decodeURIComponent(window.location.hash.slice(1)); } catch { return ''; } };
    const id = readHash();
    if (!initialSectionIds.current.includes(id)) return;
    const target = document.getElementById(id);
    if (!target) return;
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    cancelInitialRestore.current = cancel;
    // Streaming and font layout can move a fragment after the browser's first
    // jump. This mount-only correction survives equivalent item re-renders.
    const restore = () => {
      if (cancelled || !target.isConnected || readHash() !== id) return;
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
      setActive(id);
    };
    const frame = requestAnimationFrame(restore);
    void document.fonts?.ready.then(restore).catch(cancel);
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'hashchange', 'popstate'] as const;
    events.forEach(event => window.addEventListener(event, cancel, { passive: true }));
    return () => {
      cancel(); cancelAnimationFrame(frame);
      events.forEach(event => window.removeEventListener(event, cancel));
      if (cancelInitialRestore.current === cancel) cancelInitialRestore.current = null;
    };
  }, []);

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const target = sections.find(section => section.id === pendingTarget.current);
      if (target) {
        const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const targetY = Math.max(0, Math.min(maxY, window.scrollY + target.getBoundingClientRect().top - margin));
        // Smooth scrolling crosses other sections before reaching the chosen one.
        // Keep the intended destination until it settles, or the reader interrupts.
        if (Math.abs(window.scrollY - targetY) > 2) {
          setActive(target.id);
          return;
        }
        pendingTarget.current = null;
      }
      const boundary = (navRef.current?.getBoundingClientRect().bottom ?? 120) + 32;
      const reached = sections.map(section => ({ id: section.id, top: section.getBoundingClientRect().top }))
        .filter(section => section.top <= boundary).sort((a, b) => b.top - a.top);
      const nearest = reached[0];
      // A tall section may never cross an intersection-ratio threshold.
      // Compare its start with the actual fixed bar instead. For side-by-side
      // sections at the same height, preserve the link the reader selected.
      setActive(previous => nearest
        ? reached.some(section => section.id === previous && Math.abs(section.top - nearest.top) < 2) ? previous : nearest.id
        : items[0]?.id ?? '');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const interrupt = () => { pendingTarget.current = null; schedule(); };
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interrupt();
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('keydown', onKey);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    sections.forEach(section => resize?.observe(section));
    update();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', onKey);
      resize?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = document.getElementById(id);
    if (!el) return;
    cancelInitialRestore.current?.();
    e.preventDefault();
    pendingTarget.current = id;
    setActive(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${id}`);
  };

  return (
    // v3: la pestaña activa es una píldora casi negra (no violeta); las demás
    // se tintan en gris al pasar el ratón. Superficie blanca con hairline.
    <nav ref={navRef} aria-label={label} className="sticky top-14 sm:top-16 z-30 -mx-4 sm:mx-0 mb-6 border-b border-border-light bg-bg-primary sm:rounded-2xl sm:border sm:border-border sm:shadow-card">
      <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active === item.id ? "location" : undefined}
            onClick={(e) => onClick(e, item.id)}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-[color,background-color] duration-200 ease-[var(--ease-out-quart)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet ${
              active === item.id
                ? "bg-text-primary font-semibold text-bg-primary"
                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
