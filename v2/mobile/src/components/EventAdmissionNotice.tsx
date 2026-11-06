import React, { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Btn } from './ui';
import { captureSessionIdentity, onSessionIdentityChange } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { supabase } from '@/lib/supabase';
import { eventAdmissionMessage, type EventAdmission } from '../../../shared/event-admission';
import { F } from '@/theme';

export function EventAdmissionNotice({ eventId }: { eventId: string }) {
  const [admission, setAdmission] = useState<EventAdmission | null>(null); const [failed, setFailed] = useState(false); const [loading, setLoading] = useState(false); const sequence = useRef(0);
  const load = useCallback(async () => {
    const owner = captureSessionIdentity(), request = ++sequence.current; setAdmission(null); setFailed(false);
    if (!owner) return; setLoading(true);
    try {
      const data = await withOwnedRequest(owner, async owned => { const reply = await owned.query(supabase.rpc('get_event_admission', { p_event_id: eventId })); owned.check(); if (reply.error) throw reply.error; return reply.data as EventAdmission; });
      if (request === sequence.current) setAdmission(data);
    } catch { if (request === sequence.current) setFailed(true); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [eventId]);
  useFocusEffect(useCallback(() => { void load(); const stop = onSessionIdentityChange(() => { ++sequence.current; setAdmission(null); setFailed(false); void load(); }); return () => { ++sequence.current; stop(); }; }, [load]));
  if (!failed && (!admission || admission.audience === 'public' && admission.eligible)) return null;
  return <View style={{ gap: 10, marginVertical: 16 }}><Text style={F.h3}>Condiciones de asistencia</Text><Text accessibilityRole="alert" style={F.small}>{failed ? 'No se pudieron consultar las condiciones de tu cuenta. Compruébalas antes de inscribirte.' : eventAdmissionMessage(admission!)}</Text><Btn label="Comprobar acceso" variant="secondary" small busy={loading} onPress={() => void load()} /></View>;
}
