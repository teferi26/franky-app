// ─── Pestañas internas de Crush ─────────────────────────────────────────────
// Chips horizontales con rol "tab": Tablón · Descubrir · Peticiones · Matches ·
// Invitar. El chip de Peticiones lleva el contador de gente que espera
// respuesta (get_ig_pending_count). Es un componente propio y no el Chip del
// kit porque ese no admite badge y aquí el número es la gracia.
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { LayoutList, Compass, Inbox, Heart, UserPlus, LucideIcon } from 'lucide-react-native';
import { Tap } from '@/components/ui';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, FONT } from '@/theme';

export type CrushTab = 'wall' | 'discover' | 'requests' | 'matches' | 'invite';

const TABS: { key: CrushTab; label: string; icon: LucideIcon }[] = [
  { key: 'wall', label: 'Tablón', icon: LayoutList },
  { key: 'requests', label: 'Peticiones', icon: Inbox },
  { key: 'matches', label: 'Matches', icon: Heart },
  { key: 'discover', label: 'Descubrir', icon: Compass },
  { key: 'invite', label: 'Invitar', icon: UserPlus },
];

export function CrushTabs({ active, onChange, pending }: {
  active: CrushTab; onChange: (t: CrushTab) => void;
  /** Peticiones sin responder; 0 oculta el badge. */
  pending: number;
}) {
  return (
    <View accessibilityRole="tablist" style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight, backgroundColor: C.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: S.lg, paddingVertical: 10, gap: 8 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = key === active;
          const badge = key === 'requests' && pending > 0 ? (pending > 99 ? '99+' : String(pending)) : null;
          const fg = on ? C.onAccent : C.text;
          return (
            <Tap key={key} onPress={() => onChange(key)} accessibilityRole="tab" accessibilityLabel={badge ? `${label}, ${pending} pendientes` : label}
              accessibilityState={{ selected: on }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 13, paddingVertical: 7, minHeight: 44, borderRadius: R.full,
                backgroundColor: on ? C.blue : C.surface, borderWidth: 0.5, borderColor: on ? C.blue : C.border,
              }}>
              <Icon size={14} color={fg} strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: on ? FONT.semibold : FONT.medium, letterSpacing: -0.1, color: fg }}>{label}</Text>
              {badge ? (
                <View style={{
                  minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
                  backgroundColor: on ? C.onAccent : C.blue, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 10.5, fontFamily: FONT.heading, color: on ? C.blue : C.onAccent }}>{badge}</Text>
                </View>
              ) : null}
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}
