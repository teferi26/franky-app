import React, { useRef, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn } from '@/components/ui';
import { supabase, WEB_URL, fetchConTimeout, beginAuthAttempt } from '@/lib/supabase';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import { isCurrentSessionIdentity, captureSessionIdentity, type SessionIdentity } from '@/lib/session';
import { createSessionExit } from '@/lib/session-exit';
import { unregisterPushToken, resumePushRegistration } from '@/lib/push';
import { clearOwnedNotifications, resumeLocalNotifications } from '@/lib/local-notifications';
import { clearOfflineQueue } from '@/lib/offline-queue';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eraseAccountStorage } from '@/lib/account-storage';
import { Image } from 'expo-image';
import { C, F, S } from '@/theme';

const exitSession = createSessionExit({
  current: isCurrentSessionIdentity, revoke: unregisterPushToken,
  clearLocal: clearOwnedNotifications, clearQueue: clearOfflineQueue,
  signOut: () => beginAuthAttempt().run('signOut', { scope: 'local' }),
  resume: owner => { resumePushRegistration(owner); resumeLocalNotifications(owner); },
});

export default function DeleteAccount() {
  const owner = useSessionOwner();
  if (!owner) return <Screen title="Eliminar mi cuenta" back><Text style={[F.body, { padding: S.lg }]}>Inicia sesión para eliminar tu cuenta.</Text></Screen>;
  return <OwnedDeletion key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedDeletion({ owner }: { owner: SessionIdentity }) {
  const router = useRouter();
  const current = useOwnerGuard(owner);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    if (lock.current || !current()) return;
    lock.current = true; setBusy(true); setError('');
    let recorded = false;
    try {
      const finished = await exitSession(owner, async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!current() || session?.user.id !== owner.userId) throw new Error('La sesión ha cambiado. Vuelve a iniciar sesión.');
        const response = await fetchConTimeout(`${WEB_URL}/api/account/erase`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ confirmation: 'ELIMINAR' }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'No se ha registrado la eliminación. Inténtalo de nuevo.');
        recorded = true;
        await eraseAccountStorage(AsyncStorage, owner.userId);
        await Promise.allSettled([Image.clearDiskCache(), Image.clearMemoryCache()]);
      });
      if (finished && !captureSessionIdentity()) {
        router.replace('/welcome');
        Alert.alert('Eliminación solicitada', 'Tu cuenta ya no se puede recuperar. Eliminaremos tus datos personales en un máximo de 30 días y te avisaremos por correo cuando termine.');
      }
    } catch (cause) {
      if (recorded) {
        // The durable request cannot be undone by a local sign-out failure.
        if (captureSessionIdentity() && !isCurrentSessionIdentity(owner)) return;
        if (isCurrentSessionIdentity(owner)) await beginAuthAttempt().run('signOut', { scope: 'local' }).catch(() => {});
        if (!captureSessionIdentity()) router.replace('/welcome');
        Alert.alert('Eliminación registrada', 'Tu solicitud se ha guardado. Si aún ves tu sesión, cierra y vuelve a abrir la app. Te avisaremos por correo al terminar.');
      } else if (current()) setError(cause instanceof Error ? cause.message : 'Comprueba tu conexión e inténtalo de nuevo.');
    } finally { lock.current = false; if (current()) setBusy(false); }
  };

  return <Screen title="Eliminar mi cuenta" back>
    <View style={{ padding: S.lg, gap: S.lg }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
        Eliminaremos tu perfil, publicaciones, mensajes y archivos personales. La cuenta no se podrá recuperar y se detendrán las renovaciones de tus suscripciones.
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
        El proceso puede tardar hasta 30 días. Te avisaremos por correo al terminar. Solo conservaremos los registros necesarios para obligaciones legales, operaciones pendientes y derechos de otras personas, con acceso restringido.
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
        Si usas Iniciar sesión con Apple, retira también el acceso de Franky en los ajustes de tu cuenta Apple. Esto no impide solicitar aquí la eliminación.
      </Text>
      <Btn label="Cómo retirar el acceso de Apple" variant="secondary" onPress={() => {
        void Linking.openURL('https://support.apple.com/es-es/102571').catch(() => setError('No se pudo abrir la ayuda de Apple.'));
      }} />
      {error ? <Text accessibilityLiveRegion="polite" style={[F.body, { color: C.error }]}>{error}</Text> : null}
      <Btn label="Eliminar mi cuenta definitivamente" variant="danger" busy={busy} disabled={busy} onPress={() => {
        if (!current() || lock.current) return;
        Alert.alert('¿Eliminar tu cuenta definitivamente?', 'Esta acción no se puede deshacer. Se cerrará tu sesión y comenzará la eliminación de tus datos.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar definitivamente', style: 'destructive', onPress: remove },
        ]);
      }} />
    </View>
  </Screen>;
}
