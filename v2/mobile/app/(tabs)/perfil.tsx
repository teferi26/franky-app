import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Alert, Modal, FlatList, Pressable, ScrollView, Share, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import {
  Menu, Ticket, CalendarDays, Bookmark, Bell, BellRing, ShieldCheck, ChevronRight, LogOut, Grid3X3, Trash2,
  X, Camera, Moon, Wallet, ReceiptText, ShieldOff, Users, Share2, Play, Link as LinkIcon,
  Plus, Lock, Heart, AlignLeft, Film, Sparkles, HelpCircle, Lightbulb,
  BarChart3, VolumeX, ShoppingBag, UsersRound, UserPlus, Globe, MessageCircle, Send, Compass, Home,
  GraduationCap, MapPin, Flame, Eye, Map as MapIcon, type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Btn, Tap, EmptyState, ProgressBar, NavRow, Pill, IconCircle } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { VideoPlayer } from '@/components/VideoPlayer';
import { GridTile } from '@/components/GridTile';
import { CreateMenu } from '@/components/CreateMenu';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { supabase, WEB_URL } from '@/lib/supabase';
import { unregisterPushToken, resumePushRegistration, registerForPushNotifications } from '@/lib/push';
import { clearOwnedNotifications, resumeLocalNotifications } from '@/lib/local-notifications';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { createSessionExit } from '@/lib/session-exit';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { loadCardPromoState, peekCardPromoState } from '@/lib/card-promo-state';
import { markOwnedCacheFresh, ownedCacheAge, readOwnedCache, writeOwnedCache, dropOwnedCache } from '@/lib/owner-cache';
import { afterInteractions } from '@/lib/defer';
import { useSessionGuard } from '@/lib/useSessionGuard';
import { clearOfflineQueue } from '@/lib/offline-queue';
import { getMyUniversitySlug } from '@/lib/api';
import {
  getSocialCounts, listFollowLinks, getHighlights, deleteHighlight, getProfileActivity,
  type SocialCounts, type Highlight,
} from '@/lib/social';
import { startDirectChat } from '@/lib/chat';
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme-switch';
import { getStreak, type Streak } from '@/lib/streak';
import { timeAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT, SHADOW } from '@/theme';
import type { Profile } from '@/lib/types';
import { CardPromo } from '@/components/card/CardPromo';

type MyPost = {
  id: string; body: string | null; media_url: string | null;
  media_type: 'image' | 'audio' | 'video' | null;
  is_anonymous: boolean; created_at: string;
  // Contadores reales del hilo (columnas fomo_threads.reply_count/reaction_count,
  // mantenidas por trigger desde la migración 078).
  reply_count: number; reaction_count: number;
};

// Secciones del perfil:
//   publico  → línea de tiempo (perfil + texto + media)
//   grid     → rejilla de fotos y vídeos
//   videos   → solo vídeos
//   privado  → posts anónimos (SOLO su dueño)
type GridTab = 'publico' | 'grid' | 'videos' | 'privado';

type FollowPerson = { id: string; full_name: string | null; avatar_url: string | null };

const exitSession = createSessionExit({
  current: isCurrentSessionIdentity,
  revoke: unregisterPushToken,
  clearLocal: clearOwnedNotifications,
  clearQueue: clearOfflineQueue,
  signOut: () => supabase.auth.signOut({ scope: 'local' }),
  resume: owner => {
    resumePushRegistration(owner); resumeLocalNotifications(owner);
    if (isCurrentSessionIdentity(owner)) void registerForPushNotifications(owner.userId);
  },
});

// ─── Menú de ajustes, en SECCIONES ──────────────────────────────────────────
// Antes eran 24 filas idénticas seguidas. Ahora se agrupan por lo que la
// persona busca: su actividad, la comunidad, la cuenta y la app. Las
// herramientas de estudio (horario, nota media, comparar, trámites) ya no
// viven aquí: tienen su pestaña (Estudio).
type MenuItem = { key: string; icon: LucideIcon; label: () => string; note: () => string; route: string };
type MenuSection = { key: string; title: () => string; items: MenuItem[] };

