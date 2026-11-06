import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useSessionGuard } from '@/lib/useSessionGuard';
// ─── Crush Live: matches por afinidad dentro de un evento Franky ────────────
// Solo para asistentes verificados y mayores de edad de eventos oficiales con
// Crush Live activado. Flujo: elegir evento → comprobaciones → alta voluntaria
// (intención, a quién quieres conocer, edad, 5 respuestas) → mazo de perfiles
// afines → match mutuo con chat. Toda la lógica de acceso vive en el servidor
// (RPC get/set_crush_live_*, migración 20260902081139); aquí solo se pinta y
// se protege contra dobles envíos (claves de idempotencia por carta).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  BadgeCheck, CalendarDays, ChevronRight, Heart, HeartCrack, MessageCircle, MoreHorizontal, Settings2,
  ShieldCheck, Sparkles, Users, X, Coffee, Wind, Flame, Minus, Plus, LogOut, Flag, Ban, type LucideIcon, Smartphone } from 'lucide-react-native';
import { Header, Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Avatar, Btn, Chip, EmptyState, Skeleton, Tap, Pill, OptionsSheet, IconCircle } from '@/components/ui';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import {
  getCrushLiveEvents, getCrushLiveFeed, getCrushLiveMatches, getCrushLiveState,
  setCrushLiveProfile, swipeCrushLive,
} from '@/lib/api';
import { startDirectChat } from '@/lib/chat';
import { track } from '@/lib/analytics';
import { timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { supabase } from '@/lib/supabase';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { C, F, R, S, FONT, SHADOW } from '@/theme';
import type {
  CrushLiveAnswers, CrushLiveCandidate, CrushLiveEvent, CrushLiveGender,
  CrushLiveGoal, CrushLiveMatch, CrushLiveProfile, CrushLiveState,
} from '@/lib/types';

type Tab = 'discover' | 'matches';

// Acento de Crush Live: el magenta de marca (C.accent2). Se lee de C en cada
// render y NUNCA en una constante de módulo: C es mutable y cambia con el
// tema, así que una constante se quedaría congelada con la paleta con la que
// arrancó la app (el magenta oscuro del tema claro sobre el fondo de noche).

const GOALS: { value: CrushLiveGoal; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'conocer', label: 'Conocer', description: 'Sin presión', icon: Coffee },
  { value: 'dejarse_llevar', label: 'Fluir', description: 'Ver qué pasa', icon: Wind },
  { value: 'relacion', label: 'Algo serio', description: 'Con intención', icon: Flame },
];

const GENDERS: { value: CrushLiveGender; label: string }[] = [
  { value: 'hombre', label: 'Hombres' },
  { value: 'mujer', label: 'Mujeres' },
  { value: 'no_binario', label: 'No binario' },
];

const REPORT_REASONS: { label: string; value: string }[] = [
  { label: 'Spam o publicidad', value: 'spam' },
  { label: 'Contenido inapropiado', value: 'contenido_ofensivo' },
  { label: 'Acoso o comportamiento abusivo', value: 'acoso' },
  { label: 'Suplantación de identidad', value: 'suplantacion' },
  { label: 'Otro motivo', value: 'otro' },
];

const QUESTIONS: {
  key: keyof CrushLiveAnswers;
  title: string;
  options: { value: number; label: string }[];
}[] = [
  { key: 'social_energy', title: 'En un evento prefiero', options: [{ value: 1, label: 'Un plan tranquilo' }, { value: 3, label: 'Un poco de todo' }, { value: 5, label: 'Ser el alma' }] },
  { key: 'spontaneity', title: 'Mis planes suelen ser', options: [{ value: 1, label: 'Organizados' }, { value: 3, label: 'Depende' }, { value: 5, label: 'Improvisados' }] },
  { key: 'communication', title: 'Para conectar prefiero', options: [{ value: 1, label: 'Escuchar' }, { value: 3, label: 'Equilibrio' }, { value: 5, label: 'Hablar mucho' }] },
  { key: 'affection', title: 'En el amor voy', options: [{ value: 1, label: 'Poco a poco' }, { value: 3, label: 'Sin prisa' }, { value: 5, label: 'Con intensidad' }] },
  { key: 'schedule', title: 'Mi horario ideal es', options: [{ value: 1, label: 'De mañanas' }, { value: 3, label: 'Flexible' }, { value: 5, label: 'De noches' }] },
];

function eventDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

