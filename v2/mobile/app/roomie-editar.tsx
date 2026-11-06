// ─── Editar perfil de roomie (nativo) ────────────────────────────────────
// Antes esto mandaba a la web (/roomie-match). Aquí replicamos EXACTAMENTE los
// mismos campos y guardado que el formulario de la web
// (web/src/app/roomie-match/client.tsx handleSaveLifestyle): las preferencias
// de estilo de vida NO son un JSON, son columnas planas de la tabla profiles
// (smoking, partying, study_habits, sleep_schedule, cleanliness,
// noise_tolerance, friends_at_home, pet_friendly), más city, budget_min,
// budget_max y looking_for_roommate. El guardado es un update de profiles.
//
// ADEMÁS edita BIO y FOTO DE PERFIL. No es decorativo: el gate de app/roomie.tsx
// (y roomie_profile_complete en el servidor, migración 120) exige CINCO cosas
// (búsqueda activa, presupuesto, ciudad, bio de 10+ y foto) y esta pantalla
// solo editaba tres, así que el botón "Completar mi perfil" llevaba a un sitio
// donde era IMPOSIBLE desbloquearse. La validación de save() exige ahora las
// cinco: si guarda, el usuario queda desbloqueado de verdad.
//
// Desde septiembre de 2026 pregunta ADEMÁS las seis cosas que la fase de
// convivencia del onboarding web guardaba y la app no (disorder_tolerance,
// home_gatherings, is_homebody, is_early_riser,
// accepts_different_gender_roommate, diet): sin ellas el perfil de quien se
// registraba desde el móvil quedaba con los valores por defecto de la BD y
// la compatibilidad salía a medias. Mismos valores que los CHECK de las
// migraciones 006 y 010 y que los botones del onboarding web.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, RefreshCw } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Avatar, Chip, Btn, Tap, SkeletonList, EmptyState, ProgressBar } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { ensureSocialDemoFeature, useSocialDemoAccessState } from '@/lib/social-demo';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { SocialDemoFeatureNotice } from '@/components/SocialDemoFeatureNotice';
import { toast, toastError } from '@/lib/toast';
import { HOME_GATHERINGS_OPTIONS, DIET_OPTIONS, DISORDER_OPTIONS } from '@/lib/lifestyle-labels';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

const BIO_MIN = 10;
const BIO_MAX = 300;

// Mismas preguntas, ids, opciones y etiquetas que LIFESTYLE_QUESTIONS de la web,
// para que la compatibilidad (compute en el servidor y en el cliente web) siga
// cuadrando. El value guardado es la `option`; la `label` solo se muestra.
// Traducción del vocabulario viejo del onboarding al del cuestionario (157).
// Espejo de scripts/traducir-vocabulario-roomie.cjs y del guardado del
// onboarding web; los mapeos de limpieza y mascotas vienen de la migración 016.
const VIEJO_A_NUEVO: Record<string, Record<string, string>> = {
  partying: { ocasional: 'a_veces', fines_semana: 'fines_de_semana', frecuente: 'mucho' },
  sleep_schedule: { flexible: 'normal' },
  study_habits: { moderado: 'mixto' },
  cleanliness: { 1: 'relajado', 2: 'relajado', 3: 'normal', 4: 'normal', 5: 'muy_limpio' },
  noise_tolerance: { moderado: 'normal', no_importa: 'no_me_importa' },
  friends_at_home: { a_menudo: 'frecuentemente', siempre: 'frecuentemente' },
  pet_friendly: { true: 'me_gustan', false: 'no' },
};

