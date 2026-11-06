// ─── Conversación: mensajes en tiempo real, texto, fotos y notas de voz ──
// Mensajes por query directa (getMessages) + canal realtime subscribeToChat.
// El INSERT propio también llega por el canal: se dedupe por id y, para los
// optimistas, reemplazando el mensaje temporal equivalente.
//
// Diseño: burbujas agrupadas por autor (cola solo en la última de la racha),
// separadores de fecha en píldora, hora y estado de envío dentro de la
// burbuja, reacciones como píldoras solapadas, compositor que crece hasta 5
// líneas con envío en violeta sólido, adjuntos en una hoja y botón flotante de
// "nuevos mensajes" cuando llega algo estando lejos del final.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, Animated,
  ActivityIndicator, Alert, Pressable, Modal, StyleSheet, Switch, ScrollView, RefreshControl,
  type ListRenderItem, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  Send, Image as ImageIcon, Mic, Play, Pause, MoreVertical, Check, CheckCheck, ChevronLeft, X,
  Search, ChevronUp, ChevronDown, BarChart3, Plus, CalendarDays, MapPin, Clock, Ban, Reply, Forward,
  Pencil, Trash2, Phone, Video, User, Users, Palette, Bell, BellOff, Archive, Flag, LogOut,
  Sparkles, Moon, Sunset, Leaf, ImagePlus, MessageCircle, type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap, OptionsSheet, Avatar, SearchBar, Btn, Pill, Skeleton, type SheetOption } from '@/components/ui';
import { Lightbox } from '@/components/Lightbox';
import { SocialDemoBanner } from '@/components/SocialDemoBanner';
import { Screen } from '@/components/Screen';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { SocialDemoFeatureNotice } from '@/components/SocialDemoFeatureNotice';
import { ensureSocialDemoFeature, useSocialDemoAccessState } from '@/lib/social-demo';
import { useVoiceRecorder, fmtDur } from '@/components/VoiceRecorder';
import { VideoPlayer } from '@/components/VideoPlayer';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import {
  getMessages, getMessagesBefore, CHAT_FIRST_PAGE, sendTextMessage, sendImageMessage, sendAudioMessage, sendVideoMessage, markChatRead,
  subscribeToChat, subscribeToReactions, getMyChats,
  editMessage, deleteMessage, getMessageReactions, setMessageReaction,
  muteConversation, getConversationMuted, getPresence, bumpLastSeen,
  archiveConversation, forwardMessage, leaveGroupChat, getGroupMembers,
  getChatPolls, createChatPoll, voteChatPoll, getChatPollResults, subscribeToChatPolls,
  type ChatMessageExt, type MessageReaction, type GroupMember, type ChatPoll, type PollResult,
} from '@/lib/chat';
import { clearActiveConversation, setActiveConversation } from '@/lib/active-conversation';
import { CHAT_THEMES, getChatTheme, setChatTheme, themeById, type ChatTheme, type ChatThemeId } from '@/lib/chat-themes';
import { signedChatMediaUrl, normalizeImage } from '@/lib/media';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import type { ChatListItem } from '@/lib/types';
import { C, S, F, R, FONT, SHADOW } from '@/theme';

// Emojis de la fila de reacciones rápida (mantener pulsado un mensaje). Son
// contenido (la reacción en sí), no iconos: por eso se quedan como emoji.
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😍', '👍'] as const;

// Iconos de la hoja de temas: viven aquí (UI) y no en chat-themes.ts (datos).
const THEME_ICON: Record<ChatThemeId, LucideIcon> = {
  franky: Sparkles, medianoche: Moon, ocaso: Sunset, menta: Leaf, clasico: Palette,
};

// Formateadores compartidos (crear un Intl.DateTimeFormat por burbuja es caro).
const TIME_FMT = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const DAY_FMT = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const DAY_YEAR_FMT = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Etiqueta de presencia legible a partir del last_seen del otro. "en línea" si
// hubo actividad hace menos de 2 min; si no, "últ. vez hace X". Fail-soft: sin
// dato devuelve null y la cabecera solo muestra el nombre.
function presenceLabel(lastSeen: string | null): string | null {
  if (!lastSeen) return null;
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 0) return 'en línea';
  if (diff < 2 * 60 * 1000) return 'en línea';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `últ. vez hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `últ. vez hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `últ. vez hace ${days} d`;
}

// Elemento del hilo unificado (mejora 58): un mensaje, una encuesta/quedada o
// un separador de fecha, todos con marca de tiempo para mezclarlos en orden.
type FeedItem =
  | { kind: 'msg'; key: string; ts: string; msg: ChatMessageExt }
  | { kind: 'poll'; key: string; ts: string; poll: ChatPoll }
  | { kind: 'date'; key: string; ts: string; label: string };

// keyExtractor a nivel de módulo: referencia fija entre renders de la FlatList.
const feedKeyExtractor = (it: FeedItem) => it.key;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// "Hoy", "Ayer" o "vie, 25 jul" (con año si no es el actual).
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (dayKey(iso) === dayKey(now.toISOString())) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Ayer';
  try {
    return (d.getFullYear() === now.getFullYear() ? DAY_FMT : DAY_YEAR_FMT).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

function timeLabel(iso: string): string {
  try { return TIME_FMT.format(new Date(iso)); } catch { return ''; }
}

// Dos mensajes forman una "racha" del mismo autor si van seguidos y con menos
// de 5 minutos entre ellos: la racha comparte cola y espaciado.
const RUN_GAP_MS = 5 * 60 * 1000;
function sameRun(a: ChatMessageExt, b: ChatMessageExt): boolean {
  if (a.sender_id !== b.sender_id) return false;
  if (a.publishing_organization_id !== b.publishing_organization_id) return false;
  if (a.message_type === 'system' || b.message_type === 'system') return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < RUN_GAP_MS;
}

// Fecha/hora legible de una quedada en español ("vie, 25 jul · 20:30").
function formatMeetupDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${DAY_FMT.format(d)} · ${TIME_FMT.format(d)}`;
  } catch {
    return iso;
  }
}

// Texto corto para citar un mensaje (barra de respuesta y recuadro de la
// burbuja): imagen y audio se resumen con una palabra, el resto es su contenido.
function quoteText(m: ChatMessageExt): string {
  if (m.is_deleted) return 'Mensaje eliminado';
  if (m.message_type === 'image') return 'Foto';
  if (m.message_type === 'audio') return 'Nota de voz';
  if (m.message_type === 'video') return 'Vídeo';
  return m.content ?? '';
}

// Resalta las coincidencias de la búsqueda dentro del texto de un mensaje
// (mejora 40): trocea el contenido por cada aparición de `query` (sin
// distinguir mayúsculas) y pinta esa parte con un fondo del acento cálido.
function HighlightedText({ text, query, style }: {
  text: string; query: string; style: { color: string; fontSize: number; lineHeight: number };
}) {
  if (!query) return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={style}>{text}</Text>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(needle, start);
  let key = 0;
  while (idx !== -1) {
    if (idx > start) parts.push(<Text maxFontSizeMultiplier={MAX_FONT_SCALE} key={key++} style={style}>{text.slice(start, idx)}</Text>);
    parts.push(
      <Text key={key++} style={[style, { backgroundColor: `${C.accent3}66`, borderRadius: 3 }]}>
        {text.slice(idx, idx + needle.length)}
      </Text>,
    );
    start = idx + needle.length;
    idx = lower.indexOf(needle, start);
  }
  if (start < text.length) parts.push(<Text maxFontSizeMultiplier={MAX_FONT_SCALE} key={key++} style={style}>{text.slice(start)}</Text>);
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE}>{parts}</Text>;
}

// Chip de nota de voz con play/pausa (expo-audio). Componente propio porque
// useAudioPlayer es un hook y necesita vivir por mensaje. El color del texto
// viene del tema activo (burbuja propia degradada vs ajena clara u oscura).
function AudioChip({ url, fg, durationMs }: { url: string | null; fg: string; durationMs?: number }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (!url) return;
    if (status.playing) { player.pause(); return; }
    // Al acabar, el player se queda al final: rebobinamos para poder repetir.
    if (status.duration > 0 && status.currentTime >= status.duration - 0.05) {
      player.seekTo(0);
    }
    player.play();
  };
  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const pos = status.playing || status.currentTime > 0 ? status.currentTime * 1000 : 0;
  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0;
  return (
    <Tap hitSlop={8} onPress={toggle} disabled={!url} accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, minWidth: 170 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${fg}26`, alignItems: 'center', justifyContent: 'center' }}>
          {status.playing
            ? <Pause size={16} color={fg} strokeWidth={2} fill={fg} />
            : <Play size={16} color={fg} strokeWidth={2} fill={fg} style={{ marginLeft: 2 }} />}
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          {/* Barra de progreso simple: se rellena con el tono del texto. */}
          <View style={{ height: 3, borderRadius: 2, backgroundColor: `${fg}40`, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: fg }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Mic size={11} color={fg} strokeWidth={2.2} style={{ opacity: 0.8 }} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: fg, fontSize: 11.5, opacity: 0.85 }}>
              {total > 0 ? fmtDur(status.playing ? pos : total) : 'Nota de voz'}
            </Text>
          </View>
        </View>
      </View>
    </Tap>
  );
}

// Dimensiones de la imagen dentro de la burbuja a partir del meta guardado.
function imageSize(meta: ChatMessageExt['attachment_meta']): { width: number; height: number } {
  const w = 230;
  const ratio = meta?.width && meta?.height ? meta.width / meta.height : 1;
  return { width: w, height: Math.min(320, Math.max(120, Math.round(w / ratio))) };
}

// Tres puntos que suben y bajan mientras el otro escribe. Con "reducir
// movimiento" se quedan quietos.
function TypingDots({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anims = dots.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 140),
      Animated.timing(v, { toValue: -4, duration: 260, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay(420 - i * 140),
    ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots, reduceMotion]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, transform: [{ translateY: v }] }} />
      ))}
    </View>
  );
}

