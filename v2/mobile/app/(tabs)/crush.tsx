// ─── Crush: tablón anónimo del campus + pestañas (Descubrir, Peticiones,
// Matches, Invitar) ─────────────────────────────────────────────────────────
// El tablón es la lista de get_ligar_feed; el resto de pestañas viven en
// src/components/crush/*. Toda la lógica de peticiones de Instagram, deshacer,
// filtros y momento MATCH es la de siempre: aquí solo cambia el acabado.
//
// Diseño: tarjeta de activación y de Crush Live con el kit (IconCircle,
// Card, Btn), botón "¿Eres tú?" en violeta sólido, menú de la publicación
// en OptionsSheet, hoja de pedir Instagram con la superficie del kit,
// esqueletos de lista y textos con tope de escalado de fuente.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Alert, FlatList, RefreshControl,
  ActivityIndicator, Modal, Pressable, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  Heart, MoreHorizontal, AtSign, Flame, Lock, School, Settings, Sparkles, ChevronRight, Flag, Gift, Undo2, Smartphone, Play } from 'lucide-react-native';
import { Screen, Header } from '@/components/Screen';
import {
  Avatar, Tap, EmptyState, Pill, Btn, Chip, SearchBar, OptionsSheet, SkeletonList, Card,
} from '@/components/ui';
import { HomeSwitch } from '@/components/HomeSwitch';
import { FadeIn } from '@/components/motion';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AudioNote } from '@/components/fomo';
import { Lightbox } from '@/components/Lightbox';
import { CrushTabs, type CrushTab } from '@/components/crush/CrushTabs';
import { MatchModal, type MatchInfo } from '@/components/crush/MatchModal';
import { CrushDiscover } from '@/components/crush/CrushDiscover';
import { CrushRequests } from '@/components/crush/CrushRequests';
import { CrushMatches } from '@/components/crush/CrushMatches';
import { CrushInvite } from '@/components/crush/CrushInvite';
import { getCrushLiveEvents, getLigarPosts, reactLigarPost, requestIgForPost, getLigarProfile, setLigarProfile } from '@/lib/api';
import { getCrushPendingCount, getCrushNominationCount, getCrushIdentityFor, type CrushIdentity } from '@/lib/crush';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { useFetchGated } from '@/lib/useFetch';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT, SHADOW } from '@/theme';
import type { LigarPost, LigarProfile } from '@/lib/types';
import { hideSocialContent, confirmSocialAction, useSocialModerationRefresh } from '@/lib/social-moderation';

const PAGE = 20;

// Filtro de audiencia del panel de filtros (33/31): null = sin filtrar.
type AudienceFilter = 'hombre' | 'mujer' | null;

// keyExtractor a nivel de módulo: referencia estable entre renders.
const postKey = (item: LigarPost) => item.id;

// Hoja para pedir el Instagram (30): permite EDITAR el @ que se va a enviar
// (el propio, guardado con set_ligar_profile) antes de confirmar. Sustituye al
// antiguo Alert.alert de confirmación, que no dejaba tocar el handle.
function IgRequestSheet({ visible, initialHandle, busy, onClose, onConfirm }: {
  visible: boolean; initialHandle: string; busy: boolean;
  onClose: () => void; onConfirm: (handle: string) => void;
}) {
  const [handle, setHandle] = useState(initialHandle);
  useEffect(() => { if (visible) setHandle(initialHandle); }, [visible, initialHandle]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose}
          accessibilityLabel="Cerrar" accessibilityRole="button" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 8, paddingHorizontal: S.lg, paddingBottom: 30 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AtSign size={22} color={C.blue} strokeWidth={1.7} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header" style={[F.h2, { flex: 1 }]}>¿Le pides el Instagram?</Text>
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 10, lineHeight: 19 }]}>
            La otra persona recibirá tu petición. Solo cuando ambos queráis se compartirán vuestros usuarios de Instagram.
            Revisa que tu usuario esté bien escrito, es el que se le mostrará.
          </Text>
          <TextInput
            value={handle} onChangeText={setHandle} placeholder="@tuusuario"
            placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Tu usuario de Instagram" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 15.5, color: C.text, marginTop: 14 }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1 }}><Btn full variant="secondary" label="Ahora no" disabled={busy} onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Btn full label="Pedir" icon={AtSign} busy={busy} disabled={!handle.trim()} onPress={() => onConfirm(handle)} /></View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const UNDO_SECONDS = 4;