const MENU: MenuSection[] = [
  {
    key: 'activity', title: () => t('perfil.sectionActivity'),
    items: [
      { key: 'workspaces', icon: Grid3X3, label: () => 'Franky Pro', note: () => 'Tu negocio, tus pisos o tu comunidad', route: '/pro' },
      { key: 'serviceBookings', icon: CalendarDays, label: () => 'Mis citas y reservas', note: () => 'Servicios, clases y cambios de horario', route: '/card-mis-reservas' },
      { key: 'frankyCard', icon: Wallet, label: () => 'Franky Card y fidelización', note: () => 'Tu tarjeta, ventajas, sellos y premios de cada negocio', route: '/franky-card' },
      { key: 'myRental', icon: Home, label: () => 'Mi alquiler', note: () => 'Invitaciones, contratos y firmas de tu vivienda', route: '/mi-alquiler' },
      { key: 'myVisits', icon: MapPin, label: () => 'Mis visitas', note: () => 'Reservas, pagos y devoluciones', route: '/mis-visitas' },
      { key: 'cityNews', icon: Grid3X3, label: () => 'Novedades de tu ciudad', note: () => 'Planes y publicaciones de comunidades y negocios', route: '/novedades-ciudad' },
      { key: 'saved', icon: Bookmark, label: () => t('perfil.menuSaved'), note: () => t('perfil.menuSavedNote'), route: '/favoritos' },
      { key: 'tickets', icon: Ticket, label: () => t('perfil.menuTickets'), note: () => t('perfil.menuTicketsNote'), route: '/entradas' },
      { key: 'myEvents', icon: BarChart3, label: () => t('perfil.menuMyEvents'), note: () => t('perfil.menuMyEventsNote'), route: '/mis-eventos' },
      { key: 'wallet', icon: Wallet, label: () => t('perfil.menuWallet'), note: () => t('perfil.menuWalletNote'), route: '/cartera' },
      { key: 'invoices', icon: ReceiptText, label: () => t('perfil.menuInvoices'), note: () => t('perfil.menuInvoicesNote'), route: '/facturas' },
      { key: 'myListings', icon: Home, label: () => t('perfil.menuMyListings'), note: () => t('perfil.menuMyListingsNote'), route: '/mis-pisos' },
    ],
  },
  {
    key: 'community', title: () => t('perfil.sectionCommunity'),
    items: [
      { key: 'communities', icon: UsersRound, label: () => t('perfil.menuCommunities'), note: () => t('perfil.menuCommunitiesNote'), route: '/comunidades' },
      { key: 'market', icon: ShoppingBag, label: () => t('perfil.menuMarket'), note: () => t('perfil.menuMarketNote'), route: '/mercado' },
      { key: 'roomie', icon: Users, label: () => t('perfil.menuRoomie'), note: () => t('perfil.menuRoomieNote'), route: '/roomie-editar' },
      { key: 'invite', icon: UserPlus, label: () => t('perfil.menuInvite'), note: () => t('perfil.menuInviteNote'), route: '/invitar' },
    ],
  },
  {
    key: 'account', title: () => t('perfil.sectionAccount'),
    items: [
      { key: 'notifications', icon: Bell, label: () => t('perfil.menuNotifications'), note: () => t('perfil.menuNotificationsNote'), route: '/notificaciones' },
      { key: 'notificationSettings', icon: BellRing, label: () => t('perfil.menuNotificationSettings'), note: () => t('perfil.menuNotificationSettingsNote'), route: '/ajustes-notificaciones' },
      { key: 'privacy', icon: ShieldCheck, label: () => t('perfil.menuPrivacy'), note: () => t('perfil.menuPrivacyNote'), route: '/privacidad' },
      { key: 'security', icon: Lock, label: () => t('perfil.menuSecurity'), note: () => t('perfil.menuSecurityNote'), route: '/seguridad' },
      { key: 'communitySafety', icon: ShieldCheck, label: () => 'Seguridad de la comunidad', note: () => 'Denuncias, normas y contacto', route: '/centro-seguridad' },
      { key: 'blocked', icon: ShieldOff, label: () => t('perfil.menuBlocked'), note: () => t('perfil.menuBlockedNote'), route: '/bloqueados' },
      { key: 'muted', icon: VolumeX, label: () => t('perfil.menuMuted'), note: () => t('perfil.menuMutedNote'), route: '/silenciados' },
    ],
  },
  {
    key: 'app', title: () => t('perfil.sectionApp'),
    items: [
      { key: 'language', icon: Globe, label: () => t('ajustesIdioma.title'), note: () => t('ajustesIdioma.autoNote'), route: '/ajustes-idioma' },
      { key: 'intent', icon: Compass, label: () => t('perfil.menuIntent'), note: () => t('perfil.menuIntentNote'), route: '/ajustes-uso' },
      { key: 'tour', icon: MapIcon, label: () => t('perfil.menuTour'), note: () => t('perfil.menuTourNote'), route: '/tour' },
      { key: 'news', icon: Sparkles, label: () => t('perfil.menuNews'), note: () => t('perfil.menuNewsNote'), route: '/novedades' },
      { key: 'help', icon: HelpCircle, label: () => t('perfil.menuHelp'), note: () => t('perfil.menuHelpNote'), route: '/ayuda' },
      { key: 'suggest', icon: Lightbulb, label: () => t('perfil.menuSuggest'), note: () => t('perfil.menuSuggestNote'), route: '/sugerencias' },
    ],
  },
];

export default function Perfil() {
  const { uid } = useSessionIdentity();
  const sessionOwner = useSessionOwner();
  if (!uid || !sessionOwner || sessionOwner.userId !== uid) return <Screen title="Perfil"><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{uid === undefined || uid ? 'Cargando tu perfil…' : 'Inicia sesión para ver tu perfil.'}</Text></Screen>;
  return <OwnedPerfil key={`${sessionOwner.userId}:${sessionOwner.generation}`} owner={sessionOwner.userId} generation={sessionOwner.generation} />;
}

function isConfirmedAccessFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, status } = error as { code?: string; status?: number };
  return status === 401 || status === 403 || ['user_not_found', 'account_unavailable', 'session_not_found', 'bad_jwt', 'user_banned', '42501', 'PGRST301', 'PGRST302'].includes(code ?? '');
}

// Lo que se recuerda del perfil (en memoria, por cuenta y sesión) para
// pintarlo al instante al volver a la pestaña.
type ProfileSnapshot = {
  profile: Profile; uniName: string | null; counts: SocialCounts; posts: MyPost[]; hasMorePosts: boolean;
  highlights: Highlight[]; activity: { views: number; newFollowers: number }; tienePisos: boolean; streak: Streak | null;
};
const PROFILE_CACHE = 'perfil';
const PROFILE_EXTRA_CACHE = 'perfil-extra';
// Publicaciones por página (antes se pedían 90 de golpe y se pintaban todas).
const POSTS_PAGE = 30;
// Al volver a la pestaña: el perfil y las publicaciones se revisan en segundo
// plano si pasaron más de 5 s; contadores, destacadas y racha, cada 30 s.
const FOCUS_RELOAD_MS = 5_000;
const EXTRA_RELOAD_MS = 30_000;
const POST_COLUMNS = 'id, body, media_url, media_type, is_anonymous, created_at, reply_count, reaction_count';