// Separador de fecha en píldora sobre el fondo del chat.
function DatePill({ label, theme }: { label: string; theme: ChatTheme }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 10 }} accessibilityRole="header">
      <View style={{ backgroundColor: theme.bubbleOther, borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 4, opacity: 0.92 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11.5, fontFamily: FONT.semibold, color: theme.mutedOnWallpaper }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

type BubbleProps = {
  msg: ChatMessageExt; mine: boolean; mediaUrl: string | null; theme: ChatTheme;
  // Mensaje citado ya resuelto (texto corto) o null si no es respuesta. Es un
  // string plano (no objeto) para que la comparación del memo sea por valor.
  replyText: string | null;
  // Reacciones agregadas de este mensaje (emoji + total por emoji).
  reactions: { emoji: string; count: number }[];
  // Posición dentro de la racha del mismo autor: la primera lleva el nombre
  // (en grupos) y la última la cola y el avatar.
  first: boolean; last: boolean;
  // Solo en grupos y mensajes ajenos: nombre (primera de la racha) y avatar
  // (última de la racha). `avatarSlot` reserva el hueco aunque no toque avatar.
  senderName: string | null; senderAvatar: string | null; avatarSlot: boolean;
  time: string;
  onLongPress: (msg: ChatMessageExt) => void;
  onImagePress: (url: string) => void;
  // Búsqueda activa (mejora 40): texto a resaltar y si es la coincidencia actual.
  highlightQuery: string | null;
  current: boolean;
};

// Memoizada con comparador explícito (rendimiento): las props son primitivas
// o referencias estables (tema, reacciones compartidas, setters), así que
// teclear en el compositor o el aviso de "escribiendo" no repinta el historial.
const Bubble = React.memo(function Bubble({
  msg, mine, mediaUrl, theme, replyText, reactions, first, last, senderName, senderAvatar, avatarSlot,
  time, onLongPress, onImagePress, highlightQuery, current,
}: BubbleProps) {
  if (msg.message_type === 'system') {
    return (
      <View style={{ alignItems: 'center', paddingHorizontal: S.xl, marginVertical: 8 }}>
        <View style={{ backgroundColor: theme.bubbleOther, borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 5, opacity: 0.9 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', color: theme.mutedOnWallpaper }]}>{msg.content}</Text>
        </View>
      </View>
    );
  }
  const deleted = msg.is_deleted === true;
  const isImage = msg.message_type === 'image' && !deleted;
  const isVideo = msg.message_type === 'video' && !deleted;
  const isMedia = (isImage || isVideo) && !!msg.attachment_url;
  const fg = mine ? theme.bubbleMineText : theme.bubbleOtherText;
  const isTemp = msg.id.startsWith('temp-');
  const textStyle = { color: fg, fontSize: 15, lineHeight: 21 };

  // Hora + estado de envío (reloj = pendiente, un tick = entregado, dos =
  // leído). Dentro de la burbuja, como en cualquier app de mensajes moderna.
  const meta = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end', marginTop: isMedia ? 0 : 2, marginLeft: 8 }}>
      <Text maxFontSizeMultiplier={1.3} style={{ color: fg, fontSize: 10.5, opacity: 0.7 }}>{time}</Text>
      {mine && !deleted ? (
        isTemp ? <Clock size={12} color={fg} strokeWidth={2.2} style={{ opacity: 0.7 }} />
          : msg.read_at ? <CheckCheck size={13} color={fg} strokeWidth={2.4} />
            : <Check size={13} color={fg} strokeWidth={2.4} style={{ opacity: 0.7 }} />
      ) : null}
    </View>
  );

  const placeholder = (
    <View style={{ ...imageSize(msg.attachment_meta), borderRadius: R.md, backgroundColor: `${theme.mutedOnWallpaper}33`, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={fg} />
    </View>
  );

  const body = deleted ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ban size={14} color={fg} strokeWidth={2} style={{ opacity: 0.7 }} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...textStyle, fontStyle: 'italic', opacity: 0.75 }}>Mensaje eliminado</Text>
    </View>
  ) : isImage && msg.attachment_url ? (
    mediaUrl ? (
      <Image source={{ uri: mediaUrl }} recyclingKey={msg.id}
        style={{ ...imageSize(msg.attachment_meta), borderRadius: R.md }}
        contentFit="cover" cachePolicy="memory-disk" transition={120} accessibilityLabel="Foto del chat" />
    ) : placeholder
  ) : isVideo && msg.attachment_url ? (
    mediaUrl ? (
      <VideoPlayer uri={mediaUrl} style={{ ...imageSize(msg.attachment_meta), borderRadius: R.md }} contentFit="cover" radius={R.md} />
    ) : placeholder
  ) : msg.message_type === 'audio' && msg.attachment_url ? (
    <AudioChip url={mediaUrl} fg={fg} durationMs={msg.attachment_meta?.duration} />
  ) : (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={textStyle}>
      {highlightQuery ? <HighlightedText text={msg.content ?? ''} query={highlightQuery} style={textStyle} /> : msg.content}
      {/* "editado" al final del texto cuando el mensaje se editó (050). */}
      {msg.edited_at && !deleted ? (
        <Text style={{ color: fg, fontSize: 11, opacity: 0.6 }}>  editado</Text>
      ) : null}
    </Text>
  );

  // Recuadro del mensaje citado, encima del contenido, con barra de color:
  // blanca translúcida en la propia, del color del tema en la ajena.
  const quote = replyText != null && !deleted ? (
    <View style={{
      borderLeftWidth: 3,
      borderLeftColor: mine ? 'rgba(255,255,255,0.8)' : theme.bubbleMine[0],
      backgroundColor: mine ? 'rgba(255,255,255,0.16)' : `${theme.bubbleMine[0]}14`,
      borderRadius: R.sm, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 6,
    }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: fg, fontSize: 11, fontFamily: FONT.semibold, opacity: 0.85, marginBottom: 1 }}>
        {mine ? 'Respuesta' : 'En respuesta a'}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={{ color: fg, fontSize: 13, opacity: 0.85 }}>{replyText}</Text>
    </View>
  ) : null;

  const tight = isMedia && !quote;
  const bubbleStyle = {
    maxWidth: '78%' as const, borderRadius: R.lg, overflow: 'hidden' as const,
    paddingHorizontal: tight ? 3 : 12, paddingVertical: tight ? 3 : 8,
    opacity: isTemp ? 0.7 : 1,
    // Cola sutil: solo la última burbuja de la racha pierde el redondeo del
    // lado del autor, como en iMessage.
    ...(last ? (mine ? { borderBottomRightRadius: 5 } : { borderBottomLeftRadius: 5 }) : null),
    // Coincidencia actual de la búsqueda (mejora 40): aro de color para ubicarla.
    ...(current ? { borderWidth: 2, borderColor: C.accent3 } : null),
  };
  const total = reactions.reduce((n, r) => n + r.count, 0);

  // En las fotos/vídeos la hora va superpuesta abajo a la derecha, en una
  // píldora oscura (blanco sobre media: es el único caso con color fijo).
  const inner = tight ? (
    <View>
      {body}
      <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#FFFFFF', fontSize: 10.5 }}>{time}</Text>
        {mine ? (
          isTemp ? <Clock size={12} color="#FFFFFF" strokeWidth={2.2} />
            : msg.read_at ? <CheckCheck size={13} color="#FFFFFF" strokeWidth={2.4} />
              : <Check size={13} color="#FFFFFF" strokeWidth={2.4} style={{ opacity: 0.8 }} />
        ) : null}
      </View>
    </View>
  ) : (
    <View>
      {msg.organization_label ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: fg, fontFamily: FONT.semibold, fontSize: 12, marginBottom: 5 }}>Equipo de {msg.organization_label}</Text> : null}
      {quote}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
        <View style={{ flexShrink: 1 }}>{body}</View>
        {meta}
      </View>
    </View>
  );

  return (
    <View style={{
      paddingHorizontal: S.lg, marginTop: first ? 8 : 2, marginBottom: total > 0 ? 10 : 0,
      alignItems: mine ? 'flex-end' : 'flex-start',
    }}>
      {senderName ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
          style={{ fontSize: 12, fontFamily: FONT.semibold, color: theme.mutedOnWallpaper, marginLeft: avatarSlot ? 34 : 4, marginBottom: 3 }}>
          {senderName}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '100%' }}>
        {avatarSlot ? (
          <View style={{ width: 28 }}>
            {last ? <Avatar name={senderName ?? undefined} uri={senderAvatar} size={28} /> : null}
          </View>
        ) : null}
        <Pressable
          onLongPress={deleted || isTemp ? undefined : () => onLongPress(msg)}
          delayLongPress={260}
          onPress={isImage && mediaUrl ? () => onImagePress(mediaUrl) : undefined}
          accessibilityRole={isImage && mediaUrl ? 'imagebutton' : 'text'}
          accessibilityLabel={isImage ? 'Foto del chat, mantén pulsado para más opciones' : `${mine ? 'Tú' : (senderName ?? 'Mensaje')}: ${quoteText(msg)}, ${time}. Mantén pulsado para responder o reaccionar`}
          style={{ flexShrink: 1 }}>
          {mine ? (
            // Burbuja propia: color SÓLIDO del tema (v3 Editorial, sin degradados
            // en superficies). Se toma el primer color de la paleta del tema.
            <View style={[bubbleStyle, { backgroundColor: theme.bubbleMine[0] }]}>
              {inner}
            </View>
          ) : (
            <View style={[bubbleStyle, { backgroundColor: theme.bubbleOther }]}>
              {inner}
            </View>
          )}
        </Pressable>
      </View>

      {/* Píldora de reacciones solapada con el borde inferior de la burbuja. */}
      {total > 0 ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -8,
          marginLeft: avatarSlot ? 40 : 6, marginRight: 6,
          alignSelf: mine ? 'flex-end' : 'flex-start',
          backgroundColor: theme.bubbleOther,
          borderColor: `${theme.mutedOnWallpaper}55`, borderWidth: 0.5,
          borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 2,
        }}
          accessible accessibilityLabel={`${total} ${total === 1 ? 'reacción' : 'reacciones'}: ${reactions.map((r) => r.emoji).join(' ')}`}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12 }}>{reactions.map(r => r.emoji).join('')}</Text>
          {total > 1 ? <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, fontFamily: FONT.semibold, color: theme.mutedOnWallpaper }}>{total}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}, (a, b) => (
  a.msg === b.msg && a.mine === b.mine && a.mediaUrl === b.mediaUrl && a.theme === b.theme
  && a.replyText === b.replyText && a.reactions === b.reactions && a.first === b.first && a.last === b.last
  && a.senderName === b.senderName && a.senderAvatar === b.senderAvatar && a.avatarSlot === b.avatarSlot
  && a.time === b.time && a.onLongPress === b.onLongPress && a.onImagePress === b.onImagePress
  && a.highlightQuery === b.highlightQuery && a.current === b.current
));

// Reacciones vacías compartidas: la misma referencia para todos los mensajes
// sin reacciones, para no romper el memo de Bubble con un [] nuevo por render.
const NO_REACTIONS: { emoji: string; count: number }[] = [];

// Tarjeta de encuesta/quedada dentro del hilo (mejora 58). Neutra (no "mía" ni
// "ajena": la vota cualquier participante), con barra de progreso por opción y
// la fecha/lugar destacados arriba cuando es una quedada.
function PollCard({ poll, results, theme, onVote }: {
  poll: ChatPoll; results: PollResult[]; theme: ChatTheme; onVote: (optionIndex: number) => void;
}) {
  const votesByIdx = new Map(results.map((r) => [r.option_index, r]));
  const totalVotes = results.reduce((n, r) => n + r.votes, 0);
  const isMeetup = !!(poll.meetup_at || poll.meetup_place);
  const closed = !!poll.closed_at;
  const cardBorder = `${theme.mutedOnWallpaper}33`;
  const accent = theme.bubbleMine[0];

  return (
    <View style={{ paddingHorizontal: S.lg, marginVertical: 8, alignItems: 'center' }}>
      <View style={{
        maxWidth: '88%', width: '100%', borderRadius: R.lg, padding: 14,
        backgroundColor: theme.bubbleOther, borderWidth: 0.5, borderColor: cardBorder,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {isMeetup ? <CalendarDays size={15} color={accent} strokeWidth={2.2} /> : <BarChart3 size={15} color={accent} strokeWidth={2.2} />}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: accent, fontFamily: FONT.semibold, fontSize: 12.5, letterSpacing: 0.3 }}>
            {isMeetup ? 'QUEDADA' : 'ENCUESTA'}
          </Text>
        </View>
        {isMeetup ? (
          <View style={{ marginBottom: 10, gap: 3 }}>
            {poll.meetup_at ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.bubbleOtherText, fontSize: 14, fontFamily: FONT.semibold }}>
                {formatMeetupDate(poll.meetup_at)}
              </Text>
            ) : null}
            {poll.meetup_place ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <MapPin size={13} color={theme.mutedOnWallpaper} strokeWidth={2} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedOnWallpaper, fontSize: 12.5 }} numberOfLines={1}>{poll.meetup_place}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.bubbleOtherText, fontSize: 15.5, fontFamily: FONT.heading, marginBottom: 10 }}>
          {poll.question}
        </Text>

        {poll.options.map((opt, i) => {
          const r = votesByIdx.get(i);
          const votes = r?.votes ?? 0;
          const mine = r?.mine ?? false;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          return (
            <Tap key={i} onPress={closed ? undefined : () => onVote(i)} disabled={closed} haptic
              accessibilityLabel={`${opt}, ${votes} ${votes === 1 ? 'voto' : 'votos'}${mine ? ', tu voto' : ''}`}
              accessibilityState={{ selected: mine }}
              style={{ marginBottom: 8 }}>
              <View style={{ borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: mine ? accent : cardBorder, minHeight: 44, justifyContent: 'center' }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: `${accent}22` }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 }}>
                  {mine ? <Check size={15} color={accent} strokeWidth={2.6} /> : null}
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2}
                    style={{ color: theme.bubbleOtherText, fontSize: 13.5, fontFamily: mine ? FONT.semibold : FONT.medium, flex: 1 }}>
                    {opt}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedOnWallpaper, fontSize: 12, fontFamily: FONT.semibold }}>
                    {votes > 0 ? `${pct}% · ${votes}` : '0%'}
                  </Text>
                </View>
              </View>
            </Tap>
          );
        })}

        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.mutedOnWallpaper, fontSize: 11.5, marginTop: 2 }}>
          {closed ? 'Encuesta cerrada' : poll.multi ? 'Puedes elegir varias opciones' : 'Una opción por persona'}
          {' · '}{totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
        </Text>
      </View>
    </View>
  );
}

