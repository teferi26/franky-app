import QRCode from 'qrcode';
import { ALICANTE_PARTY_SLUG, partyPath, validPartySlug } from '@/lib/crush-party-route';
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!validPartySlug(slug) || slug !== ALICANTE_PARTY_SLUG) return new Response('Fiesta no encontrada.', { status: 404 });
  const buffer = await QRCode.toBuffer(`https://franky.es${partyPath(slug)}`, { width: 1600, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#150d25', light: '#ffffff' } });
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="franky-crush-${slug}-qr.png"`, 'Cache-Control': 'public, max-age=86400', 'X-Robots-Tag': 'noindex, nofollow' } });
}
