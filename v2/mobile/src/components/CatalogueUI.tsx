import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, SlidersHorizontal, ChevronRight, ArrowLeft, X, Check, ArrowUpRight, type LucideIcon } from 'lucide-react-native';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { normalizeAdmissionText } from '@/lib/admission-search';
import { C, F, FONT, R, S } from '@/theme';

export type FilterValues = Record<string, string>;
export type FilterSection = { key: string; label: string; options: { value: string; label: string }[] };

export function CatalogueHero({ eyebrow, title, description, icon: Icon, action, onAction }: {
  eyebrow: string; title: string; description: string; icon: LucideIcon; action?: string; onAction?: () => void;
}) {
  return <LinearGradient colors={['#5B2FD8', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={{ margin: S.lg, marginBottom: 20, borderRadius: 24, padding: 22, overflow: 'hidden' }}>
    <View pointerEvents="none" style={{ position: 'absolute', right: -22, top: -38, width: 150, height: 150, borderRadius: 75, borderWidth: 24, borderColor: '#FFFFFF0D' }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: '#E4D9FF' }]}>{eyebrow}</Text>
      <Icon size={25} color="#FFFFFF" strokeWidth={1.7} />
    </View>
    <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: 28, lineHeight: 32, letterSpacing: -0.7, color: '#FFFFFF', marginBottom: 8 }}>{title}</Text>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14, lineHeight: 21, color: '#EEE7FF' }}>{description}</Text>
    {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction}
      style={({ pressed }) => ({ marginTop: 18, minHeight: 46, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#4A24B3', fontFamily: FONT.semibold, fontSize: 14, flex: 1 }}>{action}</Text>
      <ArrowUpRight size={19} color="#4A24B3" />
    </Pressable> : null}
  </LinearGradient>;
}

export function CatalogueToolbar({ query, onQuery, placeholder, count, onFilters, chips = [], onClear }: {
  query: string; onQuery: (value: string) => void; placeholder: string; count: number; onFilters: () => void;
  chips?: string[]; onClear?: () => void;
}) {
  return <View style={{ paddingHorizontal: S.lg, gap: 12, marginBottom: 20 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.input, borderRadius: 15, paddingHorizontal: 13 }}>
        <Search size={19} color={C.muted} />
        <TextInput value={query} onChangeText={onQuery} placeholder={placeholder} placeholderTextColor={C.muted} accessibilityLabel={placeholder}
          maxFontSizeMultiplier={MAX_FONT_SCALE} returnKeyType="search" autoCorrect={false}
          style={{ flex: 1, minWidth: 0, paddingVertical: 13, color: C.text, fontSize: 14 }} />
        {query ? <Pressable onPress={() => onQuery('')} accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" hitSlop={10}><X size={18} color={C.muted} /></Pressable> : null}
      </View>
      <Pressable onPress={onFilters} accessibilityRole="button" accessibilityLabel={`Filtros${count ? `, ${count} activos` : ''}`}
        style={({ pressed }) => ({ minWidth: 54, minHeight: 50, paddingHorizontal: 14, borderRadius: 15, backgroundColor: count ? C.blue : C.accentSoft, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        <SlidersHorizontal size={20} color={count ? C.onAccent : C.blueDeep} />
        {count ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.heading }}>{count}</Text> : null}
      </Pressable>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onFilters} accessibilityRole="button" style={{ paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blueDeep, fontFamily: FONT.semibold }]}>{count ? 'Editar filtros' : 'Personalizar búsqueda'}</Text><ChevronRight size={14} color={C.blueDeep} />
      </Pressable>
      {chips.map((label, index) => <View key={`${label}:${index}`} style={{ backgroundColor: C.input, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, maxWidth: '100%' }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.text }]} numberOfLines={2}>{label}</Text>
      </View>)}
      {count > 0 && onClear ? <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Limpiar filtros" hitSlop={8} style={{ paddingVertical: 6 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Limpiar</Text></Pressable> : null}
    </View>
  </View>;
}

export function CatalogueResults({ count, noun, note }: { count: number; noun: string; note?: string }) {
  return <View style={{ paddingHorizontal: S.lg, marginBottom: 14, gap: 4 }}>
    <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18 }]}>{count.toLocaleString('es-ES')} {noun}</Text>
    {note ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{note}</Text> : null}
  </View>;
}

