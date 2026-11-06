import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useSessionGuard } from '@/lib/useSessionGuard';
import { toastError } from '@/lib/toast';
// ─── Ajustes > Notificaciones ─────────────────────────────────────────────
// Silenciado de notificaciones por categoría (profiles.push_prefs, migración
// 125): {} = todo activo; una clave a false silencia esa categoría; all=false
// lo silencia todo. El endpoint /api/internal/notify-push las respeta antes
// de enviar cada push.
//
// "No molestar" (franja horaria): la migración 070 ya creó una tabla
// `notification_preferences` con columnas dnd_start_hour/dnd_end_hour y la RPC
// should_send_push que respeta la ventana, pero se diseñó para una Edge
// Function (push_dispatcher, Wave 13) que nunca se desplegó: el endpoint vivo
// notify-push NO llama a esa RPC ni lee esa tabla, solo push_prefs. Para no
// dejar dos fuentes de verdad, guardamos la franja en el mismo push_prefs como
// { dnd, dnd_from, dnd_to }. Desde el 24-jul-2026, /api/internal/notify-push
// SÍ lee estos campos y silencia el push dentro de la franja (hora de Madrid;
// la franja puede cruzar la medianoche). La fila de notificación se crea
// igual: solo se calla el aviso del teléfono.
//
// Diseño: cabecera estándar (Screen) y filas agrupadas en tarjetas por sección,
// igual que el menú del perfil, en vez de una lista plana sin jerarquía.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Home, Newspaper, Bell, MessageCircle, Heart, MessageSquare, UserPlus, PartyPopper, Moon, Clock,
  type LucideIcon,
} from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Screen } from '@/components/Screen';
import { Tap, NavRow, SkeletonList, IconCircle } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, FONT } from '@/theme';

const CATEGORIES: { key: string; label: string; note: string; icon: LucideIcon }[] = [
  { key: 'messages', label: 'Mensajes', note: 'Chats nuevos y respuestas', icon: MessageCircle },
  { key: 'crush', label: 'Crush y likes', note: 'Matches, crushes y me gusta', icon: Heart },
  { key: 'comments', label: 'Comentarios', note: 'Respuestas a tus publicaciones', icon: MessageSquare },
  { key: 'follows', label: 'Publicaciones de seguidos', note: 'Cuando alguien a quien sigues publica', icon: UserPlus },
  { key: 'news', label: 'Novedades', note: 'Nuevas publicaciones de Franky', icon: Newspaper },
  { key: 'housing', label: 'Pisos en tu zona', note: 'Alojamientos de la provincia que buscas', icon: Home },
  { key: 'events', label: 'Eventos y planes', note: 'Actividades que te pueden interesar', icon: PartyPopper },
];

// push_prefs mezcla booleanos (categorías) y strings (franja "HH:MM").
type Prefs = Record<string, boolean | string>;

const DEFAULT_FROM = '23:00';
const DEFAULT_TO = '08:00';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const asDate = (v: string) => {
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(v) ? v : DEFAULT_FROM).split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
};

// Rótulo + tarjeta con las filas separadas por hairline: el agrupado que usa
// el menú del perfil, para que todos los ajustes de la app se lean igual.
// Grupo de ajustes v3: rotulo pequeno en mayusculas y filas a sangre
// separadas por una linea fina, sin tarjeta con borde alrededor.
function Group({ title, children, index = 0 }: { title: string; children: React.ReactNode; index?: number }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <FadeIn index={index} style={{ marginBottom: S.lg }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm }]}>{title}</Text>
      <View style={{ borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
        {rows.map((child, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: C.borderLight } : undefined}>{child}</View>
        ))}
      </View>
    </FadeIn>
  );
}

