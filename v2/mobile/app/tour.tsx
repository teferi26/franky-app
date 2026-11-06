import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, ScrollView, Pressable, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Flame, GraduationCap, Ticket, Home, Heart, Users, Coins, MapPin, Sparkles, ArrowUpRight, Check, type LucideIcon } from 'lucide-react-native';
import { Btn, BrandWordmark } from '@/components/ui';
import { markTourSeen } from '@/lib/tour';
import { track } from '@/lib/analytics';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, FONT, F } from '@/theme';

type Slide = { key: string; eyebrow: string; title: string; text: string; icon: LucideIcon; secondary: LucideIcon; feature: string; example: string; detail: string; chips: string[]; colors: readonly [string, string] };
const SLIDES: Slide[] = [
  { key: 'campus', eyebrow: 'Tu gente', title: 'La uni también pasa fuera de clase.', text: 'Cuenta lo que se cuece en FOMO. Conoce gente en Crush y comparte tu Instagram cuando ambos queráis.', icon: Flame, secondary: Heart, feature: 'FOMO + Crush', example: '¿Café después de clase?', detail: 'Una pregunta puede ser el principio de un buen plan.', chips: ['Tu campus', 'Tu conversación'], colors: ['#5B2FD8', '#9252EE'] },
  { key: 'estudios', eyebrow: 'Tu futuro', title: 'Más claro el camino. Más fácil el día.', text: 'Descubre carreras y becas según tu situación. Organiza clases, exámenes y apuntes en un mismo lugar.', icon: GraduationCap, secondary: Coins, feature: 'Estudia a tu manera', example: 'Tu próximo paso empieza aquí', detail: 'Carreras, ayudas y herramientas para elegir con más información.', chips: ['Becas', 'Carreras', 'Tu horario'], colors: ['#225A92', '#4381BD'] },
  { key: 'casa', eyebrow: 'Tu sitio', title: 'Encuentra dónde vivir. Y con quién.', text: 'Filtra pisos por lo que necesitas y descubre compañeros según vuestros hábitos. Tus likes y matches, siempre a mano.', icon: Home, secondary: Users, feature: 'Pisos + Compañeros', example: 'Una casa que vaya contigo', detail: 'Zona, presupuesto y convivencia: empieza por lo que te importa.', chips: ['Tu presupuesto', 'Tus hábitos'], colors: ['#24655F', '#428D80'] },
  { key: 'planes', eyebrow: 'Tus recuerdos', title: 'Que lo mejor no se quede en el grupo.', text: 'Descubre sitios de ocio y eventos cerca de ti. Encuentra un plan, consigue tu entrada y queda con tu gente.', icon: Ticket, secondary: MapPin, feature: 'Eventos + Ocio', example: 'Del «hay que quedar» al plan', detail: 'Un café tranquilo, una tarde fuera o vuestra próxima fiesta.', chips: ['Cerca de ti', 'Entradas QR'], colors: ['#923A63', '#BD658C'] },
];

function SlideCard({ slide, width, active }: { slide: Slide; width: number; active: boolean }) {
  const { height } = useWindowDimensions();
  const compact = height < 740;
  return <ScrollView accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'} style={{ width, flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 18, gap: compact ? 18 : 25, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
    <LinearGradient colors={slide.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 30, padding: compact ? 17 : 22, overflow: 'hidden', gap: compact ? 14 : 22 }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 240, height: 240, right: -100, top: -105, borderRadius: 120, borderWidth: 35, borderColor: '#FFFFFF12' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: compact ? 40 : 56, height: compact ? 40 : 56, borderRadius: 15, backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center' }}><slide.icon size={30} color="#FFFFFF" strokeWidth={1.6} /></View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold, color: '#FFFFFF', fontSize: 13 }}>Así funciona</Text>
      </View>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 19, padding: compact ? 14 : 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><slide.secondary size={15} color={slide.colors[0]} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold, fontSize: 12, color: slide.colors[0] }}>{slide.feature}</Text></View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: 21, lineHeight: 25, letterSpacing: -0.4, color: '#211B34' }}>{slide.example}</Text>
        {!compact ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, lineHeight: 19, color: '#6A627A' }}>{slide.detail}</Text> : null}
        {!compact ? <View style={{ alignItems: 'flex-end' }}><ArrowUpRight size={21} color={slide.colors[0]} /></View> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{slide.chips.map(chip => <View key={chip} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Check size={12} color="#FFFFFF" /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#FFFFFF', fontSize: 12, fontFamily: FONT.medium }}>{chip}</Text></View>)}</View>
    </LinearGradient>
    <View style={{ gap: 11 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blueDeep }]}>{slide.eyebrow}</Text>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: C.text }}>{slide.title}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontSize: 15, lineHeight: 23 }]}>{slide.text}</Text>
    </View>
  </ScrollView>;
}
export default function Tour() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const pageRef = useRef(page); pageRef.current = page;
  const last = page === SLIDES.length - 1;
  const startedAt = useMemo(() => Date.now(), []);
  useEffect(() => { listRef.current?.scrollToOffset({ offset: width * pageRef.current, animated: false }); }, [width]);
  const finish = (via: 'skip' | 'done') => {
    markTourSeen();
    track(via === 'skip' ? 'tour_skipped' : 'tour_completed', { page, seconds: Math.round((Date.now() - startedAt) / 1000) });
    const dest = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/(tabs)/feed';
    router.replace(dest as never);
  };
  const goNext = () => {
    if (last) { finish('done'); return; }
    Haptics.selectionAsync().catch(() => {});
    const target = page + 1;
    setPage(target);
    listRef.current?.scrollToIndex({ index: target, animated: !reduceMotion });
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.max(0, Math.min(SLIDES.length - 1, Math.round(e.nativeEvent.contentOffset.x / width))));
  return <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8 }}>
      <BrandWordmark size={23} />
      <Pressable onPress={() => finish('skip')} accessibilityRole="button" accessibilityLabel="Saltar la guía" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 16 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Saltar</Text></Pressable>
    </View>
    <FlatList ref={listRef} data={SLIDES} keyExtractor={s => s.key} horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollEnd}
      getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })} style={{ flex: 1 }} extraData={page} renderItem={({ item, index }) => <SlideCard slide={item} width={width} active={index === page} />} />
    <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 18, gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7 }} accessibilityLabel={`Pantalla ${page + 1} de ${SLIDES.length}`}>
        {SLIDES.map((s, i) => <View key={s.key} style={{ width: i === page ? 26 : 7, height: 7, borderRadius: 4, backgroundColor: i === page ? C.blue : C.border }} />)}
      </View>
      <Btn full label={last ? 'Vamos allá' : 'Siguiente'} onPress={goNext} />
    </View>
  </View>;
}
