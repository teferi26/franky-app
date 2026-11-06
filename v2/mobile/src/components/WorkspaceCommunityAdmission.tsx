import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useWorkspace } from './WorkspaceProvider';
import { Btn, Card, Pill } from './ui';
import { errorForWorkspace, hasWorkspacePermission } from '@/lib/workspaces';
import { C, F } from '@/theme';

type Admission = { id: string; name: string; status: string; kind: string; created_at: string };
type AdmissionPage = { items: Admission[]; next_cursor: string | null; member_count: number };
const LABELS: Record<string, string> = { requested: 'Solicitud pendiente', invited: 'Invitación pendiente', accepted: 'Miembro', rejected: 'Solicitud rechazada', declined: 'Invitación declinada', revoked: 'Invitación revocada', removed: 'Baja', expired: 'Invitación caducada' };

export function WorkspaceCommunityAdmission({ resourceId }: { resourceId: string }) {
  const { active, run, isCurrent } = useWorkspace();
  const [items, setItems] = useState<Admission[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0); const lock = useRef(false);
  const canRead = hasWorkspacePermission(active, 'members.read'); const canManage = hasWorkspacePermission(active, 'members.manage');
  const load = useCallback(async (next?: string) => {
    if (!active || !canRead) return; const request = ++sequence.current; setLoading(true); setError(null);
    try {
      const data = await run<AdmissionPage>('get_workspace_community_admissions', { p_resource_id: resourceId, p_cursor: next ?? null, p_limit: 30 });
      if (!isCurrent(active.id) || sequence.current !== request) return;
      setItems(previous => next ? [...previous, ...data.items.filter(item => !previous.some(existing => existing.id === item.id))] : data.items);
      setCursor(data.next_cursor); setCount(data.member_count);
    } catch (err) { if (isCurrent(active.id) && sequence.current === request) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id) && sequence.current === request) setLoading(false); }
  }, [active?.id, canRead, isCurrent, resourceId, run]);
  useFocusEffect(useCallback(() => { void load(); return () => { ++sequence.current; }; }, [load]));
  if (!active || !canRead) return null;
  const action = async (name: string, id?: string) => {
    if (lock.current || !canManage || !isCurrent(active.id)) return; lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await run('workspace_community_admission_action', { p_resource_id: resourceId, p_action: name, p_admission_id: id ?? null, p_email: name === 'invite' ? email.trim() : null });
      if (!isCurrent(active.id)) return;
      if (name === 'invite') { setEmail(''); setNotice('La invitación aparece en Comunidades de la cuenta destinataria y caduca en siete días.'); }
      await load();
    } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  return <View style={{ gap: 12, marginBottom: 24 }}>
    <Text style={F.h3}>Miembros y admisión{count === null ? '' : ` · ${count}`}</Text>
    <Text style={F.small}>Las personas que entran en la comunidad no reciben permisos para administrar tu espacio.</Text>
    {canManage && !active.demo_cohort_id ? <Card style={{ gap: 10 }}><Text style={F.body}>Invitar a una cuenta de Franky</Text><Text style={F.small}>Utiliza el correo verificado de la persona. Ella decide si acepta.</Text><TextInput value={email} onChangeText={setEmail} accessibilityLabel="Correo de la persona invitada" placeholder="Correo de la persona invitada" placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none" maxLength={254} style={{ color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12 }} /><Btn label="Crear invitación" disabled={!email.includes('@') || busy} onPress={() => void action('invite')} /></Card> : null}
    {notice ? <Text accessibilityRole="alert" style={F.small}>{notice}</Text> : null}
    {error ? <Card style={{ gap: 10 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Reintentar" variant="secondary" onPress={() => void load()} /></Card> : null}
    {items.map(item => <Card key={item.id} style={{ gap: 10 }}><Text style={F.body}>{item.name}</Text><Pill label={LABELS[item.status] ?? item.status} />{canManage && item.status === 'requested' ? <><Btn label="Aprobar solicitud" disabled={busy} onPress={() => void action('approve', item.id)} /><Btn label="Rechazar solicitud" variant="secondary" disabled={busy} onPress={() => void action('reject', item.id)} /></> : null}{canManage && ['invited', 'accepted'].includes(item.status) ? <Btn label={item.status === 'invited' ? 'Revocar invitación' : 'Dar de baja'} variant="danger" disabled={busy} onPress={() => Alert.alert(item.status === 'invited' ? 'Revocar invitación' : 'Dar de baja', `Se actualizará el acceso de ${item.name} a esta comunidad.`, [{ text: 'Volver', style: 'cancel' }, { text: 'Confirmar', style: 'destructive', onPress: () => void action(item.status === 'invited' ? 'revoke' : 'remove', item.id) }])} /> : null}</Card>)}
    {loading ? <ActivityIndicator color={C.blue} /> : !items.length && !error ? <Text style={F.small}>Aquí aparecerán las solicitudes, invitaciones y miembros.</Text> : null}
    {cursor && !loading ? <Btn label="Ver más personas" variant="secondary" onPress={() => void load(cursor)} /> : null}
  </View>;
}
