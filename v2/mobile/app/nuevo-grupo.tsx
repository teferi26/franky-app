// ─── Crear grupo: nombre + selector de personas (mejora 57) ──────────────
// Busca en public_profiles (la vista curada): la RLS de profiles solo deja
// leer tu propia fila, así que la búsqueda de gente para el grupo tiene que
// pasar por ahí. Al crear, se navega directo al chat nuevo.
//
// Diseño: formulario del kit (etiquetas en F.label, campos en C.input con
// R.md y 48 px de alto), personas elegidas como píldoras con avatar, filas de
// resultado con marca de selección en círculo y estados de búsqueda con
// esqueleto/vacío en vez de un spinner suelto. Los errores van por toast.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X, Users, Check, SearchX } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { SocialDemoFeatureGate } from '@/components/SocialDemoFeatureNotice';
import type { SessionIdentity } from '@/lib/session';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import { FadeIn } from '@/components/motion';
import { Avatar, Tap, Btn, SearchBar, SkeletonList, EmptyState } from '@/components/ui';
import { searchPeople, createGroupChat, type PersonResult } from '@/lib/chat';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const MAX_NAME = 60;

export default function NuevoGrupo() {
  const owner = useSessionOwner();
  return <SocialDemoFeatureGate feature="groups" title="Nuevo grupo">{owner ? <GroupComposer owner={owner} /> : null}</SocialDemoFeatureGate>;
}

function GroupComposer({ owner }: { owner: SessionIdentity }) {
  const isCurrent = useOwnerGuard(owner);
  const router = useRouter();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PersonResult[]>([]);
  const [creating, setCreating] = useState(false);

  // Busca con un pequeño debounce: evita una query por cada tecla pulsada.
  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); setSearching(false); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchPeople(term);
        if (alive) setResults(rows);
      } catch {
        // Sin red: se deja la lista como estaba, el usuario puede reintentar tecleando.
        if (alive) setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const toggle = useCallback((p: PersonResult) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => prev.some((x) => x.id === p.id)
      ? prev.filter((x) => x.id !== p.id)
      : [...prev, p]);
  }, []);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);
  const canCreate = name.trim().length > 0 && selected.length > 0 && !creating;

  const create = useCallback(async () => {
    if (!isCurrent() || !canCreate) return;
    setCreating(true);
    const trimmed = name.trim();
    let id: string | null = null;
    // finally: si createGroupChat lanza (sin red), el botón se quedaba girando.
    try {
      id = await createGroupChat(trimmed, selected.map((p) => p.id));
    } catch {
      id = null;
    } finally {
      if (isCurrent()) setCreating(false);
    }
    if (!isCurrent()) return;
    if (!id) {
      toastError('No se pudo crear el grupo', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace({ pathname: '/chat/[id]', params: { id, title: trimmed } });
  }, [canCreate, name, selected, router, isCurrent]);

  // Pista de qué falta para poder crear: guía en vez de un botón muerto.
  const hint = !name.trim() && selected.length === 0
    ? 'Ponle nombre y añade al menos a una persona.'
    : !name.trim() ? 'Falta el nombre del grupo.'
      : selected.length === 0 ? 'Añade al menos a una persona.'
        : `${selected.length + 1} ${selected.length + 1 === 1 ? 'miembro' : 'miembros'} contándote a ti.`;

  return (
    <Screen title="Nuevo grupo" back
      right={<Btn small label="Crear" onPress={create} disabled={!canCreate} busy={creating} accessibilityLabel="Crear grupo" />}>
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Nombre del grupo</Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
          borderRadius: R.md, paddingHorizontal: 14, minHeight: 48,
        }}>
          <TextInput
            value={name} onChangeText={setName} placeholder="Ej. Compis de piso"
            placeholderTextColor={C.muted} maxLength={MAX_NAME}
            accessibilityLabel="Nombre del grupo"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            returnKeyType="done"
            style={{ flex: 1, fontSize: 15.5, color: C.text, paddingVertical: 0 }}
          />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginLeft: 8 }]}>{name.length}/{MAX_NAME}</Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 6 }]}>{hint}</Text>

        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginTop: S.xl, marginBottom: 8 }]}>
          Añadir personas{selected.length > 0 ? ` · ${selected.length}` : ''}
        </Text>
      </View>

      {selected.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: S.lg, marginBottom: S.md }}>
          {selected.map((p) => (
            <Tap key={p.id} onPress={() => toggle(p)} accessibilityLabel={`Quitar a ${p.full_name ?? 'esta persona'} del grupo`}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                borderWidth: 0.5, borderColor: C.border, borderRadius: R.full,
                paddingLeft: 4, paddingRight: 10, paddingVertical: 4, minHeight: 34,
              }}>
              <Avatar name={p.full_name} uri={p.avatar_url} size={26} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: C.text, fontFamily: FONT.semibold, maxWidth: 130 }} numberOfLines={1}>
                {p.full_name ?? 'Estudiante'}
              </Text>
              <X size={14} color={C.muted} strokeWidth={1.9} />
            </Tap>
          ))}
        </View>
      ) : null}

      <SearchBar value={query} onChange={setQuery} placeholder="Buscar por nombre" />

      {searching ? (
        <SkeletonList count={3} height={56} />
      ) : results.length > 0 ? (
        <View>
          {results.map((p, i) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <FadeIn key={p.id} index={i} distance={8}>
              <Tap onPress={() => toggle(p)}
                accessibilityLabel={`${p.full_name ?? 'Estudiante'}${p.university ? `, ${p.university}` : ''}`}
                accessibilityHint={isSelected ? 'Quitar del grupo' : 'Añadir al grupo'}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 60,
                  backgroundColor: isSelected ? C.accentSoft : 'transparent',
                  borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
                }}>
                  <Avatar name={p.full_name} uri={p.avatar_url} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{p.full_name ?? 'Estudiante'}</Text>
                    {p.university ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{p.university}</Text> : null}
                  </View>
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{
                    width: 26, height: 26, borderRadius: 13, borderWidth: 1,
                    borderColor: isSelected ? C.blue : C.border,
                    backgroundColor: isSelected ? C.blue : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected ? <Check size={15} color={C.onAccent} strokeWidth={2.6} /> : null}
                  </View>
                </View>
              </Tap>
              </FadeIn>
            );
          })}
        </View>
      ) : query.trim() ? (
        <EmptyState compact icon={SearchX} title="Nadie con ese nombre"
          subtitle="Prueba con el nombre completo o con otra forma de escribirlo." />
      ) : (
        <EmptyState compact icon={Users} title="Busca a quien quieras añadir"
          subtitle="Escribe su nombre y tócalo para meterlo en el grupo." />
      )}
    </Screen>
  );
}