const QUESTIONS: { id: string; label: string; options: string[]; labels: string[] }[] = [
  { id: 'smoking', label: '¿Fumas?', options: ['no', 'ocasional', 'si'], labels: ['No fumo', 'Ocasional', 'Sí, fumo'] },
  { id: 'partying', label: '¿Sales de fiesta?', options: ['nunca', 'a_veces', 'fines_de_semana', 'mucho'], labels: ['Nunca', 'A veces', 'Fines de semana', 'Mucho'] },
  { id: 'study_habits', label: '¿Dónde estudias?', options: ['en_casa', 'biblioteca', 'mixto'], labels: ['En casa', 'Biblioteca', 'Ambos'] },
  { id: 'sleep_schedule', label: 'Horario de sueño', options: ['madrugador', 'normal', 'nocturno'], labels: ['Madrugador', 'Normal (23-8h)', 'Noctámbulo'] },
  { id: 'cleanliness', label: 'Nivel de limpieza', options: ['muy_limpio', 'normal', 'relajado'], labels: ['Muy limpio', 'Normal', 'Relajado'] },
  { id: 'noise_tolerance', label: 'Tolerancia al ruido', options: ['silencio', 'normal', 'no_me_importa'], labels: ['Necesito silencio', 'Normal', 'No me importa'] },
  { id: 'friends_at_home', label: '¿Traes amigos a casa?', options: ['nunca', 'a_veces', 'frecuentemente'], labels: ['Nunca', 'A veces', 'Frecuentemente'] },
  { id: 'pet_friendly', label: '¿Mascotas?', options: ['no', 'me_gustan', 'tengo'], labels: ['Prefiero sin', 'Me gustan', 'Tengo mascota'] },
];

// Preguntas extra de convivencia (texto): mismas opciones que el onboarding
// web y los CHECK de la BD. Se guardan tal cual (no hay traducción de
// vocabulario: estas columnas nunca tuvieron el problema de la 157).
const EXTRA_TEXT: { id: 'home_gatherings' | 'diet'; label: string; options: { value: string; label: string }[] }[] = [
  { id: 'home_gatherings', label: '¿Haces quedadas en casa?', options: HOME_GATHERINGS_OPTIONS },
  { id: 'diet', label: '¿Sigues alguna dieta?', options: DIET_OPTIONS },
];
// Preguntas sí/no: null = sin contestar (no se preselecciona nada, igual que
// la web, para no fabricar respuestas).
const EXTRA_BOOL: { id: 'is_homebody' | 'is_early_riser' | 'accepts_different_gender_roommate'; label: string }[] = [
  { id: 'is_homebody', label: '¿Eres más casero/a?' },
  { id: 'is_early_riser', label: '¿Eres madrugador/a?' },
  { id: 'accepts_different_gender_roommate', label: '¿Aceptas roomie de otro género?' },
];

