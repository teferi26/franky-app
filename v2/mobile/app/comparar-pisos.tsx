// ─── Comparador de pisos lado a lado ─────────────────────────────────────
// Recibe ?ids=a,b,c (2 a 3) desde pisos.tsx y muestra una tabla con una columna
// por piso: precio, tipo, habitaciones, baños, m2, zona/ciudad y características
// reales. Reutiliza getAccommodation de api.ts (una consulta por piso, en paralelo).
//
// Dos cosas hacen que la tabla se pueda leer de verdad:
//   1. La CABECERA (foto + título de cada piso) y la columna de etiquetas están
//      FIJAS: al bajar sigues sabiendo de qué piso es cada columna, y al
//      desplazarte a lo ancho sigues viendo qué fila estás mirando. Los dos
//      scrolls horizontales (cabecera y cuerpo) van sincronizados.
//   2. El MEJOR valor de cada fila comparable se resalta en C.success (el precio
//      más bajo, los metros más altos...). Comparar es elegir, y el ojo tiene
//      que caer solo en el ganador.
//
// Las características salen de las COLUMNAS booleanas (has_wifi, has_pool…), que
// es lo que rellena el alta: antes se comparaba el array `amenities`, que el
// formulario nunca escribe, así que la tabla salía siempre sin características.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Home as HomeIcon, BadgeCheck, Check, Minus } from 'lucide-react-native';
import { Header } from '@/components/Screen';
import { EmptyState, Btn, Skeleton } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getAccommodation, ACCOMMODATION_FEATURES, type AccommodationFull } from '@/lib/api';
import { eur, dateShort, typeLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const COL_W = 150; // ancho fijo de cada columna de piso
const LABEL_W = 100; // ancho de la columna de etiquetas (izquierda, fija)

// Filas de la tabla: cada una saca un valor legible de un piso. Se quitó
// "Verificado": es un sello que no se activa nunca en el alta, así que la fila
// solo servía para pintar "No" en las tres columnas.
//
// `score` (opcional) devuelve el número comparable de esa fila y `better` dice
// si gana el más bajo o el más alto. Solo las filas con score resaltan ganador.
type FieldRow = {
  label: string;
  value: (a: AccommodationFull) => string;
  score?: (a: AccommodationFull) => number | null;
  better?: 'low' | 'high';
};
const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const FIELDS: FieldRow[] = [
  { label: 'Precio', value: a => `${eur(a.price)}/mes`, score: a => num(a.price), better: 'low' },
  { label: 'Tipo', value: a => typeLabel[a.type] ?? a.type },
  { label: 'Habitaciones', value: a => a.rooms != null ? String(a.rooms) : '-', score: a => num(a.rooms), better: 'high' },
  { label: 'Baños', value: a => a.bathrooms != null ? String(a.bathrooms) : '-', score: a => num(a.bathrooms), better: 'high' },
  { label: 'Superficie', value: a => a.sqm != null ? `${a.sqm} m²` : '-', score: a => num(a.sqm), better: 'high' },
  { label: 'Habitación', value: a => a.room_size_sqm != null ? `${a.room_size_sqm} m²` : '-', score: a => num(a.room_size_sqm), better: 'high' },
  { label: 'Zona', value: a => a.address || a.city || '-' },
  { label: 'Ciudad', value: a => a.city || '-' },
  {
    label: 'Estancia mín.',
    value: a => a.min_stay_months ? `${a.min_stay_months} ${a.min_stay_months === 1 ? 'mes' : 'meses'}` : '-',
    score: a => num(a.min_stay_months), better: 'low',
  },
  {
    label: 'Fianza',
    value: a => (a.deposit_months != null && Number(a.deposit_months) > 0)
      ? `${Number(a.deposit_months)} ${Number(a.deposit_months) === 1 ? 'mensualidad' : 'mensualidades'}` : '-',
    score: a => num(a.deposit_months), better: 'low',
  },
  { label: 'Comisión', value: a => a.agency_commission_pct != null ? `${Number(a.agency_commission_pct)}%` : '-', score: a => num(a.agency_commission_pct), better: 'low' },
  { label: 'Libre hasta', value: a => a.available_until ? dateShort(a.available_until) : '-' },
  { label: 'Compañeros', value: a => a.current_flatmates_count != null ? String(a.current_flatmates_count) : '-' },
];

// Índices de las columnas que ganan esta fila. Con empate ganan todas las
// empatadas (resaltar solo una sería mentir sobre la comparación).
function winners(list: AccommodationFull[], f: FieldRow): Set<number> {
  const out = new Set<number>();
  if (!f.score || !f.better) return out;
  const scores = list.map(f.score);
  const valid = scores.filter((n): n is number => n != null);
  // Con menos de dos datos no hay comparación posible: nadie gana.
  if (valid.length < 2) return out;
  const best = f.better === 'low' ? Math.min(...valid) : Math.max(...valid);
  // Y si todos empatan tampoco hay ganador que destacar.
  if (valid.every(v => v === best)) return out;
  scores.forEach((v, i) => { if (v === best) out.add(i); });
  return out;
}

// Solo se comparan las características que tenga AL MENOS uno de los pisos:
// una fila donde los tres ponen un guion no ayuda a decidir nada.
function comparedFeatures(list: AccommodationFull[]) {
  return ACCOMMODATION_FEATURES.filter(f => list.some(a => a[f.key] === true));
}

export default function CompararPisos() {
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const router = useRouter();
  const idList = useMemo(
    () => String(ids ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3),
    [ids],
  );
  const [pisos, setPisos] = useState<AccommodationFull[] | null | undefined>(undefined);

  // Sincronía de los dos scrolls horizontales (cabecera fija y cuerpo). El
  // candado evita el ping-pong de eventos entre ambos.
  const headScroll = useRef<ScrollView>(null);
  const bodyScroll = useRef<ScrollView>(null);
  const syncing = useRef(false);
  const syncFrom = (which: 'head' | 'body') => (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (syncing.current) { syncing.current = false; return; }
    syncing.current = true;
    const x = e.nativeEvent.contentOffset.x;
    (which === 'head' ? bodyScroll : headScroll).current?.scrollTo({ x, animated: false });
  };

  const load = useCallback(async () => {
    setPisos(undefined);
    try {
      const results = await Promise.all(idList.map(id => getAccommodation(id)));
      setPisos(results.filter((a): a is AccommodationFull => a !== null));
    } catch {
      setPisos(null);
    }
  }, [idList]);

  useEffect(() => { load(); }, [load]);

  if (pisos === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Comparar" back />
        {/* Esqueleto con la silueta real: la tira de fotos y las filas. */}
        <View style={{ paddingTop: S.lg }}>
          <Skeleton height={120} radius={R.md} />
          <Skeleton height={44} radius={R.sm} />
          <Skeleton height={44} radius={R.sm} />
          <Skeleton height={44} radius={R.sm} />
          <Skeleton height={44} radius={R.sm} />
        </View>
      </View>
    );
  }
  if (pisos === null || pisos.length < 2) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Comparar" back />
        <EmptyState icon={HomeIcon} title="No se pudo comparar"
          subtitle="No encontramos estos pisos o ya no están disponibles. Vuelve y elige otros."
          cta="Reintentar" onCta={load} />
        <View style={{ alignItems: 'center' }}>
          <Btn variant="link" label="Volver" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const features = comparedFeatures(pisos);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={`Comparar ${pisos.length} pisos`} back />

      {/* ── Cabecera FIJA: foto y título de cada piso ── */}
      <FadeIn style={{ flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
        <View style={{ width: LABEL_W }} />
        <ScrollView ref={headScroll} horizontal showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16} onScroll={syncFrom('head')}>
          {pisos.map(a => (
            <View key={a.id} style={{ width: COL_W, padding: 8, gap: 6 }}>
              {a.images && a.images.length > 0 ? (
                <Image source={{ uri: a.images[0] }} recyclingKey={a.id} cachePolicy="memory-disk" transition={120}
                  style={{ width: '100%', height: 84, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }} contentFit="cover" />
              ) : (
                <View style={{ width: '100%', height: 84, borderRadius: R.md, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                  <HomeIcon size={26} color={C.border} strokeWidth={1.2} />
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1, fontSize: 13.5 }]} numberOfLines={2}>{a.title}</Text>
                {a.is_verified ? <BadgeCheck size={14} color={C.success} strokeWidth={2.2} /> : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </FadeIn>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <FadeIn index={1} style={{ flexDirection: 'row' }}>
          {/* Columna de etiquetas: fija a la izquierda, baja con el contenido */}
          <View style={{ width: LABEL_W }}>
            {FIELDS.map((f, i) => (
              <View key={f.label} style={{ height: 48, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
                <Text maxFontSizeMultiplier={1.3} style={F.label} numberOfLines={2}>{f.label}</Text>
              </View>
            ))}
            {features.length > 0 ? (
              <>
                <View style={{ height: 40, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 8 }}>
                  <Text maxFontSizeMultiplier={1.3} style={F.label}>Extras</Text>
                </View>
                {features.map((f, i) => (
                  <View key={String(f.key)} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={2}>{f.label}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>

          {/* Columnas de datos: se desplazan a lo ancho junto con la cabecera */}
          <ScrollView ref={bodyScroll} horizontal showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16} onScroll={syncFrom('body')}>
            <View>
              {FIELDS.map((f, i) => {
                const win = winners(pisos, f);
                return (
                  <View key={f.label} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
                    {pisos.map((a, col) => {
                      const best = win.has(col);
                      return (
                        <View key={a.id} style={{ width: COL_W, height: 48, paddingHorizontal: 12, justifyContent: 'center' }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2}
                            accessibilityLabel={best ? `${f.value(a)}, el mejor de la comparación` : undefined}
                            style={[
                              F.body,
                              { fontVariant: ['tabular-nums'] },
                              f.label === 'Precio' && { fontFamily: FONT.display, fontSize: 18, letterSpacing: -0.4 },
                              best && { color: C.success, fontFamily: FONT.heading },
                            ]}>
                            {f.value(a)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
              {features.length > 0 ? (
                <>
                  <View style={{ height: 40 }} />
                  {features.map((f, i) => (
                    <View key={String(f.key)} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
                      {pisos.map(a => {
                        const has = a[f.key] === true;
                        return (
                          <View key={a.id} accessible accessibilityLabel={`${f.label}: ${has ? 'sí' : 'no'}`}
                            style={{ width: COL_W, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                            {has
                              ? <Check size={17} color={C.success} strokeWidth={2.6} />
                              : <Minus size={16} color={C.border} strokeWidth={2} />}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          </ScrollView>
        </FadeIn>

        {/* Accesos a cada ficha completa */}
        <View style={{ paddingHorizontal: S.lg, paddingTop: 20, gap: 8 }}>
          {pisos.map(a => (
            <Btn key={a.id} variant="secondary" full small
              label={`Ver ficha: ${a.title.length > 28 ? a.title.slice(0, 28) + '…' : a.title}`}
              onPress={() => router.push(`/piso/${a.id}`)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
