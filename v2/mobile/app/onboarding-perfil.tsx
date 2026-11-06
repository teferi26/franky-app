import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Check, GraduationCap, Camera, BookOpen, Plus } from 'lucide-react-native';
import { Btn, Tap, SearchBar, Chip, ProgressBar, SkeletonList, EmptyState } from '@/components/ui';
import { getUniversities } from '@/lib/api';
import { uploadPickedImage } from '@/lib/media';
import { ensureSocialDemoFeature, useSocialDemoAccessState } from '@/lib/social-demo';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { SocialDemoFeatureNotice } from '@/components/SocialDemoFeatureNotice';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import {
  getCareerNamesForUniversity, updateMyProfile, addInterestTo,
  COURSE_OPTIONS, INTEREST_OPTIONS, MAX_INTERESTS,
} from '@/lib/profile';
import { toast, toastError } from '@/lib/toast';
import type { University } from '@/lib/types';
import { normalizeAdmissionText } from '@/lib/admission-search';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';

// Captacion de universidad y ciudad tras el registro. Sin university_id el FOMO
// y el Crush muestran "no tienes universidad asignada", asi que esta pantalla
// cierra ese hueco antes de entrar al feed.
//
// Dos pasos: (1) uni + ciudad + foto, obligatorio salvo "Completar más tarde";
// (2) carrera, curso e intereses, OPCIONAL y saltable. El segundo paso existe
// desde septiembre de 2026 por paridad con el onboarding web, que sí pregunta
// carrera (career), curso (university_course) e intereses (mismas opciones que
// HOBBIES_OPTIONS de la web). El flujo sigue igual: onboarding-intro →
// onboarding-perfil → onboarding-intencion → guia.
type Step = 'uni' | 'extra';

// El onboarding son 4 pasos en total (uni, estudios, intención y guía): el
// rótulo numerado + la barra hacen que se vea cuánto queda, en vez de una
// sucesión de pantallas sin final visible.
function StepHead({ n, of = 4 }: { n: number; of?: number }) {
  return (
    <>
      <ProgressBar value={(n / of) * 100} height={3} style={{ marginBottom: 18 }} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 10 }]}>Paso {n} de {of}</Text>
    </>
  );
}