function sameJson(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function OwnedPerfil({ owner, generation }: { owner: string; generation: number }) {
  const workspaceContext = useWorkspace();
  const sessionKey = useMemo<SessionIdentity>(() => ({ userId: owner, generation }), [owner, generation]);
  const [cached] = useState(() => readOwnedCache<ProfileSnapshot>(sessionKey, PROFILE_CACHE));
  const knownCard = peekCardPromoState(sessionKey);
  const [cardEnabled, setCardEnabled] = useState(knownCard?.enabled ?? false);
  const [cardMember, setCardMember] = useState(knownCard?.member ?? false);
  // Sin apagar la tarjeta en cada foco (parpadeaba): se parte de lo conocido y
  // la consulta solo se repite pasado un minuto.
  useFocusEffect(useCallback(() => {
    let alive = true;
    void loadCardPromoState(sessionKey).then(result => {
      if (alive && isCurrentSessionIdentity(sessionKey)) { setCardEnabled(result.enabled); setCardMember(result.member); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [sessionKey]));
  const isCurrent = useSessionGuard(owner);
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [profile, setProfile] = useState<Profile | null>(cached?.profile ?? null);
  const [checked, setChecked] = useState(!!cached);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadRequest = useRef(0);
  const loading = useRef(false);
  const [counts, setCounts] = useState<SocialCounts>(cached?.counts ?? { posts: 0, followers: 0, following: 0 });
  const [posts, setPosts] = useState<MyPost[]>(cached?.posts ?? []);
  const [hasMorePosts, setHasMorePosts] = useState(cached?.hasMorePosts ?? false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [followList, setFollowList] = useState<{ kind: 'followers' | 'following'; title: string; people: FollowPerson[] } | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>(cached?.highlights ?? []);
  const [openHighlight, setOpenHighlight] = useState<Highlight | null>(null);
  const [gridTab, setGridTab] = useState<GridTab>('publico');
  const [shareOpen, setShareOpen] = useState(false);
  const [activity, setActivity] = useState<{ views: number; newFollowers: number }>(cached?.activity ?? { views: 0, newFollowers: 0 });
  const [tienePisos, setTienePisos] = useState(cached?.tienePisos ?? false);
  const [uniName, setUniName] = useState<string | null>(cached?.uniName ?? null);
  const [streak, setStreak] = useState<Streak | null>(cached?.streak ?? null);
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref());

  // Instantánea en memoria para el próximo montaje (misma cuenta y sesión).
  useEffect(() => {
    if (!profile) { dropOwnedCache(sessionKey, PROFILE_CACHE); return; }
    writeOwnedCache<ProfileSnapshot>(sessionKey, PROFILE_CACHE, { profile, uniName, counts, posts, hasMorePosts, highlights, activity, tienePisos, streak });
  }, [sessionKey, profile, uniName, counts, posts, hasMorePosts, highlights, activity, tienePisos, streak]);

  const clearPrivateProfile = useCallback(() => {
    setProfile(null); setUniName(null); setPosts([]); setHasMorePosts(false); setHighlights([]); setOpenHighlight(null);
    setCounts({ posts: 0, followers: 0, following: 0 }); setActivity({ views: 0, newFollowers: 0 });
    setTienePisos(false); setStreak(null); setFollowList(null); setCardEnabled(false); setCardMember(false);
    setShareOpen(false); setMenuOpen(false); setCreateOpen(false);
  }, []);

  // Contadores, visitas, destacadas, racha y pisos: secundarios, fail-soft y
  // lanzados cuando termina la animación de entrada para no competir con ella.
  const loadExtras = useCallback((sessionIdentity: SessionIdentity, current: () => boolean) => {
    markOwnedCacheFresh(sessionIdentity, PROFILE_EXTRA_CACHE);
    afterInteractions(() => {
      if (!current()) return;
      getSocialCounts(owner).then(value => { if (current()) setCounts(prev => sameJson(prev, value) ? prev : value); }).catch(() => {});
      getProfileActivity(7).then(value => { if (current()) setActivity(prev => sameJson(prev, value) ? prev : value); }).catch(() => {});
      getHighlights(owner).then(value => { if (current()) setHighlights(prev => sameJson(prev, value) ? prev : value); }).catch(() => {});
      getStreak().then(value => { if (current()) setStreak(prev => sameJson(prev, value) ? prev : value); }).catch(() => {});
      supabase
        .from('accommodations')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', owner)
        .then(({ count, error }) => { if (current() && !error) setTienePisos((count ?? 0) > 0); }, () => {});
    });
  }, [owner]);

  // mode 'full': carga visible (primera vez, tirar para refrescar, Reintentar),
  // con la comprobación de la cuenta en el servidor (auth.getUser).
  // mode 'silent': revisión en segundo plano al volver a la pestaña, sin
  // indicador y sin auth.getUser, que va a la red y retiene el candado de auth
  // (mientras dura, TODAS las demás consultas de la app esperan). Si la cuenta
  // ya no es válida, la propia lectura del perfil falla y se trata igual.
  const load = useCallback(async (mode: 'full' | 'silent' = 'full') => {
    const sessionIdentity = captureSessionIdentity();
    if (!sessionIdentity || sessionIdentity.userId !== owner || !isCurrent()) return;
    const request = ++loadRequest.current;
    const current = () => request === loadRequest.current && isCurrent() && isCurrentSessionIdentity(sessionIdentity);
    const silent = mode === 'silent';
    loading.current = true;
    if (!silent) setRefreshing(true);
    try {
      if (!silent) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!current()) return;
        if (authError) throw authError;
        if (!user || user.id !== owner) { clearPrivateProfile(); throw new Error('profile_unavailable'); }
      }
      // Perfil y publicaciones EN PARALELO (antes iban en fila). Si ya se
      // habían cargado más páginas, se revisan todas las que hay en pantalla.
      const postsLimit = Math.min(Math.max(POSTS_PAGE, postsRef.current.length), POSTS_PAGE * 4);
      const [profileResult, postsResult] = await Promise.all([
        supabase.from('profiles').select('*, universities(name, short_name)').eq('id', owner).maybeSingle(),
        supabase
          .from('fomo_threads')
          .select(POST_COLUMNS)
          .eq('author_id', owner)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(postsLimit),
      ]);
      if (!current()) return;
      const { data, error, status } = profileResult;
      if (error) {
        if (status === 401 || status === 403) clearPrivateProfile();
        throw error;
      }
      if (!data || data.id !== owner) { clearPrivateProfile(); throw new Error('profile_unavailable'); }
      const row = (data ?? null) as (Profile & { universities?: { name: string; short_name: string | null } | null }) | null;
      // Sin cambios, sin repintar (la pestaña se revisa en cada foco).
      setProfile(prev => sameJson(prev, row) ? prev : row);
      setUniName(row?.universities?.short_name ?? row?.universities?.name ?? null);
      setLoadError(false);
      if (!postsResult.error) {
        const mine = (postsResult.data as MyPost[] | null) ?? [];
        setPosts(prev => sameJson(prev, mine) ? prev : mine);
        setHasMorePosts(mine.length === postsLimit);
      }
      markOwnedCacheFresh(sessionIdentity, PROFILE_CACHE);
      if (!silent || ownedCacheAge(sessionIdentity, PROFILE_EXTRA_CACHE) >= EXTRA_RELOAD_MS) loadExtras(sessionIdentity, current);
    } catch (error) {
      if (current()) {
        // Red/servidor transitorio: conservar la última carga. Acceso denegado: borrar datos privados, sin cerrar la sesión aquí.
        if (isConfirmedAccessFailure(error)) clearPrivateProfile();
        setLoadError(true);
      }
    } finally {
      if (request === loadRequest.current) loading.current = false;
      if (current()) { setChecked(true); setRefreshing(false); }
    }
  }, [clearPrivateProfile, isCurrent, owner, loadExtras]);

  const reload = useCallback(() => { void load('full'); }, [load]);

  // Siguiente página de publicaciones (por fecha, sin saltos si entran nuevas).
  const loadMorePosts = useCallback(async () => {
    const last = postsRef.current[postsRef.current.length - 1];
    if (!last || loadingMorePosts) return;
    const request = loadRequest.current;
    setLoadingMorePosts(true);
    try {
      const { data, error } = await supabase
        .from('fomo_threads')
        .select(POST_COLUMNS)
        .eq('author_id', owner)
        .eq('is_deleted', false)
        .lt('created_at', last.created_at)
        .order('created_at', { ascending: false })
        .limit(POSTS_PAGE);
      if (request !== loadRequest.current || !isCurrent()) return;
      if (error) { toastError(t('common.tryAgain')); return; }
      const page = (data as MyPost[] | null) ?? [];
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...page.filter(p => !seen.has(p.id))];
      });
      setHasMorePosts(page.length === POSTS_PAGE);
    } catch {
      toastError(t('common.tryAgain'));
    } finally {
      setLoadingMorePosts(false);
    }
  }, [owner, isCurrent, loadingMorePosts]);

  const esPropietario = profile?.role === 'propietario';
  const esStaff = profile?.role === 'admin' || profile?.role === 'analyst';
  const menu = useMemo(() => MENU.map((sec) => ({
    ...sec,
    items: sec.items.filter((it) => (it.key !== 'frankyCard' || cardEnabled) && (it.key !== 'myListings' || (!esPropietario && tienePisos)) && (it.key !== 'workspaces' || workspaceContext.enabled || workspaceContext.workspaces.length > 0)),
  })), [esPropietario, tienePisos, workspaceContext.enabled, workspaceContext.workspaces.length, cardEnabled]);

  const profileUrl = profile ? `https://franky.es/perfil/${profile.id}` : 'https://franky.es';
  const shareLink = useCallback(async () => {
    try {
      await Share.share({ message: t('perfil.shareProfileMessage', { url: profileUrl }), url: profileUrl });
    } catch { /* el usuario canceló */ }
  }, [profileUrl]);

  // Antes cualquier evento de auth (también la renovación silenciosa del token
  // y el INITIAL_SESSION del alta del listener) recargaba el perfil entero.
  // El cambio de cuenta ya remonta la pantalla (key por cuenta y sesión).
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === 'USER_UPDATED') void load('silent'); });
    return () => { sub.subscription.unsubscribe(); };
  }, [load]);
  // Al entrar: con datos ya pintados, revisión en segundo plano cuando acaba
  // la animación del cambio de pestaña; sin datos, carga normal.
  useFocusEffect(useCallback(() => {
    if (loading.current) return;
    if (!profileRef.current) { void load('full'); return; }
    if (ownedCacheAge(sessionKey, PROFILE_CACHE) < FOCUS_RELOAD_MS) return;
    return afterInteractions(() => { void load('silent'); });
  }, [load, sessionKey]));

  // Filtros de las pestañas del perfil: solo se recalculan si cambian las
  // publicaciones (antes, en cada repintado de la pantalla).
  const { publicPosts, mediaPosts, videoPosts, privatePosts } = useMemo(() => ({
    publicPosts: posts.filter((p) => !p.is_anonymous),
    mediaPosts: posts.filter((p) => !p.is_anonymous && !!p.media_url),
    videoPosts: posts.filter((p) => !p.is_anonymous && p.media_type === 'video'),
    privatePosts: posts.filter((p) => p.is_anonymous),
  }), [posts]);

  const managePost = useCallback((p: MyPost) => {
    Alert.alert(t('perfil.myPostTitle'), undefined, [
      { text: t('perfil.view'), onPress: () => router.push(`/fomo/${p.id}`) },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'), style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.rpc('delete_fomo_thread', { p_thread_id: p.id });
              if (error) { toastError(t('common.deleteError'), t('common.deleteErrorBody')); return; }
              setPosts((prev) => prev.filter((x) => x.id !== p.id));
              setCounts((prev) => ({ ...prev, posts: Math.max(0, prev.posts - (p.is_anonymous ? 0 : 1)) }));
            },
          },
        ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }, [router]);
  const openPost = useCallback((id: string) => router.push(`/fomo/${id}`), [router]);

  const openFollowList = async (kind: 'followers' | 'following') => {
    if (!profile) return;
    try {
      const people = await listFollowLinks(profile.id, kind);
      setFollowList({ kind, title: kind === 'followers' ? t('perfil.followersTitle') : t('perfil.followingTitle'), people });
    } catch {
      toastError(t('common.tryAgain'));
    }
  };

  if (!checked) {
    return (
      <Screen title={t('perfil.title')}>
        <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.borderLight }} />
          <View style={{ width: 160, height: 18, borderRadius: 9, backgroundColor: C.borderLight }} />
          <View style={{ width: 220, height: 12, borderRadius: 6, backgroundColor: C.borderLight }} />
        </View>
      </Screen>
    );
  }
  if (!profile) {
    return (
      <Screen title={t('perfil.title')}>
        {loadError ? <>
          <EmptyState icon={Grid3X3} title="No hemos podido cargar tu perfil" subtitle="Vuelve a intentarlo en unos momentos." />
          <View style={{ alignItems: 'center' }}><Btn label="Reintentar" busy={refreshing} onPress={reload} /></View>
        </> : <EmptyState icon={Grid3X3} title={t('perfil.emptyTitle')} subtitle={t('perfil.emptyBody')}
          cta={t('perfil.emptyCta')} onCta={() => router.push('/welcome')} />}
      </Screen>
    );
  }

  const username = (profile.full_name ?? profile.email ?? 'yo').split('@')[0].toLowerCase().replace(/\s+/g, '.');
  const tile = (width - S.lg * 2 - 4) / 3;

  const completion = (() => {
    const checks: { ok: boolean; label: string }[] = [
      { ok: !!profile.avatar_url, label: t('perfil.fieldPhoto') },
      { ok: !!profile.full_name, label: t('perfil.fieldName') },
      { ok: !!profile.bio, label: t('perfil.fieldBio') },
      { ok: !!profile.university_id, label: t('perfil.fieldUniversity') },
      { ok: !!profile.city, label: t('perfil.fieldCity') },
      { ok: !!profile.interests?.length, label: t('perfil.fieldInterests') },
    ];
    const done = checks.filter((c) => c.ok).length;
    return { pct: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c.ok).map((c) => c.label) };
  })();

  const renderGrid = (
    items: { id: string; body: string | null; media_url: string | null; media_type: MyPost['media_type']; is_anonymous: boolean }[],
    empty: { icon: LucideIcon; title: string; sub: string },
    own: boolean,
  ) => {
    if (items.length === 0) {
      return <EmptyState compact icon={empty.icon} title={empty.title} subtitle={empty.sub} />;
    }
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: S.lg }}>
        {items.map((p) => (
          <Pressable key={p.id} onPress={() => openPost(p.id)} delayLongPress={450}
            onLongPress={own ? () => managePost(p as MyPost) : undefined}>
            <GridTile uri={p.media_url} body={p.body} tile={tile} isVideo={p.media_type === 'video'} isAnon={p.is_anonymous} />
          </Pressable>
        ))}
      </View>
    );
  };

  const identity = [uniName, profile.career, profile.university_course ? `${profile.university_course}º` : null].filter(Boolean).join(' · ');

  return (
    <Screen
      scrollTopKey="perfil"
      title={t('perfil.title')}
      refreshing={refreshing}
      onRefresh={reload}
      right={
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Tap onPress={() => setCreateOpen(true)} accessibilityLabel={t('perfil.createA11y')} haptic hitSlop={8}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color={C.onAccent} strokeWidth={2.2} />
          </Tap>
          <Tap onPress={() => setMenuOpen(true)} accessibilityLabel={t('perfil.openMenuA11y')} hitSlop={12}
            style={{ width: 30, height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Menu size={22} color={C.text} strokeWidth={1.75} />
          </Tap>
        </View>
      }>

      {loadError ? <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: S.lg, paddingTop: S.md, gap: 8 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No hemos podido actualizar tu perfil. Se muestran los últimos datos cargados.</Text>
        <Btn small label="Reintentar" busy={refreshing} onPress={reload} />
      </View> : null}

      {/* ── Identidad: avatar grande, nombre grande y el resto en susurro ── */}
      <FadeIn>
      <View style={{ alignItems: 'center', paddingTop: S.xl, paddingHorizontal: S.lg }}>
        <Tap onPress={() => router.push('/editar-perfil')} accessibilityLabel={t('perfil.editProfile')}>
          <Avatar name={profile.full_name ?? profile.email ?? t('common.me')} uri={profile.avatar_url} size={104} ring />
        </Tap>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 28, letterSpacing: -0.9, marginTop: 14, textAlign: 'center' }]} numberOfLines={1}>
          {profile.full_name ?? t('common.student')}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 3 }]}>@{username}</Text>
        {identity ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <GraduationCap size={14} color={C.blue} strokeWidth={1.8} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontFamily: FONT.semibold, fontSize: 13 }} numberOfLines={1}>{identity}</Text>
          </View>
        ) : (
          <Tap onPress={() => router.push('/editar-perfil')} accessibilityLabel={t('perfil.fieldUniversity')}
            style={{ marginTop: 10, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.muted, fontSize: 13, fontFamily: FONT.medium }}>{t('perfil.addUniversityCta')}</Text>
          </Tap>
        )}
        {profile.bio ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center', marginTop: 10, color: C.text }]}>{profile.bio}</Text>
        ) : null}
        {profile.city ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <MapPin size={12} color={C.muted} strokeWidth={2.2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{profile.city}</Text>
          </View>
        ) : null}
        {profile.interests?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' }}>
            {profile.interests.slice(0, 8).map((it) => <Pill key={it} label={it} />)}
          </View>
        ) : null}
      </View>
      </FadeIn>

      {/* ── Números que importan ── */}
      <FadeIn index={1}>
      <View style={[{
        flexDirection: 'row', marginHorizontal: S.lg, marginTop: S.lg, backgroundColor: C.surface, borderRadius: R.lg,
        borderWidth: 0.5, borderColor: C.border, paddingVertical: 14,
      }, SHADOW.card]}>
        <StatCell value={counts.posts || publicPosts.length} label={t('perfil.statPosts')} />
        <View style={{ width: 1, backgroundColor: C.borderLight }} />
        <StatCell value={counts.followers} label={t('perfil.statFollowers')} onPress={() => openFollowList('followers')} />
        <View style={{ width: 1, backgroundColor: C.borderLight }} />
        <StatCell value={counts.following} label={t('perfil.statFollowing')} onPress={() => openFollowList('following')} />
        <View style={{ width: 1, backgroundColor: C.borderLight }} />
        <StatCell value={streak?.count ?? 0} label={t('perfil.statStreak')} icon={Flame} tone={C.accent3} onPress={() => router.push('/(tabs)/estudio')} />
      </View>
      </FadeIn>
      {activity.views > 0 || activity.newFollowers > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          <Eye size={13} color={C.muted} strokeWidth={2.2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{t('perfil.weeklyViews', { count: activity.views })}</Text>
          {activity.newFollowers > 0 ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.success, fontFamily: FONT.semibold }]}>{t('perfil.weeklyNewFollowers', { count: activity.newFollowers })}</Text> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: S.lg, marginTop: S.lg }}>
        <View style={{ flex: 1 }}>
          <Btn variant="secondary" full small label={t('perfil.editProfile')} onPress={() => router.push('/editar-perfil')} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn variant="secondary" full small label={t('perfil.publish')} onPress={() => router.push('/publicar')} />
        </View>
        <Tap onPress={() => setShareOpen(true)} accessibilityLabel={t('perfil.shareProfileA11y')}
          style={{ width: 44, borderRadius: R.md, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
          <Share2 size={18} color={C.text} strokeWidth={1.8} />
        </Tap>
      </View>

      {completion.pct < 100 ? (
        <Tap onPress={() => router.push('/editar-perfil')} accessibilityLabel={t('perfil.completeProfileA11y')}
          style={[{ marginHorizontal: S.lg, marginTop: S.md, padding: 15, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, gap: 10 }, SHADOW.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>{t('perfil.completionTitle', { pct: completion.pct })}</Text>
            <ChevronRight size={18} color={C.muted} />
          </View>
          <ProgressBar value={completion.pct} />
          {completion.missing.length ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t('perfil.completionMissing', { missing: completion.missing.join(', ') })}</Text> : null}
        </Tap>
      ) : null}

      {/* Destacadas (copia persistente de historias) */}
      {highlights.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: S.lg, gap: 14 }}>
          {highlights.map((h) => (
            <Pressable key={h.id} onPress={() => setOpenHighlight(h)} delayLongPress={450}
              onLongPress={() => Alert.alert(t('perfil.highlightDefault'), undefined, [
                { text: t('perfil.view'), onPress: () => setOpenHighlight(h) },
                {
                  text: t('perfil.highlightRemove'), style: 'destructive',
                  onPress: async () => {
                    const out = await deleteHighlight(h.id);
                    if (!out.ok) { toastError(t('perfil.highlightRemoveError'), t('common.tryAgain')); return; }
                    setHighlights((prev) => prev.filter((x) => x.id !== h.id));
                  },
                },
                { text: t('common.cancel'), style: 'cancel' },
              ])}>
              <View style={{ alignItems: 'center', width: 64 }}>
                <View style={{ width: 60, height: 60, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden', backgroundColor: C.input }}>
                  <Image source={{ uri: h.media_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
                </View>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 11, color: C.text, marginTop: 4, maxWidth: 62, fontFamily: FONT.medium }}>
                  {h.caption?.trim() || t('perfil.highlightDefault')}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {cardEnabled && !cardMember ? <CardPromo style={{ marginHorizontal: S.lg, marginTop: S.lg }} /> : null}

      {/* Pestañas del perfil */}
      <View style={{ flexDirection: 'row', marginHorizontal: S.lg, marginTop: S.lg, backgroundColor: C.input, borderRadius: R.full, padding: 3 }}>
        {([
          ['publico', AlignLeft, t('perfil.tabActivity')],
          ['grid', Grid3X3, t('perfil.tabPhotos')],
          ['videos', Film, t('perfil.tabVideos')],
          ['privado', Lock, t('perfil.tabPrivate')],
        ] as const).map(([key, Icon, label]) => {
          const active = gridTab === key;
          return (
            <Tap key={key} onPress={() => setGridTab(key)} accessibilityLabel={label} accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: R.full, backgroundColor: active ? C.surface : 'transparent', ...(active ? SHADOW.card : {}) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon size={15} color={active ? C.blue : C.muted} strokeWidth={active ? 2.4 : 1.9} />
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 11.5, fontFamily: active ? FONT.semibold : FONT.medium, color: active ? C.text : C.muted }}>{label}</Text>
              </View>
            </Tap>
          );
        })}
      </View>

      <View style={{ paddingTop: S.md }}>
        {gridTab === 'publico' ? (
          publicPosts.length === 0 ? (
            <EmptyState compact icon={AlignLeft} title={t('perfil.publicEmptyTitle')} subtitle={t('perfil.publicEmptyBody')}
              cta={t('feed.createPost')} onCta={() => router.push('/publicar')} />
          ) : (
            <View style={{ paddingHorizontal: S.lg, gap: 10 }}>
              {publicPosts.map((p) => (
                <ProfilePostRow key={p.id} p={p} name={profile.full_name ?? t('common.student')}
                  avatarName={profile.full_name ?? profile.email ?? t('common.me')} avatarUri={profile.avatar_url}
                  onOpen={openPost} onManage={managePost} />
              ))}
            </View>
          )
        ) : gridTab === 'grid' ? (
          renderGrid(mediaPosts, { icon: Camera, title: t('perfil.photosEmptyTitle'), sub: t('perfil.photosEmptyBody') }, true)
        ) : gridTab === 'videos' ? (
          renderGrid(videoPosts, { icon: Film, title: t('perfil.videosEmptyTitle'), sub: t('perfil.videosEmptyBody') }, true)
        ) : (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.lg, paddingBottom: 8 }}>
              <Lock size={13} color={C.muted} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t('perfil.privateNotice')}</Text>
            </View>
            {renderGrid(privatePosts, { icon: Lock, title: t('perfil.privateEmptyTitle'), sub: t('perfil.privateEmptyBody') }, true)}
          </View>
        )}
        {hasMorePosts ? (
          <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
            <Btn variant="secondary" full small label="Ver más publicaciones" busy={loadingMorePosts} onPress={loadMorePosts} />
          </View>
        ) : null}
      </View>

      {/* ── Menú de ajustes, por secciones ── */}
      <Modal visible={menuOpen} animationType="slide" transparent onRequestClose={() => setMenuOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setMenuOpen(false)} accessibilityLabel={t('perfil.closeMenuA11y')} />
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '86%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>{t('perfil.settingsTitle')}</Text>
              <Tap onPress={() => setMenuOpen(false)} accessibilityLabel={t('perfil.closeMenuA11y')} hitSlop={8}>
                <X size={22} color={C.text} />
              </Tap>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
              {/* Accesos destacados por rol */}
              {(esStaff || esPropietario) ? (
                <View style={{ marginHorizontal: S.lg, marginBottom: S.sm, backgroundColor: C.accentSoft, borderRadius: R.lg }}>
                  {esStaff ? (
                    <NavRow icon={ShieldCheck} title={profile.role === 'admin' ? t('perfil.menuAdminPanel') : t('perfil.menuAnalystPanel')}
                      note={t('perfil.menuPanelNote')} onPress={() => { setMenuOpen(false); router.push('/admin'); }} />
                  ) : null}
                  {esPropietario ? (
                    <NavRow icon={Home} title={t('perfil.menuMyListings')} note={t('perfil.menuMyListingsNote')}
                      onPress={() => { setMenuOpen(false); router.push('/mis-pisos'); }} />
                  ) : null}
                </View>
              ) : null}

              {menu.map((sec) => (
                <View key={sec.key} style={{ marginBottom: S.sm }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: 4 }]}>{sec.title()}</Text>
                  <View style={{ marginHorizontal: S.lg, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' }}>
                    {sec.items.map((it, i) => (
                      <View key={it.key} style={i > 0 ? { borderTopWidth: 1, borderTopColor: C.borderLight } : undefined}>
                        <NavRow icon={it.icon} title={it.label()} note={it.note()} onPress={() => { setMenuOpen(false); router.push(it.route as never); }} />
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              {/* Tema */}
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: 4 }]}>{t('perfil.theme')}</Text>
              <View style={{ marginHorizontal: S.lg, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconCircle icon={Moon} size={38} />
                <View style={{ flexDirection: 'row', flex: 1, backgroundColor: C.input, borderRadius: R.full, padding: 3 }}>
                  {([['franky', t('perfil.themeFranky')], ['light', t('perfil.themeLight')], ['dark', t('perfil.themeDark')], ['auto', t('perfil.themeAuto')]] as [ThemePref, string][]).map(([p, label]) => {
                    const active = themePref === p;
                    return (
                      <Tap key={p} onPress={() => { setThemePrefState(p); setThemePref(p); }} accessibilityLabel={t('perfil.themeA11y', { label })}
                        accessibilityRole="tab" accessibilityState={{ selected: active }} style={{ flex: 1 }}>
                        <View style={{ paddingVertical: 7, borderRadius: R.full, alignItems: 'center', backgroundColor: active ? C.blue : 'transparent' }}>
                          <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 12, fontFamily: FONT.semibold, color: active ? C.onAccent : C.muted }}>{label}</Text>
                        </View>
                      </Tap>
                    );
                  })}
                </View>
              </View>

              {/* Zona de cuenta: cerrar sesión y borrar, al fondo */}
              <View style={{ marginHorizontal: S.lg, marginTop: S.lg, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.borderLight, overflow: 'hidden' }}>
                <NavRow icon={LogOut} title={t('perfil.logout')} tone="danger" right={<View />} onPress={async () => {
                  setMenuOpen(false);
                  const identity = captureSessionIdentity();
                  if (!identity || identity.userId !== owner || !isCurrent()) return;
                  try { await exitSession(identity); }
                  catch {
                    if (isCurrentSessionIdentity(identity)) Alert.alert('No se ha cerrado la sesión', 'No hemos podido retirar los avisos de este dispositivo. Comprueba tu conexión y vuelve a intentarlo.');
                  }
                }} />
                <View style={{ borderTopWidth: 1, borderTopColor: C.borderLight }}>
                  <NavRow icon={Trash2} title={t('perfil.deleteAccount')} note={t('perfil.deleteAccountNote')} tone="danger" right={<View />}
                    accessibilityLabel={t('perfil.deleteAccountA11y')} onPress={() => { setMenuOpen(false); router.push('/eliminar-cuenta'); }} />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Lista de seguidores / siguiendo ── */}
      <Modal visible={followList !== null} animationType="slide" transparent onRequestClose={() => setFollowList(null)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setFollowList(null)} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '70%', paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>{followList?.title}</Text>
            <Tap onPress={() => setFollowList(null)} accessibilityLabel={t('common.close')} hitSlop={8}><X size={22} color={C.text} /></Tap>
          </View>
          {followList?.people.length === 0 ? (
            <EmptyState compact icon={Users} title={followList.kind === 'followers' ? t('perfil.noFollowers') : t('perfil.noFollowing')} />
          ) : (
            <FlatList
              data={followList?.people ?? []}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10 }}>
                  <Tap style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                    accessibilityLabel={t('perfil.viewProfileA11y', { name: item.full_name ?? t('common.student') })}
                    onPress={() => { setFollowList(null); router.push(`/perfil/${item.id}`); }}>
                    <Avatar name={item.full_name} uri={item.avatar_url} size={44} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]} numberOfLines={1}>{item.full_name ?? t('common.student')}</Text>
                  </Tap>
                  <Btn small variant="secondary" label={t('perfil.message')} onPress={async () => {
                    const chatId = await startDirectChat(item.id);
                    if (!chatId) { toastError(t('perfil.chatOpenError'), t('common.tryAgain')); return; }
                    setFollowList(null);
                    router.push(`/chat/${chatId}`);
                  }} />
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── Destacada a pantalla completa ── */}
      <Modal visible={openHighlight !== null} animationType="fade" transparent onRequestClose={() => setOpenHighlight(null)}>
        {/* Visor de destacados: negro fijo en los tres temas, como el Lightbox. */}
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {openHighlight ? (
            openHighlight.media_type === 'video' ? (
              <VideoPlayer key={openHighlight.id} uri={openHighlight.media_url} style={{ width, height }} contentFit="contain" autoPlay startMuted={false} />
            ) : (
              <Image source={{ uri: openHighlight.media_url }} style={{ width, height }} contentFit="contain" />
            )
          ) : null}
          {openHighlight?.caption ? (
            <View style={{ position: 'absolute', bottom: 60, left: 20, right: 20 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 15, textAlign: 'center' }}>{openHighlight.caption}</Text>
            </View>
          ) : null}
          <Tap onPress={() => setOpenHighlight(null)} accessibilityLabel={t('common.close')} hitSlop={10} style={{ position: 'absolute', top: 50, right: 18 }}>
            <X size={28} color="#fff" />
          </Tap>
        </View>
      </Modal>

      {/* ── Compartir perfil: QR + enlace ── */}
      <Modal visible={shareOpen} animationType="slide" transparent onRequestClose={() => setShareOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setShareOpen(false)} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>{t('perfil.shareProfileTitle')}</Text>
            <Tap onPress={() => setShareOpen(false)} accessibilityLabel={t('common.close')} hitSlop={8}><X size={22} color={C.text} /></Tap>
          </View>
          <View style={{ alignItems: 'center', paddingHorizontal: S.lg, gap: 14 }}>
            {/* Blanco y #241B33 fijos: el QR necesita el máximo contraste para que
                lo lea cualquier cámara, así que no sigue el tema. */}
            <View style={[{ backgroundColor: '#FFFFFF', borderRadius: R.xl, padding: 18 }, SHADOW.card]}>
              <QRCode value={profileUrl} size={200} backgroundColor="#FFFFFF" color="#241B33" />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { textAlign: 'center' }]} numberOfLines={1}>@{username}</Text>
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <LinkIcon size={16} color={C.blue} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontSize: 13, fontFamily: FONT.semibold }} numberOfLines={1}>{t('perfil.shareProfileLink')}</Text>
            </View>
            <View style={{ alignSelf: 'stretch' }}>
              <Btn full label={t('perfil.shareProfileLinkCta')} icon={Share2} onPress={shareLink} />
            </View>
          </View>
        </View>
      </Modal>

      <CreateMenu visible={createOpen} onClose={() => setCreateOpen(false)} />
    </Screen>
  );
}

