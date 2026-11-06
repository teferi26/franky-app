import { FlatList } from 'react-native';
// ─── Roomie Match estilo Tinder ──────────────────────────────────────────
// Candidatos reales de get_discovery_feed('roomie') ordenados por
// compatibilidad. Los likes se guardan; el interés mutuo aparece en Matches.
// Solo se abre chat cuando las preferencias de privacidad lo permiten.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Alert, Switch, Modal, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, Lock, GraduationCap, MapPin as MapPinIcon, Info, X as XIcon, Check, Euro, SlidersHorizontal, Flag, Heart, ChevronRight } from 'lucide-react-native';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useSessionGuard } from '@/lib/useSessionGuard';
import { Header } from '@/components/Screen';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn } from '@/components/motion';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { ViviendaSwitch } from '@/components/HomeSwitch';
import { Skeleton, EmptyState, Pill, Avatar, Tap, Btn, Chip, OptionsSheet, IconCircle, ProgressBar } from '@/components/ui';
import { lifestyleChips } from '@/lib/lifestyle-labels';
import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/monitoring';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT, SHADOW } from '@/theme';
import type { RoomieCandidate } from '@/lib/types';

// Las etiquetas de estilo de vida vienen con emoji desde lib/lifestyle-labels
// (las comparte la web). En la app los emojis no son iconos: cambian de dibujo
// según el sistema y no se tiñen con el tema, así que se quitan AQUÍ al
// pintarlas, sin tocar el módulo compartido.
const sinEmoji = (s: string) => s.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/, '').trim();

// ─── Clasificación honesta de errores de swipe (140) ─────────────────────
// El bug real que reportó el usuario ("No se pudo registrar. Revisa tu
// conexión" al dar dislike con buena conexión) era del CHECK de swipe_actions
// (ver migración 140): un error de SERVIDOR que el cliente etiquetaba como
// fallo de red. Estas funciones distinguen los tres casos posibles.
type SwipeFailureKind = 'incomplete' | 'network' | 'server';

type RpcErrorLike = { code?: string; message?: string; hint?: string } | null | undefined;

