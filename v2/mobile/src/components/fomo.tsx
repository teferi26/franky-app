// ─── Piezas compartidas de FOMO: nota de voz, encuesta y texto enriquecido ──
// Se usan en el feed y en el detalle del hilo para no duplicar lógica.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleProp, TextStyle, Modal, Pressable, FlatList, LayoutAnimation,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Play, Pause, Check, Mic, MessageCircle } from 'lucide-react-native';
import { Tap, Avatar, SkeletonList, EmptyState } from './ui';
import { voteFomoPoll, getMyUniversitySlug } from '@/lib/api';
import { getMyChats, sendTextMessage } from '@/lib/chat';
import { parseRichText } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { useReduceMotion, MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';
import type { FomoPoll } from '@/lib/types';
import type { ChatListItem } from '@/lib/types';

// Texto con #hashtags y @menciones resaltados (mejora 22). #hashtag navega a
// la Lupa con el término; @mención de momento solo se resalta (no hay id de
// usuario en el texto plano, así que no hay a dónde navegar todavía).
export function RichText({ text, style, numberOfLines }: {
  text: string; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const router = useRouter();
  const tokens = parseRichText(text);
  return (
    <Text style={style} numberOfLines={numberOfLines} maxFontSizeMultiplier={MAX_FONT_SCALE}>
      {tokens.map((tok, i) => {
        if (tok.type === 'text') return <Text key={i}>{tok.value}</Text>;
        if (tok.type === 'hashtag') {
          return (
            <Text key={i} style={{ color: C.blue, fontFamily: FONT.semibold }}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/explorar', params: { q: tok.value.slice(1) } })}>
              {tok.value}
            </Text>
          );
        }
        return <Text key={i} style={{ color: C.blue, fontFamily: FONT.semibold }}>{tok.value}</Text>;
      })}
    </Text>
  );
}

// Un solo audio sonando a la vez: al darle play a una nota se pausa la anterior.
let activeNote: React.MutableRefObject<() => void> | null = null;

const clock = (s: number) =>
  Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : null;

export function AudioNote({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const pauseRef = useRef<() => void>(() => {});
  pauseRef.current = () => player.pause();

  // Al desmontar (scroll fuera de la ventana del FlatList) el player nativo se
  // libera: si esta nota era la activa, hay que soltar la referencia global o
  // el siguiente play intentaría pausar un player muerto.
  useEffect(() => {
    return () => {
      if (activeNote === pauseRef) activeNote = null;
    };
  }, []);

  const toggle = () => {
    if (status.playing) { player.pause(); return; }
    if (activeNote && activeNote !== pauseRef) {
      try { activeNote.current(); } catch { /* player ya liberado */ }
    }
    activeNote = pauseRef;
    if (status.didJustFinish) player.seekTo(0);
    player.play();
  };

  const dur = clock(status.duration);
  const pos = clock(status.currentTime);
  const progress = status.duration > 0 ? Math.min(status.currentTime / status.duration, 1) : 0;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface,
      borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, padding: 12,
    }}>
      <Tap haptic onPress={toggle} hitSlop={6}
        accessibilityLabel={status.playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}>
        {/* El disco va en el color de acción: es el único control de la nota
            y así se lee como "esto se toca". El icono adapta su color
            al fondo violeta del tema. */}
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
          {status.playing
            ? <Pause size={16} color={C.onAccent} fill={C.onAccent} strokeWidth={1.5} />
            : <Play size={16} color={C.onAccent} fill={C.onAccent} strokeWidth={1.5} style={{ marginLeft: 2 }} />}
        </View>
      </Tap>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: C.blue, borderRadius: 2 }} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontFamily: FONT.medium }]}>
          Nota de voz{dur ? ` · ${status.playing && pos ? `${pos} / ` : ''}${dur}` : ''}
        </Text>
      </View>
      <Mic size={16} color={C.muted} strokeWidth={1.8} />
    </View>
  );
}

// Encuesta de un hilo. Voto único y no editable: si my_option_id viene null se
// puede votar (optimista, con revert si la RPC falla); si no, solo resultados.
export function ThreadPoll({ poll }: { poll: FomoPoll }) {
  const reduceMotion = useReduceMotion();
  const [localVote, setLocalVote] = useState<string | null>(null);
  // El voto local solo "cuenta" mientras el servidor aún no lo refleja.
  const bump = localVote !== null && poll.my_option_id === null;
  const voted = poll.my_option_id ?? localVote;
  const options = [...poll.options]
    .sort((a, b) => a.position - b.position)
    .map(o => (bump && o.id === localVote ? { ...o, vote_count: o.vote_count + 1 } : o));
  const total = poll.total_votes + (bump ? 1 : 0);

  const vote = async (optionId: string) => {
    if (voted) return;
    // El paso de "botones" a "barras de resultado" cambia la altura del
    // bloque: se anima para que no dé un salto seco.
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLocalVote(optionId);
    const { ok } = await voteFomoPoll(optionId);
    if (!ok) {
      setLocalVote(null);
      toastError('No se pudo votar', 'Inténtalo de nuevo en unos segundos.');
    }
  };

  return (
    <View style={{ borderWidth: 0.5, borderColor: C.border, backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 9 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{poll.question}</Text>
      {options.map(o => {
        if (!voted) {
          return (
            <Tap key={o.id} haptic onPress={() => vote(o.id)} accessibilityLabel={`Votar ${o.label}`}>
              <View style={{ borderWidth: 1.5, borderColor: C.blue, borderRadius: R.md, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.blue, textAlign: 'center' }} numberOfLines={1}>
                  {o.label}
                </Text>
              </View>
            </Tap>
          );
        }
        const mine = o.id === voted;
        const pct = total > 0 ? Math.round((o.vote_count / total) * 100) : 0;
        return (
          <View key={o.id} accessible accessibilityLabel={`${o.label}, ${pct} por ciento${mine ? ', tu voto' : ''}`}
            style={{ borderRadius: R.md, backgroundColor: C.input, overflow: 'hidden' }}>
            {/* Relleno de la opción votada: acento TRANSLÚCIDO (deriva de C.blue,
                que cambia con el tema) para que el texto encima siga legible en
                oscuro y en franky. */}
            <View style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
              backgroundColor: mine ? `${C.blue}33` : C.borderLight,
            }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 12, gap: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontSize: 13.5, fontFamily: mine ? FONT.semibold : undefined, color: C.text }} numberOfLines={1}>
                {o.label}
              </Text>
              {mine ? <Check size={14} color={C.blue} strokeWidth={2.5} /> : null}
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12.5, fontFamily: FONT.semibold, color: C.text }}>{pct} %</Text>
            </View>
          </View>
        );
      })}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{total === 1 ? '1 voto' : `${total} votos`} · voto único</Text>
    </View>
  );
}

