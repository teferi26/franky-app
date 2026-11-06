import { openSocialInstagram, readSocialDemoAccess } from '@/lib/social-demo';
// ─── Momento MATCH ──────────────────────────────────────────────────────────
// Pantalla completa con el degradado de marca, los dos avatares y las dos
// salidas naturales: abrir el chat con esa persona o seguir mirando. Antes
// era un Alert.alert, que se sentía como un error del sistema y no como el
// mejor momento de la app. Se monta UNA vez en la pantalla de Crush y todas
// las pestañas (tablón, descubrir, peticiones) lo disparan por callback.
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Alert, Clipboard } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, AtSign, Copy, Heart } from 'lucide-react-native';
import { Avatar, Tap } from '@/components/ui';
import { SocialDemoBanner } from '@/components/SocialDemoBanner';
import { openCrushChat, reportIgUser, type CrushIdentity } from '@/lib/crush';
import { toast, toastError } from '@/lib/toast';
import { maybeAskForReview } from '@/lib/review';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { BRAND_GRADIENT, FONT, R, S } from '@/theme';

/** Con quién ha habido match. `id` es null cuando el match viene de un post
 *  anónimo del tablón (la RPC solo devuelve el @, no la identidad). */
export interface MatchInfo {
  id: string | null;
  name: string | null;
  avatar: string | null;
  handle: string | null;
  verified?: boolean;
}

// Blanco sobre el degradado de marca (media): el único color fijo. El violeta
// del botón principal es el primer tono del degradado, no un hex suelto.
const WHITE = '#FFFFFF';
const BRAND = BRAND_GRADIENT[0];
const BRAND_2 = BRAND_GRADIENT[1];

function BigButton({ label, icon: Icon, onPress, busy, ghost }: {
  label: string; icon?: typeof MessageCircle; onPress: () => void; busy?: boolean; ghost?: boolean;
}) {
  return (
    <Tap onPress={busy ? undefined : onPress} haptic accessibilityLabel={label} accessibilityState={{ busy: !!busy }}
      style={{
        alignSelf: 'stretch', minHeight: 50, borderRadius: R.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: ghost ? 'rgba(255,255,255,0.16)' : WHITE, borderWidth: ghost ? 1 : 0, borderColor: 'rgba(255,255,255,0.6)',
        opacity: busy ? 0.7 : 1,
      }}>
      {Icon ? <Icon size={18} color={ghost ? WHITE : BRAND} strokeWidth={2.4} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15.5, fontFamily: FONT.semibold, color: ghost ? WHITE : BRAND }}>{label}</Text>
    </Tap>
  );
}

export function MatchModal({ match, me, onClose }: {
  match: MatchInfo | null; me: CrushIdentity | null; onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chatBusy, setChatBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const visible = match !== null;

  // Vibración de éxito y, ya que es un momento feliz, ocasión para pedir
  // reseña (tiene su propio tope interno).
  useEffect(() => {
    if (!visible) return;
    let current = true;
    setReported(false);
    setChatBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void readSocialDemoAccess().then(access => { if (current && access && !access.demo) maybeAskForReview(); });
    return () => { current = false; };
  }, [visible]);

  const openChat = async () => {
    if (!match?.id) return;
    setChatBusy(true);
    const convo = await openCrushChat(match.id);
    setChatBusy(false);
    if (!convo) { toastError('No se pudo abrir el chat', 'Inténtalo de nuevo en unos segundos.'); return; }
    onClose();
    router.push(`/chat/${convo}`);
  };

  const openInstagram = () => {
    if (!match?.handle) return;
    void openSocialInstagram(match.handle);
  };

  // Clipboard sigue disponible en RN 0.81 (deprecado, sin dependencia nueva):
  // se comprueba en runtime por si una actualización lo quita.
  const canCopy = typeof Clipboard?.setString === 'function';
  const copyHandle = () => {
    if (!match?.handle || !canCopy) return;
    Clipboard.setString(`@${match.handle}`);
    toast('Copiado', { body: `@${match.handle}` });
  };

  // report_ig solo lo admite el servidor tras un match mutuo: justo este caso.
  const report = () => {
    if (!match?.id) return;
    const target = match.id;
    Alert.alert(
      'Denunciar Instagram',
      '¿El @ parece falso o no es de esta persona? Lo revisaremos y, si se repite, dejará de mostrarse.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Denunciar', style: 'destructive',
          onPress: async () => {
            const res = await reportIgUser(target, 'falso o no es esta persona');
            if (!res.ok) { toastError('No se pudo denunciar', res.message); return; }
            setReported(true);
            toast('Gracias', { body: 'Lo revisaremos lo antes posible.' });
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* El momento MATCH es la unica pantalla de color pleno de la app:
          violeta SOLIDO (sin degradado) con todo en blanco encima. */}
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: BRAND, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: S.xl }}>
        <SocialDemoBanner />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header"
            style={{ fontSize: 44, fontFamily: FONT.display, color: WHITE, letterSpacing: -1.2, textAlign: 'center' }}>
            ¡Match!
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
            {match?.name ?? 'Esa persona'} también quería tu Instagram.{'\n'}Ya podéis veros.
          </Text>

          {/* Los dos avatares, solapados, con un corazón en medio. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 36 }}>
            <View style={{ borderWidth: 4, borderColor: WHITE, borderRadius: R.full }}>
              <Avatar name={me?.full_name ?? 'Tú'} uri={me?.avatar_url} size={104} />
            </View>
            <View style={{
              width: 44, height: 44, borderRadius: 22, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center',
              marginHorizontal: -14, zIndex: 2, borderWidth: 3, borderColor: BRAND,
            }}>
              <Heart size={22} color={BRAND_2} fill={BRAND_2} strokeWidth={2} />
            </View>
            <View style={{ borderWidth: 4, borderColor: WHITE, borderRadius: R.full }}>
              <Avatar name={match?.name ?? '?'} uri={match?.avatar} size={104} />
            </View>
          </View>

          {match?.handle ? (
            <Tap onPress={openInstagram} accessibilityLabel={`Abrir Instagram de @${match.handle}`}
              style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: R.full, paddingHorizontal: 16, paddingVertical: 9 }}>
              <AtSign size={16} color={WHITE} strokeWidth={2.4} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 17, fontFamily: FONT.heading, color: WHITE }}>{match.handle}</Text>
            </Tap>
          ) : (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ marginTop: 26, color: 'rgba(255,255,255,0.85)', fontSize: 13.5, textAlign: 'center' }}>
              Aún no ha puesto su Instagram. Escríbele por el chat.
            </Text>
          )}
        </View>

        <View style={{ gap: 10 }}>
          {match?.id ? <BigButton label="Abrir chat" icon={MessageCircle} onPress={openChat} busy={chatBusy} /> : null}
          {match?.handle ? (
            <BigButton label={match?.id ? 'Abrir Instagram' : 'Abrir su Instagram'} icon={AtSign} onPress={openInstagram} ghost={!!match?.id} />
          ) : null}
          <BigButton label="Seguir mirando" onPress={onClose} ghost />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 4, minHeight: 22 }}>
            {match?.handle && canCopy ? (
              <Tap onPress={copyHandle} accessibilityLabel="Copiar usuario de Instagram" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Copy size={12} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: FONT.medium }}>Copiar @</Text>
              </Tap>
            ) : null}
            {match?.id ? (
              reported ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Gracias, lo revisaremos.</Text>
              ) : (
                <Tap onPress={report} accessibilityLabel="Denunciar Instagram falso">
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: FONT.medium }}>
                    ¿El Instagram parece falso? Denunciar
                  </Text>
                </Tap>
              )
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
