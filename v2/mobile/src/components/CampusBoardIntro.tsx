import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Flame, Heart, PenSquare, ArrowUpRight } from 'lucide-react-native';
import { Tap } from './ui';
import { FadeIn } from './motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, FONT, R, S } from '@/theme';

/** El porqué del muro y su acción principal, antes de los servicios
 *  secundarios. Versión v3 "Editorial": sin degradados ni colores fijos, la
 *  tipografía grande manda y el violeta es solo el acento del botón. */
export function CampusBoardIntro({ mode, university, onPublish }: {
  mode: 'fomo' | 'crush'; university?: string; onPublish?: () => void;
}) {
  const router = useRouter();
  const crush = mode === 'crush';
  const Icon = crush ? Heart : Flame;
  const prompts = crush ? ['Te vi en…', 'Mi plan para conocernos…', 'Busco a alguien que…'] : ['¿Quién se apunta a…?', 'Mi duda de la uni…', 'No os perdáis…'];
  const publish = (prompt?: string) => {
    if (onPublish) { onPublish(); return; }
    router.push({ pathname: '/publicar', params: { type: crush ? 'crush' : 'thread', ...(prompt ? { prompt } : {}) } });
  };
  return (
    <View style={{ marginHorizontal: S.lg, marginTop: S.md, marginBottom: S.sm, gap: 14 }}>
      <FadeIn>
        <View style={{ gap: 10 }}>
          {/* Rótulo: icono suelto de trazo fino + el nombre de la comunidad. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Icon size={14} color={C.blue} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
              style={[F.label, { color: C.blue, flex: 1 }]}>
              {university || 'Tu comunidad universitaria'}
            </Text>
          </View>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontFamily: FONT.display, color: C.text, fontSize: 30, lineHeight: 34, letterSpacing: -1 }}>
            {crush ? 'Un cruce de miradas.\nUna segunda oportunidad.' : 'Esto merece\nque te enteres.'}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.muted, fontSize: 14.5, lineHeight: 21, maxWidth: 380 }}>
            {crush ? 'Cuenta quién te llamó la atención. El Instagram solo se comparte cuando ambos queréis.' : 'Planes, preguntas y lo que pasa en tu campus. Tú eliges si firmas o publicas en anónimo.'}
          </Text>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <Tap onPress={() => publish()} haptic accessibilityLabel={crush ? 'Escribir en Crush' : 'Escribir en FOMO'}
          style={{ alignSelf: 'flex-start', borderRadius: R.full }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.blue, minHeight: 48, borderRadius: R.full, paddingHorizontal: 20 }}>
            <PenSquare size={17} color={C.onAccent} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 14.5 }}>
              {crush ? 'Publicar mi crush' : 'Abrir conversación'}
            </Text>
            <ArrowUpRight size={16} color={C.onAccent} strokeWidth={1.9} />
          </View>
        </Tap>
      </FadeIn>

      <FadeIn index={2}>
        <View style={{ gap: 8 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Una idea para empezar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: S.lg }}>
            {prompts.map((prompt) => (
              <Tap key={prompt} onPress={() => publish(prompt)} accessibilityLabel={`Escribir: ${prompt}`}
                style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.full }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text }]}>{prompt}</Text>
              </Tap>
            ))}
          </ScrollView>
        </View>
      </FadeIn>
    </View>
  );
}
