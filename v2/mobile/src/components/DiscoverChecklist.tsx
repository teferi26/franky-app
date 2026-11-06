import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, LayoutAnimation } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, ChevronRight, X, Sparkles } from 'lucide-react-native';
import { Tap } from '@/components/ui';
import { peekChecklist, refreshChecklist, dismissChecklist, onChecklistChange, CHECKLIST_STEPS, type ChecklistState } from '@/lib/tour';
import { captureSessionIdentity } from '@/lib/session';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, R, FONT, F, SHADOW } from '@/theme';

// ─── "Primeros pasos": lo que se puede hacer en Franky, en forma de lista ───
// Tarjeta que enseña los 6 primeros pasos con progreso. Los pasos se marcan
// solos cuando la app detecta que ya están dados (ver getChecklist) y la
// tarjeta desaparece al completarlos o al cerrarla. Vive en el feed y en
// Estudio; `compact` muestra solo el siguiente paso pendiente.
export function DiscoverChecklist({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const [state, setState] = useState<ChecklistState | null>(null);

  // Primero lo guardado en el dispositivo (pinta ya) y después la comprobación
  // con el servidor, que como mucho se repite cada pocos minutos por cuenta.
  const load = useCallback(() => {
    let alive = true;
    peekChecklist().then(value => { if (alive) setState(prev => prev ?? value); }).catch(() => {});
    refreshChecklist(captureSessionIdentity()?.userId ?? null).then(value => { if (alive) setState(value); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useFocusEffect(load);
  useEffect(() => onChecklistChange(setState), []);

  // Cerrar la tarjeta la quita de la lista: el hueco se cierra con animación
  // (salvo con "reducir movimiento") en vez de que el feed pegue un salto.
  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    dismissChecklist();
  }, [reduceMotion]);

  if (!state || state.dismissed) return null;
  const doneCount = CHECKLIST_STEPS.filter((s) => state.done[s.key]).length;
  if (doneCount >= CHECKLIST_STEPS.length) return null;
  const pct = Math.round((doneCount / CHECKLIST_STEPS.length) * 100);
  const pending = CHECKLIST_STEPS.filter((s) => !state.done[s.key]);
  const shown = compact ? pending.slice(0, 1) : CHECKLIST_STEPS;

  return (
    <View style={[{
      marginHorizontal: S.lg, marginVertical: S.sm, backgroundColor: C.surface, borderRadius: R.xl,
      padding: S.lg, borderWidth: 0.5, borderColor: C.border,
    }, SHADOW.card]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {/* Icono suelto y de trazo fino: nada de cuadrados ni degradados. */}
        <Sparkles size={20} color={C.blue} strokeWidth={1.8} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 16 }]}>Tus primeros pasos</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{doneCount} de {CHECKLIST_STEPS.length} hechos</Text>
        </View>
        <Tap onPress={dismiss} accessibilityLabel="Ocultar primeros pasos" hitSlop={10}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
          <X size={15} color={C.muted} strokeWidth={2.4} />
        </Tap>
      </View>
      {/* Progreso: filete de 3 px en el acento, sin degradado. */}
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 3, borderRadius: 1.5, backgroundColor: C.borderLight, overflow: 'hidden', marginBottom: 12 }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.blue }} />
      </View>
      <View style={{ gap: 2 }}>
        {shown.map((step) => {
          const done = !!state.done[step.key];
          return (
            <Tap key={step.key} onPress={() => router.push(step.route as never)} accessibilityLabel={step.title} accessibilityHint={step.text}
              accessibilityState={{ checked: done }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 44 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? C.success : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: C.border,
                }}>
                  {done ? <Check size={14} color={C.onSuccess} strokeWidth={3} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14.5, fontFamily: FONT.semibold, color: done ? C.muted : C.text, textDecorationLine: done ? 'line-through' : 'none' }}>
                    {step.title}
                  </Text>
                  {!done ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 1 }]} numberOfLines={2}>{step.text}</Text> : null}
                </View>
                {!done ? <ChevronRight size={18} color={C.muted} strokeWidth={2} /> : null}
              </View>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
