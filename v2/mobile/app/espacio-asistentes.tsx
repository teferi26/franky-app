import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, AppState } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Pill } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { WorkspaceEventInvitations } from '@/components/WorkspaceEventInvitations';
import { errorForWorkspace, hasWorkspacePermission } from '@/lib/workspaces';
import { C, F } from '@/theme';

type Attendee = { id: string; name: string; status: string; checked_in_at: string | null };
export default function AttendeesScreen() {
  const { active, ready, revision } = useWorkspace(); const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  if (!ready) return <ActivityIndicator color={C.blue} />;
  if (!active) return <Redirect href="/espacios" />;
  if (!eventId || !hasWorkspacePermission(active, 'attendees.manage')) return <Screen title="Asistentes" back><Text style={F.small}>No tienes permiso para gestionar los accesos de esta actividad.</Text></Screen>;
  return <Attendees key={`${active.id}:${revision}:${eventId}`} eventId={eventId} />;
}
function Attendees({ eventId }: { eventId: string }) {
  const { active, run, isCurrent } = useWorkspace();
  const [items, setItems] = useState<Attendee[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null); const [result, setResult] = useState<string | null>(null);
  const [camera, setCamera] = useState(false); const [focused, setFocused] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const load = useCallback(async (next?: string) => {
    if (!active) return; setLoading(true);
    try { const page = await run<{ items: Attendee[]; next_cursor: string | null }>('get_workspace_attendees', { p_event_id: eventId, p_cursor: next ?? null, p_limit: 50 }); if (isCurrent(active.id)) { setItems(previous => next ? [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))] : page.items); setCursor(page.next_cursor); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id)) setLoading(false); }
  }, [active?.id, run, isCurrent, eventId]);
  useFocusEffect(useCallback(() => { setFocused(true); void load(); const app = AppState.addEventListener('change', state => { if (state !== 'active') setCamera(false); }); return () => { setFocused(false); setCamera(false); app.remove(); }; }, [load]));
  if (!active) return null;
  const checkIn = async (attendeeId: string | null, token: string | null) => {
    if (lock.current || !isCurrent(active.id)) return;
    lock.current = true; setBusy(true); setCamera(false); setError(null); setResult(null);
    try {
      const response = await run<{ status: string; ok?: boolean }>('check_in_workspace_attendee', { p_event_id: eventId, p_attendee_id: attendeeId, p_qr_token: token });
      if (!isCurrent(active.id)) return;
      if (response.status === 'already_used' || response.status === 'already_checked_in') setResult('Esta entrada ya se había utilizado. No se ha registrado otro acceso.');
      else if (response.status === 'used' || response.status === 'checked_in' || response.ok) setResult('Acceso validado. Asistencia registrada.');
      else setError('Esta entrada no permite el acceso a la actividad. Comprueba su estado.');
      await load();
    } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  const openCamera = async () => {
    const access = permission?.granted ? permission : await requestPermission();
    if (!isCurrent(active.id)) return;
    if (access.granted) { setError(null); setResult(null); setCamera(true); }
    else setError('Permite el acceso a la cámara para leer códigos QR. También puedes validar desde la lista.');
  };
  return <Screen title="Asistentes y accesos" subtitle={active.name} back refreshing={loading && items.length > 0} onRefresh={() => void load()}>
    <Text style={[F.small, { marginBottom: 18 }]}>Cada entrada permite un único acceso. La validación queda registrada con tu cuenta y requiere conexión.</Text>
    <Btn label={camera ? 'Cerrar cámara' : 'Escanear entrada QR'} busy={busy} onPress={() => camera ? setCamera(false) : void openCamera()} />
    {camera && focused && permission?.granted ? <View style={{ height: 280, borderRadius: 20, overflow: 'hidden', marginVertical: 18 }}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scan => { if (scan.data.length <= 2048) void checkIn(null, scan.data); }} /></View> : null}
    {result ? <Card style={{ marginVertical: 16 }}><Text accessibilityRole="alert" style={{ color: C.blue }}>{result}</Text></Card> : null}
    {error ? <Card style={{ gap: 12, marginVertical: 16 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Actualizar asistentes" variant="secondary" onPress={() => { setError(null); void load(); }} /></Card> : null}
    {loading && !items.length ? <ActivityIndicator color={C.blue} style={{ margin: 20 }} /> : null}
    {!loading && !error && !items.length ? <Text style={[F.small, { marginVertical: 20 }]}>Todavía no hay inscripciones en esta actividad.</Text> : null}
    <View style={{ marginTop: 20, gap: 12 }}>{items.map(item => <Card key={item.id} style={{ gap: 10 }}><Text style={F.h3}>{item.name || 'Asistente'}</Text><View style={{ alignSelf: 'flex-start' }}><Pill label={item.checked_in_at || item.status === 'used' ? 'Asistencia validada' : item.status === 'valid' ? 'Pendiente de entrar' : 'Entrada no disponible'} tone={item.checked_in_at ? 'green' : 'gray'} /></View>{item.checked_in_at ? <Text style={F.small}>{new Date(item.checked_in_at).toLocaleString('es-ES')}</Text> : item.status === 'valid' ? <Btn label="Validar acceso" variant="secondary" small disabled={busy} onPress={() => Alert.alert('Validar acceso', `Registrar la entrada de ${item.name || 'esta persona'}.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Validar', onPress: () => void checkIn(item.id, null) }])} /> : null}</Card>)}</View>
    {cursor ? <View style={{ marginTop: 18 }}><Btn label="Cargar más" variant="secondary" busy={loading} onPress={() => void load(cursor)} /></View> : null}
    <WorkspaceEventInvitations eventId={eventId} />
  </Screen>;
}
