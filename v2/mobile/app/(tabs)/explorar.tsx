import { formatAcademicScore } from '@/lib/academic-score';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, LayoutAnimation } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  Building2, Heart, MessageCircle, X, Play, Plus, Check, Search, Star, Award, GraduationCap, Mic,
  PartyPopper, BookOpen, Trophy, Drama, Handshake, Store, Pin, SearchX, Sparkles, WifiOff, Clock, Hash, type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, Skeleton, SectionHeader, Pill, Chip, Avatar, Btn, EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { getEvents, getThreads } from '@/lib/api';
import { getExploreSpots, getUniversityNames, type ExploreSpot } from '@/lib/explore';
import { toggleFollow, getMutualFollowerCounts } from '@/lib/social';
import { captureError } from '@/lib/monitoring';
import { startDirectChat } from '@/lib/chat';
import { useFetch } from '@/lib/useFetch';
import { sortCats } from '@/lib/spaces';
import { getIntent, onIntentChange, getTabPriority } from '@/lib/intent';
import { timeAgo, dateShort, eur, typeLabel } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';
import type { University, Career, EventItem, FomoThread, Scholarship } from '@/lib/types';

// ─── La Lupa: buscador global + feed "Para ti" ──────────────────────────────
// Sin búsqueda, la pestaña es un feed de descubrimiento tipo IG/TikTok: mezcla
// puntuada de publicaciones de universitarios (con nombre y universidad),
// eventos próximos, zonas de ocio y perfiles sugeridos de tu campus. La
// puntuación es un ranking local por afinidad (ciudad, uni, intereses,
// engagement y frescura); el objetivo es que siempre haya algo que tocar.
//
// La cabecera es ligera a propósito: buscador + una fila de categorías. Lo
// que ayuda a buscar (recientes, hashtags seguidos, tendencias) solo sale con
// el buscador enfocado, como en IG, para que el "Para ti" empiece arriba.
// TODO va en un único FlatList (variante virtualizada de Screen): si el
// buscador cambiara de contenedor al enfocarse, el TextInput se remontaría y
// perdería el foco al primer toque.

// Historial de búsquedas: se guarda en el dispositivo (no en la BD) porque es
// una comodidad local, sin valor entre sesiones ni entre dispositivos.
const RECENT_KEY = 'franky_search_recent';
const RECENT_MAX = 8;

// Hashtags seguidos: comodidad local (como Recientes), tope de 20 para que la
// sección "Tus hashtags" no crezca sin control.
const HASHTAG_KEY = 'franky_followed_hashtags';
const HASHTAG_MAX = 20;

// Pestañas de resultados: "Todo" mantiene el resumen; el resto filtra por tipo.
type ResultTab = 'all' | 'people' | 'events' | 'posts' | 'becas' | 'unis';
const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'people', label: 'Gente' },
  { key: 'events', label: 'Eventos' },
  { key: 'posts', label: 'Publicaciones' },
  { key: 'becas', label: 'Becas' },
  { key: 'unis', label: 'Unis' },
];

// Iconos por categoría de evento (los mismos que la pestaña Eventos): un emoji
// cambia de dibujo según el sistema y no se puede teñir con el tema; un icono sí.
const CAT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};

// Las categorías viven en src/lib/spaces.ts (compartidas con el carrusel del
// feed) y aquí se ordenan según la intención de uso: quien vino a buscar piso
// ve Pisos y Roomies primero, quien vino a hacer planes ve Ocio y Eventos.

type SuggestedProfile = {
  id: string; full_name: string | null; avatar_url: string | null;
  university_id: string | null; career: string | null; city?: string | null;
  // 61: cuántas de las personas a las que YO sigo también siguen a este perfil.
  mutualCount?: number;
};

type MixItem =
  | { kind: 'post'; key: string; score: number; post: FomoThread }
  | { kind: 'event'; key: string; score: number; event: EventItem }
  | { kind: 'spot'; key: string; score: number; spot: ExploreSpot }
  | { kind: 'profile'; key: string; score: number; profile: SuggestedProfile };

type Me = { id: string; city: string | null; university_id: string | null; career: string | null; interests: string[] | null };

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 36e5;

// Miniatura de resultado sin foto: marco limpio con hairline y el icono
// suelto dentro. Ocupa el hueco de la imagen, no es un cuadrado tintado.
function Thumb({ icon: Icon, size = 44, color }: { icon: LucideIcon; size?: number; color?: string }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: R.md, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
    }}>
      <Icon size={Math.round(size * 0.44)} color={color ?? C.blue} strokeWidth={1.7} />
    </View>
  );
}

// ── Ranking local ───────────────────────────────────────────────────────────
// media_type admite 'video' en prod (migración 132) aunque el tipo compartido
// aún no lo declare; lo tratamos como string para no romper el build.
const isVideoPost = (t: FomoThread): boolean => (t.media_type as string | null) === 'video';