export default function ChatDetalle() {
  const owner = useSessionOwner();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!owner) return <Screen title="Chat" back><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { padding: S.lg }]}>Inicia sesión para ver tus conversaciones.</Text></Screen>;
  return <OwnedChatDetalle key={`${owner.userId}:${owner.generation}:${String(id)}`} owner={owner} />;
}

function OwnedChatDetalle({ owner }: { owner: SessionIdentity }) {
  const isCurrent = useOwnerGuard(owner);
  const { access: demoAccess, retry: retryDemoAccess, checking: checkingDemoAccess } = useSocialDemoAccessState();
  const { id, housing } = useLocalSearchParams<{ id: string; housing?: string }>();
  const chatId = String(id);
  const [sentHousingContexts, setSentHousingContexts] = useState<string[]>([]);
  const housingContextKey = `${chatId}:${housing}`;
  const housingListingId = typeof housing === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(housing)
    && !sentHousingContexts.includes(housingContextKey) ? housing : undefined;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  // Tema del chat (elección personal, AsyncStorage por conversación).
  const [theme, setTheme] = useState<ChatTheme>(themeById('franky'));
  // Quién es "el otro" en un chat 1:1 (para Ver perfil / Reportar / Bloquear).
  // Sale de get_my_chats, la única vía segura de resolver al otro participante.
  const [other, setOther] = useState<{ id: string; name: string | null } | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  // Foto de la cabecera (del otro o del grupo), también de get_my_chats.
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(null);
  const [confirmedTitle, setConfirmedTitle] = useState('Chat');
  const [messages, setMessages] = useState<ChatMessageExt[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Tirar para recargar: el gesto (y el botón Reintentar) llaman a load().
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [sendingImage, setSendingImage] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  // URLs firmadas del bucket privado chat-media, cacheadas por path con su
  // caducidad (el TTL de la firma es 1h: sin esto, un chat abierto mucho rato
  // acabaría con imágenes en 403).
  const [mediaUrls, setMediaUrls] = useState<Record<string, { url: string; expiresAt: number }>>({});
  const pendingUrls = useRef<Set<string>>(new Set());
  const myIdRef = useRef<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  // "Escribiendo…" del otro (broadcast de realtime, sin tabla) + borrador.
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = `franky_chat_draft_v2_${owner.userId}_${chatId}`;

  // Responder citando / editar: solo uno activo a la vez (elegir uno limpia el
  // otro). replyTo pinta la barra de cita; editing carga el texto en el input.
  const [replyTo, setReplyTo] = useState<ChatMessageExt | null>(null);
  const [editing, setEditing] = useState<ChatMessageExt | null>(null);
  // Mensaje sobre el que se abrió la hoja de acciones (mantener pulsado).
  const [actionMsg, setActionMsg] = useState<ChatMessageExt | null>(null);
  // Reacciones de los mensajes visibles + visor de foto + hoja de adjuntos.
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  // Presencia del otro y estado de silencio de la conversación.
  const [presence, setPresence] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  // Miembros del grupo (mejora 57): se cargan solo si isGroup y se muestran en
  // una hoja aparte desde el menú. "Salir del grupo" reusa leaveGroupChat.
  const [groupMembers, setGroupMembers] = useState<GroupMember[] | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  // Encuestas y quedadas del chat (mejora 58): polls trae la metadata;
  // pollResults, el recuento por encuesta (get_chat_poll agrega los votos).
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const [pollResults, setPollResults] = useState<Record<string, PollResult[]>>({});
  const [pollFormOpen, setPollFormOpen] = useState(false);

  // Buscar dentro de la conversación (mejora 40): lupa de la cabecera abre un
  // campo que filtra la lista a los mensajes de texto que coinciden y permite
  // saltar entre ellos con las flechas.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const flatListRef = useRef<FlatList<FeedItem>>(null);

  // Reenviar mensaje (mejora 37): mensaje elegido en la hoja de acciones que
  // abre el selector de conversación destino.
  const [forwardMsg, setForwardMsg] = useState<ChatMessageExt | null>(null);

  // Fondo personalizado del chat (mejora 44): imagen del carrete guardada por
  // conversación en AsyncStorage. Si no hay, se usa el tema de color de siempre.
  const [bgImage, setBgImage] = useState<string | null>(null);
  const bgKey = `franky_chat_bg_v2_${owner.userId}_${chatId}`;

  // Botón flotante "nuevos mensajes": la lista está invertida, así que "lejos
  // del final" es un contentOffset.y grande. Se cuenta cuántos mensajes ajenos
  // llegan mientras el usuario está arriba leyendo el historial.
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const awayRef = useRef(false);
  const [unseen, setUnseen] = useState(0);
  const fabScale = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner.userId) return;
      myIdRef.current = user?.id ?? null;
      setMyId(user?.id ?? null);
      const rows = await getMessages(chatId);
      if (!isCurrent()) return;
      setMessages(rows);
      setHasOlder(rows.length >= CHAT_FIRST_PAGE);
      setFailed(false);
      markChatRead(chatId); // best-effort
    } catch {
      if (!isCurrent()) return;
      setFailed(true);
      setMessages(prev => prev ?? []);
    }
  }, [chatId, isCurrent, owner.userId]);

  useEffect(() => { load(); }, [load]);

  // Historial por páginas: la primera carga trae los últimos CHAT_FIRST_PAGE
  // mensajes y, al subir hasta arriba, se piden los anteriores de 50 en 50.
  // Antes el historial más antiguo simplemente no se podía ver.
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderBusy = useRef(false);
  const loadOlder = useCallback(async () => {
    if (!hasOlder || olderBusy.current || !isCurrent()) return;
    const oldest = (messages ?? []).find(m => !m.id.startsWith('temp-'));
    if (!oldest) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const older = await getMessagesBefore(chatId, oldest.created_at, 50);
      if (!isCurrent()) return;
      setMessages(prev => {
        const base = prev ?? [];
        const seen = new Set(base.map(m => m.id));
        return [...older.filter(m => !seen.has(m.id)), ...base];
      });
      setHasOlder(older.length === 50);
    } catch {
      // Sin red: se reintenta al volver a llegar arriba.
    } finally {
      olderBusy.current = false;
      if (isCurrent()) setLoadingOlder(false);
    }
  }, [hasOlder, messages, chatId, isCurrent]);

  // Mientras este chat esté delante, sus avisos no saltan como banner.
  useEffect(() => {
    setActiveConversation(chatId);
    return () => clearActiveConversation(chatId);
  }, [chatId]);

  const onRefresh = useCallback(async () => {
    if (!isCurrent()) return;
    setRefreshing(true);
    try { await load(); } finally { if (isCurrent()) setRefreshing(false); }
  }, [load, isCurrent]);

  // Borrador: recupera lo que estaba escrito al salir del chat.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(draftKey).then((d) => { if (alive && isCurrent() && d) setText(d); }).catch(() => {});
    return () => { alive = false; };
  }, [draftKey, isCurrent]);

  // Canal de "escribiendo…" por broadcast (efímero, sin tabla). Se recibe el
  // aviso del otro y se apaga solo a los 3,5 s sin nuevas señales.
  useEffect(() => {
    const ch = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'typing' }, (payload) => {
      if (!isCurrent()) return;
      const from = (payload.payload as { from?: string } | undefined)?.from;
      if (from && from !== myIdRef.current) {
        setOtherTyping(true);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setOtherTyping(false), 3500);
      }
    }).subscribe();
    typingChannelRef.current = ch;
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      supabase.removeChannel(ch);
    };
  }, [chatId, isCurrent]);

  // Cada cambio del texto: guarda el borrador y avisa "escribiendo…" (máx. 1
  // señal cada 2 s para no saturar el canal).
  const onChangeText = useCallback((t: string) => {
    if (!isCurrent()) return;
    setText(t);
    AsyncStorage.setItem(draftKey, t).catch(() => {});
    const now = Date.now();
    if (t.length > 0 && now - lastTypingSent.current > 2000 && typingChannelRef.current && myIdRef.current) {
      lastTypingSent.current = now;
      typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { from: myIdRef.current } });
    }
  }, [draftKey, isCurrent]);

  // Fondo de imagen guardado localmente (mejora 44). Fail-soft: sin dato, null.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(bgKey).then((v) => { if (alive && isCurrent()) setBgImage(v || null); }).catch(() => {});
    return () => { alive = false; };
  }, [bgKey, isCurrent]);

  // Tema guardado + datos de la conversación + estado de silencio (fail-soft:
  // sin red, tema por defecto y menú sin las opciones que dependen del otro).
  useEffect(() => {
    let alive = true;
    getChatTheme(chatId).then((t) => { if (alive) setTheme(t); });
    getConversationMuted(chatId).then((m) => { if (alive) setMuted(m); }).catch(() => {});
    getMyChats()
      .then((chats) => {
        if (!alive || !isCurrent()) return;
        const conv = chats.find((c) => c.id === chatId);
        if (!conv) return;
        setConfirmedTitle(conv.other_user?.full_name ?? conv.group_name ?? 'Chat');
        setIsGroup(conv.is_group);
        setHeaderAvatar(conv.other_user?.avatar_url ?? conv.group_avatar_url ?? null);
        if (conv.other_user) setOther({ id: conv.other_user.id, name: conv.other_user.full_name });
      })
      .catch(() => { /* sin acceso verificado, la cabecera permanece genérica */ });
    return () => { alive = false; };
  }, [chatId, isCurrent]);

  // Miembros del grupo (mejora 57): solo hace falta si la conversación es de
  // grupo. Fail-soft: sin red, la hoja de miembros se queda cargando.
  useEffect(() => {
    if (!isGroup) { setGroupMembers(null); return; }
    let alive = true;
    getGroupMembers(chatId).then((rows) => { if (alive) setGroupMembers(rows); }).catch(() => {});
    return () => { alive = false; };
  }, [isGroup, chatId]);

  // Índice de miembros por id para poner nombre y avatar a cada racha ajena.
  const membersById = useMemo(() => {
    const map = new Map<string, GroupMember>();
    for (const m of groupMembers ?? []) map.set(m.id, m);
    return map;
  }, [groupMembers]);

  // ── Encuestas y quedadas (mejora 58) ──────────────────────────────────────
  // Carga la lista de encuestas de la conversación y, para cada una, su
  // recuento de votos. Fail-soft: si la migración aún no está en prod,
  // getChatPolls devuelve [] y el chat sigue funcionando igual.
  const loadPolls = useCallback(async () => {
    if (!isCurrent()) return;
    let rows: ChatPoll[];
    try {
      rows = await getChatPolls(chatId);
    } catch {
      return; // sin red: se conservan las encuestas que ya estaban en pantalla
    }
    if (!isCurrent()) return;
    setPolls(rows);
    if (rows.length === 0) return;
    // allSettled, no all: con Promise.all bastaba que fallase el recuento de
    // UNA encuesta para que no se pintase el de ninguna.
    const settled = await Promise.allSettled(
      rows.map(async (p) => [p.id, await getChatPollResults(p.id)] as const),
    );
    if (!isCurrent()) return;
    setPollResults((prev) => {
      const next = { ...prev };
      for (const s of settled) {
        if (s.status === 'fulfilled') next[s.value[0]] = s.value[1];
      }
      return next;
    });
  }, [chatId, isCurrent]);

  useEffect(() => { loadPolls(); }, [loadPolls]);

  // Realtime: cualquier cambio en las encuestas o los votos de este chat
  // recarga la lista completa (barato: pocas encuestas por conversación).
  const loadPollsRef = useRef(loadPolls);
  useEffect(() => { loadPollsRef.current = loadPolls; }, [loadPolls]);
  useEffect(() => {
    const ch = subscribeToChatPolls(chatId, () => loadPollsRef.current());
    return () => { supabase.removeChannel(ch); };
  }, [chatId]);

  // Respaldo del realtime de encuestas: cada mensaje nuevo vuelve a pedirlas.
  // Crear una encuesta inserta también un mensaje ancla (migración 148) que SÍ
  // llega en directo, así que la tarjeta aparece en cuanto llega ese mensaje
  // aunque la publicación de chat_polls no esté en producción todavía.
  const numMensajes = messages?.length ?? 0;
  useEffect(() => {
    if (numMensajes > 0) loadPollsRef.current();
  }, [numMensajes]);

  // Votar una opción: confirma con el servidor y refresca el recuento; si
  // falla, un toast (no un Alert: no es destructivo).
  const onVotePoll = useCallback(async (poll: ChatPoll, optionIndex: number) => {
    if (!isCurrent()) return;
    const res = await voteChatPoll(poll.id, optionIndex);
    if (!isCurrent()) return;
    if (res.ok) {
      try {
        const fresh = await getChatPollResults(poll.id);
        if (!isCurrent()) return;
        setPollResults((prev) => ({ ...prev, [poll.id]: fresh }));
      } catch { /* el realtime lo traerá */ }
    } else {
      toastError('No se pudo votar', 'Inténtalo de nuevo en unos segundos.');
    }
  }, [isCurrent]);

  // Salir del grupo (mejora 57): destructivo, así que sí lleva confirmación.
  const leaveGroup = useCallback(() => {
    Alert.alert('Salir del grupo', '¿Seguro que quieres salir de este grupo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          if (!isCurrent()) return;
          const res = await leaveGroupChat(chatId);
          if (!isCurrent()) return;
          if (!res.ok) { toastError('No se pudo salir del grupo', 'Inténtalo de nuevo.'); return; }
          if (router.canGoBack()) router.back(); else router.replace('/(tabs)/chats');
        },
      },
    ]);
  }, [chatId, router, isCurrent]);

  // Presencia: al abrir un 1:1 marcamos nuestra propia actividad y leemos la del
  // otro. Heartbeat cada 60 s mientras el chat está abierto (bump_last_seen).
  useEffect(() => {
    bumpLastSeen();
    const iv = setInterval(() => { bumpLastSeen(); }, 60000);
    return () => clearInterval(iv);
  }, [chatId]);

  useEffect(() => {
    if (isGroup || !other) { setPresence(null); return; }
    let alive = true;
    const read = () => getPresence(other.id).then((p) => { if (alive) setPresence(p.lastSeen); }).catch(() => {});
    read();
    // Refresca la etiqueta de presencia cada 45 s (por si el otro se conecta).
    const iv = setInterval(read, 45000);
    return () => { alive = false; clearInterval(iv); };
  }, [isGroup, other]);

  // ── Menú: perfil, llamadas, tema, silenciar y moderación ──────────────────
  // Menús largos en OptionsSheet (Alert en Android corta a 3 botones); las
  // confirmaciones destructivas sí van con Alert nativo.
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Reportar al otro usuario: user_reports con context 'chat', el mismo insert
  // (y mapa de razones → enum de la migración 010) que hace la web en useChat.
  const submitReport = useCallback(async (reason: string, label: string) => {
    if (!isCurrent() || !other || !myIdRef.current) return;
    const { error } = await withOwnedRequest(owner, async request => await request.query(supabase.from('user_reports').insert({
      reporter_id: myIdRef.current,
      reported_user_id: other.id,
      context: 'chat',
      reason,
      description: label,
    }))).catch(() => ({ error: { code: 'request_failed' } }));
    if (!isCurrent()) return;
    // 23505 = ya reportado antes (UNIQUE): para el usuario es lo mismo.
    if (error && error.code !== '23505') {
      toastError('No se pudo enviar', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    toast('Gracias', 'Hemos recibido tu denuncia. La revisaremos lo antes posible.');
  }, [other, owner, isCurrent]);

  // Silenciar/activar: preferencia del participante (set_conversation_muted).
  // Optimista y con reversión si el RPC falla (o aún no está en prod).
  const toggleMute = useCallback(async () => {
    if (!isCurrent()) return;
    const next = !muted;
    setMuted(next);
    const res = await muteConversation(chatId, next);
    if (!isCurrent()) return;
    if (!res.ok) { setMuted(!next); toastError('No se pudo cambiar', 'Inténtalo de nuevo.'); return; }
    toast(next ? 'Chat silenciado' : 'Sonido activado');
  }, [muted, chatId, isCurrent]);

  // Archivar (mejora 43): tras el RPC, salimos del chat (ya no aparece en la
  // lista). Fail-soft: si falla, avisamos y nos quedamos en la conversación.
  const archiveChat = useCallback(async () => {
    if (!isCurrent()) return;
    const res = await archiveConversation(chatId, true);
    if (!isCurrent()) return;
    if (!res.ok) { toastError('No se pudo archivar', 'Inténtalo de nuevo.'); return; }
    toast('Conversación archivada');
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/chats');
  }, [chatId, router, isCurrent]);

  // Fondo del chat con foto propia (mejora 44): imagen del carrete guardada en
  // AsyncStorage por conversación. Elegir un tema de color de siempre quita la
  // imagen (vuelve al modo color); la imagen no depende de ninguna migración.
  const pickBackground = useCallback(async () => {
    if (!isCurrent()) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
      if (!isCurrent() || res.canceled || !res.assets?.[0]) return;
      const uri = res.assets[0].uri;
      setBgImage(uri);
      AsyncStorage.setItem(bgKey, uri).catch(() => {});
    } catch {
      toastError('No se pudo abrir el carrete');
    }
  }, [bgKey, isCurrent]);

  const clearBackground = useCallback(() => {
    if (!isCurrent()) return;
    setBgImage(null);
    AsyncStorage.removeItem(bgKey).catch(() => {});
  }, [bgKey, isCurrent]);

  // Bloquear: insert en user_blocks (RLS blocker_id = auth.uid()). get_my_chats
  // ya excluye las conversaciones con bloqueados, así que basta con volver.
  const blockOther = useCallback(() => {
    if (!isCurrent() || !other || !myIdRef.current) return;
    Alert.alert(
      `Bloquear a ${other.name ?? 'este usuario'}`,
      'Dejaréis de ver este chat y no podrá contactarte. Puedes deshacerlo desde la web.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear', style: 'destructive',
          onPress: async () => {
            if (!isCurrent()) return;
            const { error } = await withOwnedRequest(owner, async request => await request.query(supabase.from('user_blocks').insert({
              blocker_id: myIdRef.current, blocked_id: other.id,
            }))).catch(() => ({ error: { code: 'request_failed' } }));
            if (!isCurrent()) return;
            if (error && error.code !== '23505') {
              toastError('No se pudo bloquear', 'Inténtalo de nuevo.');
              return;
            }
            if (router.canGoBack()) router.back(); else router.replace('/(tabs)/chats');
          },
        },
      ],
    );
  }, [other, router, owner, isCurrent]);

  // Llamada de voz o vídeo (app/llamada/[id].tsx): `id` es el uid del otro.
  const startCall = useCallback(async (kind: 'audio' | 'video') => {
    if (!isCurrent() || !other) return;
    if (!await ensureSocialDemoFeature('calls')) return;
    if (!isCurrent()) return;
    router.push({ pathname: '/llamada/[id]', params: { id: other.id, kind } });
  }, [other, router, isCurrent]);

  const menuOptions = useMemo<SheetOption[]>(() => {
    const options: SheetOption[] = [];
    if (!isGroup && other) {
      options.push({ label: 'Ver perfil', icon: User, onPress: () => router.push(`/perfil/${other.id}`) });
      if (demoAccess?.demo === false) {
        options.push({ label: 'Llamar', icon: Phone, onPress: () => startCall('audio') });
        options.push({ label: 'Videollamada', icon: Video, onPress: () => startCall('video') });
      }
    }
    if (isGroup) {
      options.push({ label: 'Ver miembros', icon: Users, onPress: () => setMembersOpen(true) });
    }
    options.push({ label: 'Tema del chat', icon: Palette, onPress: () => setThemeOpen(true) });
    options.push({ label: muted ? 'Activar sonido' : 'Silenciar', icon: muted ? Bell : BellOff, onPress: toggleMute });
    options.push({ label: 'Archivar conversación', icon: Archive, onPress: archiveChat });
    if (!isGroup && other) {
      options.push({ label: 'Reportar', icon: Flag, destructive: true, onPress: () => setReportOpen(true) });
      options.push({ label: 'Bloquear', icon: Ban, destructive: true, onPress: blockOther });
    }
    if (isGroup) {
      options.push({ label: 'Salir del grupo', icon: LogOut, destructive: true, onPress: leaveGroup });
    }
    return options;
  }, [isGroup, other, router, blockOther, muted, toggleMute, archiveChat, leaveGroup, startCall, demoAccess]);

  // Realtime: INSERT/UPDATE de mensajes de esta conversación.
  useEffect(() => {
    const channel: RealtimeChannel = subscribeToChat(chatId, (msg) => {
      if (!isCurrent()) return;
      let isNew = false;
      setMessages(prev => {
        const base = prev ?? [];
        // Ya lo tenemos (o es un UPDATE, p. ej. read_at/editado/borrado): reemplazar.
        if (base.some(m => m.id === msg.id)) return base.map(m => (m.id === msg.id ? msg : m));
        // El INSERT propio llega también por el canal: sustituye al optimista.
        if (msg.sender_id === myIdRef.current) {
          const i = base.findIndex(m =>
            m.id.startsWith('temp-') && m.message_type === msg.message_type && m.content === msg.content);
          if (i >= 0) {
            const next = [...base];
            next[i] = msg;
            return next;
          }
        }
        isNew = true;
        return [...base, msg];
      });
      // Mensaje ajeno con el chat abierto: lo marcamos leído al momento y, si
      // el usuario está leyendo el historial, lo contamos para el botón.
      if (msg.sender_id && myIdRef.current && msg.sender_id !== myIdRef.current) {
        markChatRead(chatId);
        if (isNew && awayRef.current) setUnseen((n) => n + 1);
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [chatId, isCurrent]);

  // Firma las URLs de fotos, audios y vídeos que aún no tengamos cacheadas.
  useEffect(() => {
    const paths = (messages ?? [])
      .filter(m => m.attachment_url && (m.message_type === 'image' || m.message_type === 'audio' || m.message_type === 'video'))
      .map(m => m.attachment_url as string)
      .filter(p => {
        const entry = mediaUrls[p];
        return (!entry || entry.expiresAt < Date.now()) && !pendingUrls.current.has(p);
      });
    if (paths.length === 0) return;
    paths.forEach(p => pendingUrls.current.add(p));
    (async () => {
      for (const p of paths) {
        if (!isCurrent()) return;
        const url = await withOwnedRequest(owner, request => signedChatMediaUrl(p, request)).catch(() => null);
        if (!isCurrent()) return;
        pendingUrls.current.delete(p);
        // Renovamos 10 min antes de que caduque la firma real (1h).
        if (url) setMediaUrls(prev => ({ ...prev, [p]: { url, expiresAt: Date.now() + 50 * 60 * 1000 } }));
      }
    })();
  }, [messages, mediaUrls, owner, isCurrent]);

  // ── Reacciones: refetch de las de los mensajes visibles ───────────────────
  // Clave estable con los ids reales (los optimistas temp- no tienen reacciones).
  const msgIdsKey = useMemo(
    () => (messages ?? []).map(m => m.id).filter(mid => !mid.startsWith('temp-')).join(','),
    [messages],
  );
  const refetchReactions = useCallback(async () => {
    if (!isCurrent()) return;
    const ids = msgIdsKey ? msgIdsKey.split(',') : [];
    if (ids.length === 0) { setReactions([]); return; }
    try { const rows = await getMessageReactions(ids); if (isCurrent()) setReactions(rows); } catch { /* sin red: se conservan */ }
  }, [msgIdsKey, isCurrent]);
  useEffect(() => { refetchReactions(); }, [refetchReactions]);

  // Realtime de reacciones: nos suscribimos una sola vez y refetch-eamos las de
  // los mensajes visibles (vía ref, para no re-suscribir en cada mensaje nuevo).
  const refetchReactionsRef = useRef(refetchReactions);
  useEffect(() => { refetchReactionsRef.current = refetchReactions; }, [refetchReactions]);
  // El canal oye reacciones de CUALQUIER chat (la tabla no guarda la
  // conversación): se agrupan en un refetch cada 500 ms en vez de uno por evento.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = subscribeToReactions(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refetchReactionsRef.current(); }, 500);
    });
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, []);

  // Reacciones agregadas por mensaje (emoji → total) y mi reacción por mensaje.
  const reactionsByMsg = useMemo(() => {
    const counts = new Map<string, Map<string, number>>();
    for (const r of reactions) {
      if (!counts.has(r.message_id)) counts.set(r.message_id, new Map());
      const m = counts.get(r.message_id)!;
      m.set(r.emoji, (m.get(r.emoji) ?? 0) + 1);
    }
    const out = new Map<string, { emoji: string; count: number }[]>();
    for (const [mid, m] of counts) out.set(mid, [...m.entries()].map(([emoji, count]) => ({ emoji, count })));
    return out;
  }, [reactions]);
  const myReactionByMsg = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reactions) if (r.user_id === myId) map.set(r.message_id, r.emoji);
    return map;
  }, [reactions, myId]);

  // Índice por id para resolver el mensaje citado desde los ya cargados.
  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessageExt>();
    for (const m of messages ?? []) map.set(m.id, m);
    return map;
  }, [messages]);
  const replyTextFor = useCallback((m: ChatMessageExt): string | null => {
    if (!m.reply_to_id) return null;
    const parent = messageById.get(m.reply_to_id);
    // Si el padre no está cargado (mensaje antiguo fuera de los 100), mostramos
    // un texto genérico en lugar de nada. Devuelve string plano (no objeto)
    // para que el memo de Bubble compare por valor.
    return parent ? quoteText(parent) : 'Mensaje';
  }, [messageById]);

  // Toggle de reacción optimista: actualiza el estado local y consulta la
  // verdad solo si el backend falla (revirtiendo el cambio).
  const toggleReaction = useCallback(async (msg: ChatMessageExt, emoji: string) => {
    if (!isCurrent() || !myId) return;
    const current = myReactionByMsg.get(msg.id) ?? null;
    setReactions(prev => {
      const without = prev.filter(r => !(r.message_id === msg.id && r.user_id === myId));
      if (current === emoji) return without; // misma emoji => quitar
      return [...without, { message_id: msg.id, user_id: myId, emoji }];
    });
    const res = await setMessageReaction(msg.id, emoji, current);
    if (!isCurrent()) return;
    if (!res.ok) refetchReactions();
  }, [myId, myReactionByMsg, refetchReactions, isCurrent]);

  // ── Acciones sobre un mensaje (hoja al mantener pulsado) ──────────────────
  // Vibración al abrir: confirma el gesto largo sin mirar la pantalla.
  const openActions = useCallback((m: ChatMessageExt) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionMsg(m);
  }, []);

  const onReactFromSheet = useCallback((emoji: string) => {
    const m = actionMsg; setActionMsg(null);
    if (m) toggleReaction(m, emoji);
  }, [actionMsg, toggleReaction]);

  const onReplyFromSheet = useCallback(() => {
    const m = actionMsg; setActionMsg(null);
    if (m) { setEditing(null); setReplyTo(m); }
  }, [actionMsg]);

  const onEditFromSheet = useCallback(() => {
    const m = actionMsg; setActionMsg(null);
    if (m) { setReplyTo(null); setEditing(m); setText(m.content ?? ''); }
  }, [actionMsg]);

  // Reenviar (mejora 37): cierra la hoja de acciones y, tras su animación de
  // salida (mismo patrón que onDeleteFromSheet), abre el selector de chat.
  const onForwardFromSheet = useCallback(() => {
    const m = actionMsg; setActionMsg(null);
    if (!m) return;
    setTimeout(() => { if (isCurrent()) setForwardMsg(m); }, 320);
  }, [actionMsg, isCurrent]);

  const onDeleteFromSheet = useCallback(() => {
    const m = actionMsg; setActionMsg(null);
    if (!m) return;
    // Esperamos a que el Modal cierre antes de lanzar el Alert (iOS se traga la
    // presentación si coincide con el desmontaje del Modal). Es destructivo:
    // aquí sí toca confirmación nativa.
    setTimeout(() => {
      if (!isCurrent()) return;
      Alert.alert('Eliminar mensaje', 'Se eliminará para todos. No se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            if (!isCurrent()) return;
            setMessages(prev => (prev ?? []).map(x => x.id === m.id ? { ...x, is_deleted: true, content: null } : x));
            const res = await deleteMessage(m.id);
            if (!isCurrent()) return;
            if (!res.ok) { load(); toastError('No se pudo eliminar', 'Inténtalo de nuevo.'); }
          },
        },
      ]);
    }, 320);
  }, [actionMsg, load, isCurrent]);

  // Enviar: en modo edición confirma el UPDATE; si no, envía texto (con la cita
  // si estamos respondiendo). Optimista en ambos casos.
  const send = useCallback(async () => {
    if (!isCurrent()) return;
    const body = text.trim();
    if (!body || !myIdRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (editing) {
      const target = editing;
      setMessages(prev => (prev ?? []).map(x => x.id === target.id ? { ...x, content: body, edited_at: new Date().toISOString() } : x));
      setEditing(null); setText('');
      AsyncStorage.removeItem(draftKey).catch(() => {});
      const res = await editMessage(target.id, body);
      if (!isCurrent()) return;
      if (!res.ok) { load(); toastError('No se pudo editar', 'Inténtalo de nuevo.'); }
      return;
    }

    const replyId = replyTo?.id ?? null;
    const temp: ChatMessageExt = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversation_id: chatId, sender_id: myIdRef.current,
      content: body, message_type: 'text',
      attachment_url: null, attachment_meta: null,
      created_at: new Date().toISOString(), read_at: null,
      edited_at: null, is_deleted: false, reply_to_id: replyId,
    };
    setMessages(prev => [...(prev ?? []), temp]);
    setText('');
    setReplyTo(null);
    AsyncStorage.removeItem(draftKey).catch(() => {});
    // Al enviar siempre bajamos al final: el mensaje propio debe verse.
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    const res = await sendTextMessage(chatId, body, replyId, housingListingId);
    if (!isCurrent()) return;
    if (res.ok && housingListingId) setSentHousingContexts(current => [...current, housingContextKey]);
    if (!res.ok) {
      setMessages(prev => (prev ?? []).filter(m => m.id !== temp.id));
      setText(body);
      if (replyTo) setReplyTo(replyTo);
      AsyncStorage.setItem(draftKey, body).catch(() => {});
      toastError('No se pudo enviar', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }, [chatId, text, draftKey, editing, replyTo, load, housingListingId, housingContextKey, isCurrent]);

  const cancelCompose = useCallback(() => {
    // Cancela edición o respuesta: al cancelar edición vaciamos el input (tenía
    // el texto original cargado).
    if (editing) { setEditing(null); setText(''); AsyncStorage.removeItem(draftKey).catch(() => {}); }
    setReplyTo(null);
  }, [editing, draftKey]);

  // Adjuntar (mejora 41): fotos (varias a la vez) y vídeo, en el mismo picker.
  // Cada adjunto manda su propio mensaje, en orden, sin cortar ante un fallo
  // suelto (fail-soft: se avisa con toast de cuál falló y se sigue con el resto).
  const pickImage = useCallback(async () => {
    if (!isCurrent()) return;
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.7,
      });
    } catch {
      toastError('No se pudo abrir el carrete');
      return;
    }
    if (!isCurrent() || res.canceled || !res.assets?.length) return;
    setSendingImage(true);
    let lastError: string | null = null;
    // try/finally: si un envío lanza (sin red a mitad, un rechazo inesperado)
    // el indicador no se quedaba girando para siempre.
    try {
      for (const a of res.assets) {
        if (!isCurrent()) return;
        try {
          if (a.type === 'video') {
            const mime = a.mimeType ?? 'video/mp4';
            const out = await sendVideoMessage(chatId, a.uri, mime, {
              width: a.width, height: a.height, duration: a.duration ?? undefined,
            });
            if (!isCurrent()) return;
            if (!out.ok) lastError = out.message ?? 'No se pudo enviar el vídeo.';
            continue;
          }
          // Reescala antes de subir: quality no reduce dimensiones y una foto de
          // 4000px se pasaría del límite de 5MB del bucket en datos móviles.
          // normalizeImage reescala SI hace falta y transcodifica SIEMPRE a JPEG:
          // el HEIC del iPhone lo rechaza el bucket aunque la foto sea pequeña
          // (ver src/lib/media.ts).
          const { uri, mime } = await normalizeImage(a.uri, a.width, 1440, a.mimeType ?? 'image/jpeg');
          if (!isCurrent()) return;
          const scale = (a.width ?? 0) > 1440 && a.width ? 1440 / a.width : 1;
          const dims = {
            width: a.width ? Math.round(a.width * scale) : a.width,
            height: a.height ? Math.round(a.height * scale) : a.height,
          };
          const out = await sendImageMessage(chatId, uri, mime, dims);
          if (!isCurrent()) return;
          if (!out.ok) lastError = out.message ?? 'No se pudo enviar la foto.';
        } catch {
          // Un adjunto que revienta no corta el resto: se anota y se sigue.
          lastError = a.type === 'video' ? 'No se pudo enviar el vídeo.' : 'No se pudo enviar la foto.';
        }
      }
    } finally {
      if (isCurrent()) setSendingImage(false);
    }
    if (!isCurrent()) return;
    if (lastError) toastError('Algún adjunto no se pudo enviar', lastError);
    // Fallback por si el realtime tarda: el dedupe por id evita duplicados.
    load();
  }, [chatId, load, isCurrent]);

  // Nota de voz: la grabadora devuelve el uri local en cuanto se para; se sube
  // y se envía sola, sin paso de confirmación (petición explícita: el micro
  // graba al tocarlo y al parar se envía).
  const onRecorded = useCallback(async (uri: string, durationMs: number) => {
    if (!isCurrent()) return;
    setSendingAudio(true);
    // Mismo motivo que en pickImage: sin finally, un rechazo dejaba el micro
    // girando para siempre.
    let res: { ok: boolean; message?: string };
    try {
      res = await sendAudioMessage(chatId, uri, durationMs);
    } catch {
      res = { ok: false, message: 'Revisa tu conexión e inténtalo de nuevo.' };
    } finally {
      if (isCurrent()) setSendingAudio(false);
    }
    if (!isCurrent()) return;
    if (!res.ok) toastError('No se pudo enviar la nota de voz', res.message ?? 'Inténtalo de nuevo.');
    else load();
  }, [chatId, load, isCurrent]);

  // Grabadora en línea: el botón del micro de la barra la arranca y la para.
  const voice = useVoiceRecorder({ onRecorded, beforeRecord: async () => isCurrent() });

  // Punto rojo que late mientras se graba.
  const recPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!voice.recording || reduceMotion) { recPulse.setValue(1); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(recPulse, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(recPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [voice.recording, reduceMotion, recPulse]);

  // Hilo unificado (mejora 58): mensajes y encuestas/quedadas mezclados por
  // fecha de creación, para que la encuesta aparezca en su sitio del hilo.
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const m of messages ?? []) items.push({ kind: 'msg', key: `m-${m.id}`, ts: m.created_at, msg: m });
    for (const p of polls) items.push({ kind: 'poll', key: `p-${p.id}`, ts: p.created_at, poll: p });
    items.sort((a, b) => a.ts.localeCompare(b.ts));
    return items;
  }, [messages, polls]);

  // FlatList invertida: los datos van del más nuevo al más viejo y los nuevos
  // aparecen abajo sin necesidad de scrollToEnd. Los separadores de fecha se
  // insertan en orden cronológico (antes del primer elemento de cada día) y
  // al invertir quedan encima del día que abren.
  const data = useMemo(() => {
    const out: FeedItem[] = [];
    let lastDay = '';
    for (const it of feed) {
      const day = dayKey(it.ts);
      if (day !== lastDay) {
        out.push({ kind: 'date', key: `d-${day}`, ts: it.ts, label: dayLabel(it.ts) });
        lastDay = day;
      }
      out.push(it);
    }
    out.reverse();
    return out;
  }, [feed]);

  // Búsqueda (mejora 40): con texto activo, la lista mostrada se filtra a los
  // mensajes de texto (no borrados) que contienen la coincidencia, y se puede
  // saltar entre resultados con flechas + resaltado del texto coincidente.
  const searchNeedle = searchQuery.trim().toLowerCase();
  const searchActive = searchOpen && searchNeedle.length > 0;
  const displayData = useMemo(() => {
    if (!searchActive) return data;
    return data.filter(it => it.kind === 'msg' && !it.msg.is_deleted && it.msg.message_type === 'text' && (it.msg.content ?? '').toLowerCase().includes(searchNeedle));
  }, [data, searchActive, searchNeedle]);

  // Al cambiar la búsqueda, volvemos siempre a la coincidencia más reciente.
  useEffect(() => { setMatchIndex(0); }, [searchNeedle]);

  // Saltar a la coincidencia seleccionada (con reintento si aún no se renderizó).
  useEffect(() => {
    if (!searchActive || displayData.length === 0) return;
    const i = Math.min(matchIndex, displayData.length - 1);
    try { flatListRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 }); } catch { /* fuera de rango */ }
  }, [matchIndex, searchActive, displayData.length]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((o) => {
      const next = !o;
      if (!next) { setSearchQuery(''); setMatchIndex(0); }
      return next;
    });
  }, []);
  const goNextMatch = useCallback(() => {
    if (displayData.length === 0) return;
    setMatchIndex((i) => (i + 1) % displayData.length);
  }, [displayData.length]);
  const goPrevMatch = useCallback(() => {
    if (displayData.length === 0) return;
    setMatchIndex((i) => (i - 1 + displayData.length) % displayData.length);
  }, [displayData.length]);

  // Botón flotante: aparece (con muelle) al alejarse del final; al volver
  // abajo se esconde y el contador de no vistos se pone a cero.
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const away = e.nativeEvent.contentOffset.y > 260;
    if (away === awayRef.current) return;
    awayRef.current = away;
    setAwayFromBottom(away);
    if (!away) setUnseen(0);
  }, []);
  useEffect(() => {
    if (reduceMotion) { fabScale.setValue(awayFromBottom ? 1 : 0); return; }
    Animated.spring(fabScale, { toValue: awayFromBottom ? 1 : 0, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
  }, [awayFromBottom, fabScale, reduceMotion]);
  const jumpToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnseen(0);
  }, []);

  const canSend = text.trim().length > 0;
  const headerTitle = confirmedTitle;
  const presLabel = (!isGroup && other) ? presenceLabel(presence) : null;
  const online = presLabel === 'en línea';
  // Colores legibles sobre el fondo (imagen propia oscurecida o tema de color).
  const effectiveTheme = useMemo(
    // Sobre la imagen (oscurecida con un velo negro) el texto secundario va en
    // blanco translúcido: blanco sobre media, el único color fijo permitido.
    () => (bgImage ? { ...theme, mutedOnWallpaper: 'rgba(255,255,255,0.85)', bubbleOther: theme.dark ? theme.bubbleOther : '#ffffff' } : theme),
    [theme, bgImage],
  );

  // renderItem estable (rendimiento): extraído del JSX con useCallback para que
  // los renders del padre que no tocan sus dependencias (teclear, "escribiendo",
  // presencia) no recreen la función y las Bubble memoizadas puedan saltarse el
  // re-render. La posición en la racha se calcula mirando a los vecinos de la
  // lista invertida (index-1 = más nuevo, index+1 = más viejo).
  const renderItem = useCallback<ListRenderItem<FeedItem>>(({ item, index }) => {
    if (item.kind === 'date') return <DatePill label={item.label} theme={effectiveTheme} />;
    if (item.kind === 'poll') {
      return (
        <PollCard poll={item.poll} results={pollResults[item.poll.id] ?? []} theme={effectiveTheme}
          onVote={(optionIndex) => onVotePoll(item.poll, optionIndex)} />
      );
    }
    const m = item.msg;
    const mine = m.sender_id === myId;
    const newer = displayData[index - 1];
    const older = displayData[index + 1];
    const first = !(older && older.kind === 'msg' && sameRun(older.msg, m));
    const last = !(newer && newer.kind === 'msg' && sameRun(m, newer.msg));
    const avatarSlot = isGroup && !mine && m.message_type !== 'system';
    const member = avatarSlot ? membersById.get(m.sender_id) : undefined;
    return (
      <Bubble msg={m} mine={mine} theme={effectiveTheme}
        mediaUrl={m.attachment_url ? mediaUrls[m.attachment_url]?.url ?? null : null}
        replyText={replyTextFor(m)}
        reactions={reactionsByMsg.get(m.id) ?? NO_REACTIONS}
        first={first} last={last}
        senderName={avatarSlot && first ? (member?.full_name ?? 'Estudiante') : null}
        senderAvatar={avatarSlot && last ? (member?.avatar_url ?? null) : null}
        avatarSlot={avatarSlot}
        time={timeLabel(m.created_at)}
        onLongPress={openActions}
        onImagePress={setLightboxUrl}
        highlightQuery={searchActive ? searchNeedle : null}
        current={searchActive && index === matchIndex} />
    );
  }, [pollResults, effectiveTheme, onVotePoll, myId, mediaUrls, replyTextFor, reactionsByMsg, searchActive, searchNeedle, matchIndex, displayData, isGroup, membersById, openActions]);

  const iconBtn = { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Cabecera propia con el estilo del kit (<Header> no admite avatar ni
          presencia): botón de volver suelto (sin círculo tintado), avatar, nombre en Outfit y
          debajo la presencia (1:1) o el número de miembros (grupo). */}
      <View style={{ paddingTop: insets.top, backgroundColor: C.bg, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 8 }}>
          <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'))}
            style={[iconBtn, { marginLeft: -6 }]} accessibilityLabel="Volver" accessibilityHint="Vuelve a la lista de chats" hitSlop={8}>
            <ChevronLeft size={26} color={C.text} strokeWidth={1.9} style={{ marginLeft: -2 }} />
          </Tap>
          <Tap onPress={isGroup ? () => setMembersOpen(true) : other ? () => router.push(`/perfil/${other.id}`) : undefined}
            disabled={!isGroup && !other}
            style={{ flex: 1 }} accessibilityLabel={isGroup ? `${headerTitle}, ver miembros` : `${headerTitle}${presLabel ? `, ${presLabel}` : ''}`}
            accessibilityHint={isGroup ? 'Abre la lista de miembros' : other ? 'Abre el perfil' : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View>
                <Avatar name={headerTitle} uri={headerAvatar} size={38} />
                {online ? (
                  <View accessibilityElementsHidden style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: C.success, borderWidth: 2, borderColor: C.bg }} />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 17, fontFamily: FONT.heading, color: C.text, letterSpacing: -0.2 }} numberOfLines={1}>
                  {headerTitle}
                </Text>
                {isGroup ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 1 }]} numberOfLines={1}>
                    {groupMembers ? `${groupMembers.length} ${groupMembers.length === 1 ? 'miembro' : 'miembros'}` : 'Grupo'}
                  </Text>
                ) : presLabel ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, marginTop: 1, color: online ? C.success : C.muted, fontFamily: online ? FONT.semibold : undefined }} numberOfLines={1}>
                    {presLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          </Tap>
          {!isGroup && other && demoAccess?.demo === false ? (
            <Tap onPress={() => startCall('audio')} style={iconBtn} accessibilityLabel="Llamar" accessibilityHint="Inicia una llamada de voz" hitSlop={8}>
              <Phone size={20} color={C.text} strokeWidth={1.9} />
            </Tap>
          ) : null}
          <Tap onPress={toggleSearch} style={iconBtn}
            accessibilityLabel="Buscar en la conversación" accessibilityState={{ selected: searchOpen }} hitSlop={8}>
            <Search size={20} color={searchOpen ? C.blue : C.text} strokeWidth={searchOpen ? 2.4 : 1.9} />
          </Tap>
          <Tap onPress={() => setMenuOpen(true)} style={[iconBtn, { marginRight: -6 }]} accessibilityLabel="Opciones del chat" hitSlop={8}>
            <MoreVertical size={22} color={C.text} strokeWidth={1.9} />
          </Tap>
        </View>

        <SocialDemoBanner />
        <SocialDemoFeatureNotice access={demoAccess} feature="chatPolls" retry={retryDemoAccess} checking={checkingDemoAccess} />
        {/* Búsqueda dentro de la conversación (mejora 40) */}
        {searchOpen ? (
          <View style={{ paddingTop: 4 }}>
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Buscar en la conversación" autoFocus />
            {searchNeedle ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
                paddingHorizontal: S.lg, marginTop: -6, marginBottom: 8,
              }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginRight: 6 }]} accessibilityLiveRegion="polite">
                  {displayData.length > 0 ? `${Math.min(matchIndex, displayData.length - 1) + 1} de ${displayData.length}` : 'Sin resultados'}
                </Text>
                <Tap onPress={goPrevMatch} disabled={displayData.length === 0} accessibilityLabel="Coincidencia anterior" style={iconBtn} hitSlop={8}>
                  <ChevronUp size={20} color={displayData.length ? C.text : C.muted} strokeWidth={2} />
                </Tap>
                <Tap onPress={goNextMatch} disabled={displayData.length === 0} accessibilityLabel="Coincidencia siguiente" style={iconBtn} hitSlop={8}>
                  <ChevronDown size={20} color={displayData.length ? C.text : C.muted} strokeWidth={2} />
                </Tap>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Fondo del área de mensajes: imagen propia (44) con capa oscura para
            legibilidad, o si no hay, el degradado del tema de color de siempre. */}
        <View style={{ flex: 1 }}>
          {bgImage ? (
            <>
              <Image source={{ uri: bgImage }} style={StyleSheet.absoluteFill} contentFit="cover"
                onError={() => { setBgImage(null); AsyncStorage.removeItem(bgKey).catch(() => {}); }} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
            </>
          ) : (
            <LinearGradient colors={theme.wallpaper} start={{ x: 0, y: 0 }} end={{ x: 0.35, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          {messages === null ? (
            // Esqueleto con forma de conversación (burbujas alternadas).
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 12 }}
              accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
              {[62, 40, 55, 34, 70, 46].map((w, i) => (
                <Skeleton key={i} height={i % 3 === 1 ? 64 : 40} radius={R.lg}
                  style={{ width: `${w}%`, alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end', marginBottom: 8, backgroundColor: `${effectiveTheme.mutedOnWallpaper}33` }} />
              ))}
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              inverted
              data={displayData}
              keyExtractor={feedKeyExtractor}
              renderItem={renderItem}
              onScroll={onScroll}
              scrollEventThrottle={80}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  try { flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }); } catch { /* aún fuera de rango */ }
                }, 120);
              }}
              contentContainerStyle={{ paddingVertical: 12 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={14}
              maxToRenderPerBatch={10}
              windowSize={9}
              onEndReached={searchActive ? undefined : loadOlder}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loadingOlder ? (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={effectiveTheme.mutedOnWallpaper} />
                </View>
              ) : null}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={effectiveTheme.mutedOnWallpaper} />
              }
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: S.xl, gap: 12, transform: [{ scaleY: -1 }] }}>
                  <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: effectiveTheme.bubbleOther, alignItems: 'center', justifyContent: 'center', opacity: 0.95 }}>
                    <MessageCircle size={30} color={effectiveTheme.mutedOnWallpaper} strokeWidth={1.8} />
                  </View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 17, fontFamily: FONT.heading, color: effectiveTheme.dark || bgImage ? '#FFFFFF' : effectiveTheme.bubbleOtherText, textAlign: 'center' }}>
                    {searchActive ? 'Sin coincidencias' : failed ? 'No se pudo cargar el chat' : 'Di hola'}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: effectiveTheme.mutedOnWallpaper, textAlign: 'center' }]}>
                    {searchActive ? 'Prueba con otra palabra.' : failed ? 'Revisa tu conexión y vuelve a intentarlo.' : 'Escribe el primer mensaje y rompe el hielo.'}
                  </Text>
                  {failed && !searchActive ? (
                    <Btn small variant="secondary" label="Reintentar" onPress={onRefresh} busy={refreshing} />
                  ) : null}
                </View>
              }
            />
          )}

          {/* Botón flotante: "N nuevos" si llegó algo mientras se leía arriba,
              o una flecha simple para bajar al final. */}
          <Animated.View pointerEvents={awayFromBottom ? 'auto' : 'none'}
            style={{ position: 'absolute', right: S.lg, bottom: 12, transform: [{ scale: fabScale }], opacity: fabScale }}>
            <Tap hitSlop={8} onPress={jumpToBottom} haptic
              accessibilityLabel={unseen > 0 ? `${unseen} ${unseen === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}, ir al final` : 'Ir al último mensaje'}>
              {unseen > 0 ? (
                <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.full, paddingHorizontal: 14, height: 40, backgroundColor: C.blue }, SHADOW.float]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 13.5 }}>
                    {unseen === 1 ? '1 nuevo' : `${unseen} nuevos`}
                  </Text>
                  <ChevronDown size={18} color={C.onAccent} strokeWidth={2} />
                </View>
              ) : (
                <View style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: C.border }, SHADOW.float]}>
                  <ChevronDown size={20} color={C.text} strokeWidth={1.9} />
                </View>
              )}
            </Tap>
          </Animated.View>
        </View>

        {/* "escribiendo…" del otro, sobre la barra de escritura */}
        {otherTyping ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.lg, paddingVertical: 5, backgroundColor: C.bg }}
            accessibilityLiveRegion="polite" accessibilityLabel={other?.name ? `${other.name.split(' ')[0]} está escribiendo` : 'Escribiendo'}>
            <TypingDots color={C.blue} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.muted }]}>
              {other?.name ? `${other.name.split(' ')[0]} está escribiendo` : 'Escribiendo'}
            </Text>
          </View>
        ) : null}

        {/* Adjunto subiendo: aviso discreto encima del compositor. */}
        {sendingImage ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.lg, paddingVertical: 5, backgroundColor: C.bg }}>
            <ActivityIndicator size="small" color={C.blue} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.muted }]}>Enviando adjunto…</Text>
          </View>
        ) : null}

        {/* Barra de cita (respondiendo) o de edición, encima del input */}
        {replyTo || editing ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg,
            paddingHorizontal: S.lg, paddingTop: 8,
            borderTopWidth: 0.5, borderTopColor: C.borderLight,
          }}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 10, backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 7 }}>
              <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.blue }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {editing ? <Pencil size={12} color={C.blue} strokeWidth={2.4} /> : <Reply size={13} color={C.blue} strokeWidth={2.4} />}
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.blue }}>
                    {editing ? 'Editando mensaje' : 'Respondiendo'}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontSize: 13, color: C.muted, marginTop: 1 }}>
                  {editing ? quoteText(editing) : (replyTo ? quoteText(replyTo) : '')}
                </Text>
              </View>
            </View>
            <Tap onPress={cancelCompose} accessibilityLabel="Cancelar" style={iconBtn} hitSlop={8}>
              <X size={18} color={C.text} strokeWidth={2.2} />
            </Tap>
          </View>
        ) : null}

        {/* barra de escritura */}
        {housingListingId && !editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.md, paddingVertical: 8, backgroundColor: C.bg }}>
            <Tap onPress={() => router.push(`/piso/${housingListingId}`)} style={{ flex: 1 }} accessibilityLabel="Ver el piso sobre el que escribes">
              <Text style={{ color: C.blue, fontSize: 13 }}>Mensaje sobre este piso</Text>
            </Tap>
            <Tap onPress={() => setSentHousingContexts(current => [...current, housingContextKey])} accessibilityLabel="Quitar referencia al piso" hitSlop={8}>
              <X size={18} color={C.muted} />
            </Tap>
          </View>
        ) : null}
        <View style={{
          borderTopWidth: replyTo || editing ? 0 : 0.5, borderTopColor: C.borderLight, backgroundColor: C.bg,
          flexDirection: 'row', alignItems: 'flex-end', gap: 8,
          paddingHorizontal: S.md, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8),
        }}>
          {voice.recording ? (
            // Modo grabación: ocupa la barra entera. La papelera descarta la
            // toma y el botón violeta sólido para y ENVÍA (sin confirmación).
            <>
              <Tap hitSlop={8} onPress={voice.busy ? undefined : voice.cancel} disabled={voice.busy}
                accessibilityLabel="Cancelar nota de voz" style={[iconBtn, { width: 40, height: 40, borderRadius: 20 }]}>
                <Trash2 size={19} color={C.error} strokeWidth={1.9} />
              </Tap>
              <View style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40,
                backgroundColor: `${C.error}12`, borderRadius: R.xl, paddingHorizontal: 14,
              }} accessibilityLiveRegion="polite">
                <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.error, opacity: recPulse }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15, fontFamily: FONT.semibold, color: C.text }}>
                  Grabando {fmtDur(voice.durationMillis)}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1, textAlign: 'right' }]}>máx. 1:00</Text>
              </View>
              <Tap hitSlop={8} onPress={voice.busy ? undefined : voice.stop} disabled={voice.busy} haptic
                accessibilityLabel="Parar y enviar nota de voz" accessibilityState={{ busy: voice.busy }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
                  {voice.busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <Send size={18} color={C.onAccent} strokeWidth={2} style={{ marginLeft: -2, marginTop: 1 }} />}
                </View>
              </Tap>
            </>
          ) : (
            <>
              {/* Adjuntos en una hoja: fotos/vídeo y encuesta/quedada. */}
              <Tap hitSlop={8} onPress={() => setAttachOpen(true)} disabled={sendingImage}
                accessibilityLabel="Adjuntar" accessibilityHint={demoAccess?.demo === false ? 'Fotos, vídeos o una encuesta' : 'Fotos y vídeos privados del chat'}
                style={[iconBtn, { width: 40, height: 40, borderRadius: 20, opacity: sendingImage ? 0.5 : 1 }]}>
                <Plus size={22} color={C.text} strokeWidth={1.9} />
              </Tap>
              <View style={{ flex: 1, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.xl, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 }}>
                <TextInput
                  value={text} onChangeText={onChangeText} placeholder="Escribe un mensaje…"
                  placeholderTextColor={C.muted} multiline maxLength={2000}
                  accessibilityLabel="Mensaje"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  // Crece hasta 5 líneas (21 px cada una + relleno) y luego hace scroll.
                  style={{ fontSize: 15, lineHeight: 21, color: C.text, maxHeight: 21 * 5 + 20, paddingVertical: Platform.OS === 'ios' ? 10 : 8, paddingTop: Platform.OS === 'ios' ? 10 : 8 }}
                />
              </View>
              {canSend || editing ? (
                <Tap hitSlop={8} onPress={canSend ? send : undefined} disabled={!canSend} haptic
                  accessibilityLabel={editing ? 'Guardar cambios' : 'Enviar mensaje'}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: canSend ? C.blue : C.input, alignItems: 'center', justifyContent: 'center' }}>
                    {editing
                      ? <Check size={20} color={canSend ? C.onAccent : C.muted} strokeWidth={2.4} />
                      : <Send size={18} color={canSend ? C.onAccent : C.muted} strokeWidth={2} style={{ marginLeft: -2, marginTop: 1 }} />}
                  </View>
                </Tap>
              ) : (
                <Tap hitSlop={8} onPress={sendingAudio ? undefined : voice.start} disabled={sendingAudio}
                  accessibilityLabel="Grabar nota de voz" accessibilityHint="Toca para empezar a grabar; vuelve a tocar para enviar"
                  accessibilityState={{ busy: sendingAudio }}
                  style={[iconBtn, { width: 40, height: 40, borderRadius: 20 }]}>
                  {sendingAudio
                    ? <ActivityIndicator size="small" color={C.blue} />
                    : <Mic size={20} color={C.text} strokeWidth={1.9} />}
                </Tap>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Hoja de adjuntos */}
      <OptionsSheet visible={attachOpen} onClose={() => setAttachOpen(false)} title="Adjuntar"
        options={[
          { label: 'Fotos y vídeos', icon: ImageIcon, onPress: pickImage },
          ...(demoAccess?.demo === false ? [{ label: 'Encuesta o quedada', icon: BarChart3, onPress: async () => { if (isCurrent() && await ensureSocialDemoFeature('chatPolls') && isCurrent()) setPollFormOpen(true); } }] : []),
        ]} />

      {/* Menú del chat */}
      <OptionsSheet visible={menuOpen} onClose={() => setMenuOpen(false)}
        title={other?.name ?? (isGroup ? headerTitle : 'Opciones del chat')}
        options={menuOptions} />

      {/* Selector de tema/fondo: aplica en vivo y persiste por conversación (44) */}
      <OptionsSheet visible={themeOpen} onClose={() => setThemeOpen(false)}
        title="Fondo del chat (solo lo ves tú)"
        options={[
          ...CHAT_THEMES.map((t) => ({
            label: `${t.label} · ${t.hint}`,
            icon: THEME_ICON[t.id],
            selected: !bgImage && t.id === theme.id,
            onPress: () => { setTheme(t); setChatTheme(chatId, t.id); if (bgImage) clearBackground(); },
          })),
          { label: 'Imagen del carrete', icon: ImagePlus, selected: !!bgImage, onPress: pickBackground },
          ...(bgImage ? [{ label: 'Quitar imagen de fondo', icon: Trash2, destructive: true, onPress: clearBackground }] : []),
        ]} />

      {/* Motivos de denuncia (enum de user_reports, como la web) */}
      <OptionsSheet visible={reportOpen} onClose={() => setReportOpen(false)}
        title={`Denunciar a ${other?.name ?? 'este usuario'}`}
        options={[
          { label: 'Spam o publicidad', onPress: () => submitReport('spam', 'Spam o publicidad') },
          { label: 'Contenido inapropiado', onPress: () => submitReport('contenido_ofensivo', 'Contenido inapropiado') },
          { label: 'Acoso o comportamiento abusivo', onPress: () => submitReport('acoso', 'Acoso o comportamiento abusivo') },
          { label: 'Suplantación de identidad', onPress: () => submitReport('suplantacion', 'Suplantación de identidad') },
          { label: 'Otro motivo', onPress: () => submitReport('otro', 'Otro motivo') },
        ]} />

      {/* Hoja de acciones sobre un mensaje: fila de emojis + responder/editar/eliminar */}
      <MessageActionsSheet
        msg={actionMsg}
        mine={!!actionMsg && actionMsg.sender_id === myId}
        myEmoji={actionMsg ? (myReactionByMsg.get(actionMsg.id) ?? null) : null}
        onClose={() => setActionMsg(null)}
        onReact={onReactFromSheet}
        onReply={onReplyFromSheet}
        onEdit={onEditFromSheet}
        onDelete={onDeleteFromSheet}
        onForward={onForwardFromSheet} />

      {/* Selector de conversación destino para reenviar (mejora 37) */}
      <ForwardSheet msg={forwardMsg} currentChatId={chatId} isCurrent={isCurrent} onClose={() => setForwardMsg(null)} />

      {/* Miembros del grupo (mejora 57) */}
      <MembersSheet visible={membersOpen} members={groupMembers} onClose={() => setMembersOpen(false)} />

      {/* Crear encuesta o quedada (mejora 58) */}
      <PollComposerModal visible={pollFormOpen && demoAccess?.demo === false} chatId={chatId} isCurrent={isCurrent}
        onClose={() => setPollFormOpen(false)} onCreated={loadPolls} />

      {/* Visor de foto a pantalla completa con pinch-zoom */}
      <Lightbox uri={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </View>
  );
}

