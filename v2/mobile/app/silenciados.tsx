// ─── Cuentas silenciadas ─────────────────────────────────────────────────
// Lista quién has silenciado (tabla muted_users, migración 134): a
// diferencia de bloquear, silenciar es privado y ASIMÉTRICO. La otra persona
// nunca se entera de que la has silenciado ni de que la has dejado de
// silenciar; solo tú ves esta lista (RLS: muter_id = auth.uid()). No hay RPC
// dedicada, así que hacemos SELECT directo a muted_users y resolvemos los
// perfiles con la vista public_profiles, igual que en bloqueados.tsx.
// Fail-soft: si la tabla aún no existe en producción (migración 134 sin
// aplicar), la pantalla simplemente muestra el estado vacío.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { VolumeX } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Btn, EmptyState, SkeletonList } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F } from '@/theme';

type Muted = { id: string; full_name: string | null; avatar_url: string | null };

export default function Silenciados() {
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [people, setPeople] = useState<Muted[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(false);
    // getUser DENTRO del try: fuera, un rechazo (sin red) dejaba el esqueleto
    // para siempre porque loaded nunca pasaba a true.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPeople([]); return; }
      // 1. Filas propias de silenciado (RLS ya filtra por muter_id = auth.uid()).
      const { data: mutes, error } = await supabase
        .from('muted_users')
        .select('muted_id, created_at')
        .eq('muter_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        // Migración 134 sin aplicar todavía: se comporta como si no hubiera
        // nadie. Cualquier OTRO error (red, RLS) es un fallo de verdad y se
        // enseña como tal, no como una lista vacía.
        if (error.code === '42P01' || /does not exist/i.test(error.message ?? '')) { setPeople([]); return; }
        throw error;
      }
      const ids = (mutes ?? []).map((m) => m.muted_id as string);
      if (ids.length === 0) { setPeople([]); return; }
      // 2. Resolvemos nombre y foto desde la vista pública (legible por auth).
      const { data: profs } = await supabase
        .from('public_profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids);
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p as Muted]));
      // Conservamos el orden (más reciente primero) aunque un perfil no resuelva.
      setPeople(ids.map((id) => byId.get(id) ?? { id, full_name: null, avatar_url: null }));
    } catch {
      setLoadErr(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unmute = useCallback((person: Muted) => {
    const name = person.full_name ?? 'esta persona';
    Alert.alert(
      'Dejar de silenciar',
      `Volverás a ver el contenido de ${name} con normalidad.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dejar de silenciar',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setBusyId(person.id);
            const { error } = await supabase
              .from('muted_users')
              .delete()
              .eq('muter_id', user.id)
              .eq('muted_id', person.id);
            setBusyId(null);
            if (error) { toastError('No se pudo completar', 'Inténtalo de nuevo en unos segundos.'); return; }
            // Optimista: fuera de la lista al instante.
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setPeople((prev) => prev.filter((p) => p.id !== person.id));
          },
        },
      ],
    );
  }, []);

  if (!loaded) {
    return (
      <Screen title="Cuentas silenciadas" back>
        <View style={{ paddingTop: S.lg }}>
          <SkeletonList count={4} height={64} />
        </View>
      </Screen>
    );
  }

  if (loadErr) {
    return (
      <Screen title="Cuentas silenciadas" back>
        <EmptyState icon={VolumeX} title="No se pudo cargar"
          subtitle="No pudimos traer tu lista de silenciados. Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={() => { setLoaded(false); void load(); }} />
      </Screen>
    );
  }

  if (people.length === 0) {
    return (
      <Screen title="Cuentas silenciadas" back>
        <EmptyState icon={VolumeX} title="No has silenciado a nadie"
          subtitle="Cuando silencies a alguien desde su perfil, aparecerá aquí para que puedas dejar de silenciarle." />
      </Screen>
    );
  }

  return (
    <Screen title="Cuentas silenciadas" back>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.lg, lineHeight: 19 }]}>
        Silenciar es privado: estas personas no saben que las has silenciado, ni
        se enteran si dejas de hacerlo. A diferencia de bloquear, seguís pudiendo
        veros y escribiros con normalidad.
      </Text>
      {people.map((person, i) => (
        <FadeIn key={person.id} index={i}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: S.lg, paddingVertical: 12, minHeight: 66,
            borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
          }}>
            <Avatar name={person.full_name} uri={person.avatar_url} size={44} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]} numberOfLines={1}>
              {person.full_name ?? 'Estudiante'}
            </Text>
            <Btn small variant="ghost" busy={busyId === person.id}
              label="Dejar de silenciar" onPress={() => unmute(person)} />
          </View>
        </FadeIn>
      ))}
    </Screen>
  );
}
