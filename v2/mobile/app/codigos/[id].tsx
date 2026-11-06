// ─── Códigos de descuento del evento (mejora 77) ─────────────────────────
// Solo el organizador del evento puede ver y gestionar sus códigos: crear,
// listar y borrar. La validación real al comprar la hace la RPC
// check_discount_code (migración 136); aquí solo se administran las filas de
// event_discount_codes. Si la migración no está aplicada todavía en
// producción, la pantalla lo dice sin romperse (fail-soft).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Tag, Trash2, Lock, Percent, Euro, CalendarDays } from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Btn, Card, Chip, EmptyState, Skeleton, Tap, Pill } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { dateShort } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';
import type { EventItem } from '@/lib/types';

type DiscountCode = {
  id: string; event_id: string; code: string; kind: 'percent' | 'fixed';
  value: number; max_uses: number | null; used_count: number;
  expires_at: string | null; created_at: string;
};

// 'percent' guarda puntos porcentuales; 'fixed' guarda céntimos (igual que la
// RPC check_discount_code, migración 136).
function valueLabel(c: DiscountCode): string {
  return c.kind === 'percent'
    ? `${c.value}% de descuento`
    : `${(c.value / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })} € de descuento`;
}

export default function CodigosDescuento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = String(id);

  const [event, setEvent] = useState<EventItem | null | undefined>(undefined);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [codesAvailable, setCodesAvailable] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Formulario de creación ──
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresEnabled, setExpiresEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: { user } }, { data: ev, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      ]);
      if (error) throw error;
      const evRow = (ev as EventItem) ?? null;
      setEvent(evRow);
      const mine = !!user && !!evRow && evRow.organizer_id === user.id;
      setIsOrganizer(mine);
      if (!mine) { setCodes([]); return; }
      const { data: rows, error: codesError } = await supabase
        .from('event_discount_codes').select('*')
        .eq('event_id', eventId).order('created_at', { ascending: false });
      if (codesError) throw codesError;
      setCodesAvailable(true);
      setCodes((rows as DiscountCode[]) ?? []);
    } catch {
      // La tabla puede no existir todavía (migración 136 sin aplicar): no
      // rompemos la pantalla, solo avisamos de que la función no está lista.
      setCodesAvailable(false);
      setCodes([]);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const onPickExpires = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (e.type === 'set' && d) setExpiresAt(d);
  };

  const resetForm = () => {
    setCode('');
    setKind('percent');
    setValue('');
    setMaxUses('');
    setExpiresEnabled(false);
  };

  const create = async () => {
    // Validaciones sin decisión que tomar: toast, no un modal que hay que cerrar.
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3) {
      toastError('Código demasiado corto', 'Usa al menos 3 caracteres, por ejemplo BIENVENIDA10.');
      return;
    }
    const numValue = Number(value.replace(',', '.'));
    if (!numValue || numValue <= 0) {
      toastError('Falta el valor', 'Indica cuánto descuenta el código.');
      return;
    }
    if (kind === 'percent' && numValue > 100) {
      toastError('Porcentaje no válido', 'Un descuento por porcentaje no puede superar el 100%.');
      return;
    }
    const maxUsesNum = maxUses.trim() ? parseInt(maxUses, 10) : null;
    if (maxUses.trim() && (!maxUsesNum || maxUsesNum <= 0)) {
      toastError('Usos no válidos', 'Pon un número mayor que 0, o deja el campo vacío para usos ilimitados.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('event_discount_codes').insert({
        event_id: eventId,
        code: trimmed,
        kind,
        value: kind === 'percent' ? Math.round(numValue) : Math.round(numValue * 100),
        max_uses: maxUsesNum,
        expires_at: expiresEnabled ? expiresAt.toISOString() : null,
      });
      if (error) {
        const dup = error.code === '23505' || /duplicate/i.test(error.message ?? '');
        toastError('No se pudo crear', dup ? 'Ya existe un código igual para este evento.' : 'Inténtalo de nuevo en unos segundos.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(`Código ${trimmed} creado`, 'Ya se puede usar al comprar entradas.');
      resetForm();
      await load();
    } catch {
      toastError('No se pudo crear', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Borrar sí es destructivo e irreversible: Alert con dos botones.
  const remove = (c: DiscountCode) => {
    Alert.alert('Borrar código', `¿Seguro que quieres borrar "${c.code}"? Dejará de funcionar al momento.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          try {
            // .select('id'): un DELETE que la RLS filtra no da error, borra 0 filas.
            const { data, error } = await supabase.from('event_discount_codes').delete().eq('id', c.id).select('id');
            if (error || data?.length !== 1) { toastError('No se pudo borrar', 'Inténtalo de nuevo en unos segundos.'); await load(); return; }
            toastInfo(`Código ${c.code} borrado`);
            await load();
          } catch {
            toastError('No se pudo borrar', 'Revisa tu conexión e inténtalo de nuevo.');
          }
        },
      },
    ]);
  };

  if (event === undefined || codes === null) {
    return (
      <Screen title="Códigos de descuento" back>
        {/* Esqueleto con la silueta real: la tarjeta del formulario y la lista. */}
        <View style={{ marginTop: S.lg }}>
          <Skeleton height={340} radius={R.lg} />
          <Skeleton height={96} radius={R.lg} />
          <Skeleton height={96} radius={R.lg} />
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen title="Códigos de descuento" back>
        <EmptyState icon={Tag} title="Evento no encontrado"
          subtitle="Puede que ya no esté disponible, o que falle tu conexión."
          cta="Reintentar" onCta={refresh} />
      </Screen>
    );
  }

  if (!isOrganizer) {
    return (
      <Screen title="Códigos de descuento" back>
        <EmptyState icon={Lock} title="No disponible"
          subtitle="Solo el organizador de este evento puede gestionar sus códigos de descuento." />
      </Screen>
    );
  }

  // Campo estándar del kit: superficie C.input, radio R.md y 15 px.
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md,
    paddingHorizontal: 14, paddingVertical: 13, minHeight: 48, fontSize: 15, color: C.text,
  } as const;

  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>{children}</Text>
  );

  return (
    <Screen title="Códigos de descuento" subtitle={event.title} back refreshing={refreshing} onRefresh={refresh}>
      <View style={{ padding: S.lg, gap: 16 }}>
        {!codesAvailable ? (
          <View style={{ backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 14 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Aún no disponible</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>Esta función llegará muy pronto a tu evento.</Text>
          </View>
        ) : (
          <>
            <Card style={{ marginHorizontal: 0, marginBottom: 0, gap: 14 }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Crear código</Text>
              <View>
                <Label>Código</Label>
                <TextInput value={code} onChangeText={setCode} placeholder="BIENVENIDA10"
                  placeholderTextColor={C.muted} autoCapitalize="characters" autoCorrect={false}
                  accessibilityLabel="Código" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  maxLength={30} style={[input, { fontFamily: FONT.semibold, letterSpacing: 0.6 }]} />
              </View>
              <View>
                <Label>Tipo de descuento</Label>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip label="Porcentaje" icon={Percent} accessibilityRole="tab" active={kind === 'percent'} onPress={() => setKind('percent')} />
                  <Chip label="Importe fijo" icon={Euro} accessibilityRole="tab" active={kind === 'fixed'} onPress={() => setKind('fixed')} />
                </View>
              </View>
              <View>
                <Label>{kind === 'percent' ? 'Porcentaje (1-100)' : 'Importe en euros'}</Label>
                <TextInput value={value} onChangeText={setValue}
                  placeholder={kind === 'percent' ? '10' : '5,00'}
                  accessibilityLabel={kind === 'percent' ? 'Porcentaje de descuento' : 'Importe de descuento en euros'}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} keyboardType="decimal-pad" style={input} />
              </View>
              <View>
                <Label>Usos máximos (opcional)</Label>
                <TextInput value={maxUses} onChangeText={setMaxUses} placeholder="Ilimitados"
                  accessibilityLabel="Usos máximos" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  placeholderTextColor={C.muted} keyboardType="number-pad" style={input} />
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Caducidad (opcional)</Text>
                  <Chip label={expiresEnabled ? 'Quitar' : 'Añadir'} active={expiresEnabled} onPress={() => setExpiresEnabled(v => !v)} />
                </View>
                {expiresEnabled ? (
                  <View style={{ marginTop: 8 }}>
                    <Btn small variant="secondary" icon={CalendarDays}
                      label={`Caduca el ${dateShort(expiresAt.toISOString())}`} onPress={() => setShowDatePicker(true)} />
                    {showDatePicker ? (
                      <DateTimePicker value={expiresAt} mode="date" minimumDate={new Date()}
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickExpires} />
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Btn full busy={saving} label="Crear código" onPress={create} />
            </Card>

            <View>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { marginBottom: 10 }]}>Tus códigos</Text>
              {codes.length === 0 ? (
                <EmptyState compact icon={Tag} title="Sin códigos todavía"
                  subtitle="Crea uno arriba: por ejemplo, un 10% para los primeros que compren." />
              ) : (
                <View style={{ gap: 10 }}>
                  {codes.map((c, i) => {
                    const exhausted = c.max_uses != null && c.used_count >= c.max_uses;
                    const expired = c.expires_at != null && new Date(c.expires_at).getTime() < Date.now();
                    const inactive = exhausted || expired;
                    return (
                      <FadeIn key={c.id} index={i} distance={10}>
                      <Card style={{ marginHorizontal: 0, marginBottom: 0, gap: 6, opacity: inactive ? 0.72 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 17, fontFamily: FONT.heading, color: C.text, letterSpacing: 0.8, fontVariant: ['tabular-nums'] }}>{c.code}</Text>
                          {inactive ? <Pill label={expired ? 'Caducado' : 'Usos agotados'} tone="red" /> : <Pill label="Activo" tone="green" />}
                          <View style={{ flex: 1 }} />
                          <Tap onPress={() => remove(c)} hitSlop={8} accessibilityLabel={`Borrar el código ${c.code}`}
                            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={18} color={C.error} strokeWidth={1.9} />
                          </Tap>
                        </View>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text }]}>{valueLabel(c)}</Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                          {c.used_count} usado{c.used_count === 1 ? '' : 's'}
                          {c.max_uses != null ? ` de ${c.max_uses}` : ' · sin límite de usos'}
                          {c.expires_at ? ` · caduca el ${dateShort(c.expires_at)}` : ''}
                        </Text>
                      </Card>
                      </FadeIn>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