// ─── Hojas inferiores propias ────────────────────────────────────────────
// Mismo patrón visual que OptionsSheet del kit (velo C.overlay, superficie
// C.surface con esquinas R.xl y asa arriba): son Modales propios porque
// necesitan contenido que OptionsSheet no admite (fila de emojis, listas,
// formulario).
function SheetFrame({ visible, onClose, children, maxHeight }: {
  visible: boolean; onClose: () => void; children: React.ReactNode; maxHeight?: number | `${number}%`;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose}
        accessibilityLabel="Cerrar" accessibilityRole="button" />
      <View accessibilityViewIsModal style={{
        backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
        paddingTop: 8, paddingBottom: 30, maxHeight,
      }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 6 }} />
        {children}
      </View>
    </Modal>
  );
}

function SheetRow({ label, icon: Icon, onPress, destructive, muted }: {
  label: string; icon?: LucideIcon; onPress: () => void; destructive?: boolean; muted?: boolean;
}) {
  const color = destructive ? C.error : muted ? C.muted : C.text;
  return (
    <Tap onPress={onPress} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 13, minHeight: 48 }}>
        {Icon ? <Icon size={20} color={color} strokeWidth={2} /> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15.5, color, flex: 1 }}>{label}</Text>
      </View>
    </Tap>
  );
}

