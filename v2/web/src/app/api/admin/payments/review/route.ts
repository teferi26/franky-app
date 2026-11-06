import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/analytics-filters';
import { createRequestSupabase } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const db = await createRequestSupabase(req);
  const { data, error } = await db.rpc('admin_payment_review');
  if (error) return NextResponse.json({ error: 'No se pudo cargar la revisión de pagos. Comprueba el segundo factor de tu sesión.' }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
