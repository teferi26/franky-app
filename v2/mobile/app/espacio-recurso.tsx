import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Pill } from '@/components/ui';
import { statusLabel } from '@/components/WorkspaceScreens';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { WorkspaceCommunityAdmission } from '@/components/WorkspaceCommunityAdmission';
import { WorkspaceModeration } from '@/components/WorkspaceModeration';
import { WorkspaceVisitReschedule } from '@/components/WorkspaceVisitReschedule';
import { WorkspaceHousingFunnel } from '@/components/WorkspaceHousingFunnel';
import { errorForWorkspace, hasWorkspacePermission, RESOURCE_LABELS, type WorkspaceResource, type WorkspaceResourceType } from '@/lib/workspaces';
import { isEditableWorkspaceType } from '@/lib/workspace-form';
import { C, F } from '@/theme';
import { captureSessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { requestPublicationReview } from '@/lib/publication-review';

export default function ResourceScreen() {
  const { active, ready, revision } = useWorkspace(); const { type, id } = useLocalSearchParams<{ type?: string; id?: string }>();
  if (!ready) return <ActivityIndicator color={C.blue} />;
  if (!active) return <Redirect href="/espacios" />;
  if (!type || !Object.hasOwn(RESOURCE_LABELS, type) || !id) return <Screen title="Contenido no disponible" back><Text style={F.small}>Este enlace no identifica un contenido válido.</Text></Screen>;
  return <WorkspaceResourceDetail key={`${active.id}:${revision}:${id}`} type={type as WorkspaceResourceType} id={id} />;
}

function WorkspaceResourceDetail({ type, id }: { type: WorkspaceResourceType; id: string }) {
  const { active, run, isCurrent } = useWorkspace(); const router = useRouter();
  const [item, setItem] = useState<WorkspaceResource | null>(null); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const messageKey = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  useEffect(() => { messageKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }, [body]);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    if (!active) return; const sequence = ++loadSequence.current; setLoading(true); setError(null);
    try { const result = await run<WorkspaceResource>('get_workspace_resource', { p_resource_type: type, p_resource_id: id }); if (isCurrent(active.id) && sequence === loadSequence.current) setItem(result); }
    catch (err) { if (isCurrent(active.id) && sequence === loadSequence.current) { setError(errorForWorkspace(err)); setItem(null); } }
    finally { if (isCurrent(active.id) && sequence === loadSequence.current) setLoading(false); }
  }, [active?.id, run, isCurrent, id, type]);
  useFocusEffect(useCallback(() => { void load(); const timer = type === 'conversation' ? setInterval(() => void load(), 15_000) : null; return () => { if (timer) clearInterval(timer); ++loadSequence.current; }; }, [load, type]));
  if (!active) return null;
  const perform = async (action: string, data: Record<string, unknown> = {}) => {
    if (lock.current || !isCurrent(active.id)) return; lock.current = true; setBusy(true); setError(null); setNotice(null);
    const owner = captureSessionIdentity();
    try {
      const result = await run<WorkspaceResource>('workspace_resource_action', { p_resource_type: type, p_resource_id: id, p_action: action, p_data: ['send', 'reply'].includes(action) ? { ...data, client_request_id: messageKey.current } : data });
      if (!isCurrent(active.id)) return;
      if (action === 'duplicate' && result?.id) { router.replace({ pathname: '/espacio-editar', params: { type, id: result.id } }); return; }
      let replyStatus = result.data?.reply_status;
      if (action === 'reply' && replyStatus === 'pending_review' && typeof result.data.reply_id === 'string') {
        const review = await withOwnedRequest(owner, request => requestPublicationReview(request, result.data.reply_id as string));
        if (!isCurrent(active.id)) return; replyStatus = review === 'approved' ? 'published' : review === 'rejected' ? 'rejected' : 'pending_review';
      }
      if (['send', 'reply'].includes(action)) { setBody(''); messageKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
      setNotice(action === 'send' ? 'Mensaje enviado.' : action === 'reply' ? replyStatus === 'simulated' ? 'Respuesta simulada guardada en esta demostración.' : replyStatus === 'published' ? 'Respuesta publicada como universidad verificada.' : replyStatus === 'rejected' ? 'La respuesta no ha superado la revisión. Revisa las normas antes de preparar otra.' : 'Respuesta recibida. Aparecerá tras superar la revisión de contenido.' : 'Cambio guardado.'); await load();
    } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  const confirm = (action: string, label: string) => Alert.alert(label, action === 'archive' ? 'Dejará de estar disponible en las listas activas. Su historial se conservará.' : 'Se notificará el cambio a las personas afectadas cuando corresponda.', [{ text: 'Volver', style: 'cancel' }, { text: label, style: action === 'archive' || action === 'cancel' ? 'destructive' : 'default', onPress: () => void perform(action) }]);
  const canEdit = hasWorkspacePermission(active, 'content.manage');
  const canModerate = hasWorkspacePermission(active, 'moderation.manage');
  const messages = Array.isArray(item?.data.messages) ? item.data.messages.filter((message): message is Record<string, unknown> => !!message && typeof message === 'object') : [];
  const loadOlder = async () => {
    const cursor = item?.data.messages_cursor as { created_at?: string; id?: string } | null;
    if (lock.current || !cursor?.created_at || !cursor?.id) return; lock.current = true; setBusy(true);
    try {
      const page = await run<{ items: Record<string, unknown>[]; next_cursor: unknown }>('get_workspace_conversation_messages', { p_conversation_id: id, p_before: cursor.created_at, p_before_id: cursor.id, p_limit: 30 });
      if (isCurrent(active.id)) setItem(previous => previous ? { ...previous, data: { ...previous.data, messages: [...page.items, ...messages], messages_cursor: page.next_cursor } } : null);
    } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  return <Screen title={item?.title ?? RESOURCE_LABELS[type]} subtitle={active.name} back refreshing={loading && !!item} onRefresh={() => void load()}>
    {loading && !item ? <ActivityIndicator color={C.blue} /> : null}
    {error ? <Card style={{ gap: 12, marginBottom: 16 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Reintentar" variant="secondary" onPress={() => void load()} /></Card> : null}
    {notice ? <Text accessibilityRole="alert" style={{ color: C.green, marginBottom: 16 }}>{notice}</Text> : null}
    {item ? <>
      <View style={{ alignSelf: 'flex-start', marginBottom: 18 }}><Pill label={statusLabel(item.status)} tone={item.status === 'published' ? 'green' : 'gray'} /></View>
      {item.subtitle ? <Text style={[F.small, { marginBottom: 12 }]}>{item.subtitle}</Text> : null}
      {typeof item.data.description === 'string' ? <Text style={[F.body, { marginBottom: 20 }]}>{item.data.description}</Text> : null}
      {typeof item.data.body === 'string' ? <Card style={{ marginBottom: 20 }}><Text style={F.body}>{item.data.body}</Text></Card> : null}
      {item.starts_at ? <Text style={[F.h3, { marginBottom: 16 }]}>{new Date(item.starts_at).toLocaleString('es-ES')}</Text> : null}
      {type === 'housing' ? <Card style={{ gap: 8, marginBottom: 20 }}><Text style={F.h1}>{String(item.data.price_monthly ?? '—')} €/mes</Text><Text style={F.small}>{String(item.data.city ?? '')} · {String(item.data.bedrooms ?? '—')} habitaciones · {String(item.data.area_m2 ?? '—')} m²</Text></Card> : null}
      {type === 'housing' && canEdit ? <View style={{ marginBottom: 16 }}><Btn label="Interesados y horario de visitas" variant="secondary" onPress={() => router.push({ pathname: '/espacio-vivienda', params: { id } })} /></View> : null}
      {type === 'housing' && (canEdit || hasWorkspacePermission(active, 'finance.read')) ? <View style={{ marginBottom: 16 }}><Btn label="Equipo, inquilinos y contratos" variant="secondary" onPress={() => router.push({ pathname: '/espacio-alquiler', params: { id } })} /></View> : null}
      {type === 'community' ? <WorkspaceCommunityAdmission resourceId={id} /> : null}
      {type === 'event' && hasWorkspacePermission(active, 'resource.read') ? <View style={{ marginBottom: 16 }}><Btn label="Plantillas, lista de espera y devoluciones" variant="secondary" onPress={() => router.push({ pathname: '/espacio-actividad-gestion', params: { resource: id } })} /></View> : null}
      {type === 'housing' && hasWorkspacePermission(active, 'analytics.read') ? <WorkspaceHousingFunnel resourceId={id} /> : null}
      {type === 'visit' && canEdit && ['pending', 'confirmed'].includes(item.status) ? <WorkspaceVisitReschedule bookingId={id} onChanged={load} /> : null}
      {type === 'visit' && hasWorkspacePermission(active, 'finance.read') && (Number(item.data.price_cents ?? 0) > 0 || item.data.payment_status === 'paid') ? <View style={{ marginBottom: 16 }}><Btn label="Revisar pago y devolución" variant="secondary" onPress={() => router.push({ pathname: '/espacio-visita-devolucion', params: { booking: id } })} /></View> : null}
      {type === 'conversation' && item.data.messages_cursor ? <View style={{ marginBottom: 16 }}><Btn label="Ver mensajes anteriores" variant="secondary" busy={busy} onPress={() => void loadOlder()} /></View> : null}
      {type === 'event' && hasWorkspacePermission(active, 'attendees.manage') ? <View style={{ marginBottom: 16 }}><Btn label="Asistentes y control de acceso" variant="secondary" onPress={() => router.push({ pathname: '/espacio-asistentes', params: { eventId: id } })} /></View> : null}
      {isEditableWorkspaceType(type) && canEdit ? <View style={{ gap: 12, marginBottom: 24 }}><Btn label="Editar" onPress={() => router.push({ pathname: type === 'academic' && item.data.academic_target_type ? '/espacio-academico' : '/espacio-editar', params: { type, id } })} />{['housing', 'event', 'venue', 'community'].includes(type) ? <><Btn label="Duplicar como borrador" variant="secondary" disabled={busy} onPress={() => void perform('duplicate')} />{item.status !== 'archived' ? <Btn label="Archivar" variant="danger" disabled={busy} onPress={() => confirm('archive', 'Archivar contenido')} /> : null}</> : null}</View> : null}
      {type === 'visit' && canEdit && !['cancelled', 'completed'].includes(item.status) ? <View style={{ gap: 12 }}>{item.status !== 'confirmed' ? <Btn label="Confirmar visita" busy={busy} onPress={() => void perform('confirm')} /> : <Btn label="Marcar como realizada" busy={busy} onPress={() => void perform('complete')} />}<Btn label="Cancelar visita" variant="danger" disabled={busy} onPress={() => confirm('cancel', 'Cancelar visita')} /></View> : null}
      {type === 'conversation' ? <View style={{ gap: 12 }}>{messages.map((message, index) => <Card key={String(message.id ?? index)} style={{ backgroundColor: message.is_mine ? C.accentSoft : C.surface }}><Text style={F.small}>{typeof message.author_name === 'string' ? message.author_name : 'Conversación del espacio'}</Text><Text style={[F.body, { marginTop: 5 }]}>{String(message.body ?? '')}</Text></Card>)}{canEdit ? <><TextInput accessibilityLabel="Mensaje" placeholder="Escribe una respuesta…" placeholderTextColor={C.muted} value={body} editable={!busy} onChangeText={setBody} multiline maxLength={4000} style={{ minHeight: 90, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.text, textAlignVertical: 'top' }} /><Btn label="Enviar respuesta" busy={busy} disabled={!body.trim()} onPress={() => void perform('send', { body: body.trim() })} /></> : null}</View> : null}
      {type === 'moderation' && canEdit && canModerate && active.kind === 'university' && active.verification_status === 'verified' ? <Card style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>Responder como {active.name}</Text><Text style={F.small}>La respuesta será pública, con la identidad verificada de tu universidad. Pasará por la revisión de contenido habitual y no resolverá automáticamente el reporte.</Text><TextInput accessibilityLabel="Respuesta de la universidad" placeholder="Escribe una respuesta institucional…" placeholderTextColor={C.muted} value={body} editable={!busy} onChangeText={setBody} maxLength={4000} multiline style={{ minHeight: 110, textAlignVertical: 'top', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.text }} /><Btn label="Enviar respuesta institucional" busy={busy} disabled={!body.trim()} onPress={() => void perform('reply', { body: body.trim() })} /></Card> : null}
      {type === 'moderation' && canModerate ? <WorkspaceModeration reportId={id} onChanged={load} /> : null}
    </> : null}
  </Screen>;
}
