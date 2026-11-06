import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Flame, Ticket, Home, Users, HeartHandshake, PartyPopper, ChevronRight, LucideIcon,
} from 'lucide-react-native';
import { Btn, Tap, ProgressBar } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getIntent, markGuideSeen, type UserIntent } from '@/lib/intent';
import { track } from '@/lib/analytics';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';

// ─── "¿Por dónde empiezas?": último paso del onboarding ──────────────────
// ANTES esta pantalla era un carrusel de 5 pasos que volvía a explicar el
// FOMO, el Crush y los Eventos... justo después de que onboarding-intro (4
// slides) los explicase ya. Un usuario nuevo se comía 9 pantallas de tutorial
// antes de ver una sola publicación real.
//
// Ahora NO explica nada que onboarding-intro no haya contado: es una sola
// pantalla con 3 atajos que LLEVAN a contenido real, personalizados con la
// intención elegida en onboarding-intencion. Cadena actual:
//   onboarding-intro (4 slides) -> onboarding-perfil -> onboarding-intencion
//   -> ESTA PANTALLA (1 toque y estás dentro).
//
// Se sigue reutilizando desde app/ajustes-uso.tsx ("Ver la guía otra vez"),
// así que esta pantalla NUNCA comprueba si ya se vio: si se llega a ella, se
// enseña. markGuideSeen() al salir es lo que evita que el camino automático
// del onboarding vuelva a pasar por aquí.

type Accion = { icon: LucideIcon; title: string; text: string; route: string };

const FOMO: Accion = {
  icon: Flame,
  title: 'Abrir el Fomo de mi campus',
  text: 'Lo que se cuece hoy en tu uni. Publica en anónimo o con tu nombre.',
  route: '/(tabs)/feed',
};
const EVENTOS: Accion = {
  icon: Ticket,
  title: 'Ver los planes de esta semana',
  text: 'Fiestas y quedadas cerca de ti, con la entrada en la app.',
  route: '/(tabs)/eventos',
};
const CRUSH: Accion = {
  icon: HeartHandshake,
  title: 'Probar el Crush',
  text: 'Publica y comparte Instagram cuando ambos queráis.',
  route: '/(tabs)/crush',
};
const PISOS: Accion = {
  icon: Home,
  title: 'Buscar piso',
  text: 'Fotos, precio y visita reservada sin salir de la app.',
  route: '/pisos',
};
const ROOMIES: Accion = {
  icon: Users,
  title: 'Buscar compañero de piso',
  text: 'Perfiles ordenados por compatibilidad de convivencia.',
  route: '/roomie',
};
const OCIO: Accion = {
  icon: PartyPopper,
  title: 'Descubrir zonas de ocio',
  text: 'Dónde sale la gente de tu ciudad, con fotos reales.',
  route: '/ocio',
};

// Máximo 3 atajos por intención: más opciones no ayudan, paralizan.
const ACCIONES: Record<UserIntent, Accion[]> = {
  piso: [PISOS, ROOMIES, FOMO],
  gente: [FOMO, CRUSH, EVENTOS],
  planes: [EVENTOS, OCIO, FOMO],
  todo: [FOMO, EVENTOS, PISOS],
};

export default function Guia() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Se puede llegar aquí desde Ajustes > Cómo usas Franky ("Ver la guía otra
  // vez"): en ese caso no es un paso del onboarding y no se pinta el progreso.
  const params = useLocalSearchParams<{ from?: string }>();
  const desdeAjustes = params.from === 'ajustes';

  // Se calcula una sola vez al montar: la intención no cambia mientras se
  // mira esta pantalla, y así los atajos no bailan.
  const acciones = useMemo(() => ACCIONES[getIntent()], []);

  // Salir marcando la guía como vista (ver GUIDE_SEEN_KEY en src/lib/intent.ts).
  //
  // Los atajos a pantallas que NO son pestañas (/pisos, /roomie, /ocio) se
  // apilan SOBRE el feed: todo el onboarding navega con replace, así que un
  // replace directo dejaría al recién llegado en una pantalla suelta, sin barra
  // de pestañas y con un botón "Volver" que no hace nada.
  const salir = (destino: string, via: 'shortcut' | 'feed' | 'skip') => {
    markGuideSeen();
    track(via === 'skip' ? 'guide_skipped' : 'guide_completed', { via, destino });
    if (destino.startsWith('/(tabs)')) {
      router.replace(destino);
      return;
    }
    router.replace('/(tabs)/feed');
    router.push(destino);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={{ alignItems: 'flex-end', paddingHorizontal: S.lg, paddingTop: 8 }}>
        <Tap onPress={() => salir('/(tabs)/feed', 'skip')} accessibilityLabel="Saltar la guía"
          style={{ paddingHorizontal: 10, paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.muted, fontSize: 13.5, fontFamily: FONT.semibold }}>Saltar</Text>
        </Tap>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {/* Último paso del onboarding: la barra completa cierra la sensación de
            progreso que abre onboarding-perfil. Cuando se llega desde Ajustes
            ("Ver la guía otra vez") no hay onboarding que cerrar, así que no
            se pinta: sería un progreso inventado. */}
        {desdeAjustes ? null : (
          <>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginTop: 4, marginBottom: 6 }]}>Paso 4 de 4</Text>
            <ProgressBar value={100} style={{ marginBottom: 18 }} />
          </>
        )}
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.display, { fontSize: 30, letterSpacing: -1.1, lineHeight: 34, marginBottom: 10 }]}>
          Tu campus te espera.
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14, lineHeight: 20, marginBottom: S.xl }]}>
          Este es tu punto de partida. Elige un plan y empieza a descubrir todo lo que te espera en Franky.
        </Text>

        {/* Atajos: iconos sueltos de trazo fino y entrada en cascada. */}
        <View style={{ gap: 10 }}>
          {acciones.map((a, i) => (
            <FadeIn key={a.route} index={i}>
              <Tap
                onPress={() => salir(a.route, 'shortcut')}
                haptic
                accessibilityLabel={a.title}
                accessibilityHint={a.text}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: C.surface, borderRadius: 21, paddingHorizontal: S.lg, paddingVertical: 20,
                  borderWidth: 1, borderColor: C.border,
                }}>
                <View style={{ width: 45, height: 45, borderRadius: 16, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}><a.icon size={22} color={C.blueDeep} strokeWidth={1.75} /></View>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginBottom: 2 }]}>
                    {a.title}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{a.text}</Text>
                </View>
                <ChevronRight size={19} color={C.muted} strokeWidth={1.9} />
              </Tap>
            </FadeIn>
          ))}
        </View>

        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: S.xl }]}>
          Puedes cambiar tus preferencias cuando quieras en Ajustes.
        </Text>
      </ScrollView>

      <View style={{ paddingHorizontal: 36, paddingBottom: insets.bottom + 20 }}>
        <Btn full label="Ir al Fomo de mi uni" onPress={() => salir('/(tabs)/feed', 'feed')} />
      </View>
    </View>
  );
}
