import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BellRing } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useSessionGuard } from '@/lib/useSessionGuard';
import { Tap } from '@/components/ui';
import { C, S, F } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

type Intent = { city: string; province: string | null; enabled: boolean; expires_at: string };
const searchListeners = new Set<(owner: string, intent: Intent) => void>();
export async function recordHousingSearch(owner: string, city: string) {
  const old = await supabase.from('housing_search_intents').select('enabled').eq('user_id', owner).maybeSingle();
  if (old.error) return;
  const result = await supabase.rpc('save_housing_search', { p_city: city, p_budget_max: null, p_enabled: old.data?.enabled ?? true, p_expected_user_id: owner });
  if (!result.error && result.data) searchListeners.forEach(listener => listener(owner, result.data as Intent));
}
export default function HousingSearchAlert({ city }: { city: string | null }) {
  const { uid } = useSessionIdentity();
  const router = useRouter();
  if (!uid || !city) return null;
  return <OwnedAlert key={uid} owner={uid} city={city} openSettings={() => router.push('/ajustes-notificaciones')} />;
}
function OwnedAlert({ owner, city, openSettings }: { owner: string; city: string; openSettings: () => void }) {
  const isCurrent = useSessionGuard(owner);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    let alive = true;
    let updated = false;
    const receive = (savedOwner: string, saved: Intent) => {
      if (savedOwner !== owner || !alive || !isCurrent()) return;
      updated = true; setIntent(saved); setError('');
    };
    searchListeners.add(receive);
    supabase.from('housing_search_intents').select('city,province,enabled,expires_at').eq('user_id', owner).maybeSingle().then(({ data, error }) => {
      if (!alive || updated || !isCurrent()) return;
      if (error) setError('No pudimos comprobar tus avisos.'); else setIntent(data as Intent | null);
    });
    return () => { alive = false; searchListeners.delete(receive); };
  }, [owner, city, isCurrent]);
  const active = !!intent?.enabled && Date.parse(intent.expires_at) > Date.now();
  const save = async (enabled: boolean) => {
    if (!isCurrent() || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const { data, error } = await supabase.rpc('save_housing_search', { p_city: enabled ? city : intent?.city || city, p_budget_max: null, p_enabled: enabled, p_expected_user_id: owner });
    if (!isCurrent()) return;
    locked.current = false; setBusy(false);
    if (error) setError('No se ha guardado. Toca para reintentar.'); else setIntent(data as Intent);
  };
  // Aviso sobrio entre filetes, con las acciones como enlaces. Cada acción
  // tiene su propia área de 44 px: antes solo era pulsable el alto del texto.
  const alta = busy ? 'Guardando…' : active && intent?.city === city ? 'Renovar 30 días' : 'Avisarme durante 30 días';
  const accion = { minHeight: 44, justifyContent: 'center' as const };
  return <View style={{ marginHorizontal: S.lg, marginBottom: 10, paddingVertical: 12, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.borderLight, gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <BellRing size={17} color={C.blue} strokeWidth={1.75} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>{active ? `Avisos activos: ${intent?.province || intent?.city}` : `Nuevos pisos en ${city} y su provincia`}</Text>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
      <Tap disabled={busy} onPress={() => save(true)} accessibilityLabel={alta} accessibilityState={{ busy }} style={accion}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blue, opacity: busy ? 0.5 : 1 }]}>{alta}</Text>
      </Tap>
      {active && <Tap disabled={busy} onPress={() => save(false)} accessibilityLabel="Desactivar los avisos de pisos" style={accion}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { opacity: busy ? 0.5 : 1 }]}>Desactivar</Text>
      </Tap>}
      <Tap onPress={openSettings} accessibilityLabel="Ajustes de avisos" style={accion}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Ajustes</Text>
      </Tap>
    </View>
    {error ? <Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.errorText }]}>{error}</Text> : null}
  </View>;
}