/** One native modal: choosing a field replaces its body, so iOS never stacks
 * competing modal presenters. Draft choices only affect results on Apply. */
export function CatalogueFilterSheet({ values, defaults, sections, onApply, onClose, normalize }: {
  values: FilterValues; defaults: FilterValues; sections: (draft: FilterValues) => FilterSection[];
  onApply: (draft: FilterValues) => void; onClose: () => void;
  normalize?: (draft: FilterValues, changed: string) => FilterValues;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [draft, setDraft] = useState(values);
  const [field, setField] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const groups = sections(draft);
  const current = groups.find(s => s.key === field);
  const options = useMemo(() => (current?.options ?? []).filter(o => normalizeAdmissionText(o.label).includes(normalizeAdmissionText(query))), [current, query]);
  const back = () => { setField(null); setQuery(''); };
  return <Modal transparent visible animationType={reduce ? 'none' : 'slide'} onRequestClose={current ? back : onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar filtros sin aplicar" onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: C.overlay }} />
      <View accessibilityViewIsModal style={{ height: '87%', maxWidth: 640, width: '100%', alignSelf: 'center', backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: Math.max(insets.bottom, 16) }}>
        <View style={{ width: 36, height: 4, backgroundColor: C.border, borderRadius: 4, alignSelf: 'center', marginTop: 9 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 8 }}>
          {current ? <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Volver a filtros" style={{ padding: 10, marginLeft: -10 }}><ArrowLeft size={22} color={C.text} /></Pressable> : null}
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { flex: 1, fontSize: 23 }]}>{current?.label ?? 'A tu medida'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar filtros sin aplicar" style={{ padding: 10, marginRight: -10 }}><X size={22} color={C.muted} /></Pressable>
        </View>
        {current ? <>
          {current.options.length > 7 ? <View style={{ marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 13, borderRadius: 13, backgroundColor: C.input, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Search size={18} color={C.muted} /><TextInput value={query} onChangeText={setQuery} placeholder={`Buscar ${current.label.toLowerCase()}`} accessibilityLabel={`Buscar ${current.label.toLowerCase()}`} placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, color: C.text, paddingVertical: 14, fontSize: 15 }} />
          </View> : null}
          <FlatList data={options} keyExtractor={o => o.value} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
            ListEmptyComponent={<Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingVertical: 24 }]}>No hay coincidencias. Prueba con otro nombre.</Text>}
            renderItem={({ item }) => { const selected = draft[current.key] === item.value; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={item.label}
              onPress={() => { const next = { ...draft, [current.key]: item.value }; setDraft(normalize ? normalize(next, current.key) : next); back(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16, marginBottom: 8, minHeight: 56, backgroundColor: selected ? C.accentSoft : C.input }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, color: selected ? C.blueDeep : C.text, fontFamily: selected ? FONT.semibold : undefined }]}>{item.label}</Text>
              {selected ? <Check size={20} color={C.blueDeep} /> : <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.border }} />}
            </Pressable>; }} />
        </> : <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginBottom: 18 }]}>Elige lo que te interesa. Aplicaremos los cambios al ver los resultados.</Text>
          {groups.map(s => <Pressable key={s.key} onPress={() => setField(s.key)} accessibilityRole="button" accessibilityLabel={`${s.label}: ${s.options.find(o => o.value === draft[s.key])?.label ?? 'Cualquiera'}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.input, borderRadius: 16, marginBottom: 10, minHeight: 76 }}>
            <View style={{ flex: 1, gap: 5 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{s.label}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: draft[s.key] !== defaults[s.key] ? C.blueDeep : C.text }]}>{s.options.find(o => o.value === draft[s.key])?.label ?? 'Cualquiera'}</Text></View><ChevronRight size={20} color={C.muted} />
          </Pressable>)}
        </ScrollView>}
        {!current ? <View style={{ paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderLight, gap: 8 }}>
          <Pressable onPress={() => { onApply(draft); onClose(); }} accessibilityRole="button" style={{ padding: 16, minHeight: 52, alignItems: 'center', backgroundColor: C.blue, borderRadius: 15 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.onAccent }]}>Ver resultados</Text></Pressable>
          <Pressable onPress={() => setDraft({ ...defaults })} accessibilityRole="button" style={{ padding: 12, alignItems: 'center' }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Restablecer filtros</Text></Pressable>
        </View> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