function scorePost(t: FomoThread, me: Me | null): number {
  let s = 10;
  if (t.media_url && (t.media_type === 'image' || isVideoPost(t))) s += 8;
  if (!t.is_anonymous) s += 4; // con nombre y uni: es lo que da vida social
  s += Math.min(12, t.reaction_count * 1.2 + t.reply_count * 1.5);
  const h = hoursSince(t.created_at);
  if (h < 24) s += 8; else if (h < 72) s += 4;
  if (me?.interests?.length && t.body) {
    const body = t.body.toLowerCase();
    if (me.interests.some(i => body.includes(i.toLowerCase()))) s += 3;
  }
  return s;
}
function scoreEvent(e: EventItem, me: Me | null): number {
  let s = 12;
  if (me?.city && e.city?.toLowerCase().includes(me.city.toLowerCase())) s += 10;
  const days = (new Date(e.start_date).getTime() - Date.now()) / 864e5;
  if (days >= 0 && days <= 7) s += 8; else if (days <= 30) s += 4;
  if (e.is_featured) s += 5;
  if (me?.interests?.length && me.interests.some(i => e.category?.toLowerCase().includes(i.toLowerCase()))) s += 4;
  return s;
}
function scoreSpot(sp: ExploreSpot, me: Me | null): number {
  let s = 6;
  if (me?.city && sp.city?.toLowerCase().includes(me.city.toLowerCase())) s += 10;
  s += (sp.rating ?? 0) * 2;
  return s;
}
// Afinidad: misma carrera pesa más que misma ciudad. El motivo (etiqueta) se
// deriva con la misma prioridad para que orden y explicación coincidan.
function sameCareer(p: SuggestedProfile, me: Me | null): boolean {
  return !!(me?.career && p.career && p.career.toLowerCase() === me.career.toLowerCase());
}
function sameCity(p: SuggestedProfile, me: Me | null): boolean {
  return !!(me?.city && p.city && p.city.toLowerCase() === me.city.toLowerCase());
}
function scoreProfile(p: SuggestedProfile, me: Me | null): number {
  let s = 8;
  if (sameCareer(p, me)) s += 10;
  if (sameCity(p, me)) s += 6;
  // 61: los seguidores en común pesan mucho más que el resto de señales, para
  // que "quien tiene más en común" quede siempre primero; el resto de la
  // puntuación solo desempata entre perfiles con el mismo número.
  s += (p.mutualCount ?? 0) * 100;
  return s;
}
function profileReason(p: SuggestedProfile, me: Me | null): string | null {
  if (sameCareer(p, me)) return 'De tu carrera';
  if (sameCity(p, me)) return 'De tu ciudad';
  return null;
}

// Mezcla las colas rankeadas con un patrón fijo: posts como columna vertebral
// y el resto intercalado para que cada pantalla tenga variedad.
const PATTERN: MixItem['kind'][] = ['post', 'post', 'event', 'post', 'spot', 'post', 'profile', 'event', 'post', 'spot'];
function interleave(queues: Record<MixItem['kind'], MixItem[]>): MixItem[] {
  const out: MixItem[] = [];
  let i = 0;
  while (out.length < 60) {
    let placed = false;
    for (let tries = 0; tries < PATTERN.length; tries++) {
      const kind = PATTERN[(i + tries) % PATTERN.length];
      const item = queues[kind].shift();
      if (item) { out.push(item); placed = true; i += tries + 1; break; }
    }
    if (!placed) break;
  }
  return out;
}

// Hashtags de los posts (#fiesta, #examenes…): top por frecuencia.
function topHashtags(posts: FomoThread[]): string[] {
  const count = new Map<string, number>();
  for (const p of posts) {
    for (const m of (p.body ?? '').matchAll(/#[\p{L}\d_]{2,30}/gu)) {
      const tag = m[0].toLowerCase();
      count.set(tag, (count.get(tag) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
}

// Día y mes cortos para el bloque de fecha de los eventos ("14" / "oct").
function dayMonth(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return { day: String(d.getDate()), month: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '') };
}

// ── Piezas visuales (en memo: el feed se repinta al seguir a alguien y solo
// debe cambiar la tarjeta afectada) ─────────────────────────────────────────

const Sep = () => <View style={{ height: 0.5, backgroundColor: C.borderLight, marginHorizontal: S.lg }} />;

function DateBlock({ iso }: { iso: string }) {
  const { day, month } = dayMonth(iso);
  return (
    <View style={{ width: 44, height: 48, borderRadius: R.md, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 17, fontFamily: FONT.heading, color: C.blue, lineHeight: 20 }}>{day}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 10.5, fontFamily: FONT.semibold, color: C.blue, textTransform: 'uppercase' }}>{month}</Text>
    </View>
  );
}

const PostCard = React.memo(function PostCard({ t, uni, onOpen }: { t: FomoThread; uni: string; onOpen: (id: string) => void }) {
  const name = t.is_anonymous ? 'Anónimo' : (t.author?.full_name ?? 'Estudiante');
  return (
    <Tap onPress={() => onOpen(t.id)} accessibilityLabel={`Publicación de ${name}${t.body ? `: ${t.body}` : ''}`} accessibilityHint="Abre la publicación">
      <View style={{ paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: S.lg, marginBottom: 8 }}>
          <Avatar name={name} uri={t.is_anonymous ? null : t.author?.avatar_url} size={32} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.username} numberOfLines={1}>{t.author?.is_organization ? name : name.toLowerCase().replace(/\s+/g, '.')}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{t.author?.is_organization ? t.author.verified ? '✓ Universidad verificada · ' : 'Organización · ' : uni ? `${uni} · ` : ''}{timeAgo(t.created_at)}</Text>
          </View>
        </View>
        {t.media_url && t.media_type === 'image' ? (
          <Image source={{ uri: t.media_url }} recyclingKey={t.id}
            style={{ marginHorizontal: S.lg, height: 260, borderRadius: R.lg, backgroundColor: C.input }}
            contentFit="cover" transition={120} cachePolicy="memory-disk" />
        ) : t.media_url && isVideoPost(t) ? (
          // Vídeo: no se puede sacar miniatura con expo-image, así que
          // mostramos un bloque negro con play; tocar la tarjeta abre /fomo.
          <View style={{ marginHorizontal: S.lg, height: 260, borderRadius: R.lg, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
            </View>
            <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.sm, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Play size={11} color="#fff" fill="#fff" />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 10.5, fontFamily: FONT.semibold }}>Vídeo</Text>
            </View>
          </View>
        ) : null}
        {t.body ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={3} style={[F.body, { paddingHorizontal: S.lg, marginTop: t.media_url ? 10 : 0, fontSize: 14.5, lineHeight: 20 }]}>{t.body}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: S.lg, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Heart size={15} color={C.muted} strokeWidth={2} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t.reaction_count}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MessageCircle size={15} color={C.muted} strokeWidth={2} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t.reply_count}</Text>
          </View>
        </View>
      </View>
    </Tap>
  );
});