// Fila de universidad memoizada: el catálogo entero se refiltra en cada tecla
// del buscador y sin memo se repintan todas las filas visibles.
const UniRow = memo(function UniRow({ uni, active, onPick }: {
  uni: University; active: boolean; onPick: (u: University) => void;
}) {
  return (
    <Tap onPress={() => onPick(uni)} accessibilityLabel={uni.name} accessibilityState={{ selected: active }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16, minHeight: 76, marginHorizontal: S.lg, marginBottom: 10, borderRadius: 18,
        backgroundColor: active ? C.accentSoft : C.surface,
        borderWidth: 1, borderColor: active ? C.blue : C.border,
      }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={20} color={C.blueDeep} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{uni.name}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>
            {[uni.short_name, uni.city].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {active ? <Check size={20} color={C.blue} strokeWidth={2.4} /> : null}
      </View>
    </Tap>
  );
});

export default function OnboardingPerfil() {
  const { access: demoAccess, retry: retryDemoAccess, checking: checkingDemoAccess } = useSocialDemoAccessState();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('uni');
  const [unis, setUnis] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<University | null>(null);
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Paso 2 (opcional).
  const [career, setCareer] = useState('');
  const [careerSuggestions, setCareerSuggestions] = useState<string[]>([]);
  const [course, setCourse] = useState<number | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  // Aviso de "elige universidad" pegado al botón, no en un Alert: es un fallo
  // del formulario y el sitio donde se corrige está en esta misma pantalla.
  const [uniError, setUniError] = useState(false);

  // Foto de perfil ya en el registro: quien llega con avatar retiene mucho más.
  // Mismo flujo que Editar perfil (bucket avatars, carpeta {uid}).
  const changePhoto = async () => {
    const owner = captureSessionIdentity();
    if (!owner || !await ensureSocialDemoFeature('avatar') || !isCurrentSessionIdentity(owner)) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (!isCurrentSessionIdentity(owner) || res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/welcome'); return; }
    setUploadingPhoto(true);
    try {
      // Transcodifica a JPEG antes de subir: el HEIC del iPhone lo rechaza el
      // bucket (ver src/lib/media.ts).
      if (!await ensureSocialDemoFeature('avatar') || !isCurrentSessionIdentity(owner) || user.id !== owner.userId) return;
      const up = await uploadPickedImage('avatars', user.id, asset, 3 * 1024 * 1024);
      if (!isCurrentSessionIdentity(owner)) return;
      if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
      setAvatarUrl(up.publicUrl);
    } catch {
      toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (isCurrentSessionIdentity(owner)) setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { rows } = await getUniversities();
        setUnis(rows);
      } catch {
        // Sin catalogo el usuario puede saltar; no bloqueamos el onboarding.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filtro local por nombre, nombre corto y ciudad (el catalogo cabe en memoria).
  const filtered = useMemo(() => {
    const q = normalizeAdmissionText(query);
    if (!q) return unis;
    return unis.filter((u) =>
      normalizeAdmissionText(u.name).includes(q)
      || normalizeAdmissionText(u.short_name ?? '').includes(q)
      || normalizeAdmissionText(u.city ?? '').includes(q),
    );
  }, [unis, query]);

  const pick = (u: University) => {
    setSelected(u);
    setUniError(false);
    // Autorrellena la ciudad con la de la uni (editable): la mayoria estudia
    // donde esta el campus, pero dejamos cambiarla (online, otro campus, etc.).
    if (u.city) setCity(u.city);
  };

  // Encadena con el siguiente paso del onboarding (no directo al feed):
  // onboarding-intencion pregunta el uso que se le va a dar a la app y guia
  // enseña la app paso a paso; ambas solo se alcanzan desde aquí, que a su
  // vez solo se alcanza tras un alta nueva (ver welcome.tsx).
  const goNext = () => router.replace('/onboarding-intencion');

  // M1: dejar constancia de que el usuario YA pasó por el onboarding móvil,
  // también al pulsar "Completar más tarde". Sin esta marca la web volvería a
  // lanzarle su onboarding. Fail-soft y sin bloquear la navegación.
  const markOnboarded = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', user.id);
      }
    } catch { /* fail-soft: si falla, la web re-onboardea y ya está */ }
  };

  const save = async () => {
    if (!selected) {
      setUniError(true);
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/welcome'); return; }
      const { error } = await supabase.from('profiles')
        .update({
          university_id: selected.id,
          city: city.trim() || selected.city || null,
          // M1: la web mira esta marca para no repetir su onboarding.
          onboarding_completed: true,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        })
        .eq('id', user.id);
      if (error) {
        toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      setUserId(user.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Embudo: registro → PERFIL COMPLETO → primera publicación. Este es el
      // segundo hito; se mide con la analítica ya instrumentada (migración 131).
      track('onboarding_profile_completed', { has_avatar: !!avatarUrl, has_city: !!city.trim() });
      // Sugerencias de carrera de la uni elegida para el paso opcional.
      getCareerNamesForUniversity(selected.id).then(setCareerSuggestions);
      setStep('extra');
    } catch {
      toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Paso 2: guarda solo lo que se haya rellenado. Si no hay nada, equivale a
  // saltar. Un fallo de red no bloquea el onboarding: se avisa y se sigue
  // (todo esto se puede completar luego en Editar perfil).
  const saveExtra = async () => {
    const patch: Record<string, unknown> = {};
    if (career.trim()) patch.career = career.trim().slice(0, 120);
    if (course != null) patch.university_course = course;
    if (interests.length) patch.interests = interests.slice(0, MAX_INTERESTS);
    if (Object.keys(patch).length === 0 || !userId) { skipExtra(); return; }
    setSaving(true);
    try {
      const res = await updateMyProfile(userId, patch);
      if (!res.ok) {
        toastError('No se pudo guardar', 'Podrás completarlo luego en Editar perfil.');
      } else {
        track('onboarding_profile_extra_completed', {
          has_career: !!patch.career, has_course: course != null, interests: interests.length,
        });
        toast('Perfil guardado');
      }
    } catch {
      toastError('No se pudo guardar', 'Podrás completarlo luego en Editar perfil.');
    } finally {
      setSaving(false);
      goNext();
    }
  };
  const skipExtra = () => { track('onboarding_profile_extra_skipped'); goNext(); };

  const visibleCareerSuggestions = useMemo(() => {
    const q = career.trim().toLowerCase();
    return careerSuggestions
      .filter((c) => c.toLowerCase() !== q && (!q || c.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [career, careerSuggestions]);

  const addInterest = (raw: string) => {
    if (interests.length >= MAX_INTERESTS && raw.trim()) {
      toastError('Demasiados intereses', `Puedes elegir hasta ${MAX_INTERESTS}.`);
      return;
    }
    setInterests((prev) => addInterestTo(prev, raw));
    setInterestInput('');
  };
  const toggleInterest = (value: string) => {
    if (interests.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setInterests((prev) => prev.filter((i) => i.toLowerCase() !== value.toLowerCase()));
    } else {
      addInterest(value);
    }
  };

  // Campo estándar de la app: C.input, R.md, 48 px de alto y 15 px de texto.
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md,
    paddingHorizontal: 14, minHeight: 50, paddingVertical: 13, fontSize: 15.5, color: C.text,
    marginHorizontal: S.lg,
  } as const;

  // ── Paso 2: carrera, curso e intereses (opcional) ──
  if (step === 'extra') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={{ paddingHorizontal: S.lg, paddingTop: 18, paddingBottom: 8 }}>
              <StepHead n={2} />
              <View style={{ marginBottom: 14, width: 54, height: 54, borderRadius: 18, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={28} color={C.blue} strokeWidth={1.5} />
              </View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[F.h1, { fontSize: 30, lineHeight: 34, letterSpacing: -1, marginBottom: 8 }]}>
                Dale tu toque al campus.
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14, lineHeight: 20 }]}>
                Tu carrera, tu curso y lo que te gusta. Completa lo que quieras para conectar con gente afín.
              </Text>
            </View>

            <View style={{ gap: 18, marginTop: 10 }}>
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, marginBottom: 6 }]}>Carrera</Text>
                <TextInput
                  accessibilityLabel="Carrera" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  value={career} onChangeText={setCareer}
                  placeholder={careerSuggestions.length ? 'Escribe o elige una de abajo' : 'Ej. Ingeniería Informática'}
                  placeholderTextColor={C.muted} maxLength={120} style={input} />
                {visibleCareerSuggestions.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, paddingHorizontal: S.lg, marginTop: 10 }}>
                    {visibleCareerSuggestions.map((c) => (
                      <Chip key={c} label={c} onPress={() => setCareer(c)} />
                    ))}
                  </View>
                ) : null}
              </View>

              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, marginBottom: 6 }]}>Curso</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, paddingHorizontal: S.lg }}>
                  {COURSE_OPTIONS.map((o) => (
                    <Chip key={o.value} label={o.label} active={course === o.value}
                      onPress={() => setCourse((cur) => (cur === o.value ? null : o.value))} />
                  ))}
                </View>
              </View>

              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, marginBottom: 6 }]}>
                  Intereses{interests.length ? ` (${interests.length} de ${MAX_INTERESTS})` : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, paddingHorizontal: S.lg }}>
                  {INTEREST_OPTIONS.map((s) => {
                    const active = interests.some((i) => i.toLowerCase() === s.toLowerCase());
                    return <Chip key={s} label={s} active={active} icon={active ? Check : undefined} onPress={() => toggleInterest(s)} />;
                  })}
                  {/* Los escritos a mano que no están en la lista fija. */}
                  {interests
                    .filter((i) => !INTEREST_OPTIONS.some((s) => s.toLowerCase() === i.toLowerCase()))
                    .map((i) => <Chip key={i} label={i} active icon={Check} onPress={() => toggleInterest(i)} />)}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10, paddingRight: S.lg }}>
                  <TextInput
                    value={interestInput} onChangeText={setInterestInput}
                    placeholder="Otro interés" placeholderTextColor={C.muted}
                    maxLength={30} autoCapitalize="none" returnKeyType="done"
                    onSubmitEditing={() => addInterest(interestInput)}
                    accessibilityLabel="Otro interés" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[input, { flex: 1, marginRight: 0 }]} />
                  <Tap onPress={() => addInterest(interestInput)} accessibilityLabel="Añadir interés" haptic
                    style={{
                      width: 48, height: 48, borderRadius: R.md, backgroundColor: C.blue,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Plus size={20} color={C.onAccent} strokeWidth={2.4} />
                  </Tap>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={{
            borderTopWidth: 0.5, borderTopColor: C.border,
            paddingTop: 14, paddingBottom: insets.bottom + 14, paddingHorizontal: S.lg, gap: 10,
          }}>
            <Btn full busy={saving} label="Guardar y continuar" onPress={saveExtra} />
            <Tap onPress={skipExtra} accessibilityLabel="Saltar este paso"
              style={{ alignItems: 'center', paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.muted, fontSize: 13.5, fontFamily: FONT.semibold }}>Saltar este paso</Text>
            </Tap>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Paso 1: universidad + ciudad + foto ──
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <FlatList
            ListHeaderComponent={<>
        <View style={{ paddingHorizontal: S.lg, paddingTop: 18, paddingBottom: 8 }}>
          <StepHead n={1} />
          {/* Foto de perfil (opcional) + icono de uni. Tocar el círculo elige foto. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <Tap onPress={changePhoto} disabled={demoAccess?.demo !== false} accessibilityLabel={demoAccess?.demo === false ? 'Añadir foto de perfil' : 'Foto de perfil'}>
              <View style={{
                width: 66, height: 66, borderRadius: 23, backgroundColor: C.accentSoft,
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                borderWidth: 1, borderColor: C.border,
              }}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }}
                    contentFit="cover" cachePolicy="memory-disk" transition={120} />
                ) : uploadingPhoto ? (
                  <ActivityIndicator color={C.blue} />
                ) : (
                  <Camera size={26} color={C.muted} strokeWidth={1.8} />
                )}
              </View>
              <View style={{
                position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12,
                backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: C.bg,
              }}>
                <Camera size={12} color={C.onAccent} strokeWidth={2.4} />
              </View>
            </Tap>
            <View style={{ flex: 1, gap: 4 }}>{demoAccess?.demo === false ? <><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Ponle cara a tu perfil</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Tu foto es opcional. Tu sitio, aquí.</Text></> : <SocialDemoFeatureNotice access={demoAccess} feature="avatar" retry={retryDemoAccess} checking={checkingDemoAccess} />}</View>
          </View>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[F.h1, { fontSize: 30, lineHeight: 34, letterSpacing: -1, marginBottom: 8 }]}>
            ¿En qué uni estudias?
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14, lineHeight: 20 }]}>
            Así te enseñamos el FOMO, el Crush y los planes de tu campus. Puedes cambiarlo luego.
          </Text>
        </View>

        <View style={{ marginTop: 10 }}>
          <SearchBar value={query} onChange={setQuery} placeholder="Busca tu universidad o ciudad" />
        </View>

            </>}
            data={filtered}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            removeClippedSubviews
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={9}
            ListEmptyComponent={loading ? <SkeletonList count={3} height={76} /> :
              <EmptyState compact icon={GraduationCap} title="Sin resultados"
                subtitle="No encontramos ninguna universidad con eso. Prueba con el nombre de la ciudad." />
            }
            renderItem={({ item }) => (
              <UniRow uni={item} active={selected?.id === item.id} onPick={pick} />
            )}
          />

        <View style={{
          borderTopWidth: 0.5, borderTopColor: C.border,
          paddingTop: 14, paddingBottom: insets.bottom + 14, gap: 12,
        }}>
          {selected ? (
            <View style={{ gap: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg }]}>Tu ciudad</Text>
              <TextInput
                value={city} onChangeText={setCity} placeholder="Ciudad" placeholderTextColor={C.muted}
                accessibilityLabel="Tu ciudad" maxFontSizeMultiplier={MAX_FONT_SCALE}
                autoCapitalize="words" style={input} />
            </View>
          ) : null}
          <View style={{ paddingHorizontal: S.lg, gap: 10 }}>
            {uniError ? (
              <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[F.tiny, { color: C.error, textAlign: 'center', lineHeight: 16 }]}>
                Busca y toca tu universidad en la lista para continuar.
              </Text>
            ) : null}
            <Btn full busy={saving} label="Guardar y continuar" onPress={save} />
            <Tap onPress={() => { track('onboarding_profile_skipped'); markOnboarded(); goNext(); }}
              accessibilityLabel="Completar más tarde"
              style={{ alignItems: 'center', paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.muted, fontSize: 13.5, fontFamily: FONT.semibold }}>Completar más tarde</Text>
            </Tap>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