export default function RoomieEditar() {
  const { access: demoAccess, retry: retryDemoAccess, checking: checkingDemoAccess } = useSocialDemoAccessState();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [lifestyle, setLifestyle] = useState<Record<string, string>>({});
  // Las seis de la web. Texto y número van a null cuando no hay respuesta;
  // los booleanos también (la columna admite null y así no se inventa nada).
  const [extraText, setExtraText] = useState<Record<string, string | null>>({ home_gatherings: null, diet: null });
  const [disorder, setDisorder] = useState<number | null>(null);
  const [extraBool, setExtraBool] = useState<Record<string, boolean | null>>({
    is_homebody: null, is_early_riser: null, accepts_different_gender_roommate: null,
  });
  const [city, setCity] = useState('');
  const [budgetMin, setBudgetMin] = useState('200');
  const [budgetMax, setBudgetMax] = useState('500');
  const [looking, setLooking] = useState(false);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // El gate acepta avatar_url O photos[]: si ya tiene fotos en la galería del
  // perfil, no le exigimos además un avatar (si no, alguien ya completo se
  // encontraría con que no puede guardar).
  const [hasGalleryPhotos, setHasGalleryPhotos] = useState(false);

  // Precarga: los campos de la web + bio, avatar y photos (requisitos del gate).
  const load = async () => {
    setLoadError(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/welcome'); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('smoking, partying, study_habits, sleep_schedule, cleanliness, noise_tolerance, friends_at_home, pet_friendly, city, budget_min, budget_max, looking_for_roommate, bio, avatar_url, photos, disorder_tolerance, home_gatherings, is_homebody, is_early_riser, accepts_different_gender_roommate, diet')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const p = data as Record<string, unknown>;
        const life: Record<string, string> = {};
        for (const q of QUESTIONS) {
          const v = p[q.id];
          if (typeof v !== 'string' || !v) continue;
          // El vocabulario viejo del onboarding se traduce al del cuestionario
          // (misma tabla que scripts/traducir-vocabulario-roomie.cjs): así la
          // respuesta que la persona ya dio sale preseleccionada en vez de
          // aparecer la pregunta como sin contestar. Lo irreconocible se
          // descarta y esa pregunta se pinta vacía, que es lo honesto.
          const traducido = VIEJO_A_NUEVO[q.id]?.[v] ?? v;
          if (q.options.includes(traducido)) life[q.id] = traducido;
        }
        setLifestyle(life);
        setCity((p.city as string | null) ?? '');
        if (p.budget_min != null) setBudgetMin(String(p.budget_min));
        if (p.budget_max != null) setBudgetMax(String(p.budget_max));
        setLooking(p.looking_for_roommate === true);
        setBio((p.bio as string | null) ?? '');
        setAvatarUrl((p.avatar_url as string | null) ?? null);
        setHasGalleryPhotos(Array.isArray(p.photos) && (p.photos as unknown[]).length > 0);
        // Las seis de la web: solo se preselecciona lo que está dentro del
        // vocabulario admitido; lo raro se pinta como sin contestar.
        const text: Record<string, string | null> = {};
        for (const q of EXTRA_TEXT) {
          const v = p[q.id];
          text[q.id] = typeof v === 'string' && q.options.some((o) => o.value === v) ? v : null;
        }
        setExtraText(text);
        const dt = p.disorder_tolerance;
        setDisorder(typeof dt === 'number' && dt >= 1 && dt <= 5 ? dt : null);
        const bools: Record<string, boolean | null> = {};
        for (const q of EXTRA_BOOL) {
          const v = p[q.id];
          bools[q.id] = typeof v === 'boolean' ? v : null;
        }
        setExtraBool(bools);
      }
      setLoaded(true);
    } catch {
      setLoadError(true);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // Misma subida que app/editar-perfil.tsx: bucket `avatars`, carpeta {uid},
  // transcodificando a JPEG (el HEIC del iPhone lo rechaza Storage).
  const changePhoto = async () => {
    const owner = captureSessionIdentity();
    if (!owner || !await ensureSocialDemoFeature('avatar') || !isCurrentSessionIdentity(owner)) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (!isCurrentSessionIdentity(owner) || res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploadingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toastError('Sesión caducada', 'Vuelve a entrar en tu cuenta e inténtalo otra vez.'); return; }
      if (!await ensureSocialDemoFeature('avatar') || !isCurrentSessionIdentity(owner) || user.id !== owner.userId) return;
      const up = await uploadPickedImage('avatars', user.id, asset, 3 * 1024 * 1024);
      if (!isCurrentSessionIdentity(owner)) return;
      if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
      setAvatarUrl(up.publicUrl);
      toast('Foto actualizada');
    } catch {
      toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (isCurrentSessionIdentity(owner)) setUploadingPhoto(false);
    }
  };

  const save = async () => {
    const min = Number(budgetMin) || 0;
    const max = Number(budgetMax) || 0;
    // Los CINCO requisitos de roomie_profile_complete (120), en el mismo orden
    // en que los pinta la checklist de app/roomie.tsx.
    //
    // "Buscando roomie" apagado NO bloquea el guardado: quien viene a corregir
    // su ciudad o su presupuesto, o a apagar la búsqueda a propósito, tiene que
    // poder guardar. Solo se avisa después de guardar de que así no aparece.
    // Validaciones sin decisión que tomar: toast, no un modal que hay que cerrar.
    if (min <= 0 || max < min) { toastError('Presupuesto no válido', 'El máximo debe ser mayor o igual que el mínimo.'); return; }
    if (city.trim().length < 2) { toastError('Falta la ciudad', 'Dinos en qué ciudad buscas piso.'); return; }
    if (bio.trim().length < BIO_MIN) {
      toastError('Falta tu bio', `Cuenta en dos líneas cómo eres conviviendo (mínimo ${BIO_MIN} caracteres).`);
      return;
    }
    if (!avatarUrl && !hasGalleryPhotos) {
      toastError('Falta tu foto', 'Sin foto nadie da like. Toca el círculo de arriba para elegir una.');
      return;
    }
    // Cuestionario a medias con la búsqueda encendida: se avisa UNA vez, aquí,
    // y se deja elegir. Sin las 8 respuestas no hay % de compatibilidad
    // (migración 157) y cada tarjeta del mazo se lo recordaría eternamente,
    // que es exactamente la matraca que venimos a quitar. Pero bloquear el
    // guardado tampoco: quien solo viene a corregir la ciudad debe poder.
    const sinResponder = QUESTIONS.filter((q) => !lifestyle[q.id]);
    if (looking && sinResponder.length > 0) {
      const sigue = await new Promise<boolean>((resolve) => {
        Alert.alert(
          `Te quedan ${sinResponder.length} pregunta${sinResponder.length === 1 ? '' : 's'} de convivencia`,
          'Sin ellas no verás tu % de compatibilidad con nadie. Son 10 segundos.',
          [
            { text: 'Responder ahora', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Guardar igualmente', onPress: () => resolve(true) },
          ],
        );
      });
      if (!sigue) return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toastError('Sesión caducada', 'Vuelve a entrar en tu cuenta e inténtalo otra vez.'); return; }
      // Mismo update que handleSaveLifestyle de la web: columnas planas + city +
      // presupuesto + looking_for_roommate, más bio y avatar. Cada preferencia
      // vacía va a null.
      const update: Record<string, unknown> = {
        city: city.trim() || null,
        budget_min: min,
        budget_max: max,
        looking_for_roommate: looking,
        bio: bio.trim().slice(0, BIO_MAX),
        updated_at: new Date().toISOString(),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      };
      for (const q of QUESTIONS) update[q.id] = lifestyle[q.id] || null;
      // Las seis de la web. friends_at_home y home_gatherings son la misma
      // pregunta con dos vocabularios (la web guarda las dos a la vez, ver
      // persistProfile): si la persona contestó la de "quedadas" y no la de
      // "amigos", se deriva una de la otra para que no se contradigan.
      for (const q of EXTRA_TEXT) update[q.id] = extraText[q.id] ?? null;
      if (!lifestyle.friends_at_home && extraText.home_gatherings) {
        const friendsMap: Record<string, string> = { nunca: 'nunca', a_veces: 'a_veces', a_menudo: 'frecuentemente', siempre: 'frecuentemente' };
        update.friends_at_home = friendsMap[extraText.home_gatherings] ?? null;
      }
      update.disorder_tolerance = disorder;
      for (const q of EXTRA_BOOL) update[q.id] = extraBool[q.id];
      // El .select() no es decorativo: un UPDATE que la RLS deja en 0 filas
      // devuelve error=null y esta pantalla se cerraría cantando victoria sin
      // haber guardado nada (misma trampa que en editar-perfil.tsx).
      const { data: rows, error } = await supabase.from('profiles').update(update).eq('id', user.id).select('id');
      if (error) { toastError('No se pudo guardar', 'Inténtalo de nuevo en unos segundos.'); return; }
      if (!rows?.length) {
        toastError('No se pudo guardar', 'No hemos podido actualizar tu perfil. Cierra sesión, vuelve a entrar e inténtalo de nuevo.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!looking) {
        toast('Guardado', { kind: 'info', body: 'Tienes "Buscando roomie" apagado: de momento no apareces ni ves candidatos.' });
      } else {
        toast('Perfil de roomie guardado');
      }
      router.back();
    } catch {
      toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Campo estándar del kit (mismo en todos los formularios de la app).
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md,
    paddingHorizontal: 14, paddingVertical: 13, minHeight: 48, fontSize: 15, color: C.text,
  } as const;

  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>{children}</Text>
  );

  // Cuánto llevas de los CINCO requisitos del gate (mismos que app/roomie.tsx):
  // ver la barra avanzar mientras rellenas hace que se termine.
  const listos = [
    looking,
    (Number(budgetMin) || 0) > 0,
    city.trim().length >= 2,
    bio.trim().length >= BIO_MIN,
    !!avatarUrl || hasGalleryPhotos,
  ].filter(Boolean).length;

  // Screen ya trae la cabecera y el ScrollView (con keyboardShouldPersistTaps);
  // el KeyboardAvoidingView va por fuera para que el formulario suba con el
  // teclado en iOS sin anidar dos scrolls.
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen title="Perfil de roomie" back>
      {loadError ? (
        <EmptyState icon={RefreshCw} title="No se pudo cargar tu perfil"
          subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={load} />
      ) : !loaded ? (
        <View style={{ paddingTop: S.lg }}><SkeletonList count={5} height={64} radius={R.md} /></View>
      ) : (
          <View style={{ paddingHorizontal: S.lg }}>
            <View style={{ paddingTop: 10, gap: 8 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
                Con esto te desbloqueas: foto, bio, ciudad, presupuesto y la búsqueda activa. Las preferencias de abajo calculan tu % de compatibilidad.
              </Text>
              <ProgressBar value={(listos / 5) * 100} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{listos} de 5 requisitos listos</Text>
            </View>

            {/* Foto de perfil: requisito del gate, así que vive aquí y no solo
                en Editar perfil. Mismo patrón visual que editar-perfil.tsx. */}
            <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 6 }}>
              <Tap hitSlop={8} onPress={changePhoto} disabled={demoAccess?.demo !== false} accessibilityLabel={demoAccess?.demo === false ? 'Cambiar foto de perfil' : 'Foto de perfil'}>
                <View>
                  <Avatar name="yo" uri={avatarUrl} size={92} ring />
                  <View style={{
                    position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15,
                    backgroundColor: C.blue, borderWidth: 2.5, borderColor: C.bg,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Camera size={15} color={C.onAccent} strokeWidth={1.9} />
                  </View>
                </View>
              </Tap>
              {demoAccess?.demo === false ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ marginTop: 8, fontSize: 13.5, color: C.blueDeep, fontFamily: FONT.semibold }}>
                {uploadingPhoto ? 'Subiendo foto...' : avatarUrl ? 'Cambiar foto' : 'Añadir foto'}
              </Text> : <SocialDemoFeatureNotice access={demoAccess} feature="avatar" retry={retryDemoAccess} checking={checkingDemoAccess} />}
            </View>

            {/* Aparecer como roomie disponible (looking_for_roommate) */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
            }}>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Buscando roomie</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Apareces en el mazo de otros estudiantes</Text>
              </View>
              <Switch value={looking} onValueChange={setLooking} accessibilityLabel="Buscando roomie"
                trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
            </View>

            {/* Bio + ciudad + presupuesto */}
            <View style={{ gap: 12, marginTop: 16 }}>
              <View>
                <Label>Tu bio</Label>
                <TextInput value={bio} onChangeText={setBio}
                  placeholder="¿Cómo eres conviviendo? Horarios, manías, si cocinas…"
                  placeholderTextColor={C.muted} maxLength={BIO_MAX} multiline
                  accessibilityLabel="Tu bio" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[input, { minHeight: 96, paddingTop: 13, textAlignVertical: 'top' }]} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[F.tiny, { marginTop: 4 }, bio.trim().length < BIO_MIN && { color: C.warning }]}>
                  {bio.trim().length < BIO_MIN
                    ? `Faltan ${BIO_MIN - bio.trim().length} caracteres para el mínimo`
                    : `${bio.trim().length}/${BIO_MAX}`}
                </Text>
              </View>
              <View>
                <Label>Ciudad donde buscas piso</Label>
                <TextInput value={city} onChangeText={setCity} placeholder="Ej. Alicante, Valencia…"
                  accessibilityLabel="Ciudad donde buscas piso" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} maxLength={80} style={input} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Label>Presupuesto mín.</Label>
                  <TextInput value={budgetMin} onChangeText={setBudgetMin} keyboardType="number-pad"
                    accessibilityLabel="Presupuesto mínimo en euros al mes" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    placeholder="200 €" placeholderTextColor={C.muted} maxLength={5} style={input} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>Presupuesto máx.</Label>
                  <TextInput value={budgetMax} onChangeText={setBudgetMax} keyboardType="number-pad"
                    accessibilityLabel="Presupuesto máximo en euros al mes" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    placeholder="500 €" placeholderTextColor={C.muted} maxLength={5} style={input} />
                </View>
              </View>
            </View>

            {/* Preguntas de estilo de vida: Chip por opción, igual que la web */}
            <View style={{ gap: 16, marginTop: 20 }}>
              {QUESTIONS.map((q, i) => (
                <FadeIn key={q.id} index={i} distance={10}>
                <View>
                  <Label>{q.label}</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {q.options.map((opt, i) => (
                      <Chip key={opt} label={q.labels[i]} active={lifestyle[q.id] === opt} accessibilityRole="tab"
                        onPress={() => setLifestyle((prev) => ({ ...prev, [q.id]: opt }))} />
                    ))}
                  </View>
                </View>
                </FadeIn>
              ))}
            </View>

            {/* Las seis preguntas que antes solo hacía la web. Opcionales:
                afinan la compatibilidad pero no bloquean el guardado. */}
            <View style={{ gap: 16, marginTop: 24 }}>
              <View>
                <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: FONT.display, fontSize: 22, letterSpacing: -0.7, color: C.text, marginBottom: 2 }}>Un poco más sobre cómo vives</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Opcional. Afina tu % de compatibilidad con cada candidato.</Text>
              </View>
              {EXTRA_TEXT.map((q, i) => (
                <FadeIn key={q.id} index={i} distance={10}>
                <View>
                  <Label>{q.label}</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {q.options.map((o) => (
                      <Chip key={o.value} label={o.label} active={extraText[q.id] === o.value} accessibilityRole="tab"
                        onPress={() => setExtraText((prev) => ({ ...prev, [q.id]: o.value }))} />
                    ))}
                  </View>
                </View>
                </FadeIn>
              ))}
              <View>
                <Label>¿Cuánto toleras el desorden?</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DISORDER_OPTIONS.map((o) => (
                    <Chip key={o.value} label={o.label} active={disorder === o.value} accessibilityRole="tab"
                      onPress={() => setDisorder(o.value)} />
                  ))}
                </View>
              </View>
              {EXTRA_BOOL.map((q, i) => (
                <FadeIn key={q.id} index={i} distance={10}>
                <View>
                  <Label>{q.label}</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Chip label="Sí" active={extraBool[q.id] === true} accessibilityRole="tab"
                      onPress={() => setExtraBool((prev) => ({ ...prev, [q.id]: true }))} />
                    <Chip label="No" active={extraBool[q.id] === false} accessibilityRole="tab"
                      onPress={() => setExtraBool((prev) => ({ ...prev, [q.id]: false }))} />
                  </View>
                </View>
                </FadeIn>
              ))}
            </View>

            <View style={{ marginTop: 24 }}>
              <Btn full busy={saving || uploadingPhoto} label="Guardar" onPress={save} />
            </View>
          </View>
      )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