const EventCard = React.memo(function EventCard({ e, onOpen }: { e: EventItem; onOpen: (id: string) => void }) {
  const free = !e.price || Number(e.price) === 0;
  const CatIcon = CAT_ICON[e.category] ?? Pin;
  return (
    <Tap onPress={() => onOpen(e.id)} accessibilityLabel={`Evento: ${e.title}, ${dateShort(e.start_date)}, ${e.city}`} accessibilityHint="Abre el evento">
      <View style={{ paddingVertical: 12 }}>
        {e.image_url ? (
          <Image source={{ uri: e.image_url }} recyclingKey={e.id}
            style={{ marginHorizontal: S.lg, height: 170, borderRadius: R.lg, backgroundColor: C.input, marginBottom: 10 }}
            contentFit="cover" transition={120} cachePolicy="memory-disk" />
        ) : null}
        <View style={{ paddingHorizontal: S.lg, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <DateBlock iso={e.start_date} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{e.title}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{e.city}{e.venue ? ` · ${e.venue}` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              <Pill label={typeLabel[e.category] ?? e.category} tone="blue" icon={CatIcon} />
              <Pill label={free ? 'Gratis' : eur(e.price)} tone={free ? 'green' : 'gray'} />
            </View>
          </View>
        </View>
      </View>
    </Tap>
  );
});

const SpotCard = React.memo(function SpotCard({ sp, onOpen }: { sp: ExploreSpot; onOpen: (id: string) => void }) {
  return (
    <Tap onPress={() => onOpen(sp.id)} accessibilityLabel={`Ocio: ${sp.name}, ${sp.city}`} accessibilityHint="Abre el sitio">
      <View style={{ paddingVertical: 12 }}>
        {sp.image_url ? (
          <Image source={{ uri: sp.image_url }} recyclingKey={sp.id}
            style={{ marginHorizontal: S.lg, height: 160, borderRadius: R.lg, backgroundColor: C.input, marginBottom: 10 }}
            contentFit="cover" transition={120} cachePolicy="memory-disk" />
        ) : null}
        <View style={{ paddingHorizontal: S.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{sp.name}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{(typeLabel[sp.category] ?? sp.category)} · {sp.city}</Text>
          </View>
          {sp.rating ? <Pill label={sp.rating.toFixed(1)} tone="orange" icon={Star} /> : null}
          <Pill label="Ocio" tone="green" />
        </View>
      </View>
    </Tap>
  );
});

const ProfileCard = React.memo(function ProfileCard({ p, uni, reason, followed, onOpen, onFollow, onMessage }: {
  p: SuggestedProfile; uni: string | null; reason: string | null; followed: boolean;
  onOpen: (id: string) => void; onFollow: (id: string) => void; onMessage: (id: string) => void;
}) {
  const mutual = p.mutualCount ?? 0;
  const name = p.full_name ?? 'Estudiante';
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: S.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {/* Avatar y nombre abren el perfil público; los botones siguen aparte. */}
      <Tap onPress={() => onOpen(p.id)} accessibilityLabel={`Ver el perfil de ${name}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Avatar name={p.full_name} uri={p.avatar_url} size={46} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
            {/* Motivo de la sugerencia: por qué aparece en tu "Para ti" */}
            {reason ? <Pill label={reason} tone="blue" /> : null}
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
            {uni ?? 'Tu universidad'}{p.career ? ` · ${p.career}` : ''}
          </Text>
          {/* 61: seguidores en común, solo cuando hay al menos uno. */}
          {mutual > 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>
              {mutual === 1 ? '1 seguidor en común' : `${mutual} seguidores en común`}
            </Text>
          ) : null}
        </View>
      </Tap>
      {followed ? <Btn small variant="secondary" label="Mensaje" onPress={() => onMessage(p.id)} /> : null}
      <Btn small variant={followed ? 'secondary' : 'primary'} label={followed ? 'Siguiendo' : 'Seguir'} onPress={() => onFollow(p.id)}
        accessibilityState={{ selected: followed }} />
    </View>
  );
});

// Pastilla con dos zonas táctiles (texto = buscar, icono = quitar/seguir).
function TagPill({ label, onPress, action, actionLabel, actionSelected, icon: Icon }: {
  label: string; onPress: () => void; action: () => void; actionLabel: string; actionSelected?: boolean; icon?: LucideIcon;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.input, borderRadius: R.full, paddingLeft: 12, paddingRight: 4, minHeight: 34 }}>
      <Tap onPress={onPress} accessibilityLabel={`Buscar ${label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 }}>
        {Icon ? <Icon size={13} color={C.muted} strokeWidth={2.2} /> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, color: C.text, fontFamily: FONT.semibold }}>{label}</Text>
      </Tap>
      <Tap onPress={action} accessibilityLabel={actionLabel} hitSlop={6}
        accessibilityState={actionSelected === undefined ? undefined : { selected: actionSelected }}
        style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: actionSelected ? C.blue : 'transparent' }}>
        {actionSelected === undefined ? <X size={14} color={C.muted} strokeWidth={2.2} />
          : actionSelected ? <Check size={13} color={C.onAccent} strokeWidth={2.6} /> : <Plus size={14} color={C.blue} strokeWidth={2.6} />}
      </Tap>
    </View>
  );
}

// Esqueleto con la silueta de una tarjeta del "Para ti".
function CardSkeleton() {
  return (
    <View style={{ paddingHorizontal: S.lg, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <Skeleton height={32} radius={16} style={{ width: 32, marginBottom: 0, marginHorizontal: 0 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton height={12} radius={6} style={{ width: '40%', marginBottom: 0, marginHorizontal: 0 }} />
          <Skeleton height={10} radius={5} style={{ width: '28%', marginBottom: 0, marginHorizontal: 0 }} />
        </View>
      </View>
      <Skeleton height={220} radius={R.lg} style={{ marginBottom: 10, marginHorizontal: 0 }} />
      <Skeleton height={13} radius={6} style={{ width: '80%', marginBottom: 0, marginHorizontal: 0 }} />
    </View>
  );
}
function RowSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10 }}>
      <Skeleton height={44} radius={22} style={{ width: 44, marginBottom: 0, marginHorizontal: 0 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton height={13} radius={6} style={{ width: '60%', marginBottom: 0, marginHorizontal: 0 }} />
        <Skeleton height={11} radius={5} style={{ width: '35%', marginBottom: 0, marginHorizontal: 0 }} />
      </View>
    </View>
  );
}

export default function Explorar() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const [q, setQ] = useState('');
  // Buscador enfocado: enseña recientes, hashtags y tendencias en vez del feed.
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [followedTags, setFollowedTags] = useState<string[]>([]);
  const [resultTab, setResultTab] = useState<ResultTab>('all');
  const [me, setMe] = useState<Me | null>(null);
  const [uniName, setUniName] = useState<{ id: string; name: string } | null>(null);
  const [posts, setPosts] = useState<FomoThread[]>([]);
  const [suggested, setSuggested] = useState<SuggestedProfile[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [feedReady, setFeedReady] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Resultados de búsqueda
  const [unis, setUnis] = useState<University[]>([]);
  const [careers, setCareers] = useState<Career[]>([]);
  const [profiles, setProfiles] = useState<SuggestedProfile[]>([]);
  const [becas, setBecas] = useState<Scholarship[]>([]);
  const [eventsFound, setEventsFound] = useState<EventItem[]>([]);
  const [postsFound, setPostsFound] = useState<FomoThread[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  // Contador que fuerza relanzar la misma búsqueda ("Reintentar" tras un fallo de red).
  const [searchNonce, setSearchNonce] = useState(0);

  // Categorías ordenadas por la intención elegida en el onboarding. Se
  // suscribe a los cambios para que /ajustes-uso las reordene en caliente.
  const [intent, setIntentState] = useState(getIntent());
  useEffect(() => onIntentChange(setIntentState), []);

  // Búsqueda que llega desde fuera de la pantalla. Al tocar un #hashtag en una
  // publicación de FOMO se navega aquí con `?q=…` (ver src/components/fomo.tsx),
  // pero La Lupa NUNCA leía ese parámetro: TODOS los hashtags abrían el
  // buscador vacío. Se consume y se limpia acto seguido; si no, volver a la
  // pestaña más tarde repescaría la búsqueda vieja como si fuera nueva.
  const entrante = Array.isArray(params.q) ? params.q[0] : params.q;
  useEffect(() => {
    if (!entrante) return;
    setQ(entrante);
    router.setParams({ q: '' });
  }, [entrante, router]);
  const cats = useMemo(() => sortCats(getTabPriority(intent).exploreCategoryOrder), [intent]);

  // Versiones ligeras (columnas justas y 60 zonas como mucho): el feed solo
  // pinta unas pocas tarjetas de ocio y las siglas de cada universidad.
  const allUnis = useFetch(useCallback(() => getUniversityNames(), []), 'explore-university-names');
  const spots = useFetch(useCallback(() => getExploreSpots(), []), 'explore-spots');
  const events = useFetch(useCallback(() => getEvents(), []), 'events');

  const uniShort = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of allUnis.rows ?? []) m.set(u.id, u.short_name ?? u.name);
    return m;
  }, [allUnis.rows]);

  // Perfil propio + contenido social del campus. Reutilizable para "Reintentar".
  const loadSocial = useCallback(async () => {
    setFeedError(false);
    try {
      // Sesión local (sin ida a la red) y perfil con su universidad embebida en
      // UNA consulta; después, publicaciones y sugerencias a la vez. Antes eran
      // seis peticiones en fila antes de pintar el "Para ti".
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) return;
      const { data: profRow, error: profError } = await supabase.from('profiles')
        .select('id, city, university_id, career, interests, universities(id, name, short_name)')
        .eq('id', userId).maybeSingle();
      if (profError) throw profError;
      const { universities: embedded, ...prof } = (profRow ?? {}) as Me & { universities?: unknown };
      const uniRow = (Array.isArray(embedded) ? embedded[0] : embedded) as { id: string; name: string; short_name: string | null } | null | undefined;
      const uni = prof.university_id && uniRow ? { id: uniRow.id, name: uniRow.short_name ?? uniRow.name } : null;
      if (profRow) setMe(prof as Me);
      if (uni) setUniName(uni);
      const universityId = profRow ? (prof as Me).university_id : null;
      const [top, recent, sug] = await Promise.all([
        uni ? getThreads(uni.id, { limit: 30, sort: 'top' }).catch(() => ({ rows: [] as FomoThread[] })) : null,
        uni ? getThreads(uni.id, { limit: 20, sort: 'recent' }).catch(() => ({ rows: [] as FomoThread[] })) : null,
        universityId
          ? supabase.from('public_profiles')
            .select('id, full_name, avatar_url, university_id, career, city')
            .eq('university_id', universityId)
            .neq('id', userId)
            .limit(30)
          : null,
      ]);
      if (top && recent) {
        const seen = new Set<string>();
        setPosts([...top.rows, ...recent.rows].filter(t => !seen.has(t.id) && seen.add(t.id) !== undefined));
      }
      if (sug) {
        const sugRows = (sug.data as SuggestedProfile[]) ?? [];
        setSuggested(sugRows);
        // 61: seguidores en común, fail-soft (si falla, se quedan en 0 y las
        // sugerencias se enseñan igual que antes).
        if (sugRows.length) {
          getMutualFollowerCounts(sugRows.map((p) => p.id))
            .then((counts) => {
              if (!counts.size) return;
              setSuggested((prev) => prev.map((p) => ({ ...p, mutualCount: counts.get(p.id) ?? 0 })));
            })
            .catch(() => { /* sin red o consulta fallida: se quedan sin dato */ });
        }
      }
    } catch {
      // Sin red: el feed se degrada (solo catálogos en caché) y se ofrece reintentar.
      setFeedError(true);
    } finally {
      setFeedReady(true);
    }
  }, []);
  useEffect(() => { loadSocial(); }, [loadSocial]);

  // Tirar hacia abajo en el "Para ti": recarga lo social (posts, sugerencias)
  // y los tres catálogos a la vez. Sin esto la única forma de ver publicaciones
  // nuevas era salir de la pestaña y volver.
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadSocial(), allUnis.refresh(), spots.refresh(), events.refresh()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadSocial, allUnis.refresh, spots.refresh, events.refresh]);

  // Búsqueda global (unis, carreras, perfiles, becas, eventos y posts / #tags).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    setSearching(true);
    setSearchError(false);
    const isTag = term.startsWith('#');
    const h = setTimeout(async () => {
      try {
        const like = `%${term.replace(/^#/, '')}%`;
        const [u, c, p, b, e, th] = await Promise.all([
          isTag ? { data: [] } : supabase.from('universities').select('*').or(`name.ilike.${like},city.ilike.${like},short_name.ilike.${like}`).limit(6),
          isTag ? { data: [] } : supabase.from('careers').select('*, universities(name, short_name)').ilike('name', like).limit(6),
          isTag ? { data: [] } : supabase.from('public_profiles').select('id, full_name, avatar_url, university_id, career').ilike('full_name', like).limit(8),
          isTag ? { data: [] } : supabase.from('scholarships').select('id, name, provider, type, deadline').ilike('name', like).limit(6),
          isTag ? { data: [] } : supabase.from('events').select('*').in('status', ['upcoming', 'ongoing']).or(`title.ilike.${like},city.ilike.${like},venue.ilike.${like}`).limit(6),
          uniName ? getThreads(uniName.id, { search: term, limit: 10 }).catch(() => ({ rows: [] as FomoThread[] })) : { rows: [] as FomoThread[] },
        ]);
        if (!alive) return;
        setUnis((u.data as University[]) ?? []);
        setCareers((c.data as Career[]) ?? []);
        setProfiles((p.data as SuggestedProfile[]) ?? []);
        setBecas((b.data as Scholarship[]) ?? []);
        setEventsFound((e.data as EventItem[]) ?? []);
        setPostsFound(th.rows);
      } catch {
        if (alive) setSearchError(true);
      } finally { if (alive) setSearching(false); }
    }, 350);
    return () => { alive = false; clearTimeout(h); };
  }, [q, uniName, searchNonce]);

  const hashtags = useMemo(() => topHashtags(posts), [posts]);

  const feed = useMemo<MixItem[]>(() => {
    const queues: Record<MixItem['kind'], MixItem[]> = {
      post: posts.map(t => ({ kind: 'post' as const, key: `p:${t.id}`, score: scorePost(t, me), post: t })),
      event: (events.rows ?? []).map(e => ({ kind: 'event' as const, key: `e:${e.id}`, score: scoreEvent(e, me), event: e })),
      spot: (spots.rows ?? []).map(s => ({ kind: 'spot' as const, key: `s:${s.id}`, score: scoreSpot(s, me), spot: s })),
      profile: suggested.map(p => ({ kind: 'profile' as const, key: `u:${p.id}`, score: scoreProfile(p, me), profile: p })),
    };
    for (const k of Object.keys(queues) as MixItem['kind'][]) queues[k].sort((a, b) => b.score - a.score);
    return interleave(queues);
  }, [posts, events.rows, spots.rows, suggested, me]);

  const follow = useCallback(async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const now = await toggleFollow(id);
      setFollowed(prev => {
        const next = new Set(prev);
        if (now) next.add(id); else next.delete(id);
        return next;
      });
    } catch (e) {
      // Aquí seguir es la acción principal de la tarjeta, así que sí se avisa.
      captureError(e, { where: 'explorar.toggleFollow', id });
      toastError('No se pudo seguir', 'Inténtalo de nuevo en unos segundos.');
    }
  }, []);

  // Mensaje directo: abre (o recupera) el chat 1:1 y navega a la conversación.
  const message = useCallback(async (id: string) => {
    try {
      const chatId = await startDirectChat(id);
      if (chatId) router.push(`/chat/${chatId}`);
      else toastError('No se pudo abrir el chat', 'Inténtalo de nuevo en unos segundos.');
    } catch {
      toastError('No se pudo abrir el chat', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }, [router]);

  // ── Historial de búsquedas (local) ──
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(raw => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setRecents(arr.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX));
      } catch { /* json corrupto: lo ignoramos */ }
    }).catch(() => { /* sin storage: el historial simplemente no aparece */ });
  }, []);

  const persistRecents = useCallback((next: string[]) => {
    setRecents(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  // Guarda el término más reciente arriba, sin duplicados y con tope de RECENT_MAX.
  const pushRecent = useCallback((term: string) => {
    const term2 = term.trim();
    if (term2.length < 2) return;
    setRecents(prev => {
      const next = [term2, ...prev.filter(r => r.toLowerCase() !== term2.toLowerCase())].slice(0, RECENT_MAX);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const removeRecent = useCallback((term: string) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    persistRecents(recents.filter(r => r !== term));
  }, [recents, persistRecents, reduceMotion]);
  const clearRecents = useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    persistRecents([]);
  }, [persistRecents, reduceMotion]);

  // ── Hashtags seguidos (local) ──
  useEffect(() => {
    AsyncStorage.getItem(HASHTAG_KEY).then(raw => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setFollowedTags(arr.filter((x): x is string => typeof x === 'string').slice(0, HASHTAG_MAX));
      } catch { /* json corrupto: lo ignoramos */ }
    }).catch(() => { /* sin storage: no aparece la sección */ });
  }, []);
  const isTagFollowed = useCallback((tag: string) => followedTags.includes(tag.toLowerCase()), [followedTags]);
  const toggleTag = useCallback((tag: string) => {
    Haptics.selectionAsync().catch(() => {});
    const tl = tag.toLowerCase();
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFollowedTags(prev => {
      const next = prev.includes(tl) ? prev.filter(x => x !== tl) : [tl, ...prev].slice(0, HASHTAG_MAX);
      AsyncStorage.setItem(HASHTAG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [reduceMotion]);

  // Al cambiar el término de búsqueda, vuelve a "Todo": las pestañas son por búsqueda.
  useEffect(() => { setResultTab('all'); }, [q]);

  // Abre un resultado y recuerda el término buscado (señal fuerte de intención).
  // Recibe la navegación como callback para conservar las rutas tipadas de expo-router.
  const openResult = useCallback((go: () => void) => {
    pushRecent(q);
    go();
  }, [q, pushRecent]);

  const cancelSearch = useCallback(() => {
    setQ('');
    inputRef.current?.blur();
    setFocused(false);
  }, []);

  const openPost = useCallback((id: string) => router.push(`/fomo/${id}`), [router]);
  const openEvent = useCallback((id: string) => router.push(`/evento/${id}`), [router]);
  const openSpot = useCallback((id: string) => router.push(`/ocio/${id}`), [router]);
  const openProfile = useCallback((id: string) => router.push(`/perfil/${id}`), [router]);

  // ── Tarjetas del feed ──
  // Cada tarjeta del "Para ti" entra en cascada con su índice.
  const renderItem = useCallback(({ item, index }: { item: MixItem; index: number }) => {
    const body = (() => {
      if (item.kind === 'post') {
        const t = item.post;
        const uni = (!t.is_anonymous && t.author?.university_id ? uniShort.get(t.author.university_id) : null) ?? uniName?.name ?? '';
        return <><PostCard t={t} uni={uni} onOpen={openPost} /><Sep /></>;
      }
      if (item.kind === 'event') return <><EventCard e={item.event} onOpen={openEvent} /><Sep /></>;
      if (item.kind === 'spot') return <><SpotCard sp={item.spot} onOpen={openSpot} /><Sep /></>;
      const p = item.profile;
      return (
        <>
          <ProfileCard p={p} uni={p.university_id ? (uniShort.get(p.university_id) ?? null) : null} reason={profileReason(p, me)}
            followed={followed.has(p.id)} onOpen={openProfile} onFollow={follow} onMessage={message} />
          <Sep />
        </>
      );
    })();
    return <FadeIn index={index} distance={12}>{body}</FadeIn>;
  }, [uniShort, uniName, followed, follow, message, me, openPost, openEvent, openSpot, openProfile]);
  const keyExtractor = useCallback((i: MixItem) => i.key, []);

  const showResults = q.trim().length >= 2;
  const showDiscovery = focused && !showResults;
  const showFeed = !showResults && !focused;

  // Visibilidad por pestaña. "Todo" enseña todo; Unis agrupa universidades y
  // carreras (ambas académicas).
  const all = resultTab === 'all';
  const showPosts = all || resultTab === 'posts';
  const showPeople = all || resultTab === 'people';
  const showEvents = all || resultTab === 'events';
  const showBecas = all || resultTab === 'becas';
  const showUnis = all || resultTab === 'unis';
  // Nº de resultados visibles en la pestaña actual, para el mensaje de vacío.
  const tabCount =
    (showPosts ? postsFound.length : 0) + (showPeople ? profiles.length : 0) +
    (showEvents ? eventsFound.length : 0) + (showBecas ? becas.length : 0) +
    (showUnis ? unis.length + careers.length : 0);

  // Cabecera: buscador (con Cancelar al enfocar) + categorías o pestañas de
  // resultados + panel de descubrimiento o resultados. Es un elemento (no un
  // componente inline) para que el FlatList lo reconcilie sin remontarlo.
  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: S.md, paddingHorizontal: S.lg, marginBottom: S.sm, gap: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.input, borderRadius: R.full, paddingHorizontal: 14, minHeight: 44 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Search size={17} color={C.muted} strokeWidth={2.2} />
          </View>
          <TextInput
            ref={inputRef}
            value={q} onChangeText={setQ}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder="Gente, eventos, becas, unis, #hashtags…"
            placeholderTextColor={C.muted}
            returnKeyType="search" autoCorrect={false} autoCapitalize="none"
            onSubmitEditing={() => pushRecent(q)}
            accessibilityLabel="Buscar en Franky"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ flex: 1, fontSize: 15.5, color: C.text, paddingVertical: 0, marginLeft: 9 }}
          />
          {q ? (
            <Tap onPress={() => setQ('')} style={{ marginLeft: 8 }} accessibilityLabel="Limpiar búsqueda" hitSlop={8}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <X size={13} color={C.text} strokeWidth={2.4} />
              </View>
            </Tap>
          ) : null}
        </View>
        {focused || showResults ? <Btn variant="link" label="Cancelar" onPress={cancelSearch} haptic={false} /> : null}
      </View>

      {showResults ? (
        // Pestañas de resultados: solo con búsqueda activa.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 4 }}>
          {RESULT_TABS.map(tab => (
            <Chip key={tab.key} label={tab.label} active={resultTab === tab.key} accessibilityRole="tab" onPress={() => setResultTab(tab.key)} />
          ))}
        </ScrollView>
      ) : (
        // Una fila de categorías: los catálogos, en el orden de tu intención.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 6 }}>
          {cats.map(cat => (
            <Chip key={cat.key} label={(cat.wideLabel ?? cat.label)()} icon={cat.icon} onPress={() => router.push(cat.href)} accessibilityHint="Abre el catálogo" />
          ))}
        </ScrollView>
      )}

      {showDiscovery ? (
        <View style={{ paddingTop: S.sm }}>
          {recents.length ? (
            <View style={{ paddingHorizontal: S.lg, paddingBottom: S.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Recientes</Text>
                <Btn variant="link" small label="Borrar todo" onPress={clearRecents} haptic={false} accessibilityLabel="Borrar todo el historial de búsqueda" />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recents.map(term => (
                  <TagPill key={term} label={term} icon={Clock} onPress={() => setQ(term)}
                    action={() => removeRecent(term)} actionLabel={`Quitar ${term} del historial`} />
                ))}
              </View>
            </View>
          ) : null}
          {/* Tus hashtags seguidos: tocar busca ese tag, la X deja de seguirlo. */}
          {followedTags.length ? (
            <View style={{ paddingHorizontal: S.lg, paddingBottom: S.md }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Tus hashtags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {followedTags.map(tag => (
                  <TagPill key={tag} label={tag} onPress={() => setQ(tag)}
                    action={() => toggleTag(tag)} actionLabel={`Dejar de seguir ${tag}`} />
                ))}
              </View>
            </View>
          ) : null}
          {/* Tendencias hoy: cada hashtag rellena el buscador y tiene botón Seguir. */}
          {hashtags.length ? (
            <View style={{ paddingBottom: S.md }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, marginBottom: 8 }]}>Tendencias hoy</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: S.lg, gap: 8 }}>
                {hashtags.map(tag => {
                  const following = isTagFollowed(tag);
                  return (
                    <TagPill key={tag} label={tag} onPress={() => setQ(tag)}
                      action={() => toggleTag(tag)} actionSelected={following}
                      actionLabel={following ? `Dejar de seguir ${tag}` : `Seguir ${tag}`} />
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          {!recents.length && !followedTags.length && !hashtags.length ? (
            <EmptyState compact icon={Hash} title="Busca lo que quieras"
              subtitle="Gente de tu campus, eventos, becas, universidades o un #hashtag." />
          ) : null}
        </View>
      ) : null}

      {showResults ? (
        <View style={{ paddingBottom: S.lg }}>
          {searching && tabCount === 0 ? (
            <View accessible accessibilityRole="progressbar" accessibilityLabel="Buscando" accessibilityState={{ busy: true }} style={{ paddingTop: S.md }}>
              <RowSkeleton /><RowSkeleton /><RowSkeleton />
            </View>
          ) : null}
          {showPosts && postsFound.length ? (
            <View>
              <SectionHeader title="Publicaciones" />
              {postsFound.map(t => {
                const author = t.is_anonymous ? 'Anónimo' : (t.author?.full_name ?? 'Estudiante');
                const isVideo = isVideoPost(t);
                return (
                  <Tap key={t.id} onPress={() => openResult(() => router.push(`/fomo/${t.id}`))}
                    accessibilityLabel={`Publicación de ${author}${t.body ? `: ${t.body}` : ''}`}>
                    <View style={{ paddingHorizontal: S.lg, paddingVertical: 9, flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 60 }}>
                      {t.media_url && t.media_type === 'image' ? (
                        <Image source={{ uri: t.media_url }} recyclingKey={t.id} style={{ width: 48, height: 48, borderRadius: R.md, backgroundColor: C.input }} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <Thumb icon={isVideo ? Play : t.media_type === 'audio' ? Mic : MessageCircle} size={48} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={[F.body, { fontSize: 14 }]}>
                          {t.body ?? (isVideo ? 'Vídeo' : t.media_type === 'audio' ? 'Nota de voz' : 'Foto')}
                        </Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{author} · {timeAgo(t.created_at)}</Text>
                      </View>
                    </View>
                  </Tap>
                );
              })}
            </View>
          ) : null}
          {showPeople && profiles.length ? (
            <View>
              <SectionHeader title="Gente" />
              {profiles.map(p => (
                <View key={p.id} style={{ paddingHorizontal: S.lg, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60 }}>
                  {/* Avatar y nombre abren el perfil público; Seguir/Mensaje intactos. */}
                  <Tap onPress={() => openResult(() => router.push(`/perfil/${p.id}`))} accessibilityLabel={`Ver el perfil de ${p.full_name ?? 'Estudiante'}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Avatar name={p.full_name} uri={p.avatar_url} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{p.full_name ?? 'Estudiante'}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
                        {(p.university_id ? uniShort.get(p.university_id) : null) ?? 'Universidad'}{p.career ? ` · ${p.career}` : ''}
                      </Text>
                    </View>
                  </Tap>
                  {followed.has(p.id) ? (
                    <Btn small variant="secondary" label="Mensaje" onPress={() => message(p.id)} />
                  ) : null}
                  <Btn small variant={followed.has(p.id) ? 'secondary' : 'primary'}
                    label={followed.has(p.id) ? 'Siguiendo' : 'Seguir'} onPress={() => follow(p.id)} />
                </View>
              ))}
            </View>
          ) : null}
          {showEvents && eventsFound.length ? (
            <View>
              <SectionHeader title="Eventos" />
              {eventsFound.map(e => {
                const free = !e.price || Number(e.price) === 0;
                return (
                  <Tap key={e.id} onPress={() => openResult(() => router.push(`/evento/${e.id}`))} accessibilityLabel={`Evento: ${e.title}, ${dateShort(e.start_date)}, ${e.city}`}>
                    <View style={{ paddingHorizontal: S.lg, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
                      <DateBlock iso={e.start_date} />
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{e.title}</Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{e.city}{e.venue ? ` · ${e.venue}` : ''}</Text>
                      </View>
                      <Pill label={free ? 'Gratis' : eur(e.price)} tone={free ? 'green' : 'gray'} />
                    </View>
                  </Tap>
                );
              })}
            </View>
          ) : null}
          {showBecas && becas.length ? (
            <View>
              <SectionHeader title="Becas" />
              {becas.map(b => (
                <Tap key={b.id} onPress={() => openResult(() => router.push(`/beca/${b.id}`))} accessibilityLabel={`Beca: ${b.name}`}>
                  <View style={{ paddingHorizontal: S.lg, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
                    <Thumb icon={Award} size={44} color={C.accent3} />
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{b.name}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{b.provider}</Text>
                    </View>
                    {b.deadline ? <Pill label={`Hasta ${dateShort(b.deadline)}`} tone="orange" icon={Clock} /> : null}
                  </View>
                </Tap>
              ))}
            </View>
          ) : null}
          {showUnis && unis.length ? (
            <View>
              <SectionHeader title="Universidades" />
              {unis.map(u => (
                <Tap key={u.id} onPress={() => openResult(() => router.push(`/uni/${u.id}`))} accessibilityLabel={`Universidad: ${u.name}, ${u.city}`}>
                  <View style={{ paddingHorizontal: S.lg, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
                    {u.logo_url ? (
                      <Image source={{ uri: u.logo_url }} recyclingKey={u.id} style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderLight }} contentFit="contain" cachePolicy="memory-disk" />
                    ) : <Thumb icon={Building2} size={44} />}
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{u.short_name ?? u.name}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{u.city}</Text>
                    </View>
                  </View>
                </Tap>
              ))}
            </View>
          ) : null}
          {showUnis && careers.length ? (
            <View>
              <SectionHeader title="Carreras" />
              {careers.map(c => (
                <Tap key={c.id} onPress={() => openResult(() => router.push(`/carrera/${c.id}`))} accessibilityLabel={`Carrera: ${c.name}`}>
                  <View style={{ paddingHorizontal: S.lg, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
                    <Thumb icon={GraduationCap} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{c.name}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{c.universities?.short_name ?? c.universities?.name ?? ''}</Text>
                    </View>
                    {c.cut_off_score ? <Pill label={`Nota ${formatAcademicScore(c.cut_off_score)}`} tone="blue" /> : null}
                  </View>
                </Tap>
              ))}
            </View>
          ) : null}
          {!searching && tabCount === 0 ? (
            searchError ? (
              <EmptyState compact icon={WifiOff} title="No se pudo buscar" subtitle="Revisa tu conexión e inténtalo de nuevo."
                cta="Reintentar" onCta={() => setSearchNonce(n => n + 1)} />
            ) : (
              <EmptyState compact icon={SearchX} title={all ? 'Nada por aquí' : 'Sin resultados en esta pestaña'}
                subtitle={all ? 'Prueba con otra búsqueda o un #hashtag.' : 'Prueba en "Todo" para ver el resto.'} />
            )
          ) : null}
        </View>
      ) : null}

      {showFeed && uniName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: 2 }}>
          <Sparkles size={13} color={C.blue} strokeWidth={2.2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Para ti · {uniName.name}</Text>
        </View>
      ) : null}
      {showFeed && feedError && feed.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: S.lg, marginTop: S.sm, padding: 10, borderRadius: R.md, backgroundColor: `${C.warning}1F` }}>
          <WifiOff size={16} color={C.warning} strokeWidth={2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>Sin conexión: te enseñamos lo último que cargamos.</Text>
          <Btn small variant="ghost" label="Reintentar" onPress={loadSocial} />
        </View>
      ) : null}
    </View>
  );

  // Estado del "Para ti" cuando la lista está vacía: cargando, sin red o sin
  // perfil suficiente para mezclar nada.
  const feedEmpty = !feedReady ? (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
      <CardSkeleton /><CardSkeleton />
    </View>
  ) : feedError ? (
    <EmptyState icon={WifiOff} title="No se pudo cargar tu Para ti"
      subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={loadSocial} />
  ) : (
    <EmptyState icon={Sparkles} title="Tu Para ti está calentando"
      subtitle="Completa tu perfil (universidad y ciudad) y te mezclamos publicaciones, eventos y planes de tu campus."
      cta="Completar perfil" onCta={() => router.push('/perfil')} />
  );

  return (
    <Screen<MixItem>
      title="Buscar"
      scrollTopKey="explorar"
      // Solo en el "Para ti": con el buscador activo el gesto chocaría con la
      // lista de resultados y no hay nada que refrescar ahí.
      refreshing={refreshing}
      onRefresh={showFeed ? refreshAll : undefined}
      data={showFeed ? feed : []}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={showFeed ? feedEmpty : null}
    />
  );
}
