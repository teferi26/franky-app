// ─── Centro de privacidad ─────────────────────────────────────────────────
// Modo oculto, quién puede escribirte, cuentas bloqueadas y silenciadas,
// documentos legales y acceso al borrado de cuenta (que vive en el menú
// principal). Cumple además el requisito de las stores de tener términos,
// privacidad y borrado accesibles desde dentro de la app.
//
// Diseño: cabecera estándar (Screen) y filas agrupadas en tarjetas por
// sección, el mismo patrón que el menú del perfil y el resto de ajustes.
import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ShieldOff, EyeOff, FileText, Trash2, BadgeCheck, MessageCircle, VolumeX } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { NavRow, OptionsSheet, SkeletonList } from '@/components/ui';
import { supabase, WEB_URL } from '@/lib/supabase';
import { toastError } from '@/lib/toast';
import { getAnalyticsConsent, setAnalyticsConsent } from '@/lib/analytics';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F } from '@/theme';

// 67: opciones de "quién puede escribirte" (profiles.dm_privacy, migración 134).
const DM_PRIVACY_OPTIONS: { value: string; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'seguidos', label: 'Solo a quien sigo' },
  { value: 'verificados', label: 'Solo estudiantes verificados' },
];

// Rótulo pequeno y filas a sangre separadas por una linea fina (grupo v3).
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const rows = React.Children.toArray(children);
  return (
    <View style={{ marginBottom: S.lg }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm }]}>{title}</Text>
      <View style={{ borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
        {rows.map((child, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: C.borderLight } : undefined}>{child}</View>
        ))}
      </View>
    </View>
  );
}

export default function Privacidad() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  useEffect(() => { void getAnalyticsConsent().then(setAnalytics); }, []);
  const toggleAnalytics = async (value: boolean) => {
    try { await setAnalyticsConsent(value); setAnalytics(value); }
    catch { toastError('No se pudo guardar', 'Inténtalo de nuevo.'); }
  };
  // 67: quién puede escribirte. Fail-soft: si la columna aún no existe en
  // producción (migración sin aplicar), se queda en 'todos' (como hasta ahora).
  const [dmPrivacy, setDmPrivacy] = useState('todos');
  const [dmSheetOpen, setDmSheetOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/welcome'); return; }
      const { data } = await supabase.from('profiles').select('is_hidden').eq('id', user.id).maybeSingle();
      setHidden(Boolean(data?.is_hidden));
      try {
        const { data: dm } = await supabase.from('profiles').select('dm_privacy').eq('id', user.id).maybeSingle();
        if (dm?.dm_privacy) setDmPrivacy(dm.dm_privacy);
      } catch { /* migración 134 sin aplicar: se queda en 'todos' */ }
      setLoaded(true);
    })();
  }, [router]);

  const saveDmPrivacy = async (value: string) => {
    const prev = dmPrivacy;
    setDmPrivacy(value);
    Haptics.selectionAsync().catch(() => {});
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDmPrivacy(prev); return; }
    // .select('id'): un UPDATE que no toca ninguna fila no da error; sin esto
    // el ajuste parecería guardado sin estarlo.
    const { data, error } = await supabase.from('profiles').update({ dm_privacy: value }).eq('id', user.id).select('id');
    if (error || data?.length !== 1) { setDmPrivacy(prev); toastError('No se pudo guardar', 'Inténtalo de nuevo en unos segundos.'); }
  };

  const toggleHidden = async (v: boolean) => {
    setHidden(v);
    Haptics.selectionAsync().catch(() => {});
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // is_hidden (migración 077): oculta el perfil de los feeds de descubrimiento.
    const { data, error } = await supabase.from('profiles').update({ is_hidden: v }).eq('id', user.id).select('id');
    if (error || data?.length !== 1) { setHidden(!v); toastError('No se pudo guardar', 'Inténtalo de nuevo.'); }
  };

  return (
    <Screen title="Privacidad" back>
      {!loaded ? (
        <View style={{ paddingTop: S.lg }}><SkeletonList count={4} height={64} /></View>
      ) : (
        <>
          <Group title="Mejorar Franky">
            <NavRow icon={FileText} title="Compartir uso de la app" note="Permite medir qué pantallas y funciones utilizas. No incluye el contenido de mensajes ni búsquedas. Puedes desactivarlo aquí."
              onPress={() => toggleAnalytics(!analytics)} right={<Switch value={analytics} onValueChange={toggleAnalytics} accessibilityLabel="Compartir uso de la app" trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />} />
          </Group>
          <Group title="Tu perfil">
            <NavRow icon={EyeOff} title="Perfil oculto" note="No aparecerás en las sugerencias de descubrimiento"
              onPress={() => toggleHidden(!hidden)}
              right={
                <Switch value={hidden} onValueChange={toggleHidden} accessibilityLabel="Perfil oculto"
                  trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
              } />
            <NavRow icon={BadgeCheck} title="Verificar email de estudiante" note="Consigue el badge de estudiante verificado"
              onPress={() => router.push('/verificar-estudiante')} />
          </Group>

          <Group title="Quién contacta contigo">
            <NavRow icon={MessageCircle} title="Quién puede escribirte"
              note={DM_PRIVACY_OPTIONS.find((o) => o.value === dmPrivacy)?.label ?? 'Todos'}
              onPress={() => setDmSheetOpen(true)} />
            <NavRow icon={ShieldOff} title="Cuentas bloqueadas" note="Ver y desbloquear" onPress={() => router.push('/bloqueados')} />
            <NavRow icon={VolumeX} title="Cuentas silenciadas" note="Ver y dejar de silenciar" onPress={() => router.push('/silenciados')} />
          </Group>

          <Group title="Legal">
            <NavRow icon={FileText} title="Términos del servicio" onPress={() => Linking.openURL(`${WEB_URL}/terminos`)} />
            <NavRow icon={FileText} title="Política de privacidad" onPress={() => Linking.openURL(`${WEB_URL}/privacidad`)} />
          </Group>

          <Group title="Tu cuenta">
            <NavRow icon={Trash2} tone="danger" title="Eliminar mi cuenta" note="Eliminación definitiva de tus datos"
              onPress={() => router.push('/eliminar-cuenta')} />
          </Group>

          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { paddingHorizontal: S.lg, paddingTop: 12, lineHeight: 16 }]}>
            Tus datos se tratan según nuestra política de privacidad. Puedes
            eliminar tu cuenta cuando quieras desde el menú de tu perfil.
          </Text>
        </>
      )}

      <OptionsSheet visible={dmSheetOpen} onClose={() => setDmSheetOpen(false)}
        title="Quién puede escribirte"
        options={DM_PRIVACY_OPTIONS.map((o) => ({
          label: o.label,
          selected: o.value === dmPrivacy,
          onPress: () => saveDmPrivacy(o.value),
        }))} />
    </Screen>
  );
}