// Publicación de la línea de tiempo del perfil. En memo: la pestaña se
// repinta con cada contador o foco y antes se rehacían todas las filas.
// Un vídeo NO se pasa a <Image> (expo-image descargaba el MP4 entero para no
// pintar nada): se enseña un bloque oscuro con el icono de reproducir.
const ProfilePostRow = React.memo(function ProfilePostRow({ p, name, avatarName, avatarUri, onOpen, onManage }: {
  p: MyPost; name: string; avatarName: string; avatarUri: string | null;
  onOpen: (id: string) => void; onManage: (p: MyPost) => void;
}) {
  const isVideo = p.media_type === 'video';
  return (
    <Pressable onPress={() => onOpen(p.id)} delayLongPress={450} onLongPress={() => onManage(p)}
      accessibilityLabel={t('perfil.view')}
      style={[{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.borderLight }, SHADOW.card]}>
      <Avatar name={avatarName} uri={avatarUri} size={38} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.username, { flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>· {timeAgo(p.created_at)}</Text>
        </View>
        {p.body ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 2 }]}>{p.body}</Text> : null}
        {p.media_url ? (
          <View style={{ marginTop: 8, borderRadius: R.md, overflow: 'hidden', backgroundColor: isVideo ? C.black : C.input }}>
            {isVideo ? (
              <View style={{ width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' }}>
                <Play size={34} color={C.white} fill={C.white} />
              </View>
            ) : (
              <Image source={{ uri: p.media_url }} recyclingKey={p.id} style={{ width: '100%', height: 200 }} contentFit="cover" cachePolicy="memory-disk" />
            )}
            {isVideo ? (
              <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 4 }}>
                <Play size={13} color="#fff" fill="#fff" />
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} accessibilityLabel={t('perfil.repliesCountA11y', { count: p.reply_count ?? 0 })}>
            <MessageCircle size={15} color={C.muted} strokeWidth={2} />
            <Text maxFontSizeMultiplier={1.2} style={F.tiny}>{p.reply_count ?? 0}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} accessibilityLabel={t('perfil.reactionsCountA11y', { count: p.reaction_count ?? 0 })}>
            <Heart size={15} color={C.muted} strokeWidth={2} />
            <Text maxFontSizeMultiplier={1.2} style={F.tiny}>{p.reaction_count ?? 0}</Text>
          </View>
          <Pressable
            onPress={async (e) => {
              e.stopPropagation();
              const slug = await getMyUniversitySlug();
              const url = slug ? `${WEB_URL}/fomo/${slug}` : WEB_URL;
              Share.share({ message: `${p.body ?? t('feed.shareDefaultMessage')}\n\n${url}` });
            }}
            hitSlop={8} accessibilityRole="button" accessibilityLabel={t('perfil.sharePostA11y')}>
            <Send size={15} color={C.muted} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

// Celda de estadística: la cifra CUENTA al entrar (AnimatedNumber) y el
// rótulo va debajo en pequeño. Sin fondos tintados.
function StatCell({ value, label, onPress, icon: Icon, tone }: { value: number; label: string; onPress?: () => void; icon?: LucideIcon; tone?: string }) {
  const inner = (
    <View style={{ alignItems: 'center', flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {Icon ? <Icon size={14} color={tone ?? C.text} fill={tone ?? 'transparent'} strokeWidth={1.9} /> : null}
        <AnimatedNumber value={value} style={{ fontSize: 20, fontFamily: FONT.heading, color: C.text, letterSpacing: -0.4 }} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT.medium }} numberOfLines={1}>{label}</Text>
    </View>
  );
  return onPress ? <Tap onPress={onPress} accessibilityLabel={`${value} ${label}`} style={{ flex: 1 }}>{inner}</Tap> : <View style={{ flex: 1 }}>{inner}</View>;
}
