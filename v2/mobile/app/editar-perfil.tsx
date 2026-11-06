import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  Camera, X, Plus, ChevronRight, Check, Building2, CalendarDays, RefreshCw,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { SocialDemoFeatureNotice } from '@/components/SocialDemoFeatureNotice';
import { ensureSocialDemoFeature, useSocialDemoAccessState } from '@/lib/social-demo';
import { Avatar, Btn, Tap, Chip, SearchBar, SkeletonList, EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { uploadPickedImage } from '@/lib/media';
import { getUniversities } from '@/lib/api';
import {
  getMyProfile, updateMyProfile, getCareerNamesForUniversity, getUniversityById, addInterestTo,
  GENDER_OPTIONS, COURSE_OPTIONS, INTEREST_OPTIONS, MAX_INTERESTS,
  isoDateToLocal, localDateToIso, formatDateEs, defaultBirthDate, birthDateBounds,
} from '@/lib/profile';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import type { University } from '@/lib/types';
import { C, R, S, F, FONT } from '@/theme';

// Fila del selector de universidad, memoizada: el catálogo entero se
// refiltra en cada tecla del buscador del modal.
const UniPickRow = memo(function UniPickRow({ uni, active, onPick }: {
  uni: University; active: boolean; onPick: (u: University) => void;
}) {
  return (
    <Tap onPress={() => onPick(uni)} accessibilityLabel={uni.name} accessibilityState={{ selected: active }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: S.lg, paddingVertical: 13, minHeight: 56,
        backgroundColor: 'transparent',
        borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
      }}>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{uni.name}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>
            {[uni.short_name, uni.city].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {active ? <Check size={20} color={C.blue} strokeWidth={2.4} /> : null}
      </View>
    </Tap>
  );
});

// Edición de perfil nativa: foto, nombre, bio, ciudad, intereses y, desde
// septiembre de 2026, lo mismo que edita la web (perfil y onboarding):
// universidad (selector con buscador sobre `universities`), carrera (texto
// con sugerencias de `careers` de esa uni), curso (university_course 1-6),
// género (gender, CHECK de la 010) y fecha de nacimiento (birth_date, que el
// trigger de la 041 cifra al escribir). La foto sube al bucket `avatars`
// ({uid}/{archivo}, políticas de la migración 020) y el resto es un update
// normal de profiles (la RLS permite editar los campos propios).
export default function EditarPerfil() {
  const owner = useSessionOwner();
  if (!owner) return <Screen title="Editar perfil" back><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { padding: S.lg }]}>Inicia sesión para editar tu perfil.</Text></Screen>;
  return <OwnedEditarPerfil key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedEditarPerfil({ owner }: { owner: SessionIdentity }) {
  const { access: demoAccess, retry: retryDemoAccess, checking: checkingDemoAccess } = useSocialDemoAccessState();
  const isCurrent = useOwnerGuard(owner);
  const loadRevision = useRef(0);
  const careerRevision = useRef(0);
  const mutationBusy = useRef(false);
  useEffect(() => () => { loadRevision.current++; careerRevision.current++; }, []);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  // El nombre vacío se avisa DEBAJO del campo, no con un Alert: el usuario
  // tiene que volver justo ahí y un modal solo añade un toque de más.
  const [nameError, setNameError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [updatingEmail, setUpdatingEmail] = useState(false);

  // Campos de paridad con la web.
  const [career, setCareer] = useState('');
  const [careerSuggestions, setCareerSuggestions] = useState<string[]>([]);
  const [course, setCourse] = useState<number | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null); // 'YYYY-MM-DD'
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [university, setUniversity] = useState<University | null>(null);

  // Selector de universidad: el catálogo se pide al abrir el modal (no al
  // entrar en la pantalla) y se guarda para las siguientes aperturas.
  const [uniModal, setUniModal] = useState(false);
  const [unis, setUnis] = useState<University[] | null>(null);
  const [unisError, setUnisError] = useState(false);
  const [uniQuery, setUniQuery] = useState('');

  const load = async () => {
    if (!isCurrent()) return;
    const revision = ++loadRevision.current;
    const current = () => isCurrent() && revision === loadRevision.current;
    setLoadError(false);
    try {
      const res = await getMyProfile(owner);
      if (!current()) return;
      if (!res) { router.replace('/welcome'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!current() || user?.id !== owner.userId) return;
      setEmail(user?.email ?? '');
      setCurrentEmail(user?.email ?? '');
      setUserId(res.userId);
      const p = res.profile;
      if (p) {
        setName(p.full_name ?? '');
        setBio(p.bio ?? '');
        setCity(p.city ?? '');
        setAvatarUrl(p.avatar_url ?? null);
        setInterests(Array.isArray(p.interests) ? p.interests : []);
        setCareer(p.career ?? '');
        setCourse(typeof p.university_course === 'number' ? p.university_course : null);
        setGender(p.gender && GENDER_OPTIONS.some((g) => g.value === p.gender) ? p.gender : null);
        setBirthDate(p.birth_date ? p.birth_date.slice(0, 10) : null);
        if (p.university_id) {
          // Nombre de la uni elegida sin cargar el catálogo entero.
          const u = await getUniversityById(p.university_id);
          if (!current()) return;
          setUniversity(u);
          if (u) loadCareerSuggestions(u.id);
        }
      }
      setLoaded(true);
    } catch {
      if (current()) setLoadError(true);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const openUniModal = async () => {
    if (!isCurrent()) return;
    setUniModal(true);
    if (unis) return;
    setUnisError(false);
    try {
      const { rows } = await getUniversities();
      if (isCurrent()) setUnis(rows);
    } catch {
      if (isCurrent()) setUnisError(true);
    }
  };
  const filteredUnis = useMemo(() => {
    const list = unis ?? [];
    const q = uniQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) =>
      u.name.toLowerCase().includes(q)
      || (u.short_name ?? '').toLowerCase().includes(q)
      || (u.city ?? '').toLowerCase().includes(q));
  }, [unis, uniQuery]);

  const loadCareerSuggestions = async (universityId: string | null) => {
    const revision = ++careerRevision.current;
    setCareerSuggestions([]);
    if (!universityId) return;
    const rows = await getCareerNamesForUniversity(universityId);
    if (isCurrent() && revision === careerRevision.current) setCareerSuggestions(rows);
  };
  const pickUniversity = (u: University | null) => {
    if (!isCurrent()) return;
    setUniversity(u);
    setUniModal(false);
    setUniQuery('');
    // Al cambiar de uni las sugerencias de carrera cambian con ella; lo
    // escrito en el campo se respeta (puede ser la misma carrera).
    void loadCareerSuggestions(u?.id ?? null);
  };

  // Sugerencias de carrera que casan con lo tecleado (máximo 12 para no
  // llenar la pantalla; con la uni sin carreras en BD queda solo el texto).
  const visibleCareerSuggestions = useMemo(() => {
    const q = career.trim().toLowerCase();
    return careerSuggestions
      .filter((c) => c.toLowerCase() !== q && (!q || c.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [career, careerSuggestions]);

  const addInterest = (raw: string) => {
    if (interests.length >= MAX_INTERESTS && raw.trim()) {
      toastError('Demasiados intereses', `Puedes tener hasta ${MAX_INTERESTS}.`);
      return;
    }
    setInterests((prev) => addInterestTo(prev, raw));
    setInterestInput('');
  };
  const removeInterest = (value: string) =>
    setInterests((prev) => prev.filter((i) => i !== value));

  const changePhoto = async () => {
    if (!isCurrent() || mutationBusy.current) return;
    mutationBusy.current = true;
    setUploadingPhoto(true);
    try {
    if (!await ensureSocialDemoFeature('avatar') || !isCurrent()) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (!isCurrent() || res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner.userId) return;
      // Antes se volvía en silencio: la rueda paraba y no pasaba nada, que es
      // exactamente lo que la gente describe como "no me deja cambiar la foto".
      if (!user) { toastError('Sesión caducada', 'Vuelve a entrar en tu cuenta e inténtalo otra vez.'); return; }
      // uploadPickedImage transcodifica a JPEG: el HEIC del iPhone lo rechaza
      // el bucket (ver el porqué en src/lib/media.ts).
      if (!await ensureSocialDemoFeature('avatar') || !isCurrent()) return;
      const up = await withOwnedRequest(owner, request => uploadPickedImage('avatars', user.id, asset, 3 * 1024 * 1024, request));
      if (!isCurrent()) return;
      if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
      setAvatarUrl(up.publicUrl);
      toast('Foto actualizada');
    } catch {
      if (isCurrent()) toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      // En finally para que un fallo de red no deje el botón "Guardar"
      // bloqueado para siempre (depende de uploadingPhoto).
      mutationBusy.current = false;
      if (isCurrent()) setUploadingPhoto(false);
    }
  };

  // Cambiar el correo de acceso. Supabase envía un enlace de confirmación al
  // nuevo correo (y, según configuración, también al antiguo): el cambio no es
  // efectivo hasta que el usuario lo confirma. Por eso va aparte del guardado.
  const updateEmail = async () => {
    if (!isCurrent() || mutationBusy.current) return;
    const next = email.trim().toLowerCase();
    if (!next || !next.includes('@')) { toastError('Correo no válido', 'Escribe un correo con formato válido.'); return; }
    if (next === currentEmail.toLowerCase()) { toastError('Sin cambios', 'Ese ya es tu correo actual.'); return; }
    mutationBusy.current = true;
    setUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (!isCurrent()) return;
      if (error) { toastError('No se pudo cambiar', error.message || 'Inténtalo de nuevo más tarde.'); return; }
      toastInfo('Confirma tu nuevo correo', `Te hemos enviado un enlace a ${next}. El cambio se aplica al confirmarlo.`);
    } catch {
      if (isCurrent()) toastError('No se pudo cambiar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      mutationBusy.current = false;
      if (isCurrent()) setUpdatingEmail(false);
    }
  };

  // Selector de fecha: en Android es un diálogo (se cierra solo), en iOS un
  // spinner inline con botón "Listo".
  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (e.type === 'set' && d) setBirthDate(localDateToIso(d));
  };
  const bounds = birthDateBounds();

  const save = async () => {
    if (!isCurrent() || mutationBusy.current) return;
    if (!name.trim()) { setNameError('El nombre no puede quedar vacío.'); return; }
    if (!userId) { toastError('Sesión caducada', 'Vuelve a entrar en tu cuenta e inténtalo otra vez.'); return; }
    mutationBusy.current = true;
    setSaving(true);
    try {
      const fullName = name.trim().slice(0, 80);
      const res = await updateMyProfile(userId, {
        full_name: fullName,
        bio: bio.trim().slice(0, 300) || null,
        city: city.trim().slice(0, 80) || null,
        avatar_url: avatarUrl,
        interests: interests.slice(0, MAX_INTERESTS),
        // Paridad con la web: mismos nombres de columna y mismos valores.
        career: career.trim().slice(0, 120) || null,
        university_course: course,
        gender,
        birth_date: birthDate,
        university_id: university?.id ?? null,
      }, owner);
      if (!isCurrent()) return;
      if (!res.ok) { toastError('No se pudo guardar', res.message); return; }

      // Espejo en los metadatos de auth, como ya hacía la web (perfil/page.tsx):
      // así el nombre y la foto siguen cuadrando si alguna pantalla los lee de
      // la sesión en vez de la tabla. Si falla no bloquea el guardado.
      try {
        await supabase.auth.updateUser({ data: { full_name: fullName, avatar_url: avatarUrl } });
      } catch { /* el dato bueno ya está en profiles */ }
      if (!isCurrent()) return;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Perfil guardado');
      router.back();
    } catch {
      if (isCurrent()) toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      mutationBusy.current = false;
      if (isCurrent()) setSaving(false);
    }
  };

  // Campo estándar de la app: C.input, R.md, 48 px de alto y 15 px de texto.
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
    borderRadius: R.md, paddingHorizontal: 14, minHeight: 48, paddingVertical: 12, fontSize: 15, color: C.text,
  } as const;
  const label = [F.label, { marginBottom: 7 }];
  // Fila tipo selector (universidad, fecha): mismo aspecto que un input.
  const selectorRow = {
    ...input, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 48,
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen title="Editar perfil" back>
        {loadError ? (
          <EmptyState icon={RefreshCw} title="No se pudo cargar tu perfil"
            subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={load} />
        ) : !loaded ? (
          <View style={{ paddingTop: S.lg }}><SkeletonList count={6} height={56} radius={R.md} /></View>
        ) : (
          <View style={{ paddingHorizontal: S.lg }}>
            <FadeIn style={{ alignItems: 'center', paddingTop: S.xl, paddingBottom: S.xxl }}>
              <Tap onPress={changePhoto} disabled={demoAccess?.demo !== false}
                accessibilityLabel={demoAccess?.demo === false ? 'Cambiar foto de perfil' : 'Foto de perfil'}>
                <View>
                  <Avatar name={name || 'yo'} uri={avatarUrl} size={108} />
                  {demoAccess?.demo === false ? <View style={{
                    position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16,
                    backgroundColor: C.blue, borderWidth: 3, borderColor: C.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Camera size={15} color={C.onAccent} strokeWidth={2.2} />
                  </View> : null}
                </View>
              </Tap>
              {demoAccess?.demo === false ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginTop: 12, color: C.blueDeep }]}>
                {uploadingPhoto ? 'Subiendo foto…' : 'Cambiar foto'}
              </Text> : <SocialDemoFeatureNotice access={demoAccess} feature="avatar" retry={retryDemoAccess} checking={checkingDemoAccess} />}
            </FadeIn>

            <View style={{ gap: 18 }}>
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Nombre</Text>
                <TextInput value={name} placeholder="Tu nombre"
                  onChangeText={(v) => { setName(v); if (nameError) setNameError(null); }}
                  accessibilityLabel="Nombre" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} maxLength={80}
                  style={[input, nameError ? { borderColor: C.error } : null]} />
                {nameError ? (
                  <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[F.tiny, { color: C.error, marginTop: 5 }]}>{nameError}</Text>
                ) : null}
              </View>
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Bio</Text>
                <TextInput value={bio} onChangeText={setBio} placeholder="Cuéntale a tu campus quién eres"
                  accessibilityLabel="Bio" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} maxLength={300} multiline
                  style={[input, { minHeight: 96, textAlignVertical: 'top' }]} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 5, textAlign: 'right' }]}>{bio.length}/300</Text>
              </View>
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Ciudad</Text>
                <TextInput value={city} onChangeText={setCity} placeholder="Alicante, Murcia…"
                  accessibilityLabel="Ciudad" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} maxLength={80} style={input} />
              </View>

              {/* Universidad: selector con buscador (modal). */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Universidad</Text>
                <Tap onPress={openUniModal} accessibilityLabel="Elegir universidad"
                  accessibilityHint="Abre un buscador de universidades" style={selectorRow}>
                  <Building2 size={18} color={university ? C.blue : C.muted} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontSize: 15, color: university ? C.text : C.muted }} numberOfLines={1}>
                    {university ? university.name : 'Elige tu universidad'}
                  </Text>
                  <ChevronRight size={18} color={C.muted} strokeWidth={2} />
                </Tap>
              </View>

              {/* Carrera: texto libre con sugerencias de la uni elegida. */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Carrera</Text>
                <TextInput value={career} onChangeText={setCareer}
                  placeholder={university ? 'Escribe o elige una de abajo' : 'Ingeniería Informática'}
                  accessibilityLabel="Carrera" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} maxLength={120} style={input} />
                {visibleCareerSuggestions.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 10 }}>
                    {visibleCareerSuggestions.map((c) => (
                      <Chip key={c} label={c} onPress={() => setCareer(c)} />
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Curso: 1º a 6º; tocar el activo lo quita. */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Curso</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                  {COURSE_OPTIONS.map((o) => (
                    <Chip key={o.value} label={o.label} active={course === o.value}
                      onPress={() => setCourse((cur) => (cur === o.value ? null : o.value))} />
                  ))}
                </View>
              </View>

              {/* Género: mismos valores que el CHECK de profiles.gender. */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Género</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                  {GENDER_OPTIONS.map((o) => (
                    <Chip key={o.value} label={o.label} active={gender === o.value}
                      onPress={() => setGender((cur) => (cur === o.value ? null : o.value))} />
                  ))}
                </View>
              </View>

              {/* Fecha de nacimiento: nunca se publica, solo la edad. */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Fecha de nacimiento</Text>
                <Tap onPress={() => setShowDatePicker((v) => !v)} accessibilityLabel="Elegir fecha de nacimiento"
                  style={selectorRow}>
                  <CalendarDays size={18} color={birthDate ? C.blue : C.muted} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontSize: 15, color: birthDate ? C.text : C.muted }}>
                    {birthDate && isoDateToLocal(birthDate) ? formatDateEs(isoDateToLocal(birthDate) as Date) : 'Elige tu fecha'}
                  </Text>
                  {birthDate ? (
                    <Tap onPress={() => setBirthDate(null)} accessibilityLabel="Quitar fecha de nacimiento" hitSlop={8}>
                      <X size={16} color={C.muted} strokeWidth={2.2} />
                    </Tap>
                  ) : <ChevronRight size={18} color={C.muted} strokeWidth={2} />}
                </Tap>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 5 }]}>Solo mostramos tu edad, nunca la fecha exacta.</Text>
                {showDatePicker ? (
                  <View>
                    <DateTimePicker
                      value={isoDateToLocal(birthDate) ?? defaultBirthDate()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={bounds.min} maximumDate={bounds.max}
                      onChange={onPickDate}
                    />
                    {Platform.OS === 'ios' ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Btn small variant="link" label="Listo" onPress={() => setShowDatePicker(false)} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Correo de acceso: el cambio requiere confirmar por enlace. */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>Correo de acceso</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput value={email} onChangeText={setEmail} placeholder="tucorreo@uni.es"
                    accessibilityLabel="Correo de acceso" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none"
                    autoCorrect={false} maxLength={120} style={[input, { flex: 1 }]} />
                  <Btn small busy={updatingEmail} label="Cambiar" onPress={updateEmail}
                    variant={email.trim().toLowerCase() !== currentEmail.toLowerCase() ? 'primary' : 'ghost'}
                    accessibilityLabel="Cambiar el correo de acceso" />
                </View>
              </View>

              {/* Intereses: chips quitables + input con botón + y sugerencias
                  (las mismas opciones que el onboarding web). */}
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={label}>
                  Intereses{interests.length ? ` (${interests.length} de ${MAX_INTERESTS})` : ''}
                </Text>
                {interests.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {interests.map((it) => (
                      <View key={it} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        backgroundColor: C.accentSoft, borderRadius: R.full, paddingLeft: 12, paddingRight: 8, paddingVertical: 7,
                      }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: C.blue, fontFamily: FONT.semibold }}>{it}</Text>
                        <Tap onPress={() => removeInterest(it)} accessibilityLabel={`Quitar ${it}`} style={{ padding: 2 }} hitSlop={6}>
                          <X size={14} color={C.blue} strokeWidth={2} />
                        </Tap>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    value={interestInput} onChangeText={setInterestInput}
                    placeholder="Añade un interés" placeholderTextColor={C.muted}
                    maxLength={30} autoCapitalize="none" returnKeyType="done"
                    onSubmitEditing={() => addInterest(interestInput)}
                    accessibilityLabel="Añadir un interés" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[input, { flex: 1 }]} />
                  <Tap onPress={() => addInterest(interestInput)} accessibilityLabel="Añadir interés" haptic
                    style={{
                      width: 48, height: 48, borderRadius: R.md, backgroundColor: C.blue,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Plus size={20} color={C.onAccent} strokeWidth={2.4} />
                  </Tap>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 10 }}>
                  {INTEREST_OPTIONS
                    .filter((s) => !interests.some((i) => i.toLowerCase() === s.toLowerCase()))
                    .map((s) => (
                      <Chip key={s} label={s} icon={Plus} onPress={() => addInterest(s)} />
                    ))}
                </View>
              </View>
            </View>

            <View style={{ marginTop: 22 }}>
              <Btn full busy={saving || uploadingPhoto} label="Guardar" onPress={save} />
            </View>
          </View>
        )}
      </Screen>

      {/* Modal de universidades: buscador + lista. Sin catálogo (red caída)
          enseña un "Reintentar" en vez de una lista vacía. */}
      <Modal visible={uniModal} animationType="slide" onRequestClose={() => setUniModal(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, gap: 12 }}>
            <Tap onPress={() => setUniModal(false)} accessibilityLabel="Cerrar" hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={C.text} strokeWidth={2.2} />
            </Tap>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { flex: 1, fontSize: 19 }]}>Tu universidad</Text>
            {university ? <Btn small variant="link" label="Quitar" onPress={() => pickUniversity(null)} /> : null}
          </View>
          <SearchBar value={uniQuery} onChange={setUniQuery} placeholder="Busca por nombre o ciudad" autoFocus />
          {unisError ? (
            <EmptyState icon={RefreshCw} title="No se pudo cargar el catálogo"
              subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={() => { setUnis(null); openUniModal(); }} />
          ) : unis === null ? (
            <SkeletonList count={8} height={52} radius={R.md} />
          ) : (
            <FlatList
              data={filteredUnis}
              keyExtractor={(u) => u.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              removeClippedSubviews
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={9}
              ListEmptyComponent={
                <EmptyState compact icon={Building2} title="Sin resultados"
                  subtitle="No encontramos ninguna universidad con eso. Prueba con el nombre de la ciudad." />
              }
              renderItem={({ item }) => (
                <UniPickRow uni={item} active={university?.id === item.id} onPick={pickUniversity} />
              )}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
