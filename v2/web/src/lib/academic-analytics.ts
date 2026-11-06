"use client";

export async function trackAcademicConsultation(kind: 'university' | 'career' | 'cutoff', entityId: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || JSON.parse(localStorage.getItem('franky_cookie_consent') ?? '{}').analytics !== true) return;
    const { createClient } = await import('./supabase-client');
    const client = createClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) return;
    // A stale session cannot change actor during the asynchronous request.
    await client.rpc('track_institutional_consultation', { p_kind: kind, p_entity_id: entityId, p_consent: true, p_platform: 'web' }).setHeader('Authorization', `Bearer ${session.access_token}`);
  } catch { /* Optional telemetry never blocks a catalogue interaction. */ }
}
