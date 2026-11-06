import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, View, type ViewToken } from 'react-native';
import { Header } from '@/components/Screen';
import { Btn, Card, Pill } from '@/components/ui';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { captureSessionIdentity } from '@/lib/session';
import { workspaceRpc } from '@/lib/workspaces';
import { cityContentError, trackCityPost } from '@/lib/city-content';
import { C, F } from '@/theme';
import type { CityCursor, CityPage, CityPost } from '../../shared/city-content';

export default function CityNews() {
  const owner = useSessionOwner();
  return <CityFeed key={owner ? `${owner.userId}:${owner.generation}` : 'signed-out'} />;
}
function CityFeed() {
  const [city, setCity] = useState(''), [selected, setSelected] = useState('');
  const [items, setItems] = useState<CityPost[]>([]), [cursor, setCursor] = useState<CityCursor | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [expanded, setExpanded] = useState<string | null>(null);
  const [report, setReport] = useState<CityPost | null>(null), [reason, setReason] = useState('');
  const lock = useRef(false), mounted = useRef(true), sequence = useRef(0), seen = useRef(new Set<string>()), owner = useRef(captureSessionIdentity()), list = useRef<FlatList<CityPost>>(null);
  useEffect(() => () => { mounted.current = false; sequence.current++; }, []);
  const viewable = useRef(({ viewableItems }: { viewableItems: ViewToken<CityPost>[] }) => {
    for (const { item, isViewable } of viewableItems) if (mounted.current && isViewable && !seen.current.has(item.id)) { seen.current.add(item.id); void trackCityPost(item.id, 'view', owner.current); }
  }).current;
  const load = useCallback(async (more = false) => {
    if (lock.current || (!more && city.trim().length < 2)) return;
    const version = ++sequence.current, target = more ? selected : city.trim();
    lock.current = true; setBusy(true); setError('');
    if (!more) { setItems([]); setCursor(null); setSelected(target); seen.current.clear(); }
    try {
      const page = await workspaceRpc<CityPage>('get_city_workspace_posts', { p_city: target, p_cursor: more ? cursor?.id ?? null : null, p_cursor_sponsored: more ? cursor?.sponsored ?? false : false, p_limit: 20 }, owner.current);
      if (mounted.current && version === sequence.current) { setItems(old => more ? [...old, ...page.items] : page.items); setCursor(page.next_cursor); }
    } catch (err) { if (mounted.current && version === sequence.current) setError(cityContentError(err)); }
    finally { lock.current = false; if (mounted.current && version === sequence.current) setBusy(false); }
  }, [city, selected, cursor]);
  const hide = async (item: CityPost, isReport = false) => {
    if (lock.current || (isReport && reason.trim().length < 5)) return;
    if (!mounted.current) return; lock.current = true; setBusy(true); setError('');
    try {
      await workspaceRpc(isReport ? 'report_city_workspace_post' : 'mute_city_workspace_org', { p_resource_id: item.id, ...(isReport ? { p_reason: reason.trim() } : {}) }, owner.current);
      if (mounted.current) { setItems(old => old.filter(row => isReport ? row.id !== item.id : row.organization_id !== item.organization_id)); setReport(null); setReason(''); }
    } catch (err) { if (mounted.current) setError(cityContentError(err)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: C.bg }}><Header title="Novedades de tu ciudad" back />
    <FlatList ref={list} data={items} keyExtractor={item => item.id} contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
      initialNumToRender={5} maxToRenderPerBatch={5} windowSize={9} refreshing={busy} onRefresh={() => void load()}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 800 }} onViewableItemsChanged={viewable}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 20 }}><Text style={F.h2}>La ciudad, desde dentro</Text><Text style={F.small}>Propuestas y novedades de comunidades y negocios. Tú eliges dónde descubrirlas.</Text>
        <TextInput accessibilityLabel="Ciudad" value={city} onChangeText={setCity} maxLength={100} placeholder="Por ejemplo, Alicante" placeholderTextColor={C.muted} returnKeyType="search" onSubmitEditing={() => void load()} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, color: C.text }} />
        <Btn label="Buscar novedades" disabled={city.trim().length < 2} busy={busy} onPress={() => void load()} />
        {!!error && <Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text>}
        {report && <Card style={{ gap: 12 }}><Text style={F.h3}>Reportar publicación</Text><Text style={F.small}>{report.title}</Text><TextInput accessibilityLabel="Motivo del reporte" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Cuéntanos qué debemos revisar" placeholderTextColor={C.muted} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, color: C.text, minHeight: 80 }} /><Btn label="Enviar reporte" disabled={reason.trim().length < 5} busy={busy} onPress={() => void hide(report, true)} /><Btn label="Cancelar" variant="secondary" onPress={() => { setReport(null); setReason(''); }} /></Card>}
      </View>}
      ListEmptyComponent={!busy && selected && !error ? <Text style={F.small}>Todavía no hay publicaciones revisadas para {selected}. Puedes probar otra ciudad.</Text> : null}
      ListFooterComponent={<View style={{ marginTop: 10 }}>{busy ? <ActivityIndicator color={C.blue} /> : cursor ? <Btn label="Cargar más" variant="secondary" onPress={() => void load(true)} /> : null}</View>}
      renderItem={({ item }) => <Card style={{ gap: 13, marginBottom: 18 }}><Text style={[F.small, { color: C.blue }]}>{item.organization_name}{item.verified ? ' · Verificado' : ''}</Text>{item.sponsored && <Pill label="Patrocinado" />}<Text style={F.h2}>{item.title}</Text><Text style={F.body} numberOfLines={expanded === item.id ? undefined : 4}>{item.body}</Text><Text style={F.small}>{item.city} · {new Date(item.published_at).toLocaleDateString('es-ES')}{item.minimum_age === '18' ? ' · Mayores de 18 años' : ''}</Text><Btn label={expanded === item.id ? 'Ver menos' : 'Leer publicación'} variant="secondary" onPress={() => { setExpanded(expanded === item.id ? null : item.id); void trackCityPost(item.id, 'open', owner.current); }} /><View style={{ flexDirection: 'row', gap: 10 }}><Btn label="Ocultar espacio" variant="secondary" small onPress={() => Alert.alert('Ocultar espacio', `Dejarás de ver las publicaciones de ${item.organization_name}.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Ocultar', onPress: () => void hide(item) }])} /><Btn label="Reportar" variant="secondary" small onPress={() => { setReport(item); setReason(''); list.current?.scrollToOffset({ offset: 0, animated: true }); }} /></View></Card>}
    />
  </View>;
}