const CrushPost = React.memo(function CrushPost({ p, optedIn, myHandle, onNeedActivation, onOpenImage, onProfileChanged, onMatch, isSessionCurrent }: {
  isSessionCurrent: () => boolean;
  p: LigarPost; optedIn: boolean; myHandle: string | null;
  onNeedActivation: () => void; onOpenImage: (uri: string) => void; onProfileChanged: () => void;
  onMatch: (m: MatchInfo) => void;
}) {
  const [liked, setLiked] = React.useState(p.my_reaction);
  const router = useRouter();
  const [suppressed, setSuppressed] = useState(false);
  const reacting = useRef(false);
  const phase = useRef<'idle' | 'confirming' | 'pending' | 'sending' | 'sent'>('idle');
  const alive = useRef(true);
  // 'pending' = ventana de deshacer abierta (aún no se ha llamado a la RPC).
  const [igState, setIgState] = React.useState<'idle' | 'pending' | 'sending' | 'sent'>('idle');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [savingHandle, setSavingHandle] = React.useState(false);
  const [undoLeft, setUndoLeft] = React.useState(0);
  // La hoja de Instagram y el menú se montan al abrirlos por primera vez (antes
  // cada post del tablón montaba los dos, con su Modal, aunque nunca se usaran).
  const [sheetsMounted, setSheetsMounted] = React.useState(false);
  useEffect(() => { if (sheetOpen || menuOpen) setSheetsMounted(true); }, [sheetOpen, menuOpen]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { alive.current = true; return () => {
    alive.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }; }, []);
  const isCurrent = useCallback(() => alive.current && isSessionCurrent(), [isSessionCurrent]);
  const likes = p.reaction_count - (p.my_reaction ? 1 : 0) + (liked ? 1 : 0);
  const name = p.is_anonymous ? 'anonimo' : (p.author?.full_name ?? 'estudiante').toLowerCase().replace(/\s+/g, '.');

  const doSend = useCallback(async () => {
    if (!isCurrent() || phase.current !== 'pending') return;
    phase.current = 'sending';
    setIgState('sending');
    try {
      const res = await requestIgForPost(p.id);
      if (!isCurrent()) return;
      if (!res.ok) {
        phase.current = 'idle'; setIgState('idle');
        toastError('No se pudo enviar', 'Comprueba tu conexión y que tienes Crush activado, e inténtalo de nuevo.');
        return;
      }
      phase.current = 'sent'; setIgState('sent');
      if (res.matched && res.instagram) {
        onMatch({ id: p.author?.id ?? null, name: p.author?.full_name ?? null, avatar: p.author?.avatar_url ?? null, handle: res.instagram });
      } else toast('Petición enviada', { body: 'Si esa persona también te pide el tuyo, haréis match.' });
    } catch {
      if (!isCurrent()) return;
      phase.current = 'idle'; setIgState('idle');
      toastError('No se pudo enviar', 'Revisa la conexión e inténtalo de nuevo.');
    }
  }, [p.id, p.author, onMatch, isCurrent]);

  const startPending = useCallback(() => {
    if (!isCurrent() || phase.current !== 'confirming' || timerRef.current !== null) return;
    phase.current = 'pending'; setIgState('pending'); setUndoLeft(UNDO_SECONDS);
    const deadline = Date.now() + UNDO_SECONDS * 1000;
    const localTimer = setInterval(() => {
      if (!isCurrent() || phase.current !== 'pending') {
        clearInterval(localTimer);
        if (timerRef.current === localTimer) timerRef.current = null;
        return;
      }
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setUndoLeft(remaining);
      if (remaining === 0) {
        clearInterval(localTimer);
        if (timerRef.current === localTimer) timerRef.current = null;
        void doSend();
      }
    }, 250);
    timerRef.current = localTimer;
  }, [doSend, isCurrent]);

  const cancelPending = useCallback(() => {
    if (phase.current !== 'pending') return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null; phase.current = 'idle'; setIgState('idle');
  }, []);

  const openSheet = () => {
    if (!isCurrent() || phase.current !== 'idle') return;
    if (!optedIn) { onNeedActivation(); return; }
    setSheetOpen(true);
  };

  const confirmSheet = useCallback(async (handleInput: string) => {
    if (!isCurrent() || phase.current !== 'idle') return;
    phase.current = 'confirming'; setSavingHandle(true);
    try {
      const clean = handleInput.trim().replace(/^@/, '');
      if (!clean) { phase.current = 'idle'; return; }
      if (clean.toLowerCase() !== (myHandle ?? '').toLowerCase()) {
        const res = await setLigarProfile(clean, true);
        if (!isCurrent()) return;
        if (!res.ok) {
          phase.current = 'idle';
          toastError('No se pudo guardar tu Instagram', res.message ?? 'Revísalo e inténtalo de nuevo.');
          return;
        }
        onProfileChanged();
      }
      if (!isCurrent()) return;
      setSheetOpen(false); startPending();
    } catch {
      if (!isCurrent()) return;
      phase.current = 'idle'; toastError('No se pudo guardar tu Instagram', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally { if (isCurrent()) setSavingHandle(false); }
  }, [myHandle, onProfileChanged, startPending, isCurrent]);

  const audience = p.audience === 'hombre' ? 'Para chicos' : p.audience === 'mujer' ? 'Para chicas' : 'Para todos';
  const displayName = `${name}${!p.is_anonymous && p.author?.age ? `, ${p.author.age}` : ''}`;

  return suppressed ? null : (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingBottom: 12, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 10, gap: 10, minHeight: 56 }}>
        <Avatar name={p.is_anonymous ? '?' : name} size={36} ring={!p.is_anonymous} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.username} numberOfLines={1}>{displayName}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{timeAgo(p.created_at)}</Text>
        </View>
        <Pill label={audience} tone={p.audience === 'todos' ? 'gray' : 'red'} />
        <Tap onPress={() => setMenuOpen(true)} accessibilityLabel="Opciones de la publicación" hitSlop={10}
          style={{ width: 32, height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
          <MoreHorizontal size={22} color={C.text} strokeWidth={2} />
        </Tap>
      </View>

      {p.body ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { paddingHorizontal: S.lg, fontSize: 15.5, lineHeight: 22 }]}>{p.body}</Text>
      ) : null}
      {p.media_url && p.media_type === 'image' ? (
        // Tocar la foto la abre a pantalla completa (Lightbox con pinch-to-zoom).
        <Tap onPress={() => onOpenImage(p.media_url!)} accessibilityRole="imagebutton" accessibilityLabel="Ver foto a pantalla completa">
          <Image
            source={{ uri: p.media_url }} recyclingKey={p.id}
            style={{ marginHorizontal: S.lg, marginTop: 10, borderRadius: R.lg, aspectRatio: 4 / 5, backgroundColor: C.input }}
            contentFit="cover" transition={150} cachePolicy="memory-disk"
          />
        </Tap>
      ) : null}
      {p.media_url && p.media_type === 'video' ? (
        // Vídeo embebido (antes abría el navegador externo con WebBrowser).
        <View style={{ marginHorizontal: S.lg, marginTop: 10, aspectRatio: 4 / 5 }}>
          <VideoPlayer uri={p.media_url} radius={R.lg} style={{ width: '100%', height: '100%' }} />
          {/* Blanco fijo sobre el globo oscuro: no depende del tema. */}
          <View pointerEvents="none" style={{
            position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.sm, paddingHorizontal: 7, paddingVertical: 3,
          }}>
            <Play size={11} color="#fff" fill="#fff" />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 10.5, fontFamily: FONT.semibold }}>Vídeo</Text>
          </View>
        </View>
      ) : null}
      {p.media_url && p.media_type === 'audio' ? (
        // Audio embebido (34): mismo reproductor que FOMO (expo-audio), en vez
        // de abrir el navegador externo. Solo se usa si media_type es 'audio'.
        <View style={{ marginHorizontal: S.lg, marginTop: 10 }}>
          <AudioNote uri={p.media_url} />
        </View>
      ) : null}
      {p.offer ? (
        <View style={{ marginHorizontal: S.lg, marginTop: 10, backgroundColor: C.accentSoft, borderRadius: R.md, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Gift size={16} color={C.blue} strokeWidth={2.2} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blue }]}>Qué ofrece</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 3 }]}>{p.offer}</Text>
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 12, marginTop: 10, minHeight: 44 }}>
        <Tap haptic hitSlop={8} accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'} accessibilityState={{ selected: liked }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: 4 }}
          onPress={async () => {
            if (reacting.current || !isCurrent()) return;
            reacting.current = true;
            const previous = liked;
            setLiked(!previous);
            try {
              const res = await reactLigarPost(p.id);
              if (!res.ok) throw new Error('reaction_failed');
              if (res.reacted !== undefined) setLiked(res.reacted);
            } catch { setLiked(previous); toastError('No se pudo reaccionar'); }
            finally { reacting.current = false; }
          }}>
          <Heart size={25} color={liked ? C.accent2 : C.text} fill={liked ? C.accent2 : 'transparent'} strokeWidth={1.9} />
          {likes > 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: liked ? C.accent2 : C.text }}>
              {likes}
            </Text>
          ) : null}
        </Tap>
        <View style={{ flex: 1 }} />
        {p.is_mine ? <Pill label="Tu post" tone="blue" /> : igState === 'sent' ? <Pill label="Pedido" tone="green" /> : igState === 'pending' ? (
          // Ventana de deshacer (30): aún no se ha llamado a la RPC.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Enviando en {undoLeft} s</Text>
            <Tap onPress={cancelPending} accessibilityLabel="Deshacer petición de Instagram" haptic
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.input, borderRadius: R.full, paddingHorizontal: 12, minHeight: 36 }}>
              <Undo2 size={14} color={C.text} strokeWidth={2.2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>Deshacer</Text>
            </Tap>
          </View>
        ) : (
          <Tap onPress={openSheet} disabled={igState === 'sending'} haptic
            accessibilityLabel="¿Eres tú? Pedir el Instagram" accessibilityState={{ busy: igState === 'sending' }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.blue, borderRadius: R.full, paddingHorizontal: 15, minHeight: 36, opacity: igState === 'sending' ? 0.6 : 1 }}>
              {igState === 'sending'
                ? <ActivityIndicator size="small" color={C.onAccent} />
                : <AtSign size={15} color={C.onAccent} strokeWidth={2} />}
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 13.5 }}>¿Eres tú?</Text>
            </View>
          </Tap>
        )}
      </View>
      {sheetsMounted || sheetOpen || menuOpen ? <>
      <IgRequestSheet
        visible={sheetOpen}
        initialHandle={myHandle ? `@${myHandle}` : ''}
        busy={savingHandle}
        onClose={() => setSheetOpen(false)}
        onConfirm={confirmSheet}
      />
      {/* Menú de la publicación: hoy solo denunciar; la confirmación (Alert)
          se lanza cuando la hoja ya se ha cerrado (OptionsSheet lo retrasa). */}
      <OptionsSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={displayName}
        options={p.is_mine ? [] : [
          { label: 'Denunciar publicación', icon: Flag, destructive: true, onPress: () => void confirmSocialAction('crush_post', p.id, false, () => setSuppressed(true)) },
          { label: 'Ocultar publicación', onPress: () => void hideSocialContent('crush_post', p.id, () => setSuppressed(true)) },
          { label: 'Contactar con seguridad', onPress: () => router.push('/centro-seguridad') },
          { label: 'Bloquear a esta persona', destructive: true, onPress: () => void confirmSocialAction('crush_post', p.id, true, () => setSuppressed(true)) },
        ]} />
      </> : null}
    </View>
  );
});