function classifySwipeFailure(error: RpcErrorLike): SwipeFailureKind {
  const text = `${error?.message ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  if (text.includes('roomie_profile_incomplete')) return 'incomplete';
  // Un error que SÍ trae un code de Postgres (SQLSTATE) llegó al servidor y
  // volvió con una respuesta real: es un fallo del servidor, nunca de red.
  const hasPgCode = !!error?.code;
  const mentionsNetwork = /network|fetch|conexi[oó]n|timeout|timed out/.test(text);
  if (!hasPgCode || mentionsNetwork) return 'network';
  return 'server';
}

// Detecta si el error es "la función/columna aún no existe" (migración 140
// pendiente de aplicar). Fail-soft: las funciones nuevas (undo_last_swipe,
// reset_passed_swipes, report_profile_photo) se ocultan sin más si no existen.
function isMissingRpcError(error: RpcErrorLike): boolean {
  const code = error?.code ?? '';
  const msg = (error?.message ?? '').toLowerCase();
  return code === '42883' || code === 'PGRST202'
    || msg.includes('could not find the function') || msg.includes('does not exist');
}

const REPORT_REASONS = ['No es la persona', 'Contenido inapropiado', 'Imagen ofensiva', 'Otro motivo'];

// Perfil de roomie "completo" (idéntico a roomie_profile_complete, migración
// 120): búsqueda activa + presupuesto + ciudad + bio + foto. Sin esto no se
// puede swipear. La edición de estos campos es nativa (app/roomie-editar.tsx).
//
// Devuelve el DETALLE de cada requisito, no un booleano: el bloqueo enseñaba
// el mismo párrafo con los 5 requisitos a todo el mundo, así que quien solo
// tenía la bio corta no sabía qué le faltaba de verdad.
export type RoomieCheck = { key: string; label: string; ok: boolean };

function roomieChecks(p: Record<string, unknown>): RoomieCheck[] {
  const photos = Array.isArray(p.photos) ? (p.photos as unknown[]) : [];
  return [
    { key: 'looking', label: 'Activar "Buscando roomie"', ok: p.looking_for_roommate === true },
    { key: 'budget', label: 'Tu presupuesto mínimo (€/mes)', ok: p.budget_min != null },
    { key: 'city', label: 'La ciudad donde buscas piso', ok: String(p.city ?? '').trim().length >= 2 },
    { key: 'bio', label: 'Una bio de 10 caracteres o más', ok: String(p.bio ?? '').trim().length >= 10 },
    { key: 'photo', label: 'Una foto de perfil', ok: String(p.avatar_url ?? '').trim().length > 0 || photos.length > 0 },
  ];
}

/** Lista "✗ lo que te falta" para los avisos, ya en texto plano. */
function faltanTexto(checks: RoomieCheck[]): string {
  return checks.filter((c) => !c.ok).map((c) => `✗  ${c.label}`).join('\n');
}

// Aquí vivía LIFE_LABELS, que leía `lifestyle_preferences`: una columna JSONB
// que NADIE escribe nunca y que sigue con el DEFAULT de la migración 001. Por
// eso TODOS los perfiles enseñaban los mismos seis datos ("Limpieza 3/5",
// "Invitados a veces"…) y afirmaba "No fumador/a" hasta cuando el dato era
// undefined. Ahora se pintan las columnas planas reales con lifestyleChips
// (src/lib/lifestyle-labels.ts), que devuelve null para lo desconocido y por
// tanto no pinta nada en vez de inventárselo.

/** Aviso cuando no hay un porcentaje honesto que enseñar (migración 157). */
function motivoSinCompatibilidad(motivo: RoomieCandidate['compatibility_reason']): string {
  if (motivo === 'them') return 'Esta persona aún no ha respondido el cuestionario de convivencia.';
  return 'Completa tu cuestionario de convivencia para ver vuestra compatibilidad.';
}

function age(birth?: string | null): number | null {
  if (!birth) return null;
  const diff = Date.now() - new Date(birth).getTime();
  const years = Math.floor(diff / (365.25 * 864e5));
  return years > 14 && years < 90 ? years : null;
}

// la 108 manda age ya calculada; birth_date solo llega de BDs sin migrar
const candAge = (r: RoomieCandidate): number | null => r.age ?? age(r.birth_date);

// Memoizada: el mazo re-renderiza durante todo el gesto de arrastre y la foto
// a pantalla completa es lo más caro de esta pantalla.
const RoomieCard = React.memo(function RoomieCard({ r, onInfo, onReport }: {
  r: RoomieCandidate; onInfo: (r: RoomieCandidate) => void; onReport: (r: RoomieCandidate) => void;
}) {
  const a = candAge(r);
  // null = no hay porcentaje real (alguno de los dos no ha contestado). Antes
  // esto se convertía en un 0 % que parecía un dato, y con los valores por
  // defecto de todo el mundo salían 100 % a mansalva.
  const compat = r.compatibility == null ? null : Math.round(Number(r.compatibility));
  // Círculo oscuro semitransparente SOBRE la foto: es el mismo fijo a
  // propósito que ya usaba el botón de info (blanco sobre degradado oscuro),
  // no depende del tema.
  const circleBtn = {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  };
  return (
    <View style={{ flex: 1 }}>
      {r.avatar_url ? (
        <Image source={{ uri: r.avatar_url }} recyclingKey={r.id} cachePolicy="memory-disk"
          style={{ flex: 1 }} contentFit="cover" transition={120} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.input }}>
          <Avatar name={r.full_name ?? '?'} size={130} ring />
        </View>
      )}
      {/* Compatibilidad arriba a la derecha: cifra grande + BARRA, para que se
          entienda de un vistazo si es mucho o poco sin leer el número. Va sobre
          la foto, así que los colores son fijos a propósito. */}
      <View accessible accessibilityLabel={compat == null ? 'Sin cuestionario de convivencia' : `${compat} por ciento compatible`}
        style={{
          position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: R.lg, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 5, minWidth: 96,
        }}>
        {compat == null ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontFamily: FONT.semibold }}>
            Sin cuestionario
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text maxFontSizeMultiplier={1.2} style={{ color: '#fff', fontFamily: FONT.display, fontSize: 20, letterSpacing: -0.5 }}>{compat}%</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontFamily: FONT.semibold }}>afín</Text>
            </View>
            <View style={{ alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' }}>
              <View style={{ width: `${Math.max(4, Math.min(100, compat))}%`, height: '100%', borderRadius: 2, backgroundColor: compat >= 80 ? '#4ADE80' : '#F5B76A' }} />
            </View>
          </>
        )}
      </View>
      <View style={{ position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 8 }}>
        <Tap onPress={() => onInfo(r)} accessibilityLabel="Ver perfil completo" hitSlop={6}>
          <View style={circleBtn}>
            <Info size={18} color="#fff" strokeWidth={1.9} />
          </View>
        </Tap>
        <Tap onPress={() => onReport(r)} accessibilityLabel="Denunciar foto de este perfil" hitSlop={6}>
          <View style={circleBtn}>
            <Flag size={16} color="#fff" strokeWidth={1.9} />
          </View>
        </Tap>
      </View>
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 100, paddingBottom: 18, paddingHorizontal: 18 }}>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ color: '#fff', fontSize: 27, fontFamily: FONT.display, letterSpacing: -0.6 }}>
          {r.full_name ?? 'Estudiante'}{a ? `, ${a}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {r.career ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <GraduationCap size={13} color="rgba(255,255,255,0.85)" />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                {r.career}{r.academic_year ? ` · ${r.academic_year}º` : ''}
              </Text>
            </View>
          ) : null}
          {r.city ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MapPinIcon size={13} color="rgba(255,255,255,0.85)" />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{r.city}</Text>
            </View>
          ) : null}
        </View>
        {r.bio ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 6 }} numberOfLines={2}>{r.bio}</Text>
        ) : null}
        {r.interests && r.interests.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {r.interests.slice(0, 4).map(i => (
              <View key={i} style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 11.5, fontFamily: FONT.semibold }}>{i}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}, (prev, next) => prev.r === next.r);