// Hoja inferior de acciones al mantener pulsado un mensaje: fila de emojis para
// reaccionar y opciones (Responder siempre; Editar/Eliminar solo en los propios
// de texto no borrados).
function MessageActionsSheet({ msg, mine, myEmoji, onClose, onReact, onReply, onEdit, onDelete, onForward }: {
  msg: ChatMessageExt | null;
  mine: boolean;
  myEmoji: string | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
}) {
  const visible = !!msg;
  const canEdit = mine && msg?.message_type === 'text' && msg?.is_deleted !== true;
  const canDelete = mine && msg?.is_deleted !== true;
  return (
    <SheetFrame visible={visible} onClose={onClose}>
      {/* Fila de reacciones rápida: la emoji ya puesta se resalta. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: S.lg, paddingVertical: 8 }}>
        {REACTION_EMOJIS.map((e) => (
          <Tap key={e} onPress={() => onReact(e)} haptic accessibilityLabel={`Reaccionar con ${e}`}
            accessibilityState={{ selected: myEmoji === e }}
            style={{
              width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
              backgroundColor: myEmoji === e ? C.accentSoft : C.input,
              borderWidth: myEmoji === e ? 1.5 : 0, borderColor: C.blue,
            }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 26 }}>{e}</Text>
          </Tap>
        ))}
      </View>
      <View style={{ height: 0.5, backgroundColor: C.borderLight, marginVertical: 6 }} />
      <SheetRow label="Responder" icon={Reply} onPress={onReply} />
      <SheetRow label="Reenviar" icon={Forward} onPress={onForward} />
      {canEdit ? <SheetRow label="Editar" icon={Pencil} onPress={onEdit} /> : null}
      {canDelete ? <SheetRow label="Eliminar" icon={Trash2} destructive onPress={onDelete} /> : null}
      <SheetRow label="Cancelar" muted onPress={onClose} />
    </SheetFrame>
  );
}

// Hoja "Reenviar a…" (mejora 37): lista de chats existentes (excluye el actual)
// sacada de getMyChats(); al tocar uno se copia el mensaje con forwardMessage.
function ForwardSheet({ msg, currentChatId, onClose, isCurrent }: {
  msg: ChatMessageExt | null; currentChatId: string; onClose: () => void; isCurrent: () => boolean;
}) {
  const visible = !!msg;
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setChats(null); return; }
    let alive = true;
    getMyChats()
      .then((list) => { if (alive) setChats(list.filter((c) => c.id !== currentChatId)); })
      .catch(() => { if (alive) setChats([]); });
    return () => { alive = false; };
  }, [visible, currentChatId]);

  const send = useCallback(async (targetId: string) => {
    if (!isCurrent() || !msg) return;
    setSendingTo(targetId);
    // finally: un rechazo dejaba el spinner de esa fila girando y la hoja
    // bloqueada (disabled={!!sendingTo}) sin forma de cerrarla.
    let res: { ok: boolean };
    try {
      res = await forwardMessage(msg, targetId);
    } catch {
      res = { ok: false };
    } finally {
      if (isCurrent()) setSendingTo(null);
    }
    if (!isCurrent()) return;
    onClose();
    if (res.ok) toast('Reenviado', 'El mensaje se ha enviado a ese chat.');
    else toastError('No se pudo reenviar', 'Inténtalo de nuevo en unos segundos.');
  }, [msg, onClose, isCurrent]);

  return (
    <SheetFrame visible={visible} onClose={onClose} maxHeight="70%">
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { paddingHorizontal: S.lg, paddingTop: 8, paddingBottom: 8, color: C.muted }]}>Reenviar a</Text>
      {chats === null ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={52} radius={R.md} />)}
        </View>
      ) : chats.length === 0 ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingHorizontal: S.lg, paddingVertical: 24 }]}>
          No tienes más conversaciones para reenviar.
        </Text>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={({ item: c }) => {
            const title = c.other_user?.full_name ?? c.group_name ?? 'Chat de grupo';
            return (
              <Tap onPress={sendingTo ? undefined : () => send(c.id)} disabled={!!sendingTo}
                accessibilityLabel={`Reenviar a ${title}`} accessibilityState={{ busy: sendingTo === c.id }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 56 }}>
                  <Avatar name={title} uri={c.other_user?.avatar_url ?? c.group_avatar_url} size={40} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]} numberOfLines={1}>{title}</Text>
                  {sendingTo === c.id ? <ActivityIndicator size="small" color={C.blue} /> : <Forward size={18} color={C.muted} strokeWidth={2} />}
                </View>
              </Tap>
            );
          }}
        />
      )}
      <SheetRow label="Cancelar" muted onPress={onClose} />
    </SheetFrame>
  );
}

// Hoja de miembros del grupo (mejora 57): avatar, nombre y una insignia si es
// admin. Los datos se cargan en el componente padre (getGroupMembers).
function MembersSheet({ visible, members, onClose }: {
  visible: boolean; members: GroupMember[] | null; onClose: () => void;
}) {
  return (
    <SheetFrame visible={visible} onClose={onClose} maxHeight="70%">
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { paddingHorizontal: S.lg, paddingTop: 8, paddingBottom: 8, color: C.muted }]}>
        {members ? `${members.length} ${members.length === 1 ? 'miembro' : 'miembros'}` : 'Miembros'}
      </Text>
      {members === null ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={52} radius={R.md} />)}
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          renderItem={({ item: m }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 56 }}
              accessible accessibilityLabel={`${m.full_name ?? 'Estudiante'}${m.role === 'admin' ? ', administrador' : ''}`}>
              <Avatar name={m.full_name} uri={m.avatar_url} size={40} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]} numberOfLines={1}>{m.full_name ?? 'Estudiante'}</Text>
              {m.role === 'admin' ? <Pill label="Admin" tone="blue" /> : null}
            </View>
          )}
        />
      )}
      <SheetRow label="Cerrar" muted onPress={onClose} />
    </SheetFrame>
  );
}

// Formulario "Crear encuesta / quedada" (mejora 58): pregunta, de 2 a 8
// opciones, interruptor de multi-opción y, si se activa "Es una quedada",
// fecha + hora (dos DateTimePicker, igual que en crear-evento.tsx) y lugar.
function PollComposerModal({ visible, chatId, onClose, onCreated, isCurrent }: {
  visible: boolean; chatId: string; onClose: () => void; onCreated: () => void; isCurrent: () => boolean;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [isMeetup, setIsMeetup] = useState(false);
  const [meetupDate, setMeetupDate] = useState<Date | null>(null);
  const [meetupPlace, setMeetupPlace] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reinicia el formulario cada vez que se abre: no queremos arrastrar el
  // borrador de una encuesta anterior ya creada.
  useEffect(() => {
    if (!visible) return;
    setQuestion(''); setOptions(['', '']); setMulti(false);
    setIsMeetup(false); setMeetupDate(null); setMeetupPlace('');
  }, [visible]);

  const setOption = (i: number, v: string) => setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const addOption = () => setOptions((prev) => (prev.length < 8 ? [...prev, ''] : prev));

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = question.trim().length > 0 && validOptions.length >= 2 && !submitting;

  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    setShowDatePicker(false);
    if (e.type !== 'set' || !d) return;
    const base = meetupDate ?? new Date(new Date().getTime() + 60 * 60 * 1000);
    const next = new Date(d);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    setMeetupDate(next);
  };
  const onPickTime = (e: DateTimePickerEvent, d?: Date) => {
    setShowTimePicker(false);
    if (e.type !== 'set' || !d) return;
    const base = meetupDate ?? new Date();
    const next = new Date(base);
    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
    setMeetupDate(next);
  };

  const submit = useCallback(async () => {
    if (!isCurrent() || !canSubmit) return;
    setSubmitting(true);
    // finally: si createChatPoll lanza, el botón "Crear" se quedaba con el
    // spinner y canSubmit en false para siempre.
    let res: { ok: boolean; message?: string };
    try {
      res = await createChatPoll({
        conversationId: chatId,
        question: question.trim(),
        options: validOptions,
        multi,
        meetupAt: isMeetup && meetupDate ? meetupDate.toISOString() : null,
        meetupPlace: isMeetup ? (meetupPlace.trim() || null) : null,
      });
    } catch {
      res = { ok: false, message: 'Revisa tu conexión e inténtalo de nuevo.' };
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
    if (!isCurrent()) return;
    if (!res.ok) {
      toastError('No se pudo crear', res.message ?? 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    toast(isMeetup ? 'Quedada creada' : 'Encuesta creada');
    onCreated();
    onClose();
  }, [canSubmit, chatId, question, validOptions, multi, isMeetup, meetupDate, meetupPlace, onCreated, onClose, isCurrent]);

  const input = {
    backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: C.text, minHeight: 44,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 8, maxHeight: '85%' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 6 }} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.lg, paddingBottom: 30 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { marginBottom: 12 }]}>
              {isMeetup ? 'Nueva quedada' : 'Nueva encuesta'}
            </Text>

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Pregunta</Text>
            <TextInput
              value={question} onChangeText={setQuestion} placeholder="¿Qué preguntamos?"
              placeholderTextColor={C.muted} multiline maxLength={200}
              accessibilityLabel="Pregunta de la encuesta" maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[input, { marginBottom: 14 }]}
            />

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Opciones</Text>
            {options.map((opt, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={opt} onChangeText={(v) => setOption(i, v)} placeholder={`Opción ${i + 1}`}
                  placeholderTextColor={C.muted} maxLength={80}
                  accessibilityLabel={`Opción ${i + 1}`} maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[input, { flex: 1 }]}
                />
                {options.length > 2 ? (
                  <Tap hitSlop={8} onPress={() => removeOption(i)} accessibilityLabel={`Quitar opción ${i + 1}`}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} color={C.muted} strokeWidth={2.2} />
                  </Tap>
                ) : null}
              </View>
            ))}
            {options.length < 8 ? (
              <View style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
                <Btn variant="link" small icon={Plus} label="Añadir opción" onPress={addOption} />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, minHeight: 48 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Varias opciones</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Cada persona puede votar más de una</Text>
              </View>
              <Switch value={multi} onValueChange={setMulti} trackColor={{ false: C.border, true: C.blue }} thumbColor={C.white} accessibilityLabel="Permitir varias opciones" />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, minHeight: 48 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Es una quedada</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Añade fecha, hora y lugar</Text>
              </View>
              <Switch value={isMeetup} onValueChange={setIsMeetup} trackColor={{ false: C.border, true: C.blue }} thumbColor={C.white} accessibilityLabel="Marcar como quedada" />
            </View>

            {isMeetup ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Tap onPress={() => setShowDatePicker(true)} style={{ flex: 1 }} accessibilityLabel="Elegir fecha de la quedada">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 12, minHeight: 44 }}>
                      <CalendarDays size={16} color={C.blue} strokeWidth={2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: meetupDate ? C.text : C.muted, fontSize: 14 }} numberOfLines={1}>
                        {meetupDate ? DAY_FMT.format(meetupDate) : 'Elegir fecha'}
                      </Text>
                    </View>
                  </Tap>
                  <Tap onPress={() => setShowTimePicker(true)} style={{ flex: 1 }} accessibilityLabel="Elegir hora de la quedada">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 12, minHeight: 44 }}>
                      <Clock size={16} color={C.blue} strokeWidth={2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: meetupDate ? C.text : C.muted, fontSize: 14 }} numberOfLines={1}>
                        {meetupDate ? TIME_FMT.format(meetupDate) : 'Elegir hora'}
                      </Text>
                    </View>
                  </Tap>
                </View>
                <TextInput
                  value={meetupPlace} onChangeText={setMeetupPlace} placeholder="Lugar (opcional)"
                  placeholderTextColor={C.muted} maxLength={120}
                  accessibilityLabel="Lugar de la quedada" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={input}
                />
              </View>
            ) : null}

            {showDatePicker ? (
              <DateTimePicker value={meetupDate ?? new Date()} mode="date" minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickDate} />
            ) : null}
            {showTimePicker ? (
              <DateTimePicker value={meetupDate ?? new Date()} mode="time" is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickTime} />
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}><Btn full variant="secondary" label="Cancelar" onPress={onClose} disabled={submitting} /></View>
              <View style={{ flex: 1 }}>
                <Btn full label={isMeetup ? 'Crear quedada' : 'Crear encuesta'} onPress={submit} disabled={!canSubmit} busy={submitting} />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
