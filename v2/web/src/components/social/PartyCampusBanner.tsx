"use client";
import { useEffect, useState } from 'react';
import { ArrowUpRight, Heart } from 'lucide-react';
import { ALICANTE_PARTY_SLUG, ALICANTE_UNIVERSITY_ID, partyPath } from '@/lib/crush-party-route';

export default function PartyCampusBanner({ universityId }: { universityId: string | null | undefined }) {
  const [until, setUntil] = useState<number | null>(null);
  useEffect(() => {
    setUntil(null);
    if (universityId !== ALICANTE_UNIVERSITY_ID) return;
    const controller = new AbortController(); let alive = true; let timer: ReturnType<typeof setTimeout>;
    fetch(`/api/crush/fiesta/${ALICANTE_PARTY_SLUG}/feed`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (!alive || !data?.party?.active || data.party.university_id !== universityId) return;
        const end = Date.parse(data.party.ends_at);
        if (!Number.isFinite(end) || end <= Date.now()) return;
        setUntil(end); timer = setTimeout(() => setUntil(null), Math.min(end - Date.now(), 2147483647));
      }).catch(() => {});
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [universityId]);
  if (universityId !== ALICANTE_UNIVERSITY_ID || !until) return null;
  // Aviso de la fiesta (v3): tarjeta sobria con el corazón suelto, sin
  // degradado ni icono en cuadrado tintado.
  return <a href={partyPath(ALICANTE_PARTY_SLUG)} className="group hover-lift mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15">
    <Heart className="h-6 w-6 shrink-0 fill-violet/10 text-violet" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="eyebrow block text-violet">Franky Event · Viernes 11 septiembre</span><span className="mt-1 block font-heading text-lg font-bold text-text-primary">El Crush de la fiesta ya tiene su sitio.</span><span className="mt-1 block text-xs leading-relaxed text-text-secondary">Entra y escribe para el muro de Alicante y las pantallas de la fiesta.</span></span>
    <span className="flex min-h-10 items-center gap-2 rounded-full bg-text-primary px-4 text-xs font-semibold text-bg-primary">Entrar <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></span>
  </a>;
}