function uuid() {
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${random()}${random()}-${random()}-4${random().slice(1)}-${((8 + Math.random() * 4) | 0).toString(16)}${random().slice(1)}-${random()}${random()}${random()}`;
}

function messageForReason(reason?: string | null) {
  switch (reason) {
    case 'not_participant': return 'Apúntate al evento para entrar en Crush Live.';
    case 'student_verification_required': return 'Verifica tu email de estudiante para proteger a toda la comunidad.';
    case 'age_required': return 'Añade tu fecha de nacimiento. Crush Live es solo para mayores de 18 años.';
    case 'missing_gender': return 'Completa tu género en el perfil para aplicar preferencias recíprocas.';
    case 'photo_required': return 'Añade al menos una foto visible antes de entrar en Crush Live.';
    case 'profile_unavailable': return 'Tu perfil debe estar visible y disponible para poder participar.';
    case 'disabled': return 'Crush Live no está activo en este evento.';
    case 'event_closed': return 'Crush Live ya ha terminado para este evento.';
    case 'not_official': return 'Crush Live solo está disponible en eventos oficiales de Franky.';
    case 'event_not_found': return 'Este evento ya no está disponible.';
    default: return 'Esta experiencia no está disponible ahora mismo.';
  }
}

function titleForReason(reason?: string | null) {
  switch (reason) {
    case 'not_participant': return 'Solo para asistentes';
    case 'student_verification_required': return 'Verifica tu cuenta';
    case 'age_required': return 'Solo para mayores de 18';
    case 'missing_gender': return 'Completa tu perfil';
    case 'photo_required': return 'Añade una foto';
    case 'profile_unavailable': return 'Haz visible tu perfil';
    case 'event_closed': return 'Este Live ha terminado';
    case 'event_not_found': return 'Evento no disponible';
    default: return 'Crush Live no disponible';
  }
}

// Cada motivo de bloqueo lleva a la pantalla donde se arregla: así el estado
// vacío no es un callejón sin salida.
function actionForReason(reason?: string | null): { label: string; route: string } | null {
  switch (reason) {
    case 'student_verification_required': return { label: 'Verificar mi email', route: '/verificar-estudiante' };
    case 'age_required':
    case 'missing_gender':
    case 'photo_required':
    case 'profile_unavailable': return { label: 'Completar mi perfil', route: '/editar-perfil' };
    default: return null;
  }
}

function crushLiveErrorToken(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  return [
    'target_not_available', 'swipe_already_decided', 'crush_live_unavailable',
    'event_closed', 'not_participant', 'profile_not_eligible',
    'crush_live_opt_in_required', 'rate_limit_exceeded', 'idempotency_stale',
  ].find((token) => message.includes(token)) ?? null;
}

function AffinityBadge({ score, light }: { score: number; light?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: R.full,
      paddingHorizontal: 11, paddingVertical: 6, backgroundColor: C.accent2, opacity: light ? 0.95 : 1,
    }}>
      <Sparkles size={13} color={C.onAccent} strokeWidth={1.9} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.heading, fontSize: 13.5 }}>{score}% afinidad</Text>
    </View>
  );
}

function EventPicker({ events, loading, failed, onRetry, onSelect, onOpenMatches }: {
  events: CrushLiveEvent[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onSelect: (event: CrushLiveEvent) => void;
  onOpenMatches: () => void;
}) {
  return (
    <Screen title="Crush Live" back>
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.lg, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Sparkles size={14} color={C.accent2} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.accent2, fontFamily: FONT.semibold, fontSize: 11.5, letterSpacing: 1.2 }}>SOLO EN EVENTOS FRANKY</Text>
          </View>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ color: C.text, fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -1.1 }}>
            Tu evento, vuestro match
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { maxWidth: 420 }]}>
            Descubre asistentes afines. Los likes son secretos y solo se guardan como match si son mutuos.
          </Text>
        </View>
      </FadeIn>

      <View style={{ paddingHorizontal: S.lg, marginBottom: S.lg }}>
        <Btn full variant="secondary" icon={Heart} label="Ver mis matches guardados" onPress={onOpenMatches} />
      </View>

      {loading ? <><Skeleton height={100} radius={R.lg} /><Skeleton height={100} radius={R.lg} /></> : null}
      {!loading && events.map((event) => (
        <Tap key={event.id} onPress={() => onSelect(event)} accessibilityLabel={`Abrir Crush Live de ${event.title}`} haptic
          style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 12, marginHorizontal: S.lg, marginBottom: 10 }, SHADOW.card]}>
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={{ width: 68, height: 68, borderRadius: R.md, backgroundColor: C.input }} contentFit="cover" />
          ) : (
            <IconCircle icon={CalendarDays} size={68} />
          )}
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={2}>{event.title}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 3 }]}>{eventDate(event.start_date)}</Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}><Pill label="Crush Live activo" tone="red" icon={Sparkles} /></View>
          </View>
          <ChevronRight size={20} color={C.muted} strokeWidth={2} />
        </Tap>
      ))}

      {!loading && !events.length ? (
        <EmptyState
          icon={failed ? HeartCrack : CalendarDays}
          title={failed ? 'No se pudo cargar' : 'Aún no tienes un Live activo'}
          subtitle={failed
            ? 'Comprueba tu conexión e inténtalo otra vez.'
            : 'Cuando te apuntes a un evento Franky con Crush Live, aparecerá aquí.'}
          cta={failed ? 'Reintentar' : undefined}
          onCta={failed ? onRetry : undefined}
        />
      ) : null}
    </Screen>
  );
}

function AgeControl({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (next: number) => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderLight, borderRadius: R.lg, padding: 12 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Tap hitSlop={8} onPress={() => onChange(Math.max(min, value - 1))} accessibilityLabel={`Reducir ${label.toLowerCase()}`} disabled={value <= min}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center', opacity: value <= min ? 0.4 : 1 }}>
          <Minus size={18} color={C.text} strokeWidth={2.6} />
        </Tap>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 26 }]}>{value}</Text>
        <Tap hitSlop={8} onPress={() => onChange(Math.min(max, value + 1))} accessibilityLabel={`Aumentar ${label.toLowerCase()}`} disabled={value >= max}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center', opacity: value >= max ? 0.4 : 1 }}>
          <Plus size={18} color={C.text} strokeWidth={2.6} />
        </Tap>
      </View>
    </View>
  );
}

function LiveSetup({ event, current, saving, onSave, onCancel }: {
  event: CrushLiveEvent;
  current: CrushLiveProfile | null;
  saving: boolean;
  onSave: (profile: {
    goal: CrushLiveGoal; preferredGenders: CrushLiveGender[];
    ageMin: number; ageMax: number; answers: CrushLiveAnswers;
  }) => void;
  onCancel?: () => void;
}) {
  const [goal, setGoal] = useState<CrushLiveGoal>(current?.goal ?? 'conocer');
  const [preferred, setPreferred] = useState<CrushLiveGender[]>(current?.preferred_genders?.length ? current.preferred_genders : []);
  const [ageMin, setAgeMin] = useState(current?.age_min ?? 18);
  const [ageMax, setAgeMax] = useState(current?.age_max ?? 30);
  const [answers, setAnswers] = useState<Partial<CrushLiveAnswers>>(current?.answers ?? {});

  const answered = QUESTIONS.filter((q) => typeof answers[q.key] === 'number').length;
  const complete = preferred.length > 0 && answered === QUESTIONS.length && ageMin <= ageMax;
  const toggleGender = (value: CrushLiveGender) => {
    setPreferred((old) => old.includes(value) ? old.filter((item) => item !== value) : [...old, value]);
  };

  return (
    <Screen title={current?.active ? 'Tus preferencias' : 'Entrar en Crush Live'} back onBack={onCancel}>
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.lg, gap: 6 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ color: C.accent2, fontFamily: FONT.semibold, fontSize: 11.5, letterSpacing: 1.2 }}>{event.title.toUpperCase()}</Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ color: C.text, fontFamily: FONT.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.9 }}>
            Un minuto y ya estás dentro
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
            Tus respuestas son privadas. Solo enseñamos el porcentaje de afinidad y hasta tres motivos.
          </Text>
        </View>
      </FadeIn>

      <View style={{ paddingHorizontal: S.lg }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>¿Qué buscas?</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: S.xl }}>
          {GOALS.map((item) => {
            const on = goal === item.value;
            return (
              <Tap key={item.value} onPress={() => setGoal(item.value)} accessibilityRole="tab" accessibilityLabel={`${item.label}: ${item.description}`} accessibilityState={{ selected: on }} style={{ flex: 1 }}
                haptic>
                <View style={[{ minHeight: 92, borderWidth: 1.5, borderColor: on ? C.accent2 : C.borderLight, backgroundColor: on ? `${C.accent2}12` : C.surface, borderRadius: R.lg, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 6 }, !on && SHADOW.card]}>
                  <item.icon size={22} color={on ? C.accent2 : C.muted} strokeWidth={2.2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 13.5, fontFamily: FONT.semibold, textAlign: 'center' }}>{item.label}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>{item.description}</Text>
                </View>
              </Tap>
            );
          })}
        </View>

        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>¿A quién te gustaría conocer?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 10, marginBottom: S.xl }}>
          {GENDERS.map((item) => (
            <Chip key={item.value} label={item.label} active={preferred.includes(item.value)} onPress={() => toggleGender(item.value)} />
          ))}
        </View>

        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Rango de edad</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: S.xl }}>
          <AgeControl label="Desde" value={ageMin} min={18} max={Math.min(80, ageMax)} onChange={setAgeMin} />
          <AgeControl label="Hasta" value={ageMax} min={Math.max(18, ageMin)} max={80} onChange={setAgeMax} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Vuestro punto de conexión</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: answered === QUESTIONS.length ? C.success : C.muted }]}>{answered}/{QUESTIONS.length}</Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 4, marginBottom: S.md }]}>Cinco respuestas rápidas para calcular un porcentaje honesto.</Text>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.borderLight, paddingHorizontal: 14 }, SHADOW.card]}>
          {QUESTIONS.map((question, i) => (
            <View key={question.key} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.borderLight, paddingVertical: 14 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginBottom: 9 }]}>{question.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                {question.options.map((option) => (
                  <Chip key={option.value} label={option.label} active={answers[question.key] === option.value}
                    onPress={() => setAnswers((old) => ({ ...old, [question.key]: option.value }))} />
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.accentSoft, borderRadius: R.lg, padding: 12, marginTop: S.lg }}>
          <ShieldCheck size={18} color={C.blue} strokeWidth={2.2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>
            Solo aparecerás a asistentes con preferencias recíprocas de este evento. Puedes salir de Live cuando quieras y tus matches seguirán guardados.
          </Text>
        </View>

        <View style={{ gap: 9, marginTop: S.lg, marginBottom: S.xl }}>
          <Btn full label={current?.active ? 'Guardar cambios' : 'Entrar en Crush Live'} icon={Sparkles} busy={saving} disabled={!complete || saving}
            onPress={() => onSave({ goal, preferredGenders: preferred, ageMin, ageMax, answers: answers as CrushLiveAnswers })} />
          {!complete ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
              {preferred.length === 0 ? 'Elige a quién quieres conocer.' : answered < QUESTIONS.length ? 'Responde a las cinco preguntas.' : 'Revisa el rango de edad.'}
            </Text>
          ) : null}
          {onCancel ? <Btn full variant="ghost" label="Cancelar" disabled={saving} onPress={onCancel} /> : null}
        </View>
      </View>
    </Screen>
  );
}

function CandidateCard({ candidate, onProfile }: { candidate: CrushLiveCandidate; onProfile: () => void }) {
  const photo = candidate.photos?.find(Boolean) ?? candidate.avatar_url;
  return (
    <View style={{ flex: 1, backgroundColor: C.input }}>
      {photo ? (
        <Image source={{ uri: photo }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={180} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.input }}>
          <Avatar name={candidate.full_name} size={124} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(20,10,30,0.15)', 'rgba(20,10,30,0.92)']} locations={[0.35, 0.55, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      {/* De aquí abajo todo va SOBRE la foto y su velo oscuro: el blanco es fijo
          a propósito (el sustrato no cambia con el tema, la foto sí manda). */}
      <View style={{ position: 'absolute', top: 14, left: 14 }}><AffinityBadge score={candidate.compatibility} /></View>
      <Tap onPress={onProfile} accessibilityLabel={`Ver los detalles de ${candidate.full_name ?? 'esta persona'}`}
        style={{ position: 'absolute', top: 10, right: 10 }}>
        <View style={{ minHeight: 40, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.full, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 12.5, fontFamily: FONT.semibold }}>Ver detalles</Text>
        </View>
      </Tap>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 28, fontFamily: FONT.display, flexShrink: 1, letterSpacing: -0.5 }} numberOfLines={1}>
            {candidate.full_name ?? 'Estudiante'}{candidate.age ? `, ${candidate.age}` : ''}
          </Text>
          <BadgeCheck size={20} color="#fff" strokeWidth={2.4} />
        </View>
        {candidate.career ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, fontFamily: FONT.medium, marginTop: 2 }} numberOfLines={1}>{candidate.career}</Text> : null}
        {candidate.bio ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18, marginTop: 6 }} numberOfLines={2}>{candidate.bio}</Text> : null}
        {candidate.compatibility_reasons?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {candidate.compatibility_reasons.slice(0, 3).map((reason) => (
              <View key={reason} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: R.full, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 11.5, fontFamily: FONT.semibold }}>{reason}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function CandidatePreview({ candidate, eventId, onClose, onHidden, owner }: {
  owner: string;
  candidate: CrushLiveCandidate | null;
  eventId: string;
  onClose: () => void;
  onHidden: (candidateId: string, eventId: string) => void;
}) {
  const isCurrent = useSessionGuard(owner);
  const selected = useRef<string | null>(null);
  const safetyLock = useRef(false);
  const selection = `${eventId}:${candidate?.id ?? ''}`;
  useLayoutEffect(() => { selected.current = selection; safetyLock.current = false; return () => { selected.current = null; }; }, [selection]);
  const isHere = () => isCurrent() && selected.current === selection;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setReportOpen(false);
    setSafetyBusy(false);
  }, [candidate?.id]);

  if (!candidate) return null;
  const photos = (candidate.photos ?? []).filter(Boolean);
  if (!photos.length && candidate.avatar_url) photos.push(candidate.avatar_url);
  const name = candidate.full_name ?? 'esta persona';

  const submitReport = async (reason: string, label: string) => {
    if (!isHere() || safetyLock.current) return;
    safetyLock.current = true;
    setSafetyBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isHere()) return;
      if (!user || user.id !== owner) { toastError('Inicia sesión', 'Necesitas una cuenta para denunciar.'); return; }
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: user.id,
        reported_user_id: candidate.id,
        context: 'profile',
        context_id: eventId,
        reason,
        description: `${label} · Crush Live`,
      });
      if (!isHere()) return;
      if (error && error.code !== '23505') throw error;
      onHidden(candidate.id, eventId);
      toast('Gracias por avisar', 'Revisaremos la denuncia lo antes posible.');
    } catch {
      if (!isHere()) return;
      toastError('No se pudo enviar', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      if (isHere()) { safetyLock.current = false; setSafetyBusy(false); }
    }
  };

  const blockCandidate = () => {
    if (!isHere() || safetyLock.current) return;
    Alert.alert(`Bloquear a ${name}`, 'Dejaréis de veros en Franky y no podrá contactarte.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Bloquear', style: 'destructive', onPress: async () => {
          if (!isHere() || safetyLock.current) return;
          safetyLock.current = true;
    setSafetyBusy(true);
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!isHere()) return;
      if (!user || user.id !== owner) { toastError('Inicia sesión', 'Necesitas una cuenta para bloquear.'); return; }
            const { error } = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: candidate.id });
            if (!isHere()) return;
      if (error && error.code !== '23505') throw error;
            onHidden(candidate.id, eventId);
            toast('Perfil bloqueado', `Has bloqueado a ${name}.`);
          } catch {
            if (!isHere()) return;
            toastError('No se pudo bloquear', 'Inténtalo de nuevo.');
          } finally {
            if (isHere()) { safetyLock.current = false; setSafetyBusy(false); }
          }
        },
      },
    ]);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!safetyBusy) onClose(); }}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 6 }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>Detalles</Text>
          <Tap hitSlop={8} disabled={safetyBusy} onPress={() => setMenuOpen(true)} accessibilityLabel="Opciones de seguridad" accessibilityState={{ busy: safetyBusy }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
            <MoreHorizontal size={22} color={C.text} strokeWidth={2} />
          </Tap>
          <Tap hitSlop={8} disabled={safetyBusy} onPress={onClose} accessibilityLabel="Cerrar detalles" accessibilityState={{ busy: safetyBusy }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
            <X size={22} color={C.text} strokeWidth={2.2} />
          </Tap>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: Math.max(S.xl, insets.bottom + S.lg) }} showsVerticalScrollIndicator={false}>
          {photos.length ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} accessibilityLabel={`Fotos de ${name}`}>
              {photos.map((photo, index) => (
                <Image key={`${photo}:${index}`} source={{ uri: photo }} accessibilityLabel={`Foto ${index + 1} de ${photos.length}`}
                  style={{ width, aspectRatio: 0.82, backgroundColor: C.input }} contentFit="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={{ width, height: width * 0.8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.input }}>
              <Avatar name={candidate.full_name} size={128} />
            </View>
          )}
          <View style={{ padding: S.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { flex: 1 }]}>
                {candidate.full_name ?? 'Estudiante'}{candidate.age ? `, ${candidate.age}` : ''}
              </Text>
              <AffinityBadge score={candidate.compatibility} />
            </View>
            {candidate.career ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 4 }]}>{candidate.career}</Text> : null}
            {candidate.bio ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: S.lg, lineHeight: 22 }]}>{candidate.bio}</Text> : null}

            {candidate.compatibility_reasons?.length ? (
              <View style={{ marginTop: S.xl }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Por qué podéis conectar</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                  {candidate.compatibility_reasons.slice(0, 3).map((reason) => <Pill key={reason} label={reason} tone="red" icon={Sparkles} />)}
                </View>
              </View>
            ) : null}

            {candidate.interests?.length ? (
              <View style={{ marginTop: S.xl }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Intereses</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                  {candidate.interests.slice(0, 12).map((interest) => <Pill key={interest} label={interest} />)}
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.accentSoft, borderRadius: R.lg, padding: 12, marginTop: S.xl }}>
              <ShieldCheck size={18} color={C.blue} strokeWidth={2.2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>
                Ver estos detalles no avisa a la otra persona ni permite escribirle. Solo un Me gusta mutuo abre el chat.
              </Text>
            </View>
          </View>
        </ScrollView>

        <OptionsSheet visible={menuOpen} title={candidate.full_name ?? 'Opciones de seguridad'} onClose={() => setMenuOpen(false)} options={[
          { label: 'Denunciar perfil', icon: Flag, destructive: true, onPress: () => setReportOpen(true) },
          { label: 'Bloquear perfil', icon: Ban, destructive: true, onPress: blockCandidate },
        ]} />
        <OptionsSheet visible={reportOpen} title={`Denunciar a ${name}`} onClose={() => setReportOpen(false)}
          options={REPORT_REASONS.map((reason) => ({ label: reason.label, onPress: () => { void submitReport(reason.value, reason.label); } }))} />
      </View>
    </Modal>
  );
}

function MatchCelebration({ candidate, score, conversationId, onClose, onMessage }: {
  candidate: CrushLiveCandidate | null;
  score: number;
  conversationId: string | null;
  onClose: () => void;
  onMessage: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!candidate) return null;
  const photo = candidate.photos?.[0] ?? candidate.avatar_url;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.accent2, justifyContent: 'center', alignItems: 'center', padding: S.xl, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }}>
        <View accessibilityViewIsModal style={{ alignItems: 'center', width: '100%' }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, opacity: 0.85, fontFamily: FONT.semibold, fontSize: 13, letterSpacing: 1.2 }}>CRUSH LIVE</Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.display, fontSize: 46, letterSpacing: -1, marginTop: 6 }}>¡Es un match!</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 26 }}>
            <View style={{ borderWidth: 4, borderColor: C.onAccent, borderRadius: 60, marginRight: -18, zIndex: 2 }}>
              <Avatar name="Tú" size={104} />
            </View>
            <View style={{ borderWidth: 4, borderColor: C.onAccent, borderRadius: 60 }}>
              <Avatar name={candidate.full_name} uri={photo} size={104} />
            </View>
            <View style={{ position: 'absolute', alignSelf: 'center', left: '50%', marginLeft: -22, backgroundColor: C.surface, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
              <Heart size={22} color={C.error} fill={C.error} />
            </View>
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.heading, fontSize: 20, marginTop: 24, textAlign: 'center' }}>
            Tú y {candidate.full_name ?? 'esta persona'} os habéis gustado
          </Text>
          <View style={{ marginTop: 10, backgroundColor: `${C.onAccent}33`, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 14 }}>{score}% de afinidad</Text>
          </View>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 34 }}>
            <Tap onPress={onMessage} haptic accessibilityLabel={conversationId ? 'Enviar mensaje' : 'Abrir chat'}
              style={{ backgroundColor: C.surface, borderRadius: R.md, minHeight: 50, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              <MessageCircle size={18} color={C.accent2} strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.accent2, fontFamily: FONT.semibold, fontSize: 15.5 }}>{conversationId ? 'Enviar mensaje' : 'Abrir chat'}</Text>
            </Tap>
            <Tap onPress={onClose} accessibilityLabel="Seguir descubriendo"
              style={{ backgroundColor: `${C.onAccent}2B`, borderRadius: R.md, minHeight: 50, alignItems: 'center', justifyContent: 'center' }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 15.5 }}>Seguir descubriendo</Text>
            </Tap>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MatchesList({ matches, loading, failed, onRetry, onMessage, onProfile }: {
  matches: CrushLiveMatch[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onMessage: (match: CrushLiveMatch) => void;
  onProfile: (id: string) => void;
}) {
  if (loading) return <View style={{ paddingTop: S.lg }}><Skeleton height={84} radius={R.lg} /><Skeleton height={84} radius={R.lg} /><Skeleton height={84} radius={R.lg} /></View>;
  if (!matches.length) {
    return (
      <EmptyState icon={failed ? HeartCrack : Heart}
        title={failed ? 'No se pudieron cargar' : 'Tus matches aparecerán aquí'}
        subtitle={failed ? 'Comprueba tu conexión e inténtalo otra vez.' : 'Cuando un like sea mutuo, guardaremos el match y su porcentaje.'}
        cta={failed ? 'Reintentar' : undefined} onCta={failed ? onRetry : undefined} />
    );
  }
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: 130, gap: 10 }} showsVerticalScrollIndicator={false}>
      {matches.map((match) => (
        <View key={match.id} style={[{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, padding: 12 }, SHADOW.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Tap onPress={() => onProfile(match.user.id)} accessibilityLabel={`Ver perfil de ${match.user.full_name ?? 'este match'}`}>
              <Avatar name={match.user.full_name} uri={match.user.photos?.[0] ?? match.user.avatar_url} size={54} ring />
            </Tap>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{match.user.full_name ?? 'Estudiante'}{match.user.age ? `, ${match.user.age}` : ''}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]} numberOfLines={1}>{match.event.title} · {timeAgo(match.matched_at)}</Text>
              <View style={{ flexDirection: 'row', marginTop: 6 }}><Pill label={`${match.compatibility}% de afinidad`} tone="red" icon={Sparkles} /></View>
            </View>
            <Tap haptic onPress={() => onMessage(match)} accessibilityLabel={`Enviar mensaje a ${match.user.full_name ?? 'este match'}`}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent2, alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={20} color={C.onAccent} strokeWidth={1.9} />
              </View>
            </Tap>
          </View>
          {match.compatibility_reasons?.length ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 8 }]} numberOfLines={1}>{match.compatibility_reasons.join(' · ')}</Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

export default function CrushLive() {
  const { uid } = useSessionIdentity();
  const router = useRouter();
  if (!uid) return <Screen title="Crush Live" back><EmptyState icon={Heart} title={uid === undefined ? "Cargando tu sesión…" : "Entra para participar"} subtitle="Tus preferencias y matches están vinculados a tu cuenta." cta={uid === undefined ? undefined : "Iniciar sesión"} onCta={() => router.push('/welcome')} /></Screen>;
  return <OwnedCrushLive key={uid} owner={uid} />;
}
function OwnedCrushLive({ owner }: { owner: string }) {
  const isCurrent = useSessionGuard(owner);
  const params = useLocalSearchParams<{ eventId?: string | string[]; view?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const selectedEventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const showAllMatches = !selectedEventId && requestedView === 'matches';

  const [events, setEvents] = useState<CrushLiveEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(!selectedEventId && !showAllMatches);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [state, setState] = useState<CrushLiveState | null>(null);
  const [stateLoading, setStateLoading] = useState(!!selectedEventId);
  const [stateFailed, setStateFailed] = useState(false);
  const [feed, setFeed] = useState<CrushLiveCandidate[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedFailed, setFeedFailed] = useState(false);
  const [matches, setMatches] = useState<CrushLiveMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesFailed, setMatchesFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('discover');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [match, setMatch] = useState<{ candidate: CrushLiveCandidate; score: number; conversationId: string | null } | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<CrushLiveCandidate | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const eventsRequest = useRef(0);
  const stateRequest = useRef(0);
  const feedRequest = useRef(0);
  const matchesRequest = useRef(0);
  const mutationRequest = useRef(0);
  const eventEpoch = useRef(0);
  const swipeInFlight = useRef(false);
  const deckBusy = useRef(false);
  const swipeKeys = useRef(new Map<string, { key: string; action: 'like' | 'pass' }>());
  const deckRef = useRef<SwipeDeckHandle>(null);
  const handleDeckBusy = useCallback((busy: boolean) => {
    deckBusy.current = busy;
    setSwiping(busy);
  }, []);

  // Si se cambia de evento dentro de la misma ruta, no debe aparecer ni un
  // fotograma del mazo o los matches del evento anterior.
  useLayoutEffect(() => {
    eventEpoch.current += 1;
    eventsRequest.current += 1;
    stateRequest.current += 1;
    feedRequest.current += 1;
    matchesRequest.current += 1;
    mutationRequest.current += 1;
    swipeInFlight.current = false;
    deckBusy.current = false;
    swipeKeys.current.clear();
    setState(null);
    setStateLoading(!!selectedEventId);
    setFeed([]);
    setMatches([]);
    setMatch(null);
    setPreviewCandidate(null);
    setTab('discover');
    setEditing(false);
    setSaving(false);
    setSwiping(false);
  }, [selectedEventId]);

  const loadEvents = useCallback(async () => {
    if (!isCurrent()) return;
    const request = ++eventsRequest.current;
    setEventsLoading(true);
    setEventsFailed(false);
    try {
      const nextEvents = await getCrushLiveEvents();
      if (isCurrent() && request === eventsRequest.current) setEvents(nextEvents);
    } catch {
      if (isCurrent() && request === eventsRequest.current) { setEvents([]); setEventsFailed(true); }
    } finally {
      if (isCurrent() && request === eventsRequest.current) setEventsLoading(false);
    }
  }, []);

  const loadState = useCallback(async () => {
    if (!isCurrent() || !selectedEventId) return;
    if (!isCurrent()) return;
    const request = ++stateRequest.current;
    setStateLoading(true);
    setStateFailed(false);
    try {
      const nextState = await getCrushLiveState(selectedEventId);
      if (isCurrent() && request === stateRequest.current) setState(nextState);
    } catch {
      if (isCurrent() && request === stateRequest.current) { setState(null); setStateFailed(true); }
    } finally {
      if (isCurrent() && request === stateRequest.current) setStateLoading(false);
    }
  }, [selectedEventId]);

  const loadFeed = useCallback(async () => {
    if (!isCurrent() || !selectedEventId) return;
    if (!isCurrent()) return;
    const request = ++feedRequest.current;
    setFeedLoading(true);
    setFeedFailed(false);
    try {
      const candidates = await getCrushLiveFeed(selectedEventId);
      if (request !== feedRequest.current) return;
      setFeed(candidates);
      void track('crush_live_deck_loaded', {
        event_id: selectedEventId,
        candidate_band: candidates.length === 0 ? '0' : candidates.length < 5 ? '1_4' : candidates.length < 15 ? '5_14' : '15_plus',
      });
    } catch {
      if (isCurrent() && request === feedRequest.current) { setFeed([]); setFeedFailed(true); }
    } finally {
      if (isCurrent() && request === feedRequest.current) setFeedLoading(false);
    }
  }, [selectedEventId]);

  const loadMatches = useCallback(async () => {
    if (!isCurrent()) return;
    const request = ++matchesRequest.current;
    setMatchesLoading(true);
    setMatchesFailed(false);
    try {
      const nextMatches = await getCrushLiveMatches(selectedEventId ?? null);
      if (isCurrent() && request === matchesRequest.current) setMatches(nextMatches);
    } catch {
      if (isCurrent() && request === matchesRequest.current) { setMatches([]); setMatchesFailed(true); }
    } finally {
      if (isCurrent() && request === matchesRequest.current) setMatchesLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    void track('crush_live_entry_viewed', { event_id: selectedEventId ?? null });
    if (showAllMatches) loadMatches();
    else if (selectedEventId) loadState();
    else loadEvents();
  }, [selectedEventId, showAllMatches, loadEvents, loadMatches, loadState]);
  useEffect(() => {
    if (!isCurrent() || !selectedEventId || !state?.profile?.active) return;
    loadFeed();
    loadMatches();
  }, [selectedEventId, state?.profile?.active, loadFeed, loadMatches]);

  const event = state?.event ?? events.find((item) => item.id === selectedEventId) ?? null;

  const saveProfile = async (profile: {
    goal: CrushLiveGoal; preferredGenders: CrushLiveGender[];
    ageMin: number; ageMax: number; answers: CrushLiveAnswers;
  }) => {
    if (!isCurrent() || !selectedEventId) return;
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    const mutation = ++mutationRequest.current;
    setSaving(true);
    try {
      const wasActive = state?.profile?.active === true;
      await setCrushLiveProfile({ eventId, active: true, ...profile });
      if (!isCurrent() || epoch !== eventEpoch.current) return;
      void track(state?.profile?.active ? 'crush_live_profile_completed' : 'crush_live_event_opt_in', { event_id: eventId });
      await loadState();
      if (!isCurrent()) return;
      if (wasActive) await Promise.all([loadFeed(), loadMatches()]);
      if (!isCurrent()) return;
      setEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(wasActive ? 'Preferencias guardadas' : 'Ya estás en Crush Live', wasActive ? undefined : 'Desliza para descubrir gente afín de este evento.');
    } catch {
      if (isCurrent() && mutation === mutationRequest.current) {
        toastError('No se pudo guardar', 'Comprueba tus respuestas y vuelve a intentarlo.');
      }
    } finally {
      if (isCurrent() && mutation === mutationRequest.current) setSaving(false);
    }
  };

  const deactivate = () => {
    if (saving || swiping || deckBusy.current || swipeInFlight.current
      || !selectedEventId || !state?.profile?.answers || !state.profile.goal) return;
    const eventId = selectedEventId;
    const profile = state.profile;
    Alert.alert('¿Salir de Crush Live?', 'Dejarás de aparecer en este evento. Tus matches seguirán guardados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive', onPress: async () => {
          if (!isCurrent()) return;
          if (deckBusy.current || swipeInFlight.current) {
            toastInfo('Espera un momento', 'Estamos terminando tu decisión anterior antes de salir.');
            return;
          }
          const epoch = eventEpoch.current;
          const mutation = ++mutationRequest.current;
          setSaving(true);
          try {
            await setCrushLiveProfile({
              eventId, active: false, goal: profile.goal!,
              preferredGenders: profile.preferred_genders,
              ageMin: profile.age_min, ageMax: profile.age_max,
              answers: profile.answers!,
            });
            if (!isCurrent() || epoch !== eventEpoch.current) return;
            void track('crush_live_event_opt_out', { event_id: eventId });
            await loadState();
            toast('Has salido de Crush Live', 'Tus matches siguen guardados.');
          } catch {
            if (isCurrent() && mutation === mutationRequest.current) toastError('No se pudo salir', 'Inténtalo otra vez.');
          } finally {
            if (isCurrent() && mutation === mutationRequest.current) setSaving(false);
          }
        },
      },
    ]);
  };

  const swipe = useCallback(async (candidate: CrushLiveCandidate, action: 'like' | 'pass'): Promise<boolean> => {
    if (!isCurrent() || !selectedEventId || swipeInFlight.current) return false;
    const eventId = selectedEventId;
    const epoch = eventEpoch.current;
    const requestKey = `${eventId}:${candidate.id}`;
    const pending = swipeKeys.current.get(requestKey);
    if (pending && pending.action !== action) {
      toastInfo('Confirma primero tu decisión anterior',
        `Vuelve a pulsar ${pending.action === 'like' ? 'Me gusta' : 'Paso'} para comprobarla sin cambiar tu elección.`);
      return false;
    }
    const idempotencyKey = pending?.key ?? uuid();
    swipeKeys.current.set(requestKey, { key: idempotencyKey, action });
    swipeInFlight.current = true;
    try {
      const result = await swipeCrushLive({ eventId, targetId: candidate.id, action, idempotencyKey });
      if (!isCurrent() || epoch !== eventEpoch.current) return false;
      swipeKeys.current.delete(requestKey);
      void track('crush_live_swipe', {
        event_id: eventId,
        action,
        affinity_band: candidate.compatibility >= 80 ? '80_100' : candidate.compatibility >= 60 ? '60_79' : 'below_60',
      });
      if (result.match) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setMatch({ candidate, score: result.compatibility ?? candidate.compatibility, conversationId: result.conversation_id });
        void track('crush_live_match_created', {
          event_id: eventId,
          affinity_band: candidate.compatibility >= 80 ? '80_100' : candidate.compatibility >= 60 ? '60_79' : 'below_60',
        });
        loadMatches();
      }
      return true;
    } catch (error) {
      if (!isCurrent() || epoch !== eventEpoch.current) return false;
      const token = crushLiveErrorToken(error);
      if (token === 'target_not_available') {
        swipeKeys.current.delete(requestKey);
        return true;
      }
      if (token === 'swipe_already_decided') {
        swipeKeys.current.delete(requestKey);
        toastInfo('Decisión ya guardada', 'Este perfil ya tenía otra decisión. Hemos actualizado el mazo.');
        await Promise.all([loadFeed(), loadMatches()]);
        return false;
      }
      if (token === 'idempotency_stale') {
        swipeKeys.current.delete(requestKey);
        toastInfo('Participación actualizada', 'Tu alta cambió desde esa decisión. Vuelve a elegir.');
        await loadFeed();
        return false;
      }
      if (token === 'crush_live_unavailable' || token === 'event_closed'
        || token === 'not_participant' || token === 'profile_not_eligible'
        || token === 'crush_live_opt_in_required') {
        await loadState();
        return false;
      }
      if (token === 'rate_limit_exceeded') {
        toastInfo('Has ido muy rápido', 'Espera un momento antes de seguir.');
        return false;
      }
      toastError('No pudimos confirmar la decisión',
        `Comprueba la conexión y repite ${action === 'like' ? 'Me gusta' : 'Paso'}: no se duplicará.`);
      return false;
    } finally {
      if (epoch === eventEpoch.current) {
        swipeInFlight.current = false;
      }
    }
  }, [selectedEventId, loadFeed, loadMatches, loadState]);

  const openConversation = useCallback(async (otherUserId: string, conversationId?: string | null) => {
    if (!isCurrent()) return;
    const id = conversationId ?? await startDirectChat(otherUserId);
    if (!isCurrent()) return;
    if (!id) {
      toastError('No se pudo abrir el chat', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    setMatch(null);
    void track('crush_live_chat_started', { event_id: selectedEventId ?? null });
    router.push(`/chat/${id}`);
  }, [router, selectedEventId]);

  const headerRight = state?.profile?.active ? (
    <Tap hitSlop={8} disabled={saving || swiping} onPress={() => setMenuOpen(true)} accessibilityLabel="Opciones de Crush Live"
      accessibilityState={{ busy: saving || swiping }}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
      <Settings2 size={19} color={C.text} strokeWidth={2.1} />
    </Tap>
  ) : undefined;

  const tabs = useMemo(() => (
    <View style={{ flexDirection: 'row', marginHorizontal: S.lg, marginTop: S.sm, marginBottom: 4, backgroundColor: C.input, borderRadius: R.full, padding: 3 }}>
      {([
        ['discover', 'Descubrir'], ['matches', `Matches${matches.length ? ` (${matches.length})` : ''}`],
      ] as [Tab, string][]).map(([value, label]) => {
        const on = tab === value;
        return (
          <Tap key={value} disabled={saving || swiping}
            onPress={() => { setTab(value); if (value === 'matches') void loadMatches(); }}
            accessibilityRole="tab" accessibilityState={{ selected: on, busy: saving || swiping }} style={{ flex: 1 }}>
            <View style={{ minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: R.full, backgroundColor: on ? C.surface : 'transparent', ...(on ? SHADOW.card : {}) }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: on ? C.text : C.muted, fontSize: 14, fontFamily: on ? FONT.semibold : FONT.medium }}>{label}</Text>
            </View>
          </Tap>
        );
      })}
    </View>
  ), [tab, matches.length, saving, swiping, loadMatches]);

  if (!isCurrent() || !selectedEventId) {
    if (showAllMatches) {
      return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <Header title="Mis matches de Live" back />
          <MatchesList matches={matches} loading={matchesLoading} failed={matchesFailed} onRetry={loadMatches}
            onProfile={(id) => router.push(`/perfil/${id}`)}
            onMessage={(item) => openConversation(item.user.id, item.conversation_id)} />
        </View>
      );
    }
    return <EventPicker events={events} loading={eventsLoading} failed={eventsFailed} onRetry={loadEvents}
      onSelect={(chosen) => router.replace({ pathname: '/crush-live', params: { eventId: chosen.id } })}
      onOpenMatches={() => router.push({ pathname: '/crush-live', params: { view: 'matches' } })} />;
  }

  if (stateLoading) {
    return <Screen title="Crush Live" back><View style={{ paddingTop: S.lg }}><Skeleton height={140} radius={R.xl} /><Skeleton height={300} radius={R.xl} /></View></Screen>;
  }

  if (stateFailed || !state) {
    return <Screen title="Crush Live" back><EmptyState icon={HeartCrack} title="No se pudo abrir Crush Live"
      subtitle="Comprueba tu conexión e inténtalo otra vez." cta="Reintentar" onCta={loadState} /></Screen>;
  }

  if (!state.available || !state.participant || !state.eligible) {
    const reason = state.reason;
    const fix = actionForReason(reason);
    const closed = reason === 'event_closed' || reason === 'disabled';
    return (
      <Screen title="Crush Live" back>
        <EmptyState icon={reason === 'student_verification_required' ? BadgeCheck : reason === 'not_participant' ? Users : ShieldCheck}
          title={titleForReason(reason)}
          subtitle={messageForReason(reason)}
          cta={closed ? 'Ver mis matches guardados' : fix ? fix.label : reason === 'not_participant' && event ? 'Ver el evento' : undefined}
          onCta={closed
            ? () => router.replace({ pathname: '/crush-live', params: { view: 'matches' } })
            : fix ? () => router.push(fix.route as never)
            : reason === 'not_participant' && event ? () => router.push(`/evento/${event.id}`)
            : undefined} />
        {fix || reason === 'not_participant' ? (
          <View style={{ paddingHorizontal: S.lg }}>
            <Btn full variant="ghost" label="Volver a comprobar" onPress={loadState} />
          </View>
        ) : null}
      </Screen>
    );
  }

  if (event && (!state.profile?.active || editing)) {
    return <LiveSetup event={event} current={state.profile} saving={saving} onSave={saveProfile}
      onCancel={editing ? () => setEditing(false) : undefined} />;
  }

  const chrome = (
    <>
      <Header title="Crush Live" subtitle={event?.title} back right={headerRight} />
      {tabs}
    </>
  );

  if (tab === 'matches') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {chrome}
        <MatchesList matches={matches} loading={matchesLoading} failed={matchesFailed} onRetry={loadMatches}
          onProfile={(id) => router.push(`/perfil/${id}`)}
          onMessage={(item) => openConversation(item.user.id, item.conversation_id)} />
        <OptionsSheet visible={menuOpen} title="Crush Live" onClose={() => setMenuOpen(false)} options={[
          { label: 'Editar mis preferencias', icon: Settings2, onPress: () => setEditing(true) },
          { label: 'Salir de este Live', icon: LogOut, destructive: true, onPress: deactivate },
        ]} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {chrome}
      {feedLoading ? (
        <View style={{ flex: 1, paddingTop: S.lg }}><Skeleton height={470} radius={R.xl} /></View>
      ) : feedFailed ? (
        <EmptyState icon={HeartCrack} title="No se pudieron cargar los perfiles" subtitle="Comprueba tu conexión e inténtalo otra vez." cta="Reintentar" onCta={loadFeed} />
      ) : (
        <SwipeDeck ref={deckRef} items={feed} disabled={saving || swiping}
          onBusyChange={handleDeckBusy}
          renderCard={(candidate) => <CandidateCard candidate={candidate} onProfile={() => setPreviewCandidate(candidate)} />}
          onSmash={(candidate) => swipe(candidate, 'like')} onPass={(candidate) => swipe(candidate, 'pass')}
          onReset={loadFeed} onOpenSaved={() => { setTab('matches'); void loadMatches(); }} resetLabel="Buscar de nuevo" savedLabel="Ver mis matches"
          likeLabel="ME GUSTA" passLabel="PASO"
          emptyTitle="Ya has visto a todo el mundo"
          emptySubtitle="Vuelve más tarde: podrán entrar más asistentes mientras el evento siga activo." />
      )}
      <View style={{ paddingHorizontal: S.lg, paddingBottom: Math.max(8, insets.bottom) }}>
        {/* Franky Tap dentro del evento: acercar los móviles hace match al
            instante (chat + Instagram si ambos tienen Crush). */}
        <Btn variant="ghost" full icon={Smartphone} label="Hacer match acercando los móviles"
          onPress={() => router.push({ pathname: '/tap', params: { mode: 'live', eventId: selectedEventId! } })} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 8 }]}>¿Estáis juntos? Abrid Franky Tap los dos y juntad los móviles: match al momento.</Text>
      </View>
      <OptionsSheet visible={menuOpen} title="Crush Live" onClose={() => setMenuOpen(false)} options={[
        { label: 'Editar mis preferencias', icon: Settings2, onPress: () => setEditing(true) },
        { label: 'Salir de este Live', icon: LogOut, destructive: true, onPress: deactivate },
      ]} />
      <MatchCelebration candidate={match?.candidate ?? null} score={match?.score ?? 0}
        conversationId={match?.conversationId ?? null} onClose={() => setMatch(null)}
        onMessage={() => match && openConversation(match.candidate.id, match.conversationId)} />
      <CandidatePreview owner={owner} candidate={previewCandidate} eventId={selectedEventId}
        onClose={() => setPreviewCandidate(null)} onHidden={(candidateId, hiddenEventId) => {
          if (hiddenEventId !== selectedEventId) return;
          setPreviewCandidate(null);
          deckRef.current?.advance(candidateId);
        }} />
    </View>
  );
}
