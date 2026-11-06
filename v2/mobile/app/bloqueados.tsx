// ─── Cuentas bloqueadas ──────────────────────────────────────────────────
// Lista las personas que el usuario ha bloqueado (tabla user_blocks, la misma
// que usan chat/[id].tsx y perfil/[id].tsx para bloquear, y que get_my_chats y
// los feeds sociales usan para ocultarlas). No hay RPC list_my_blocked, así que
// hacemos un SELECT a user_blocks (RLS: solo se ven los propios, blocker_id =
// auth.uid()) y resolvemos los perfiles con la vista public_profiles.
// Desbloquear = DELETE de esa fila (la RLS "Users manage own blocks" lo permite
// porque blocker_id = auth.uid()).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ShieldOff } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Btn, EmptyState, SkeletonList } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F } from '@/theme';

type Blocked = { id: string; full_name: string | null; avatar_url: string | null };

export default function Bloqueados() {
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [people, setPeople] = useState<Blocked[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(false);
    // try/catch/finally: si getUser o la query lanzan (sin red) el esqueleto
    // se quedaba para siempre porque loaded nunca pasaba a true. Y un error
    // de la query se enseña como fallo, no como "no has bloqueado a nadie".
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPeople([]); return; }
      // 1. Filas de bloqueo propias (RLS ya filtra por blocker_id = auth.uid()).
      const { data: blocks, error } = await supabase
        .from('user_blocks')
        .select('blocked_id, created_at')
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (blocks ?? []).map((b) => b.blocked_id as string);
      if (ids.length === 0) { setPeople([]); return; }
      // 2. Resolvemos nombre y foto desde la vista pública (legible por auth).
      const { data: profs } = await supabase
        .from('public_profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids);
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p as Blocked]));
      // Conservamos el orden de bloqueo (más reciente primero) y no perdemos a
      // nadie aunque su perfil no resuelva.
      setPeople(ids.map((id) => byId.get(id) ?? { id, full_name: null, avatar_url: null }));
    } catch {
      setLoadErr(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unblock = useCallback((person: Blocked) => {
    const name = person.full_name ?? 'esta persona';
    Alert.alert(
      'Desbloquear',
      `¿Seguro que quieres desbloquear a ${name}? Volveréis a poder veros y escribiros.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbloquear',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setBusyId(person.id);
            const { error } = await supabase
              .from('user_blocks')
              .delete()
              .eq('blocker_id', user.id)
              .eq('blocked_id', person.id);
            setBusyId(null);
            if (error) { toastError('No se pudo desbloquear', 'Inténtalo de nuevo en unos segundos.'); return; }
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
      <Screen title="Cuentas bloqueadas" back>
        <View style={{ paddingTop: S.lg }}>
          <SkeletonList count={4} height={64} />
        </View>
      </Screen>
    );
  }

  if (loadErr) {
    return (
      <Screen title="Cuentas bloqueadas" back>
        <EmptyState icon={ShieldOff} title="No se pudo cargar"
          subtitle="No pudimos traer tu lista de bloqueados. Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={() => { setLoaded(false); void load(); }} />
      </Screen>
    );
  }

  if (people.length === 0) {
    return (
      <Screen title="Cuentas bloqueadas" back>
        <EmptyState icon={ShieldOff} title="No has bloqueado a nadie"
          subtitle="Cuando bloquees a alguien desde su perfil o un chat, aparecerá aquí para que puedas desbloquearlo." />
      </Screen>
    );
  }

  return (
    <Screen title="Cuentas bloqueadas" back>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.lg, lineHeight: 19 }]}>
        Las personas bloqueadas no pueden verte ni escribirte. Puedes desbloquear a quien quieras.
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
              label="Desbloquear" onPress={() => unblock(person)} />
          </View>
        </FadeIn>
      ))}
    </Screen>
  );
}
