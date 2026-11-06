import { NextResponse, type NextRequest } from 'next/server';
import { createPublicSupabase } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { ORIGIN_EVENT_FIELDS, ORIGIN_ORGANIZER_ID, originEventSlug } from '@/lib/origin-partner';

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { key: 'origin-event-catalogue', limit: 120, windowMs: 60_000 });
  if (!limited.ok) return limited.response;
  const supabase = createPublicSupabase();
  const { data, error } = await supabase.from('events').select(ORIGIN_EVENT_FIELDS)
    .eq('organizer_id', ORIGIN_ORGANIZER_ID).in('status', ['upcoming','ongoing'])
    .order('start_date', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'No se pueden consultar los encuentros ahora.' }, { status: 503 });
  return NextResponse.json({ events: (data ?? []).map(event => ({
    ...event,
    max_capacity: event.show_participant_count === true ? event.max_capacity : null,
    slug: originEventSlug(event.id),
  })) }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}