export default function AjustesNotificaciones() {
  const { uid } = useSessionIdentity();
  if (!uid) return <Screen title="Notificaciones" back><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { padding: S.lg }]}>{uid === undefined ? 'Cargando tu sesión…' : 'Inicia sesión para gestionar tus avisos.'}</Text></Screen>;
  return <OwnedNotificationSettings key={uid} owner={uid} />;
}
function OwnedNotificationSettings({ owner }: { owner: string }) {
  const isCurrent = useSessionGuard(owner);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const load = async () => {
    setError(false);
    const { data, error: readError } = await supabase.from('profiles').select('push_prefs').eq('id', owner).maybeSingle();
    if (!isCurrent()) return;
    if (readError || !data) { setError(true); setLoaded(false); return; }
    setPrefs((data.push_prefs ?? {}) as Prefs); setLoaded(true);
  };
  useEffect(() => { void load(); }, [owner]);
  const save = async (next: Prefs) => {
    if (!isCurrent() || busy.current || !loaded) return;
    busy.current = true; setSaving(true);
    const previous = prefs; setPrefs(next);
    const { data, error: saveError } = await supabase.from('profiles').update({ push_prefs: next }).eq('id', owner).select('id');
    if (!isCurrent()) return;
    busy.current = false; setSaving(false);
    if (saveError || !data?.length) { setPrefs(previous); toastError('No se ha guardado el cambio', 'Comprueba tu conexión y vuelve a intentarlo.'); }
    else Haptics.selectionAsync().catch(() => {});
  };

  const allOn = prefs.all !== false;
  const isOn = (k: string) => allOn && prefs[k] !== false;

  const dndOn = prefs.dnd === true;
  const dndFrom = typeof prefs.dnd_from === 'string' ? prefs.dnd_from : DEFAULT_FROM;
  const dndTo = typeof prefs.dnd_to === 'string' ? prefs.dnd_to : DEFAULT_TO;

  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    const which = picking;
    if (Platform.OS === 'android') setPicking(null);
    if (e.type === 'set' && d && which) {
      save({ ...prefs, [which === 'from' ? 'dnd_from' : 'dnd_to']: hhmm(d) });
      if (Platform.OS === 'ios') setPicking(null);
    } else if (e.type === 'dismissed') {
      setPicking(null);
    }
  };

  // Fila con interruptor. Tocar la fila entera equivale a mover el interruptor:
  // el objetivo táctil pasa de 50 px de switch a los 56 px de la fila.
  const SwitchRow = ({ icon, label, note, value, onChange, disabled }: {
    icon: LucideIcon; label: string; note?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
  }) => (
    <View style={{ opacity: disabled ? 0.45 : 1 }}>
      <NavRow icon={icon} title={label} note={note}
        onPress={disabled || saving ? undefined : () => onChange(!value)}
        accessibilityLabel={label}
        right={
          <Switch value={value} onValueChange={disabled || saving ? undefined : onChange} disabled={disabled || saving}
            accessibilityLabel={label}
            trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
        } />
    </View>
  );

  // Fila que muestra una hora ("HH:MM") y abre el selector nativo al tocarla.
  const TimeRow = ({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) => (
    <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}
      accessibilityHint="Abre el selector de hora">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: S.lg, paddingVertical: 12, minHeight: 56 }}>
        <IconCircle icon={Clock} size={38} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>{label}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 16, fontFamily: FONT.heading, color: C.blue }}>{value}</Text>
      </View>
    </Tap>
  );

  return (
    <Screen title="Notificaciones" back>
      {error ? <Tap onPress={load} accessibilityLabel="Reintentar carga de preferencias" style={{ padding: S.lg }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>No se pudieron cargar tus preferencias. Toca para reintentar.</Text></Tap> : !loaded ? (
        <View style={{ paddingTop: S.lg }}><SkeletonList count={4} height={64} /></View>
      ) : (
        <>
          <Group title="General" index={0}>
            <SwitchRow icon={Bell} label="Permitir notificaciones"
              note="Apágalo para silenciarlo todo"
              value={allOn} onChange={(v) => save({ ...prefs, all: v })} />
          </Group>

          <Group title="Qué te avisamos" index={1}>
            {CATEGORIES.map((c) => (
              <SwitchRow key={c.key} icon={c.icon} label={c.label} note={c.note} disabled={!allOn}
                value={isOn(c.key)} onChange={(v) => save({ ...prefs, [c.key]: v })} />
            ))}
          </Group>

          <Group title="No molestar" index={2}>
            <SwitchRow icon={Moon} label="Silenciar en una franja horaria"
              note="No recibirás push durante las horas elegidas"
              value={dndOn} onChange={(v) => save({ ...prefs, dnd: v })} />
            {dndOn ? <TimeRow label="Desde" value={dndFrom} onOpen={() => setPicking('from')} /> : null}
            {dndOn ? <TimeRow label="Hasta" value={dndTo} onOpen={() => setPicking('to')} /> : null}
          </Group>

          {picking ? (
            <DateTimePicker
              value={asDate(picking === 'from' ? dndFrom : dndTo)}
              mode="time" is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPick}
            />
          ) : null}

          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { paddingHorizontal: S.lg, paddingTop: 14, lineHeight: 16 }]}>
            Los avisos silenciados dejan de llegar como push al momento; seguirás
            viéndolos en la campana de la app.
          </Text>
        </>
      )}
    </Screen>
  );
}
