// ─── Lista de conversaciones: matches de Crush y grupos de eventos ───────
// La lista viene del RPC get_my_chats (via getMyChats) y se refresca por
// realtime con subscribeToChatList + al recuperar el foco de la pestaña.
// La presencia (punto verde) sale de user_presence en UNA sola query con los
// ids de "el otro" de cada chat directo: fail-soft, sin dato no hay punto.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import {
  MessageCircle, Users, UsersRound, User, Camera, Mic, Video, BarChart3, CalendarDays, Archive, WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { SocialDemoFeatureNotice } from '@/components/SocialDemoFeatureNotice';
import { ensureSocialDemoFeature, useSocialDemoAccessState } from '@/lib/social-demo';
import { Avatar, Chip, EmptyState, OptionsSheet, SkeletonList, Tap, NavRow } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { archiveConversation, getMyChats, subscribeToChatList } from '@/lib/chat';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, FONT } from '@/theme';
import type { ChatListItem } from '@/lib/types';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';

type Filter = 'todos' | 'personas' | 'grupos';

/** "En línea" si hubo actividad hace menos de 2 min (mismo umbral que el chat). */
const ONLINE_MS = 2 * 60 * 1000;

function chatTitle(c: ChatListItem): string {
  return c.other_user?.full_name ?? c.group_name ?? t('chats.groupChatDefault');
}

// get_my_chats resume los adjuntos con un emoji delante ("📷 Foto", "🎙️ Audio",
// "📊 Encuesta: …"). Aquí se convierte en icono + texto: el emoji como icono
// se ve distinto en cada móvil y no sigue el tema.
function previewOf(raw: string | null): { icon: LucideIcon | null; text: string } {
  if (!raw) return { icon: null, text: t('chats.noMessages') };
  const rules: [string, LucideIcon, string | null][] = [
    ['📷', Camera, 'Foto'],
    ['🎙️', Mic, 'Nota de voz'],
    ['🎙', Mic, 'Nota de voz'],
    ['🎥', Video, 'Vídeo'],
    ['📊', BarChart3, null],
    ['📅', CalendarDays, null],
  ];
  for (const [prefix, icon, label] of rules) {
    if (raw.startsWith(prefix)) {
      const rest = raw.slice(prefix.length).trim();
      return { icon, text: label ?? rest };
    }
  }
  return { icon: null, text: raw };
}

// Fila memoizada: la lista se refresca por realtime con cada mensaje y solo
// deben repintarse las filas cuyo item o presencia cambia.
const ChatRow = React.memo(function ChatRow({ item: c, online, onPress, onLongPress }: {
  item: ChatListItem; online: boolean;
  onPress: (c: ChatListItem) => void; onLongPress: (c: ChatListItem) => void;
}) {
  const title = chatTitle(c);
  const unread = c.unread_count > 0;
  const preview = previewOf(c.last_message);
  const PreviewIcon = preview.icon;
  return (
    <Tap onPress={() => onPress(c)} onLongPress={() => onLongPress(c)}
      accessibilityLabel={`${t('chats.chatWithA11y', { title })}${unread ? t('chats.unreadSuffixA11y', { count: c.unread_count }) : ''}${online ? ', en línea' : ''}`}
      accessibilityHint="Mantén pulsado para más opciones">
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: S.lg, paddingVertical: 11,
      }}>
        <View>
          <Avatar name={title} uri={c.other_user?.avatar_url ?? c.group_avatar_url} size={54} />
          {c.is_group ? (
            // Insignia de grupo sobre el avatar (mejora 57).
            <View style={{
              position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10,
              backgroundColor: C.blue, borderWidth: 2, borderColor: C.bg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <UsersRound size={11} color={C.onAccent} strokeWidth={2.4} />
            </View>
          ) : online ? (
            // Punto de presencia: solo en chats 1:1 y solo si el otro está activo.
            <View accessibilityElementsHidden style={{
              position: 'absolute', right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7,
              backgroundColor: C.success, borderWidth: 2.5, borderColor: C.bg,
            }} />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[F.h3, { fontSize: 15.5, flex: 1 }, unread && { fontFamily: FONT.heading }]} numberOfLines={1}>
              {title}
            </Text>
            {c.last_message_at ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, unread && { color: C.accent2, fontFamily: FONT.semibold }]}>
                {timeAgo(c.last_message_at)}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            {PreviewIcon ? <PreviewIcon size={14} color={unread ? C.text : C.muted} strokeWidth={2.1} /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[F.small, { flex: 1, fontSize: 13.5 }, unread && { color: C.text, fontFamily: FONT.medium }]}
              numberOfLines={1}>
              {preview.text}
            </Text>
          </View>
        </View>
        {unread ? (
          <View style={{
            minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent2,
            alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
          }}>
            <Text maxFontSizeMultiplier={1.2} style={{ color: C.onAccent, fontSize: 11.5, fontFamily: FONT.heading }}>
              {c.unread_count > 99 ? '99+' : c.unread_count}
            </Text>
          </View>
        ) : null}
      </View>
    </Tap>
  );
});

