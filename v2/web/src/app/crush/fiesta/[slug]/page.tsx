import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createPublicSupabase } from '@/lib/supabase-server';
import { ALICANTE_PARTY_SLUG, validPartySlug } from '@/lib/crush-party-route';
import PartyClient from '../PartyClient';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Crush de la fiesta · Franky Event', description: 'Entra, escribe y rompe el hielo en el Crush de la fiesta. Universidad de Alicante.', robots: { index: false, follow: false } };
export default async function PartyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!validPartySlug(slug) || slug !== ALICANTE_PARTY_SLUG) notFound();
  const { data, error } = await createPublicSupabase().from('universities').select('id,name').order('name');
  if (error) return <div className="mx-auto max-w-xl p-8"><h1 className="font-heading text-2xl font-bold">Estamos preparando tu entrada.</h1><p className="mt-3">No se ha podido cargar el listado de universidades. Recarga la página en unos segundos.</p><a href={`/crush/fiesta/${slug}`} className="mt-5 inline-block rounded-full bg-violet px-5 py-3 font-bold text-white">Reintentar</a></div>;
  return <PartyClient slug={slug} universities={data ?? []} />;
}