// Banner superior del tablón. Va como cabecera de la lista.
function CrushBanner() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.lg, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
      <Lock size={13} color={C.muted} strokeWidth={2.2} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>Tablón anónimo de tu campus. Si esa persona se reconoce, intercambiáis Instagram.</Text>
    </View>
  );
}

// Gancho de curiosidad (paridad con la web): si hay gente esperando tu
// respuesta, se dice en el tablón y un toque lleva a Peticiones.
function PendingBanner({ count, onPress }: { count: number; onPress: () => void }) {
  if (count <= 0) return null;
  return (
    <Tap onPress={onPress} haptic accessibilityLabel={`${count === 1 ? '1 persona quiere' : `${count} personas quieren`} tu Instagram. Ver peticiones`}
      style={[{ marginHorizontal: S.lg, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: C.blue }, SHADOW.card]}>
      <Flame size={22} color={C.blue} strokeWidth={1.7} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>
          {count === 1 ? '1 persona quiere tu Instagram' : `${count} personas quieren tu Instagram`}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Míralas y acéptalas en Peticiones.</Text>
      </View>
      <ChevronRight size={18} color={C.muted} strokeWidth={2} />
    </Tap>
  );
}

// Panel de filtros del tablón (31): audiencia (chips, sobre el campo real
// `audience` de cada post) + texto libre (nombre del autor, texto o "qué
// ofrece"). El filtrado ocurre en cliente sobre lo ya cargado: get_ligar_feed
// no admite filtrar por universidad (siempre es la del que mira), así que no
// se ofrece ese filtro para no prometer algo que la RPC no hace.
function CrushFilters({ search, onSearchChange, audience, onAudienceChange }: {
  search: string; onSearchChange: (t: string) => void;
  audience: AudienceFilter; onAudienceChange: (a: AudienceFilter) => void;
}) {
  return (
    <View style={{ paddingTop: 12 }}>
      <SearchBar value={search} onChange={onSearchChange} placeholder="Buscar en las publicaciones cargadas" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist"
        contentContainerStyle={{ paddingHorizontal: S.lg, marginBottom: 4 }}>
        <Chip label="Todos" accessibilityRole="tab" active={audience === null} onPress={() => onAudienceChange(null)} />
        <Chip label="Para chicos" accessibilityRole="tab" active={audience === 'hombre'} onPress={() => onAudienceChange(audience === 'hombre' ? null : 'hombre')} />
        <Chip label="Para chicas" accessibilityRole="tab" active={audience === 'mujer'} onPress={() => onAudienceChange(audience === 'mujer' ? null : 'mujer')} />
      </ScrollView>
    </View>
  );
}