export default function Chats() {
  const owner = useSessionOwner();
  const router = useRouter();
  if (!owner) return <Screen title={t('chats.title')}><EmptyState icon={MessageCircle} title={t('chats.emptyAuthTitle')} subtitle={t('chats.emptyAuthBody')} cta={t('common.loginCta')} onCta={() => router.push('/welcome')} /></Screen>;
  return <OwnedChats key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedChats({ owner }: { owner: SessionIdentity }) {
  const isCurrent = useOwnerGuard(owner);
  const { access: demoAccess, retry: retryDemoAccess, checking: checkingDemoAccess } = useSocialDemoAccessState();
  const router = useRouter();
  const [items, setItems] = useState<ChatListItem[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Fallo de carga sin nada en pantalla: se enseña con "Reintentar" en vez del
  // vacío "no tienes chats", que mentía cuando lo que fallaba era la red.
  const [loadErr, setLoadErr] = useState(false);
  // Chat sobre el que se mantiene pulsado (menú de fila: archivar, mejora 43).
  const [menuFor, setMenuFor] = useState<ChatListItem | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  // user_id → last_seen de los otros participantes (solo chats directos).
  const [presence, setPresence] = useState<Record<string, string>>({});

  // Presencia en una sola query. Fail-soft: si la tabla no responde, no hay
  // puntos verdes y la lista sigue igual.
  const loadPresence = useCallback(async (list: ChatListItem[]) => {
    if (!isCurrent()) return;
    const ids = list.map((c) => c.other_user?.id).filter((v): v is string => !!v);
    if (ids.length === 0) { setPresence({}); return; }
    try {
      const { data } = await supabase.from('user_presence').select('user_id, last_seen').in('user_id', ids);
      if (!isCurrent()) return;
      const next: Record<string, string> = {};
      for (const row of (data ?? []) as { user_id: string; last_seen: string | null }[]) {
        if (row.last_seen) next[row.user_id] = row.last_seen;
      }
      setPresence(next);
    } catch { /* sin presencia: no pasa nada */ }
  }, [isCurrent]);

  // Una sola petición a la vez: el foco, el realtime y "tirar para recargar"
  // pueden coincidir. Si llega otra mientras una está en vuelo, se apunta y se
  // repite UNA vez al terminar (nunca se pierde el último cambio).
  const inFlight = useRef<{ fetch: () => Promise<void>; run: Promise<void> } | null>(null);
  const again = useRef(false);
  const fetchList = useCallback(async () => {
    if (!isCurrent()) return;
    // getUser DENTRO del try: fuera, un rechazo (sin red) dejaba items en null
    // y los esqueletos para siempre.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (!user) { setAuthed(false); setItems([]); setLoadErr(false); return; }
      setAuthed(true);
      const list = await getMyChats();
      if (!isCurrent()) return;
      setItems(list);
      setLoadErr(false);
      void loadPresence(list);
    } catch {
      if (!isCurrent()) return;
      // Sin conexión: conservamos lo que hubiera en pantalla.
      setLoadErr(true);
      setItems(prev => prev ?? []);
    }
  }, [loadPresence, isCurrent]);

  const load = useCallback(async () => {
    // Solo se reutiliza la petición de ESTA sesión: tras un cambio de cuenta
    // la de la anterior no cuenta y se lanza una nueva.
    const pending = inFlight.current;
    if (pending && pending.fetch === fetchList) { again.current = true; return pending.run; }
    const run = (async () => {
      do {
        again.current = false;
        await fetchList();
      } while (again.current && isCurrent());
    })();
    const entry = { fetch: fetchList, run };
    inFlight.current = entry;
    try { await run; } finally { if (inFlight.current === entry) inFlight.current = null; }
  }, [fetchList, isCurrent]);

  // Realtime con ráfagas (un grupo activo manda varios mensajes por segundo):
  // se agrupan en una recarga cada 600 ms en vez de una RPC por mensaje.
  const burst = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSoon = useCallback(() => {
    if (burst.current) return;
    burst.current = setTimeout(() => { burst.current = null; void load(); }, 600);
  }, [load]);
  useEffect(() => () => { if (burst.current) clearTimeout(burst.current); }, []);

  useEffect(() => { load(); }, [load]);

  // Al volver a la pestaña (p. ej. tras leer un chat) los contadores cambian.
  // El primer foco coincide con el montaje, que ya ha cargado arriba.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    load();
  }, [load]));

  // Realtime: cualquier mensaje nuevo o alta en conversación refresca la lista.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive || !isCurrent() || user.id !== owner.userId) return;
      channel = subscribeToChatList(user.id, loadSoon);
    })();
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadSoon, isCurrent, owner.userId]);

  const openChat = useCallback((c: ChatListItem) => {
    if (!isCurrent()) return;
    router.push({ pathname: '/chat/[id]', params: { id: c.id, title: chatTitle(c) } });
  }, [router, isCurrent]);

  const openMenu = useCallback((c: ChatListItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMenuFor(c);
  }, []);

  // Archivar (mejora 43): optimista, quita la fila de la lista al momento; si
  // el RPC falla (o la migración 072 aún no está en prod) se recarga la lista
  // real para no dejar el estado local desincronizado.
  const archiveChat = useCallback(async (c: ChatListItem) => {
    if (!isCurrent()) return;
    setMenuFor(null);
    setItems(prev => (prev ?? []).filter(x => x.id !== c.id));
    const res = await archiveConversation(c.id, true);
    if (!isCurrent()) return;
    if (!res.ok) load();
  }, [load, isCurrent]);

  // Los chips de filtro solo aparecen si hay de los dos tipos: con solo
  // personas (o solo grupos) no aportan nada.
  const hasBoth = useMemo(() => {
    const list = items ?? [];
    return list.some((c) => c.is_group) && list.some((c) => !c.is_group);
  }, [items]);

  const visible = useMemo(() => {
    const list = items ?? [];
    if (filter === 'personas') return list.filter((c) => !c.is_group);
    if (filter === 'grupos') return list.filter((c) => c.is_group);
    return list;
  }, [items, filter]);

  // Conjunto de ids "en línea" recalculado solo cuando llega presencia nueva
  // (cada load la refresca): así renderItem no cambia en cada render y las
  // filas memoizadas se saltan el repintado.
  const onlineIds = useMemo(() => {
    const n = Date.now();
    const set = new Set<string>();
    for (const [id, seen] of Object.entries(presence)) {
      if (n - new Date(seen).getTime() < ONLINE_MS) set.add(id);
    }
    return set;
  }, [presence]);

  const renderItem = useCallback(({ item, index }: { item: ChatListItem; index: number }) => (
    <FadeIn index={index} distance={10}>
      <ChatRow item={item} online={!item.is_group && !!item.other_user && onlineIds.has(item.other_user.id)}
        onPress={openChat} onLongPress={openMenu} />
    </FadeIn>
  ), [openChat, openMenu, onlineIds]);

  // Cabecera de la lista: chips de filtro (solo si hay personas Y grupos) y
  // el acceso a Comunidades. Las comunidades NO son conversaciones (viven en
  // su propia tabla y no pasan por get_my_chats), así que no pueden ser un
  // filtro más: van como atajo en fila, con su propio icono.
  const listHeader = authed ? (
    <View style={{ paddingTop: S.sm }}>
      <SocialDemoFeatureNotice access={demoAccess} feature="groups" retry={retryDemoAccess} checking={checkingDemoAccess} />
      {hasBoth ? (
        <View style={{ flexDirection: 'row', paddingHorizontal: S.lg, paddingBottom: S.sm }} accessibilityRole="tablist">
          <Chip label="Todos" accessibilityRole="tab" active={filter === 'todos'} onPress={() => setFilter('todos')} />
          <Chip label="Personas" icon={User} accessibilityRole="tab" active={filter === 'personas'} onPress={() => setFilter('personas')} />
          <Chip label="Grupos" icon={UsersRound} accessibilityRole="tab" active={filter === 'grupos'} onPress={() => setFilter('grupos')} />
        </View>
      ) : null}
      <NavRow icon={Users} title="Comunidades" note="Tu carrera, tu residencia, tus aficiones"
        onPress={() => router.push('/comunidades')} accessibilityLabel="Comunidades del campus" />
    </View>
  ) : null;

  return (
    <>
      <Screen<ChatListItem>
        title={t('chats.title')}
        scrollTopKey="chats"
        right={demoAccess?.demo === false ?
          <Tap onPress={async () => { if (await ensureSocialDemoFeature('groups')) router.push('/nuevo-grupo'); }} accessibilityLabel={t('chats.createGroupA11y')}
            accessibilityHint={t('chats.createGroupHintA11y')} hitSlop={12}
            style={{ width: 32, height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Users size={22} color={C.text} strokeWidth={1.75} />
          </Tap> : null
        }
        refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
        data={visible}
        renderItem={renderItem}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          items === null ? (
            <View style={{ paddingTop: S.md }}>
              <SkeletonList count={6} height={64} />
            </View>
          ) : authed === false ? (
            <EmptyState icon={MessageCircle} title={t('chats.emptyAuthTitle')}
              subtitle={t('chats.emptyAuthBody')}
              cta={t('common.loginCta')} onCta={() => router.push('/welcome')} />
          ) : loadErr ? (
            <EmptyState icon={WifiOff} title="No se pudo cargar"
              subtitle="No pudimos traer tus chats. Revisa tu conexión e inténtalo de nuevo."
              cta="Reintentar" onCta={() => { setItems(null); void load(); }} />
          ) : filter !== 'todos' ? (
            <EmptyState compact icon={MessageCircle}
              title={filter === 'personas' ? 'Sin chats con personas' : 'Sin chats de grupo'}
              subtitle="Cambia el filtro para ver el resto." cta="Ver todos" onCta={() => setFilter('todos')} />
          ) : (
            <EmptyState icon={MessageCircle} title={t('chats.emptyTitle')}
              subtitle={t('chats.emptyBody')} />
          )
        }
      />

      {/* Menú de la fila (mantener pulsado): archivar conversación (mejora 43). */}
      <OptionsSheet visible={!!menuFor} onClose={() => setMenuFor(null)}
        title={menuFor ? chatTitle(menuFor) : undefined}
        options={menuFor ? [{ label: t('chats.archiveConversation'), icon: Archive, onPress: () => archiveChat(menuFor) }] : []} />
    </>
  );
}