// ─── Enviar un post por privado (mejora 59) ──────────────────────────────
// Hoja "Enviar a…": lista las conversaciones (getMyChats, de src/lib/chat.ts,
// que NO se toca) y al elegir una manda un mensaje de texto con el cuerpo
// recortado + el enlace del hilo (sendTextMessage, mismo fichero). Se usa
// tanto desde el feed como desde el detalle del hilo, de ahí que viva aquí.
export type SendablePost = { id: string; body: string | null };

const ChatRow = React.memo(function ChatRow({ chat, sending, disabled, onSend }: {
  chat: ChatListItem; sending: boolean; disabled: boolean; onSend: (id: string) => void;
}) {
  const title = chat.other_user?.full_name ?? chat.group_name ?? 'Chat de grupo';
  return (
    <Tap onPress={disabled ? undefined : () => onSend(chat.id)} disabled={disabled}
      accessibilityLabel={`Enviar a ${title}`} accessibilityState={{ busy: sending }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 56 }}>
        <Avatar name={title} uri={chat.other_user?.avatar_url ?? chat.group_avatar_url} size={40} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]} numberOfLines={1}>{title}</Text>
        {sending ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontFamily: FONT.semibold, color: C.blue }]}>Enviando…</Text>
        ) : null}
      </View>
    </Tap>
  );
});

export function SendPostSheet({ thread, onClose }: {
  thread: SendablePost | null;
  onClose: () => void;
}) {
  const visible = !!thread;
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setChats(null); return; }
    let alive = true;
    getMyChats()
      .then((list) => { if (alive) setChats(list); })
      .catch(() => { if (alive) setChats([]); }); // sin red: lista vacía, no rompe la hoja
    return () => { alive = false; };
  }, [visible]);

  const send = useCallback(async (chatId: string) => {
    if (!thread) return;
    setSendingTo(chatId);
    let ok = false;
    try {
      const flat = (thread.body ?? '').replace(/\s+/g, ' ').trim();
      const snippet = flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
      // Enlace público del campus (/fomo/{slug}, migración 144): la web no
      // tiene página por hilo, un UUID ahí caía en una landing vacía. Sin
      // slug, a la portada. El recorte del post da contexto al enlace.
      const slug = await getMyUniversitySlug();
      const url = slug ? `https://franky.es/fomo/${slug}` : 'https://franky.es';
      const text = `${snippet || 'Mira esta publicación en Franky'}\n\n${url}`;
      const res = await sendTextMessage(chatId, text);
      ok = res.ok;
    } catch {
      ok = false;
    } finally {
      setSendingTo(null);
    }
    onClose();
    // El toast no es modal, así que no hace falta esperar a que la hoja se
    // cierre (con Alert sí había que esperar por el desmontaje del Modal).
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Enviado', 'La publicación ya está en el chat.');
    } else {
      toastError('No se pudo enviar', 'Inténtalo de nuevo en unos segundos.');
    }
  }, [thread, onClose]);

  const renderItem = useCallback(({ item }: { item: ChatListItem }) => (
    <ChatRow chat={item} sending={sendingTo === item.id} disabled={!!sendingTo} onSend={send} />
  ), [sendingTo, send]);
  const keyExtractor = useCallback((c: ChatListItem) => c.id, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose}
        accessibilityLabel="Cerrar" accessibilityRole="button" />
      {/* Mismo patrón que OptionsSheet (asa, R.xl, C.surface): así todas las
          hojas inferiores de la app se sienten la misma pieza. */}
      <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 8, paddingBottom: 30, maxHeight: '70%' }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 6 }} />
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.h3, { paddingHorizontal: S.lg, paddingTop: 8, paddingBottom: 6, color: C.muted }]}>
          Enviar a…
        </Text>
        {chats === null ? (
          <View style={{ paddingTop: S.sm }}><SkeletonList count={3} height={56} /></View>
        ) : chats.length === 0 ? (
          <EmptyState compact icon={MessageCircle} title="Aún no tienes chats"
            subtitle="Escribe a alguien de tu campus y podrás mandarle publicaciones desde aquí." />
        ) : (
          <FlatList
            data={chats}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            removeClippedSubviews
            initialNumToRender={8}
            keyboardShouldPersistTaps="handled"
          />
        )}
        <Tap onPress={onClose} accessibilityLabel="Cancelar">
          <View style={{ paddingHorizontal: S.lg, paddingVertical: 13, minHeight: 48, justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15.5, color: C.muted }}>Cancelar</Text>
          </View>
        </Tap>
      </View>
    </Modal>
  );
}
