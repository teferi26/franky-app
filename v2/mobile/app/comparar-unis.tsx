// Comparador de universidades lado a lado (mejora 88). El usuario elige 2
// universidades del catálogo (con un buscador propio, esta pantalla es
// autónoma: no depende de venir de otra lista con selección) y se pintan en
// una tabla de filas, solo con los campos que existen de verdad en el
// catálogo (ver University en src/lib/types.ts). No se inventa ningún dato.
//
// Diseño: la tabla ya no necesita scroll horizontal (dos columnas flexibles
// y una de etiquetas), así la cabecera con los dos nombres queda fija arriba
// de la tabla. El tamaño y la antigüedad no se interpretan como calidad.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Modal, Linking, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, X, Search } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Tap, SearchBar, EmptyState, SkeletonList, Card } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getUniversityList, type UniversityListItem as University } from '@/lib/catalogue-pages';
import { useFetch } from '@/lib/useFetch';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';
import { universityStudentContext } from '@/lib/university-evidence';

type FieldRow = { label: string; value: (u: University) => string };
const FIELDS: FieldRow[] = [
  { label: 'Tipo', value: u => u.type === 'publica' ? 'Pública' : 'Privada' },
  { label: 'Ciudad', value: u => u.city || '—' },
  { label: 'Comunidad autónoma', value: u => u.comunidad_autonoma || '—' },
  { label: 'Fundación', value: u => u.founded_year != null ? String(u.founded_year) : '—' },
  { label: 'Estudiantes', value: u => u.student_count != null ? `${u.student_count.toLocaleString('es-ES')}\n${universityStudentContext(u)}` : '—' },
  { label: 'Campus', value: u => u.campus_count != null ? String(u.campus_count) : '—' },
];
type Slot = 'A' | 'B';

