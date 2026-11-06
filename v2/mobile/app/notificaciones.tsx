import React, { useCallback, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Heart, MessageCircle, Home, Newspaper, Settings2, CheckCheck, WifiOff } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { EmptyState, Tap, SkeletonList, Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useNotificationInbox } from '@/lib/useNotificationInbox';
import { notificationNativeDestination } from '@/lib/notification-destinations';
import { openInboxNotification, type InboxNotification } from '@/lib/notification-inbox';
import { timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R } from '@/theme';

type Row = { kind: 'heading'; id: string; title: string } | { kind: 'notice'; id: string; notice: InboxNotification };
const NoticeRow = React.memo(function NoticeRow({ notice, onPress, disabled }: { notice: InboxNotification; onPress: (notice: InboxNotification) => void; disabled: boolean }) {
  const Icon = notice.type === 'news' ? Newspaper : notice.type === 'accommodation' ? Home : notice.type === 'message' || notice.type === 'comment' ? MessageCircle : notice.type === 'match' || notice.type === 'roomie_like' ? Heart : Bell;
  const link = notificationNativeDestination(notice.data, notice.type);
  const clickable = !!link || !notice.is_read;
  const content = <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: S.lg, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, backgroundColor: C.bg }}>
    <Icon size={20} color={notice.is_read ? C.muted : C.blue} strokeWidth={1.75} style={{ marginTop: 2 }} />
    <View style={{ flex: 1 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 15 }]}>{notice.title}</Text>{notice.body ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 4 }]}>{notice.body}</Text> : null}<Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 6 }]}>{timeAgo(notice.created_at)}</Text></View>
    {!notice.is_read && <View style={{ marginTop: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue }} />}
  </View>;
  return clickable ? <Tap disabled={!link && disabled} onPress={() => onPress(notice)} accessibilityRole="button" accessibilityLabel={`${notice.is_read ? '' : 'Sin leer. '}${notice.title}${notice.body ? '. ' + notice.body : ''}`} accessibilityHint={link ? 'Abre el detalle' : 'Marca el aviso como leído'}>{content}</Tap> : content;
});

export default function Notifications() {
  const { uid } = useSessionIdentity();
  const router = useRouter();
  if (uid === undefined) return <Screen title="Notificaciones" back><SkeletonList count={5} /></Screen>;
  if (!uid) return <Screen title="Notificaciones" back><EmptyState icon={Bell} title="Tus avisos, aquí" subtitle="Inicia sesión para ver tus conversaciones, conexiones y novedades." cta="Iniciar sesión" onCta={() => router.push('/welcome')} /></Screen>;
  return <OwnedInbox key={uid} owner={uid} />;
}

function OwnedInbox({ owner }: { owner: string }) {
  const router = useRouter();
  const { items, loading, loadingMore, hasMore, error, moreError, readError, marking, inbox, isCurrent } = useNotificationInbox(owner);
  const unread = items.filter(item => !item.is_read);
  const open = useCallback(async (notice: InboxNotification) => {
    await openInboxNotification(notice, { isCurrent, markRead: inbox.markRead, destination: notificationNativeDestination(notice.data, notice.type), navigate: path => router.push(path as never) });
  }, [inbox, isCurrent, router]);
  const rows = useMemo<Row[]>(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const week = new Date(today); week.setDate(week.getDate() - 6);
    let previous = '';
    const result: Row[] = [];
    for (const notice of items) {
      const timestamp = new Date(notice.created_at).getTime();
      const title = timestamp >= today.getTime() ? 'Hoy' : timestamp >= week.getTime() ? 'Esta semana' : 'Antes';
      if (title !== previous) result.push({ kind: 'heading', id: 'heading-' + title, title });
      previous = title;
      result.push({ kind: 'notice', id: notice.id, notice });
    }
    return result;
  }, [items]);
  const render = useCallback(({ item, index }: { item: Row; index: number }) => item.kind === 'heading' ? <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.sm }]}>{item.title}</Text> : <FadeIn index={index}><NoticeRow notice={item.notice} onPress={open} disabled={marking.length > 0} /></FadeIn>, [open, marking.length]);
  return <Screen<Row> title="Notificaciones" back data={rows} keyExtractor={item => item.id} renderItem={render} refreshing={loading && items.length > 0} onRefresh={() => void inbox.refresh()}
    right={<Tap accessibilityRole="button" accessibilityLabel="Personalizar notificaciones" onPress={() => router.push('/ajustes-notificaciones')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Settings2 size={22} color={C.blue} strokeWidth={1.9} /></Tap>}
    ListHeaderComponent={<FadeIn style={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.lg, gap: 12 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 26, letterSpacing: -0.9, lineHeight: 30 }]}>Lo que te importa, en un sitio.</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Mensajes, conexiones, novedades y pisos. Abre un aviso para seguir donde toca.</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['/novedades', 'Novedades'], ['/pisos', 'Pisos'], ['/roomie-conexiones', 'Roomie']].map(([path, label]) => <Btn key={path} small variant="ghost" label={label} onPress={() => router.push(path as never)} />)}</View>{unread.length > 0 && <Btn full small icon={CheckCheck} label={`Leer visibles (${unread.length})`} busy={marking.length > 0} onPress={() => void inbox.markRead(unread.map(item => item.id))} />}{(error || moreError || readError) && <View accessibilityRole="alert" style={{ padding: 12, backgroundColor: C.surface, borderRadius: R.md, gap: 8 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{readError ? 'No hemos podido guardar el estado de lectura. Vuelve a intentarlo.' : moreError ? 'No se han cargado los avisos anteriores. Puedes reintentar.' : 'No hemos podido actualizar. Esto es lo último que cargamos.'}</Text>{error && <Btn small label="Reintentar" onPress={() => void inbox.refresh()} />}</View>}</FadeIn>}
    ListEmptyComponent={loading ? <SkeletonList count={4} /> : error ? <EmptyState icon={WifiOff} title="No se han podido cargar tus avisos" subtitle="Revisa tu conexión e inténtalo de nuevo." /> : <EmptyState icon={Bell} title="Cuando pase algo para ti, estará aquí." subtitle="Los nuevos mensajes y los avisos que tengas activados se guardarán en esta bandeja." cta="Ir a mi campus" onCta={() => router.push('/(tabs)/feed')} />}
    ListFooterComponent={<View style={{ padding: S.lg, gap: 12 }}>{hasMore && <Btn full variant="ghost" label="Ver avisos anteriores" disabled={loading} busy={loadingMore} onPress={() => void inbox.loadMore()} />}{items.length > 0 && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>{items.length} avisos cargados. «Leer visibles» marca solo esta lista.</Text>}</View>}
  />;
}
