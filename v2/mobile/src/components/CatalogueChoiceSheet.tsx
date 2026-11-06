import React, { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { SearchBar, Tap } from './ui';
import { normalizeAdmissionText } from '@/lib/admission-search';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, R, S } from '@/theme';

/** Search a long public catalogue without hundreds of horizontally scrolling chips. */
export function CatalogueChoiceSheet({ title, allLabel, options, selected, onSelect, onClose }: {
  title: string; allLabel: string; options: string[]; selected: string;
  onSelect: (value: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const choices = useMemo(() => {
    const terms = normalizeAdmissionText(query).split(/\s+/).filter(Boolean);
    return ['', ...options].filter(value => terms.every(term => normalizeAdmissionText(value || allLabel).includes(term)));
  }, [allLabel, options, query]);
  return <Modal transparent visible animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector" onPress={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: C.overlay }} />
      <View accessibilityViewIsModal style={{ height: '82%', backgroundColor: C.surface,
        borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: Math.max(insets.bottom, S.md) }}>
        {/* Asa de la hoja: el mismo gesto visual que el resto de modales. */}
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm, flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1, fontSize: 20, letterSpacing: -0.4 }]}>{title}</Text>
          <Tap onPress={onClose} accessibilityLabel="Cerrar selector" style={{ padding: 12 }}><X size={22} color={C.text} /></Tap>
        </View>
        <SearchBar value={query} onChange={setQuery} placeholder={`Buscar ${title.toLowerCase()}…`} />
        <FlatList data={choices} keyExtractor={value => value || '__all__'} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" initialNumToRender={18}
          ListEmptyComponent={<Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { padding: S.lg }]}>No hay coincidencias. Prueba con otro nombre.</Text>}
          renderItem={({ item }) => <Tap onPress={() => { onSelect(item); onClose(); }}
            accessibilityRole="radio" accessibilityState={{ checked: item === selected }}
            accessibilityLabel={item || allLabel}
            style={{ padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.sm,
              borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
              backgroundColor: item === selected ? C.accentSoft : C.surface }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, color: item === selected ? C.blueDeep : C.text }]}>{item || allLabel}</Text>
            {item === selected ? <Check size={20} color={C.blue} /> : null}
          </Tap>} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