export default function CompararUnis() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Columnas ligeras y la misma caché que el catálogo de universidades: si
  // se viene de allí, el selector se pinta al instante sin volver a pedirlo.
  const fetcher = useCallback(() => getUniversityList(), []);
  const { rows: catalog, error, refresh } = useFetch(fetcher, 'universities-list');
  const [uniA, setUniA] = useState<University | null>(null);
  const [uniB, setUniB] = useState<University | null>(null);
  const [pickerFor, setPickerFor] = useState<Slot | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const other = pickerFor === 'A' ? uniB : pickerFor === 'B' ? uniA : null;
    const term = q.trim().toLowerCase();
    return (catalog ?? [])
      .filter((u) => u.id !== other?.id)
      .filter((u) => term === '' || `${u.name} ${u.short_name ?? ''} ${u.city}`.toLowerCase().includes(term));
  }, [catalog, pickerFor, uniA, uniB, q]);

  const pick = (u: University) => {
    if (pickerFor === 'A') setUniA(u);
    if (pickerFor === 'B') setUniB(u);
    setPickerFor(null); setQ('');
  };

  const openPicker = (slot: Slot) => { setQ(''); setPickerFor(slot); };

  const renderSlot = (slot: Slot, uni: University | null) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      {uni ? (
        <>
          {uni.image_url || uni.logo_url ? (
            <Image source={{ uri: uni.logo_url ?? uni.image_url! }} accessibilityLabel={`Logo de ${uni.name}`} cachePolicy="memory-disk" recyclingKey={uni.id}
              style={{ width: 60, height: 60, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }}
              contentFit="contain" transition={120} />
          ) : (
            <View style={{ width: 60, height: 60, borderRadius: R.md, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={24} color={C.muted} strokeWidth={1.5} />
            </View>
          )}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { textAlign: 'center' }]} numberOfLines={2}>{uni.short_name || uni.name}</Text>
          <Btn variant="link" small label="Cambiar" onPress={() => openPicker(slot)} accessibilityLabel={`Cambiar universidad ${slot === 'A' ? '1' : '2'}`} />
        </>
      ) : (
        <Tap onPress={() => openPicker(slot)} haptic accessibilityLabel={`Elegir universidad ${slot === 'A' ? '1' : '2'}`} style={{ alignSelf: 'stretch' }}>
          <View style={{
            paddingVertical: 20, borderRadius: R.lg, borderWidth: 1, borderStyle: 'dashed',
            borderColor: C.border, alignItems: 'center', gap: 6,
          }}>
            <Search size={22} color={C.blue} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontSize: 13, fontFamily: FONT.semibold, textAlign: 'center' }}>Elegir{'\n'}universidad</Text>
          </View>
        </Tap>
      )}
    </View>
  );

  if (catalog === null && !error) {
    return (
      <Screen title="Comparar universidades" back>
        <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: S.lg, paddingTop: S.lg }}>
          <SkeletonList count={1} height={110} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
          <SkeletonList count={1} height={110} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
        </View>
        <SkeletonList count={4} height={44} radius={R.md} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Comparar universidades" back>
        <EmptyState icon={Building2} title="No se pudo cargar" subtitle="Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={refresh} />
      </Screen>
    );
  }

  const bothChosen = uniA && uniB;
  const cell = (text: string) => (
    <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 11 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{text}</Text>
    </View>
  );

  return (
    <>
      <Screen title="Comparar universidades" back>
        <FadeIn style={{ flexDirection: 'row', paddingHorizontal: S.lg, paddingTop: S.lg, gap: 16 }}>
          {renderSlot('A', uniA)}
          {renderSlot('B', uniB)}
        </FadeIn>

        {!bothChosen ? (
          <View style={{ paddingTop: 12 }}>
            <EmptyState compact icon={Building2} title="Elige 2 universidades" subtitle="Toca cada hueco de arriba para elegir una universidad del catálogo y compararlas." />
          </View>
        ) : (
          <>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingHorizontal: S.lg, paddingTop: S.lg }]}>El tamaño y la antigüedad no miden la calidad. Consulta el periodo de las cifras y abre cada ficha para ver sus fuentes.</Text>
            <FadeIn index={1}>
            <Card style={{ marginTop: S.lg, padding: 0, overflow: 'hidden' }}>
              {/* Cabecera fija de la tabla con los dos nombres */}
              <View style={{ flexDirection: 'row', backgroundColor: C.input, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
                {[uniA!, uniB!].map((u) => (
                  <View key={u.id} style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 10 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { textAlign: 'center', fontSize: 13.5 }]}>{u.short_name || u.name}</Text>
                  </View>
                ))}
              </View>
              {FIELDS.map((f, i) => (
                <View key={f.label} accessible accessibilityLabel={`${f.label}: ${uniA!.short_name || uniA!.name} ${f.value(uniA!)}, ${uniB!.short_name || uniB!.name} ${f.value(uniB!)}`}
                  style={{ borderBottomWidth: i < FIELDS.length - 1 ? 0.5 : 0, borderBottomColor: C.borderLight }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { textAlign: 'center', paddingTop: 12 }]}>{f.label}</Text>
                  <View style={{ flexDirection: 'row' }}>{cell(f.value(uniA!))}{cell(f.value(uniB!))}</View>
                </View>
              ))}
            </Card>
            </FadeIn>

            <View style={{ paddingHorizontal: S.lg, gap: 8 }}>
              <Btn variant="secondary" full small label={`Ver ficha: ${uniA!.short_name || uniA!.name}`} onPress={() => router.push(`/uni/${uniA!.id}`)} />
              <Btn variant="secondary" full small label={`Ver ficha: ${uniB!.short_name || uniB!.name}`} onPress={() => router.push(`/uni/${uniB!.id}`)} />
            </View>
          </>
        )}
      </Screen>

      <Modal visible={pickerFor !== null} animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 8, gap: 12 }}>
            <Tap onPress={() => setPickerFor(null)} accessibilityLabel="Cerrar" hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={C.text} strokeWidth={2.2} />
            </Tap>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>
              {pickerFor === 'A' ? 'Elige la primera universidad' : 'Elige la segunda universidad'}
            </Text>
          </View>
          <SearchBar value={q} onChange={setQ} placeholder="Nombre, siglas, ciudad…" autoFocus />
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            initialNumToRender={12}
            ListEmptyComponent={<EmptyState compact icon={Building2} title="Sin resultados" subtitle="Prueba con otras siglas o ciudad." />}
            renderItem={({ item: u }) => (
              <Tap onPress={() => pick(u)} accessibilityLabel={`Elegir ${u.name}`}>
                <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, alignItems: 'center', minHeight: 60 }}>
                  {u.image_url || u.logo_url ? (
                    <Image source={{ uri: u.logo_url ?? u.image_url! }} recyclingKey={u.id} cachePolicy="memory-disk" style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }} contentFit="contain" />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={18} color={C.muted} strokeWidth={1.5} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{u.name}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{u.city} · {u.comunidad_autonoma}</Text>
                  </View>
                </View>
              </Tap>
            )}
          />
        </View>
      </Modal>
    </>
  );
}
