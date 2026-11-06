import { NextResponse } from 'next/server';

/**
 * The UI already disables screenshot verification. A user-supplied image cannot
 * prove control of an Instagram account, even if OCR sees the expected token.
 * Keep the endpoint closed too; do not upload images or grant a trust badge.
 * Reopening requires an independently authenticated ownership proof.
 */
export async function POST() {
  return NextResponse.json({
    error: 'La verificación de Instagram no está disponible. Puedes seguir usando Crush sin verificarlo.',
    code: 'instagram_verification_unavailable',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
