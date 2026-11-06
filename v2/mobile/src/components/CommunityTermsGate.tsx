import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, Text } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, Square, CheckSquare } from 'lucide-react-native';
import { Btn, Tap } from './ui';
import { supabase, beginAuthAttempt } from '@/lib/supabase';
import { COMMUNITY_TERMS_VERSION, hasCachedCommunityAcceptance, loadCachedCommunityAcceptance, cacheCommunityAcceptance } from '@/lib/community-terms';
import { isCommunityRoute, type CommunityTermsStatus } from '@/lib/community-terms-state';
import { withOwnedRequest } from '@/lib/owned-request';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import { isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { createSessionExit } from '@/lib/session-exit';
import { unregisterPushToken, resumePushRegistration } from '@/lib/push';
import { clearOwnedNotifications, resumeLocalNotifications } from '@/lib/local-notifications';
import { clearOfflineQueue } from '@/lib/offline-queue';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S } from '@/theme';

const exitSession = createSessionExit({
  current: isCurrentSessionIdentity, revoke: owner => unregisterPushToken(owner).catch(() => {}),
  clearLocal: clearOwnedNotifications, clearQueue: clearOfflineQueue,
  signOut: () => beginAuthAttempt().run('signOut', { scope: 'local' }),
  resume: owner => { resumePushRegistration(owner); resumeLocalNotifications(owner); },
});

/** Acceptance is checked before social content can be viewed, including deep links. */
export function CommunityTermsGate() {
  const owner = useSessionOwner();
  if (!owner) return null;
  return <OwnedTerms key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedTerms({ owner }: { owner: SessionIdentity }) {
  const current = useOwnerGuard(owner);
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const lock = useRef(false);
  const [status, setStatus] = useState<CommunityTermsStatus>(() => hasCachedCommunityAcceptance(owner.userId) ? 'accepted' : 'loading');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const read = useCallback(async () => {
    setError('');
    try {
      const cached = await loadCachedCommunityAcceptance(owner.userId);
      if (!current()) return;
      setStatus(cached ? 'accepted' : 'loading');
      const accepted = await withOwnedRequest(owner, async request => {
        const { data, error: failure } = await request.query(supabase.rpc('community_terms_accepted'));
        request.check();
        if (failure) throw failure;
        return data === true;
      });
      if (current()) { await cacheCommunityAcceptance(owner.userId, accepted); if (current()) setStatus(accepted ? 'accepted' : 'required'); }
    } catch { if (current() && !hasCachedCommunityAcceptance(owner.userId)) { setStatus('error'); setError('No pudimos comprobar las normas. Revisa tu conexión e inténtalo de nuevo.'); } }
  }, [owner, current]);
  useEffect(() => { void read(); }, [read]);

  const accept = async () => {
    if (!checked || lock.current || !current()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await withOwnedRequest(owner, async request => {
        const { error: failure } = await request.query(supabase.rpc('accept_community_terms', { p_version: COMMUNITY_TERMS_VERSION }));
        request.check();
        if (failure) throw failure;
      });
      if (current()) { await cacheCommunityAcceptance(owner.userId, true); if (current()) setStatus('accepted'); }
    } catch { if (current()) setError('No se ha guardado la aceptación. Inténtalo de nuevo.'); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };

  // Only the social area requires this agreement. Loading never displays the
  // legal form, and an outage cannot prevent housing, study or payment access.
  return <Modal visible={status !== 'accepted' && isCommunityRoute(segments)} animationType="fade" onRequestClose={() => router.replace('/(tabs)/explorar')}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: C.bg, padding: S.lg, paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl, gap: S.lg }}>
      {status === 'required' ? <ShieldCheck color={C.blue} size={38} /> : null}
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.display}>{status === 'required' ? 'Una comunidad segura' : 'Acceso a la comunidad'}</Text>
      {status === 'loading' ? <ActivityIndicator accessibilityLabel="Comprobando las normas" color={C.blue} /> : null}
      {status === 'required' ? <>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Antes de entrar, lee y acepta nuestras normas y los términos de uso (EULA).</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Tolerancia cero con el acoso, las amenazas, el odio, la explotación sexual, el contenido sexual explícito y la difusión de datos privados. Retiramos el contenido que incumple las normas y suspendemos a los usuarios responsables, también cuando publican en anónimo.</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Puedes ocultar, denunciar y bloquear desde el menú de cada publicación. Revisamos las denuncias en un máximo de 24 horas. Contacto: soporte@franky.es.</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Revisamos las publicaciones antes de mostrarlas. Al aceptar, autorizas el envío del texto, las encuestas y las imágenes que publiques a Google Gemini para detectar abusos; no enviamos tu identificador interno. Los audios, vídeos y contenidos dudosos los revisa nuestro equipo.</Text>
        <Tap accessibilityRole="checkbox" accessibilityLabel="He leído y acepto las normas y los términos de uso" accessibilityState={{ checked }} onPress={() => setChecked(!checked)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12 }}>
          {checked ? <CheckSquare color={C.blue} size={25} /> : <Square color={C.muted} size={25} />}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>He leído y acepto las normas y los términos de uso</Text>
        </Tap>
        <Btn label="Aceptar y continuar" disabled={!checked || busy} busy={busy} onPress={() => void accept()} />
      </> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={[F.body, { color: C.error }]}>{error}</Text> : null}
      {status === 'error' ? <Btn label="Reintentar" onPress={() => void read()} /> : null}
      <Btn variant="secondary" label="Continuar explorando Franky" onPress={() => router.replace('/(tabs)/explorar')} />
      <Btn variant="link" label="Leer los términos completos" onPress={() => router.push('/terminos')} />
      <Btn variant="link" label="Política de privacidad" onPress={() => {
        void Linking.openURL('https://franky.es/privacidad').catch(() => setError('No se pudo abrir la política. Puedes consultarla en franky.es/privacidad.'));
      }} />
      <Btn variant="link" label="Contactar con seguridad" onPress={() => router.push('/centro-seguridad')} />
      <Btn variant="secondary" label="No acepto · Cerrar sesión" disabled={busy} onPress={() => {
        if (lock.current || !current()) return;
        lock.current = true; setBusy(true);
        void exitSession(owner).catch(() => { if (current()) setError('No pudimos cerrar la sesión. Inténtalo de nuevo.'); })
          .finally(() => { lock.current = false; if (current()) setBusy(false); });
      }} />
    </ScrollView>
  </Modal>;
}