export default function Roomie() {
  const { uid } = useSessionIdentity();
  const router = useRouter();
  if (uid === undefined) return <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg }}><Skeleton height={420} /></View>;
  if (!uid) return <View style={{ flex: 1, backgroundColor: C.bg }}><Header title="RoomieMatch" back /><EmptyState icon={Lock} title="Encuentra con quién compartir piso" subtitle="Guarda likes, consulta tus matches y compara hábitos de convivencia." cta="Iniciar sesión" onCta={() => router.push('/welcome')} /></View>;
  return <OwnedRoomie key={uid} owner={uid} />;
}
function OwnedRoomie({ owner }: { owner: string }) {
  const isCurrent = useSessionGuard(owner);
  const operation = useRef(false);
  const loadGeneration = useRef(0);
  const [mutating, setMutating] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = owner;
  const [gate, setGate] = useState<'loading' | 'no-auth' | 'ok'>('loading');
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(true); // perfil de roomie completo
  // Detalle requisito a requisito: alimenta la checklist del bloqueo y los avisos.
  const [checks, setChecks] = useState<RoomieCheck[]>([]);
  const [browseMode, setBrowseMode] = useState<'list' | 'swipe'>('swipe');
  const [deck, setDeck] = useState<RoomieCandidate[] | null>(null);
  const [detail, setDetail] = useState<RoomieCandidate | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const deckRef = useRef<SwipeDeckHandle>(null);
  // 140: hay un último swipe GUARDADO en el servidor que se puede deshacer.
  // Deshacer es de un solo uso: tras usarlo (o si el swipe ni se guardó por un
  // fallo) vuelve a false hasta el siguiente swipe.
  const [canUndo, setCanUndo] = useState(false);
  // Fail-soft: si undo_last_swipe/reset_passed_swipes no existen todavía (la
  // 140 no se ha aplicado en prod), se ocultan sin más, sin volver a intentarlo.
  const [undoUnavailable, setUndoUnavailable] = useState(false);
  const [reportFor, setReportFor] = useState<RoomieCandidate | null>(null);

  const load = useCallback(async (preferredId?: string, excludedId?: string) => {
    if (!isCurrent()) return;
    const generation = ++loadGeneration.current;
    setLoadErr(false);
    setCanUndo(false); // mazo nuevo: no hay nada previo que deshacer
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || generation !== loadGeneration.current) return;
      if (!user || user.id !== owner) { setGate('no-auth'); return; }
      setGate('ok');
      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('looking_for_roommate, budget_min, city, bio, avatar_url, photos')
        .eq('id', user.id)
        .maybeSingle();
      if (!isCurrent() || generation !== loadGeneration.current) return;
      // Sin el perfil no se puede decidir si está completo: un error de red
      // aquí enseñaba "te faltan 5 cosas" a quien lo tenía todo relleno.
      if (profError || !prof) { setLoadErr(true); setDeck([]); return; }
      const p = (prof ?? {}) as Record<string, unknown>;
      setVisible(Boolean(p.looking_for_roommate));
      const list = roomieChecks(p);
      setChecks(list);
      const isComplete = list.every((c) => c.ok);
      setComplete(isComplete);
      if (!isComplete) { setDeck([]); return; } // gate: no se pide mazo sin perfil
      const { data, error } = await supabase.rpc('get_discovery_feed', {
        p_user_id: user.id, p_target_type: 'roomie', p_limit: 30,
      });
      if (!isCurrent() || generation !== loadGeneration.current) return;
      if (error) { setLoadErr(true); setDeck([]); return; }
      const candidates = ((data as unknown as RoomieCandidate[]) ?? []).filter(person => person.id !== excludedId);
      if (preferredId) candidates.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
      setDeck(candidates);
    } catch {
      if (!isCurrent() || generation !== loadGeneration.current) return;
      // getUser o una query han lanzado (sin red). `deck === null` es el
      // "cargando" de esta pantalla y `gate` arranca en 'loading': si ninguno
      // sale de ahí, el esqueleto se queda para siempre.
      setGate((g) => (g === 'loading' ? 'ok' : g));
      setLoadErr(true);
      setDeck([]);
    }
  }, [owner, isCurrent]);

  const openProfileEditor = useCallback(() => {
    // La edición de preferencias de roomie ya es nativa (app/roomie-editar.tsx),
    // replica los mismos campos y guardado que la web. Al volver, load() se
    // vuelve a disparar por el useEffect de foco del router.
    if (isCurrent()) router.push('/roomie-editar');
  }, [router, isCurrent]);

  // useFocusEffect (no useEffect): al volver del editor nativo de roomie
  // recargamos el perfil y el mazo para reflejar los cambios recién guardados.
  useFocusEffect(useCallback(() => { void load(); return () => { loadGeneration.current += 1; }; }, [load]));

  // El aviso dice EXACTAMENTE lo que le falta a esta persona (no los 5
  // requisitos siempre) y ya no manda a la web: el editor es nativo.
  const showIncompleteProfileAlert = () => {
    const faltan = faltanTexto(checks);
    Alert.alert(
      'Te falta poco',
      faltan
        ? `Para dar like o pasar te falta:\n\n${faltan}\n\nSe rellena aquí mismo, en la app.`
        : 'Termina tu perfil de roomie para dar like o pasar. Se rellena aquí mismo, en la app.',
      [{ text: 'Ahora no', style: 'cancel' }, { text: 'Completar', onPress: openProfileEditor }],
    );
  };

  // One synchronous lock covers gestures, undo, reset, visibility and reports.
  const runMutation = async <T,>(action: () => Promise<T>): Promise<T | false> => {
    if (!isCurrent() || operation.current) return false;
    operation.current = true;
    setMutating(true);
    try { return await action(); }
    catch { if (isCurrent()) toastError('No se pudo guardar', 'La tarjeta sigue aquí. Revisa la conexión y reintenta.'); return false; }
    finally { operation.current = false; if (isCurrent()) setMutating(false); }
  };

  const swipe = (target: RoomieCandidate, action: 'like' | 'pass'): Promise<boolean> => runMutation(async () => {
    if (!userId) return false;
    if (!complete) {
      // Defensa en cliente: el servidor también lo rechaza (migración 119).
      showIncompleteProfileAlert();
      return false;
    }
    const { data, error } = await supabase.rpc('process_swipe_action', {
      p_user_id: userId, p_target_id: target.id, p_target_type: 'roomie', p_action: action,
    });
    if (!isCurrent()) return false;
    if (error) {
      const kind = classifySwipeFailure(error);
      if (kind === 'incomplete') {
        // El servidor es la fuente de verdad de la completitud (119): puede
        // pasar aunque el cliente crea que el perfil está completo si acaba
        // de cambiar algo. Mismo flujo que la comprobación de arriba.
        showIncompleteProfileAlert();
        return false;
      }
      // Este swipe NO llegó a guardarse: no hay nada que deshacer todavía.
      setCanUndo(false);
      captureError(error, { where: 'roomie.process_swipe_action', action, targetId: target.id });
      const what = action === 'like' ? 'like' : 'descarte';
      if (kind === 'network') {
        toastError('Sin conexión', `Tu ${what} no llegó al servidor. La tarjeta sigue aquí. Revisa tu conexión y reintenta.`);
      } else {
        // NO es un problema de conexión: el error vino del servidor (tiene
        // código de Postgres). Decirlo tal cual, sin mandar al usuario a
        // revisar su wifi por algo que no tiene que ver con su red.
        toastError(
          'Ha fallado el servidor',
          `No se pudo registrar tu ${what}. Ya se ha avisado al equipo: prueba de nuevo en un momento.`,
        );
      }
      return false;
    }
    setCanUndo(!(data as { match?: boolean } | null)?.match);
    if (action === 'like') {
      const matched = (data as { match?: boolean } | null)?.match;
      if (matched) {
        // El match se celebra con haptic fuerte y un toast, no con un modal:
        // un Alert corta el ritmo del mazo y obliga a un toque extra.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const chatId = (data as { conversation_id?: string | null } | null)?.conversation_id;
        toast('¡Match!', `${target.full_name ?? 'Esta persona'} también te dio like. ${chatId ? 'Tenéis una conversación disponible en Matches.' : 'El chat depende de vuestras preferencias de privacidad.'}`);
      } else {
        // un like normal no rompe el ritmo del deck: solo un haptic discreto
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
    return true;
  });

  // Deshacer el último swipe (140): borra la fila en swipe_actions y vuelve a
  // mostrar la carta anterior. Un solo uso por swipe (canUndo se pone a false
  // tanto si funciona como si no hay nada que deshacer).
  const handleUndo = () => runMutation(async () => {
    if (!canUndo || undoUnavailable) return;
    const { data, error } = await supabase.rpc('undo_last_swipe', { p_target_type: 'roomie' });
    if (!isCurrent()) return;
    if (error) {
      if (isMissingRpcError(error)) { setUndoUnavailable(true); return; } // migración 140 aún no aplicada: se oculta sin avisar
      captureError(error, { where: 'roomie.undo_last_swipe' });
      toastError('No se pudo deshacer', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    setCanUndo(false);
    if (!data) return; // no había nada que deshacer en el servidor
    // Refresh confirmed server state; imperative undo is intentionally blocked
    // while another mutation disables the deck. This also handles cross-device undo.
    await load(typeof data === 'string' ? data : undefined);
    if (isCurrent() && Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });

  // "Volver a ver los que descarté" (140): SOLO en el estado vacío. Borra los
  // descartes (nunca los likes) y recarga el mazo desde cero.
  const handleResetPassed = () => runMutation(async () => {
    const { data, error } = await supabase.rpc('reset_passed_swipes', { p_target_type: 'roomie' });
    if (!isCurrent()) return;
    if (error) {
      if (isMissingRpcError(error)) {
        toastInfo('Aún no disponible', 'Esta función llega en una próxima actualización.');
        return;
      }
      captureError(error, { where: 'roomie.reset_passed_swipes' });
      toastError('No se pudo reiniciar', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    const n = typeof data === 'number' ? data : 0;
    if (n === 0) {
      toastInfo('Nada que recuperar', 'No tenías perfiles descartados. Tus likes nunca se borran con esto.');
      return;
    }
    setDeck(null);
    load();
  });

  // Denunciar la foto de un perfil (140): quita la carta del mazo (sin
  // contar como like ni pass) y avisa al equipo. Con varias denuncias el
  // perfil deja de aparecer hasta que lo revisen.
  const submitReport = (target: RoomieCandidate | null, reason: string) => runMutation(async () => {
    if (!target) return;
    const { data, error } = await supabase.rpc('report_profile_photo', { p_target: target.id, p_reason: reason });
    if (!isCurrent()) return;
    if (error) {
      if (isMissingRpcError(error)) {
        toastInfo('Aún no disponible', 'Denunciar fotos llega en una próxima actualización.');
        return;
      }
      captureError(error, { where: 'roomie.report_profile_photo', targetId: target.id });
      toastError('No se pudo denunciar', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    setCanUndo(false); // esta carta se fue por denuncia, no por swipe: no hay swipe que deshacer
    await load(undefined, target.id);
    if (!isCurrent()) return;
    const hidden = (data as { hidden?: boolean } | null)?.hidden;
    toast(
      'Denuncia enviada',
      hidden
        ? 'Esta foto ya no aparecerá para nadie hasta que el equipo la revise.'
        : 'Si acumula más denuncias, el perfil dejará de aparecer hasta que lo revisemos.',
    );
  });

  const toggleVisible = (v: boolean) => runMutation(async () => {
    if (!userId) return;
    if (v && !complete) {
      // No dejamos aparecer como roomie con el perfil a medias. Mismo detalle
      // por persona que el aviso del swipe, y sin mandar a nadie a la web.
      const faltan = faltanTexto(checks);
      Alert.alert(
        'Te falta poco',
        faltan
          ? `Para aparecer como roomie disponible te falta:\n\n${faltan}\n\nSe rellena aquí mismo, en la app.`
          : 'Termina tu perfil de roomie para aparecer como disponible. Se rellena aquí mismo, en la app.',
        [{ text: 'Ahora no', style: 'cancel' }, { text: 'Completar', onPress: openProfileEditor }],
      );
      return;
    }
    // .select('id'): sin filas devueltas el cambio no se ha guardado aunque no haya error.
    const { data, error } = await supabase.from('profiles').update({ looking_for_roommate: v }).eq('id', userId).select('id');
    if (!isCurrent()) return;
    if (error || data?.length !== 1) {
      toastError('No se pudo guardar', 'No pudimos actualizar tu visibilidad. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    setVisible(v);
    Haptics.selectionAsync().catch(() => {});
    toast(v ? 'Ya apareces como roomie' : 'Ya no apareces como roomie',
      v ? 'Otros estudiantes pueden encontrarte.' : undefined);
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: insets.bottom }}>
      <Header logo={<ViviendaSwitch active="roomie" />} back />
      <View style={{ flexDirection: 'row', paddingHorizontal: S.lg, paddingVertical: 10, gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Btn small full variant="secondary" label="Matches" onPress={() => router.push('/roomie-conexiones')}
            accessibilityLabel="Ver mis matches de Roomie" />
        </View>
        <View style={{ flex: 1 }}>
          <Btn small full variant="ghost" label="Les encajas" onPress={() => router.push('/roomie-conexiones?tab=received')}
            accessibilityLabel="Ver likes recibidos de Roomie" />
        </View>
        <View style={{ flex: 1 }}>
          <Btn small full variant="ghost" label="Tus likes" onPress={() => router.push('/roomie-conexiones?tab=given')}
            accessibilityLabel="Ver mis likes de Roomie" />
        </View>
      </View>
      {gate === 'loading' || (gate === 'ok' && deck === null) ? (
        // Esqueleto con la silueta real del mazo: tarjeta grande y botonera.
        <View style={{ flex: 1, padding: S.lg }}>
          <Skeleton height={420} radius={R.xl} style={{ marginHorizontal: 0 }} />
          <Skeleton height={64} radius={R.full} style={{ marginHorizontal: 40 }} />
        </View>
      ) : gate === 'no-auth' ? (
        <EmptyState icon={Lock} title="Encuentra a tu roomie ideal"
          subtitle="Inicia sesión para deslizar entre estudiantes compatibles contigo. Si el interés es mutuo, aparece en Matches."
          cta="Iniciar sesión" onCta={() => router.push('/welcome')} />
      ) : loadErr ? (
        <EmptyState icon={Info} title="No se pudo cargar"
          subtitle="No pudimos traer los roomies disponibles. Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={() => { setDeck(null); load(); }} />
      ) : !complete ? (
        // Checklist real en vez del párrafo genérico: cada persona ve lo que
        // tiene hecho (✓) y lo que le falta (✗), y el botón abre el editor
        // nativo que ahora sí edita los 5 requisitos (app/roomie-editar.tsx).
        <ScrollView contentContainerStyle={{ padding: S.lg, paddingTop: 32 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ marginBottom: 18 }}>
              <IconCircle icon={SlidersHorizontal} size={88} strokeWidth={1.5} />
            </View>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[F.h1, { fontSize: 22, textAlign: 'center' }]}>
              {checks.filter((c) => !c.ok).length === 1
                ? 'Te falta una cosa'
                : `Te faltan ${checks.filter((c) => !c.ok).length} cosas`}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 20 }]}>
              Sin esto no podemos enseñarte candidatos ni calcular vuestra compatibilidad. Se rellena aquí mismo, en un minuto.
            </Text>
          </View>

          {/* Cuánto llevas hecho, no solo lo que falta: motiva terminar. */}
          <View style={{ marginBottom: 18, gap: 6 }}>
            <ProgressBar value={(checks.filter((c) => c.ok).length / Math.max(1, checks.length)) * 100} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
              {checks.filter((c) => c.ok).length} de {checks.length} listos
            </Text>
          </View>

          <View style={{ gap: 10, marginBottom: 22 }}>
            {checks.map((c) => (
              <View key={c.key} accessible accessibilityLabel={`${c.label}: ${c.ok ? 'hecho' : 'pendiente'}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: c.ok ? `${C.success}22` : C.input,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {c.ok
                    ? <Check size={15} color={C.success} strokeWidth={2.4} />
                    : <XIcon size={15} color={C.muted} strokeWidth={2.2} />}
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{
                  flex: 1, fontSize: 14.5, color: c.ok ? C.muted : C.text,
                  fontFamily: c.ok ? undefined : FONT.semibold,
                  textDecorationLine: c.ok ? 'line-through' : 'none',
                }}>
                  {c.label}
                </Text>
              </View>
            ))}
          </View>

          <Btn full label="Completar mi perfil" onPress={openProfileEditor} />
        </ScrollView>
      ) : (
        <>
          <View style={{
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 10,
            borderBottomWidth: 0.5, borderBottomColor: C.borderLight, gap: 10,
          }}>
            <Users size={18} color={C.muted} strokeWidth={1.75} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>Aparecer como roomie disponible</Text>
            <Pill label={visible ? 'Visible' : 'Oculto'} tone={visible ? 'green' : 'gray'} />
            <Switch value={visible} disabled={mutating} onValueChange={(value) => { void toggleVisible(value); }}
              accessibilityLabel="Aparecer como roomie disponible"
              trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
          </View>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', paddingHorizontal: S.lg, paddingVertical: 8 }}>
            <Chip label="Comparar perfiles" accessibilityRole="tab" active={browseMode === 'list'} onPress={() => setBrowseMode('list')} />
            <Chip label="Uno a uno" accessibilityRole="tab" active={browseMode === 'swipe'} onPress={() => setBrowseMode('swipe')} />
          </View>
          {browseMode === 'list' ? <FlatList data={deck ?? []} keyExtractor={r => r.id} contentContainerStyle={{ padding: S.lg, paddingBottom: 120 }}
            ListHeaderComponent={<View style={{ marginBottom: 20, gap: 8 }}><Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -1.1, color: C.text }}>Con quién compartes casa importa.</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Compara hábitos y presupuesto. Guarda a quien te encaja; si es mutuo, podréis hablar.</Text></View>}
            ListEmptyComponent={<EmptyState icon={Users} title="Nadie nuevo por ahora" subtitle="Tus likes y matches siguen guardados. Puedes recuperar los perfiles que descartaste." cta="Recuperar descartados" onCta={handleResetPassed} />}
            renderItem={({ item: r, index }) => <FadeIn index={index}><View style={{ borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.surface, marginBottom: 18, overflow: 'hidden', ...SHADOW.card }}>
              <Tap onPress={() => setDetail(r)} accessibilityLabel={`Ver perfil de ${r.full_name ?? 'Estudiante'}`}><View style={{ height: 230, backgroundColor: C.input }}>{r.avatar_url ? <Image source={{ uri: r.avatar_url }} recyclingKey={r.id} contentFit="cover" style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Users size={40} color={C.muted} strokeWidth={1.4} /></View>}</View><View style={{ padding: 16, gap: 8 }}><Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={{ fontFamily: FONT.display, fontSize: 25, letterSpacing: -0.8, color: C.text }}>{r.full_name ?? 'Estudiante'}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{r.career || 'Su próxima etapa universitaria'} · {r.city || 'Ciudad por concretar'}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.blue }]}>{r.budget_min ?? 0}–{r.budget_max ?? '…'} €/mes{r.compatibility != null ? ` · ${Math.round(Number(r.compatibility))}% de afinidad` : ''}</Text>{r.bio && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={3}>{r.bio}</Text>}<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blue }]}>Ver hábitos y perfil completo</Text><ChevronRight size={14} color={C.blue} strokeWidth={1.9} /></View></View></Tap>
              <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingTop: 0 }}><View style={{ flex: 1 }}><Btn label="Me encaja" icon={Heart} disabled={mutating} onPress={async () => { if (await swipe(r, 'like') && isCurrent()) setDeck(d => d?.filter(p => p.id !== r.id) ?? []); }} /></View><Btn variant="secondary" label="Pasar" disabled={mutating} onPress={async () => { if (await swipe(r, 'pass') && isCurrent()) setDeck(d => d?.filter(p => p.id !== r.id) ?? []); }} /></View>
            </View></FadeIn>} ListFooterComponent={canUndo && !undoUnavailable ? <Btn variant="secondary" label="Deshacer mi última decisión" disabled={mutating} onPress={handleUndo} /> : null} /> : <SwipeDeck
            ref={deckRef}
            disabled={mutating}
            items={deck ?? []}
            renderCard={(r) => <RoomieCard r={r} onInfo={setDetail} onReport={setReportFor} />}
            onSmash={(r) => swipe(r, 'like')}
            onPass={(r) => swipe(r, 'pass')}
            onUndo={canUndo && !undoUnavailable ? handleUndo : undefined}
            onReset={handleResetPassed}
            showResetMidDeck={false}
            resetLabel="Volver a ver los que descarté"
            // Rótulos propios: aquí se busca con quién vivir, no una cita.
            likeLabel="ME ENCAJA"
            passLabel="PASO"
            emptyTitle="No hay más roomies por ahora"
            emptySubtitle="Has visto a todos los disponibles. Activa tu visibilidad para que otros te encuentren, o recupera los que descartaste (tus likes nunca se pierden)."
          />}
        </>
      )}

      {/* motivo de la denuncia de foto */}
      <OptionsSheet
        visible={reportFor !== null}
        title="Denunciar foto de perfil"
        onClose={() => setReportFor(null)}
        options={REPORT_REASONS.map(reason => ({
          label: reason,
          onPress: () => submitReport(reportFor, reason),
        }))}
      />

      {/* perfil completo */}
      <Modal visible={detail !== null} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setDetail(null)}
          accessibilityLabel="Cerrar" accessibilityRole="button" />
        {detail ? (
          <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '80%', paddingBottom: insets.bottom + 10 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, gap: 12 }}>
              <Avatar name={detail.full_name ?? '?'} uri={detail.avatar_url} size={44} ring />
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2} numberOfLines={1}>
                  {detail.full_name ?? 'Estudiante'}{candAge(detail) ? `, ${candAge(detail)}` : ''}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
                  {detail.career ?? ''}{detail.academic_year ? ` · ${detail.academic_year}º` : ''}{detail.city ? ` · ${detail.city}` : ''}
                </Text>
              </View>
              <Tap onPress={() => setDetail(null)} accessibilityLabel="Cerrar" hitSlop={8}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                <XIcon size={18} color={C.text} strokeWidth={1.9} />
              </Tap>
            </View>
            <ScrollView contentContainerStyle={{ padding: S.lg, gap: 14 }} showsVerticalScrollIndicator={false}>
              {detail.compatibility != null ? (
                // La compatibilidad es EL dato de esta ficha: cifra grande, barra
                // de marca y colores del tema (nada de verdes fijos que en modo
                // oscuro se ven como una mancha clara).
                <View style={{ backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Heart size={24} color={C.blue} fill={C.blue} strokeWidth={1.75} />
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={1.2} style={[F.display, { fontSize: 26, color: C.blueDeep }]}>
                        {Math.round(Number(detail.compatibility))}%
                      </Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blueDeep }]}>
                        de compatibilidad según vuestros estilos de vida
                      </Text>
                    </View>
                  </View>
                  <ProgressBar value={Number(detail.compatibility)} height={8} />
                </View>
              ) : (
                // 157: sin cuestionario NO se enseña porcentaje. Un número
                // inventado (o el 100 % de los valores por defecto) es peor que
                // no dar ninguno.
                <View style={{ backgroundColor: C.input, borderRadius: R.lg, padding: 14, gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>
                    {motivoSinCompatibilidad(detail.compatibility_reason)}
                  </Text>
                  {detail.compatibility_reason !== 'them' ? (
                    <Btn small label="Rellenar mi cuestionario"
                      onPress={() => { setDetail(null); router.push('/roomie-editar'); }} />
                  ) : null}
                </View>
              )}
              {/* Más fotos suyas, no solo el avatar (158). */}
              {detail.photos && detail.photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {detail.photos.map((uri) => (
                    <Image key={uri} source={{ uri }} recyclingKey={uri} cachePolicy="memory-disk"
                      style={{ width: 132, height: 176, borderRadius: R.md, backgroundColor: C.input }}
                      contentFit="cover" transition={120} />
                  ))}
                </ScrollView>
              ) : null}
              {detail.university || detail.university_name || detail.is_verified ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <GraduationCap size={16} color={C.blue} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{detail.university || detail.university_name || 'Universidad'}</Text>
                  {detail.is_verified ? <Pill label="Email universitario verificado" tone="green" /> : null}
                </View>
              ) : null}
              {detail.bio ? (
                <View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 4 }]}>Sobre mí</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{detail.bio}</Text>
                </View>
              ) : null}
              {/* Las 8 respuestas REALES del cuestionario. Lo que no se sabe no
                  se pinta (lifestyleChips devuelve solo lo traducible). */}
              {(() => {
                const chips = lifestyleChips(detail);
                if (chips.length === 0) return null;
                return (
                  <View>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Estilo de vida</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {/* Sin el emoji con el que vienen de lib/lifestyle-labels. */}
                      {chips.map((c) => <Pill key={c} label={sinEmoji(c)} />)}
                    </View>
                  </View>
                );
              })()}
              {detail.budget_min != null || detail.budget_max != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Euro size={16} color={C.blue} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
                    Presupuesto: {detail.budget_min ?? '?'} a {detail.budget_max ?? '?'} €/mes
                  </Text>
                </View>
              ) : null}
              {(() => {
                // Intereses y aficiones son dos campos distintos que el usuario
                // rellena en sitios distintos; se juntan sin repetir.
                const tags = Array.from(new Set([...(detail.interests ?? []), ...(detail.hobbies ?? [])]));
                if (tags.length === 0) return null;
                return (
                  <View>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Intereses</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {tags.map(i => <Pill key={i} label={i} tone="blue" />)}
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
