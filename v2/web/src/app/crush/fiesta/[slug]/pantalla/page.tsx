import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { ALICANTE_PARTY_SLUG, partyPath, validPartySlug } from '@/lib/crush-party-route';
import PartyScreen from '../../PartyScreen';
import { screenMode } from '../../model';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Franky Event · Pantalla Crush', robots: { index: false, follow: false } };
export default async function PartyScreenPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ modo?: string; demo?: string }> }) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  if (!validPartySlug(slug) || slug !== ALICANTE_PARTY_SLUG) notFound();
  const qr = await QRCode.toDataURL(`https://franky.es${partyPath(slug)}`, { width: 1024, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#150d25', light: '#ffffff' } });
  return <PartyScreen slug={slug} qr={qr} mode={screenMode(search.modo)} demo={search.demo === '1'} />;
}