// Formulario de activación (o edición/desactivación) del perfil de Crush. La
// validación real (18+, formato del handle) la hace el servidor: aquí solo se
// recoge el @ y se muestran sus mensajes. `nominations` (amigos que te han
// invitado, get_ligar_nomination_count) es el gancho anónimo de la activación.
function CrushProfileForm({ profile, editing, nominations = 0, onDone }: {
  profile: LigarProfile; editing?: boolean; nominations?: number; onDone: () => void;
}) {
  const [handle, setHandle] = useState(profile.instagram_handle ? `@${profile.instagram_handle}` : '');
  const [busy, setBusy] = useState(false);

  if (!profile.eligible) {
    return (
      <Card style={{ marginTop: 12, marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Lock size={22} color={C.muted} strokeWidth={1.7} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>Crush es solo para mayores de 18</Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 8, lineHeight: 19 }]}>
          Podrás activarlo cuando los cumplas. Mientras, puedes cotillear el tablón sin problema.
        </Text>
      </Card>
    );
  }

  const save = async (optIn: boolean) => {
    setBusy(true);
    // finally: si setLigarProfile lanza, el botón se quedaba girando.
    let res: { ok: boolean; message?: string };
    try {
      res = await setLigarProfile(handle.trim(), optIn);
    } catch {
      res = { ok: false, message: 'Revisa tu conexión e inténtalo de nuevo.' };
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      toastError(optIn ? 'No se pudo activar' : 'No se pudo desactivar', res.message ?? 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(optIn ? 'Crush activado' : 'Crush desactivado');
    onDone();
  };

  const deactivate = () => Alert.alert(
    '¿Desactivar Crush?',
    'Dejarás de poder publicar y nadie podrá pedirte el Instagram.',
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: () => save(false) },
    ],
  );

  return (
    <Card style={{ marginTop: 12, marginBottom: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Flame size={22} color={C.blue} strokeWidth={1.7} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header" style={[F.h2, { flex: 1 }]}>{editing ? 'Tu Crush' : 'Activa Crush'}</Text>
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 8, lineHeight: 19 }]}>
        {editing
          ? 'Cambia tu usuario de Instagram o desactiva Crush cuando quieras.'
          : 'Activa Crush para publicar, descubrir gente de tu uni y que te pidan el Instagram. Tu @ solo se comparte si hay match.'}
      </Text>
      {!editing && nominations > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: C.accentSoft, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Sparkles size={15} color={C.accent2} strokeWidth={2.2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text, fontFamily: FONT.semibold, flex: 1 }]}>
            {nominations === 1 ? 'Un amigo cree que encajarías aquí' : `${nominations} amigos creen que encajarías aquí`}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 14, minHeight: 48, marginTop: 12 }}>
        <AtSign size={16} color={C.muted} strokeWidth={2.2} />
        <TextInput
          value={handle} onChangeText={setHandle} placeholder="tuusuario"
          placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false}
          accessibilityLabel="Tu usuario de Instagram" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ flex: 1, fontSize: 15.5, color: C.text, paddingVertical: 0, marginLeft: 6 }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Btn full label={editing ? 'Guardar' : 'Activar Crush'} icon={editing ? undefined : Flame} busy={busy} disabled={!handle.trim()} onPress={() => save(true)} />
        </View>
        {editing ? <Btn label="Desactivar" variant="danger" disabled={busy} onPress={deactivate} /> : null}
      </View>
    </Card>
  );
}

