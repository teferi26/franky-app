import { Platform } from 'react-native';
import { getAnalyticsConsent } from './analytics';
import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { supabase } from './supabase';

export async function trackAcademicConsultation(kind: 'university' | 'career' | 'cutoff', entityId: string): Promise<void> {
  const owner = captureSessionIdentity();
  try {
    if (!owner || !await getAnalyticsConsent()) return;
    await withOwnedRequest(owner, async request => {
      await request.query(supabase.rpc('track_institutional_consultation', { p_kind: kind, p_entity_id: entityId, p_consent: true, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' }));
    });
  } catch { /* Consent or session failure must not affect academic browsing. */ }
}