// Cabecera de la lista: banner + estado del perfil de Crush (activación si
// falta, acceso discreto a ajustes si ya está activo) + gancho de peticiones
// + acceso a Crush Live (matches por afinidad en eventos oficiales).
function CrushHeader({ profile, onChanged, search, onSearchChange, audience, onAudienceChange, pending, nominations, onGoRequests, editing, onToggleEditing, liveEventCount, onOpenLive, onOpenTap }: {
  profile: LigarProfile | null; onChanged: () => void;
  search: string; onSearchChange: (t: string) => void;
  audience: AudienceFilter; onAudienceChange: (a: AudienceFilter) => void;
  pending: number; nominations: number; onGoRequests: () => void;
  editing: boolean; onToggleEditing: () => void;
  liveEventCount: number; onOpenLive: () => void;
  onOpenTap: () => void;
}) {
  return (
    <View style={{ paddingBottom: profile ? 12 : 0 }}>
      <CrushBanner />
      <Tap onPress={onOpenTap} haptic accessibilityLabel="Abrir Franky Tap: acercad los móviles y hacéis match">
        <View style={{
          marginHorizontal: S.lg, marginTop: 12, padding: 20, borderRadius: 24,
          backgroundColor: C.input, borderWidth: 1, borderColor: C.border,
          flexDirection: 'row', alignItems: 'center', gap: 14,
        }}>
          <Smartphone size={34} color={C.accent2} strokeWidth={1.6} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Franky Tap · Acercad los móviles</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
              Junta tu móvil con el suyo y hacéis match al instante: chat abierto y, si los dos tenéis Crush, su Instagram.
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.accent2, fontFamily: FONT.heading }]}>Abrir Franky Tap →</Text>
          </View>
        </View>
      </Tap>
      <Tap onPress={onOpenLive} haptic accessibilityLabel="Ver gente y matches de mis eventos">
        <View style={{ marginHorizontal: S.lg, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Heart size={18} color={C.accent2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>
            {liveEventCount > 0 ? 'Descubrir gente de mis eventos' : 'Mis matches de eventos'}
          </Text>
          <ChevronRight size={18} color={C.accent2} />
        </View>
      </Tap>
      <CrushFilters search={search} onSearchChange={onSearchChange} audience={audience} onAudienceChange={onAudienceChange} />
      {profile && !profile.opted_in ? <CrushProfileForm profile={profile} nominations={nominations} onDone={onChanged} /> : null}
      {profile?.opted_in ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, marginTop: 8, gap: 6, minHeight: 36 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.success }} accessibilityElementsHidden />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]} numberOfLines={1}>
            Crush activo{profile.instagram_handle ? ` como @${profile.instagram_handle}` : ''}
          </Text>
          <Tap onPress={onToggleEditing} accessibilityLabel="Ajustes de Crush" accessibilityState={{ selected: editing }} hitSlop={6}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: editing ? C.accentSoft : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={17} color={editing ? C.blue : C.muted} strokeWidth={2} />
          </Tap>
        </View>
      ) : null}
      {profile?.opted_in && editing ? (
        <CrushProfileForm profile={profile} editing onDone={() => { onToggleEditing(); onChanged(); }} />
      ) : null}
      {profile?.opted_in ? <PendingBanner count={pending} onPress={onGoRequests} /> : null}
    </View>
  );
}

export default function Crush() {
  const { uid, isCurrent } = useSessionIdentity();
  if (uid === undefined) return <SkeletonList />;
  return <CrushSession key={uid ?? 'signed-out'} uid={uid} isSessionCurrent={isCurrent} />;
}

function CrushSession({ uid, isSessionCurrent }: { uid: string | null; isSessionCurrent: () => boolean }) {
  const router = useRouter();
  const feedGeneration = useRef(0);
  const nextOffset = useRef(0);
  const initialBusy = useRef(true);
  const fetcher = useCallback(async () => {
    const current = ++feedGeneration.current;
    initialBusy.current = true;
    try {
      const result = await getLigarPosts({ limit: PAGE, offset: 0 });
      if (current === feedGeneration.current) nextOffset.current = result.rows.length;
      return result;
    } finally { if (current === feedGeneration.current) initialBusy.current = false; }
  }, []);
  const { rows, gate, refreshing, refresh, error: feedError } = useFetchGated<LigarPost>(fetcher);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') feedGeneration.current++;
    });
    return () => { feedGeneration.current++; sub.subscription.unsubscribe(); };
  }, []);

  const [profile, setProfile] = useState<LigarProfile | null>(null);
  const [liveEventCount, setLiveEventCount] = useState(0);
  const loadProfile = useCallback(async () => {
    try { const value = await getLigarProfile(); if (isSessionCurrent()) setProfile(value); } catch { /* sin red: se conserva el perfil que hubiera */ }
  }, []);
  const loadLiveEvents = useCallback(async () => {
    try { const value = await getCrushLiveEvents(); if (isSessionCurrent()) setLiveEventCount(value.length); }
    catch { setLiveEventCount(0); }
  }, []);
  // Recarga el perfil al entrar y cuando cambia la sesión (el gate lo refleja).
  useEffect(() => {
    if (gate !== 'ok') return;
    loadProfile();
    loadLiveEvents();
  }, [gate, loadProfile, loadLiveEvents]);

  const optedIn = !!profile?.opted_in;
  const myHandle = profile?.instagram_handle ?? null;

  // Pestaña activa. Tablón es la de siempre; el resto son la paridad con la
  // web (Descubrir, Peticiones, Matches, Invitar).
  const [tab, setTab] = useState<CrushTab>('wall');

  // Contadores: peticiones pendientes (badge) solo con Crush activo;
  // invitaciones recibidas solo cuando aún no lo has activado (gancho).
  const [pending, setPending] = useState(0);
  const [nominations, setNominations] = useState(0);
  const loadCounts = useCallback(async () => {
    if (gate !== 'ok' || !profile) return;
    try {
      if (profile.opted_in) { const value = await getCrushPendingCount(); if (isSessionCurrent()) setPending(value); }
      else { const value = await getCrushNominationCount(); if (isSessionCurrent()) setNominations(value); }
    } catch { /* sin red: los contadores se quedan como estaban */ }
  }, [gate, profile]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Mi nombre y avatar para el momento MATCH (una sola vez por sesión).
  const [me, setMe] = useState<CrushIdentity | null>(null);
  // Con el id ya conocido: sin auth.getUser, que va a la red y retiene el
  // candado de auth mientras el tablón intenta cargar.
  useEffect(() => { if (gate === 'ok' && uid) getCrushIdentityFor(uid).then(value => { if (isSessionCurrent()) setMe(value); }).catch(() => {}); }, [gate, uid]);

  // Match a celebrar (null = modal cerrado) y clave para que Matches se
  // recargue cuando aparece uno nuevo desde otra pestaña.
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [matchesKey, setMatchesKey] = useState(0);
  const onMatch = useCallback((m: MatchInfo) => {
    setMatch(m);
    setMatchesKey((k) => k + 1);
    loadCounts();
  }, [loadCounts]);

  // Scroll infinito: `rows` (del hook gated) es siempre la página 0; `extra`
  // acumula las páginas siguientes y se vacía en cada refresh.
  const [extra, setExtra] = useState<LigarPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [footerBusy, setFooterBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const loadingMore = useRef(false);
  useEffect(() => { setExtra([]); setMoreError(false); setHasMore((rows?.length ?? 0) === PAGE); }, [rows]);

  // Dedup por id: si entran posts nuevos entre página y página, el offset se
  // desplaza y una página puede repetir algún post.
  const data = useMemo(() => {
    const seen = new Set<string>();
    return [...(rows ?? []), ...extra].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [rows, extra]);

  // Filtro por audiencia y texto (31): se aplica en cliente sobre lo ya
  // cargado (get_ligar_feed ya viene acotado a la universidad y audiencia
  // visibles para quien mira; aquí solo se acota más, no se pide más red).
  // El texto busca en el nombre del autor (si no es anónimo), el cuerpo y
  // "qué ofrece": son los únicos campos de texto que existen en LigarPost.
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>(null);
  const visibleData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((p) => {
      if (audienceFilter && p.audience !== audienceFilter) return false;
      if (!q) return true;
      const name = !p.is_anonymous && p.author?.full_name ? p.author.full_name.toLowerCase() : '';
      const body = (p.body ?? '').toLowerCase();
      const offer = (p.offer ?? '').toLowerCase();
      return name.includes(q) || body.includes(q) || offer.includes(q);
    });
  }, [data, search, audienceFilter]);
  const filtering = !!search.trim() || !!audienceFilter;
  const clearFilters = useCallback(() => { setSearch(''); setAudienceFilter(null); }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || initialBusy.current || !hasMore || gate !== 'ok' || feedError) return;
    const current = feedGeneration.current;
    loadingMore.current = true;
    setFooterBusy(true); setMoreError(false);
    try {
      const r = await getLigarPosts({ limit: PAGE, offset: nextOffset.current });
      if (current !== feedGeneration.current) return;
      nextOffset.current += r.rows.length;
      setExtra(prev => [...prev, ...r.rows]);
      setHasMore(r.rows.length === PAGE);
    } catch { if (current === feedGeneration.current) setMoreError(true); }
    finally { loadingMore.current = false; setFooterBusy(false); }
  }, [hasMore, gate, feedError]);

  const onRefresh = useCallback(() => {
    loadProfile();
    loadLiveEvents();
    refresh();
  }, [loadProfile, loadLiveEvents, refresh]);
  useSocialModerationRefresh(onRefresh);

  // Cualquier pestaña puede pedir "activa Crush": se vuelve al tablón, arriba
  // del todo, donde está la tarjeta de activación.
  const listRef = useRef<FlatList<LigarPost>>(null);
  const goActivate = useCallback(() => {
    setTab('wall');
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 50);
    toastInfo('Activa Crush primero', 'Pon tu usuario de Instagram en la tarjeta de arriba.');
  }, []);

  // Ajustes del perfil (editar @ / desactivar) desplegados en la cabecera.
  // El estado vive aquí y no en CrushHeader porque el header se recrea con
  // cada cambio de dependencias y perdía el desplegable.
  const [editing, setEditing] = useState(false);
  const toggleEditing = useCallback(() => setEditing((e) => !e), []);

  // Imagen abierta en el Lightbox (null = cerrado). Se monta una sola instancia
  // al final de la pantalla y cada post pide abrir su foto por callback.
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const openImage = useCallback((uri: string) => setLightboxUri(uri), []);

  const renderItem = useCallback(
    ({ item, index }: { item: LigarPost; index: number }) => (
      <FadeIn index={index} distance={12}>
        <CrushPost p={item} optedIn={optedIn} myHandle={myHandle} isSessionCurrent={isSessionCurrent}
          onNeedActivation={goActivate} onOpenImage={openImage} onProfileChanged={loadProfile} onMatch={onMatch} />
      </FadeIn>
    ),
    [optedIn, myHandle, goActivate, openImage, loadProfile, onMatch],
  );
  const goRequests = useCallback(() => setTab('requests'), []);
  const goDiscover = useCallback(() => setTab('discover'), []);
  const openTap = useCallback(() => { router.push('/tap'); }, [router]);

  // Crush Live: con eventos disponibles entra al mazo; sin ellos, al historial.
  const openLive = useCallback(() => {
    router.push(liveEventCount > 0 ? '/crush-live' : '/crush-live?view=matches');
  }, [router, liveEventCount]);
  const header = useMemo(() => (
    <CrushHeader profile={profile} onChanged={onRefresh}
      search={search} onSearchChange={setSearch}
      audience={audienceFilter} onAudienceChange={setAudienceFilter}
      pending={pending} nominations={nominations} onGoRequests={goRequests}
      editing={editing} onToggleEditing={toggleEditing}
      liveEventCount={liveEventCount} onOpenLive={openLive} onOpenTap={openTap} />
  ), [profile, onRefresh, search, audienceFilter, pending, nominations, goRequests, editing, toggleEditing, liveEventCount, openLive, openTap]);

  const publishBtn = (
    <Tap onPress={() => router.push({ pathname: '/publicar', params: { type: 'crush' } })} accessibilityLabel="Publicar en Crush"
      accessibilityHint="Abre el editor para publicar tu crush" hitSlop={6}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
      <Flame size={19} color={C.text} strokeWidth={2.1} />
    </Tap>
  );
  const screenChrome = { logo: <HomeSwitch active="crush" />, right: publishBtn, refreshing, onRefresh, scrollTopKey: 'feed' };

  // Gates a pantalla completa: variante clásica con children (banner + estado).
  if (gate === 'loading') {
    return (
      <Screen {...screenChrome}>
        <CrushBanner />
        <View style={{ paddingTop: S.lg }}>
          <SkeletonList count={3} height={220} radius={R.lg} gap={S.md} />
        </View>
      </Screen>
    );
  }
  if (gate === 'no-auth') {
    return (
      <Screen {...screenChrome}>
        <CrushBanner />
        <EmptyState icon={Lock} title="El tablón es privado"
          subtitle="Solo estudiantes con cuenta pueden ver los crushes de su campus. Entra para cotillear."
          cta="Iniciar sesión" onCta={() => router.push('/welcome')} />
      </Screen>
    );
  }
  if (gate === 'no-profile') {
    return (
      <Screen {...screenChrome}>
        <CrushBanner />
        <EmptyState icon={School} title="Completa tu perfil"
          subtitle="Necesitamos saber tu universidad para enseñarte los crushes de tu campus."
          cta="Ir al perfil" onCta={() => router.push('/perfil')} />
      </Screen>
    );
  }

  // Tablón cargado. FlatList propia (con el Header compartido) porque la
  // variante de lista de Screen no expone onEndReached ni footer; se replican
  // sus ajustes, salvo removeClippedSubviews (rompería el TextInput de la
  // cabecera en Android). paddingBottom 130 = hueco del tab bar flotante.
  // Sin resultados por los filtros (31) es un caso distinto de "no hay
  // crushes": hay posts, pero ninguno pasa el filtro actual.
  const emptyState = feedError ? (
    <EmptyState icon={Heart} title="No se pudo cargar Crush" subtitle="Revisa tu conexión. No sabemos aún si hay publicaciones." cta="Reintentar" onCta={onRefresh}/>
  ) : filtering ? (
    <EmptyState icon={Heart} title="Sin resultados con estos filtros"
      subtitle="Prueba con otro texto o quita el filtro de audiencia."
      cta="Quitar filtros" onCta={clearFilters} />
  ) : (
    <EmptyState icon={Heart} title="Aún no hay crushes"
      subtitle="Abre el tablón con una historia, un plan o ese cruce de miradas. Tú eliges si publicas en anónimo."
      cta="Publicar mi crush" onCta={() => router.push({ pathname: '/publicar', params: { type: 'crush' } })} />
  );

  // Las pestañas nuevas gestionan su propia carga (skeleton, vacío, error con
  // reintento) y solo necesitan saber si Crush está activo y a quién avisar
  // cuando hay match o cambia el contador.
  let body: React.ReactNode;
  switch (tab) {
    case 'discover':
      body = <CrushDiscover optedIn={optedIn} onActivate={goActivate} onMatch={onMatch} />;
      break;
    case 'requests':
      body = <CrushRequests optedIn={optedIn} onActivate={goActivate} onChanged={loadCounts} onMatch={onMatch} />;
      break;
    case 'matches':
      body = <CrushMatches optedIn={optedIn} onActivate={goActivate} reloadKey={matchesKey} onGoDiscover={goDiscover} />;
      break;
    case 'invite':
      body = <CrushInvite optedIn={optedIn} onActivate={goActivate} />;
      break;
    default:
      body = (
        <FlatList<LigarPost>
          ref={listRef}
          data={visibleData}
          renderItem={renderItem}
          keyExtractor={postKey}
          ListHeaderComponent={<>{header}{feedError && data.length > 0 ? <View style={{ padding: S.lg, gap: 8 }}><Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No se pudo actualizar. Estás viendo la última carga.</Text><Btn label="Reintentar" variant="secondary" onPress={onRefresh}/></View> : null}</>}
          ListEmptyComponent={emptyState}
          ListFooterComponent={footerBusy
            ? <ActivityIndicator size="small" color={C.muted} style={{ marginVertical: S.lg }} />
            : moreError || (filtering && hasMore) ? <View style={{ padding: S.lg, gap: 8 }}><Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{moreError ? 'No se cargó la siguiente página.' : 'La búsqueda se aplica a lo que has cargado.'}</Text><Btn label={moreError ? 'Reintentar' : 'Buscar en más publicaciones'} variant="secondary" onPress={loadMore}/></View> : null}
          onEndReached={moreError ? undefined : loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 130 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} colors={[C.blue]} />}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={11}
        />
      );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header logo={<HomeSwitch active="crush" />} right={publishBtn} />
      <CrushTabs active={tab} onChange={setTab} pending={pending} />
      {body}
      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
      <MatchModal match={match} me={me} onClose={() => setMatch(null)} />
    </View>
  );
}
