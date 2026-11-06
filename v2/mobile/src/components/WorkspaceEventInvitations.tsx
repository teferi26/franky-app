import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useWorkspace } from './WorkspaceProvider';
import { Btn, Card, Pill } from './ui';
import { errorForWorkspace, type WorkspaceResource } from '@/lib/workspaces';
import { C, F } from '@/theme';
type Invitation = { id: string; name: string; status: 'invited' | 'revoked' | 'expired'; expires_at: string };
export function WorkspaceEventInvitations({ eventId }: { eventId: string }) {
  const { active, run, isCurrent } = useWorkspace();
  const [items, setItems] = useState<Invitation[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false); const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0); const lock = useRef(false);
  const load = useCallback(async (next?: string) => {
    if (!active) return; const request = ++sequence.current; setLoading(true); setError(null);
    try {
      const [resource, page] = await Promise.all([
        run<WorkspaceResource>('get_workspace_resource', { p_resource_type: 'event', p_resource_id: eventId }),
        run<{ items: Invitation[]; next_cursor: string | null }>('get_workspace_event_invitations', { p_event_id: eventId, p_cursor: next ?? null, p_limit: 30 }),
      ]);
      if (!isCurrent(active.id) || request !== sequence.current) return;
      setEnabled((resource.published_data ?? resource.data).audience === 'invited' && resource.status === 'published');
      setItems(previous => next ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items); setCursor(page.next_cursor);
    } catch (err) { if (isCurrent(active.id) && request === sequence.current) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id) && request === sequence.current) setLoading(false); }
  }, [active?.id, run, isCurrent, eventId]);
  useFocusEffect(useCallback(() => { void load(); return () => { ++sequence.current; }; }, [load]));
  if (!active) return null;
  const action = async (name: 'invite' | 'revoke', id?: string) => {
    if (lock.current || !isCurrent(active.id)) return; lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      await run('workspace_event_invitation_action', { p_event_id: eventId, p_action: name, p_invitation_id: id ?? null, p_email: name === 'invite' ? email.trim() : null });
      if (!isCurrent(active.id)) return;
      if (name === 'invite') { setEmail(''); setNotice('Cuenta autorizada. La persona ya puede inscribirse en la actividad mientras haya plazas.'); }
      await load();
    } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  if (!enabled && !items.length && !error) return loading ? <ActivityIndicator color={C.blue} /> : null;
  return <View style={{ gap: 12, marginTop: 28 }}><Text style={F.h3}>Invitaciones a la actividad</Text><Text style={F.small}>Una invitación autoriza a inscribirse; no reserva una plaza ni cobra una entrada. Revocarla impide nuevos accesos y no devuelve automáticamente un pago.</Text>
    {enabled && !active.demo_cohort_id ? <Card style={{ gap: 10 }}><TextInput accessibilityLabel="Correo de la persona invitada" value={email} onChangeText={setEmail} placeholder="Correo verificado en Franky" placeholderTextColor={C.muted} keyboardType="email-address" autoCapitalize="none" editable={!busy} maxLength={254} style={{ color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12 }} /><Btn label="Autorizar invitación" busy={busy} disabled={!email.includes('@')} onPress={() => void action('invite')} /></Card> : null}
    {notice ? <Text accessibilityRole="alert" style={F.small}>{notice}</Text> : null}{error ? <Card style={{ gap: 10 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Actualizar invitaciones" variant="secondary" onPress={() => void load()} /></Card> : null}
    {items.map(item => <Card key={item.id} style={{ gap: 10 }}><Text style={F.body}>{item.name}</Text><Pill label={item.status === 'invited' ? 'Invitación vigente' : item.status === 'expired' ? 'Caducada' : 'Revocada'} /><Text style={F.small}>Válida hasta {new Date(item.expires_at).toLocaleString('es-ES')}</Text>{item.status === 'invited' ? <Btn label="Revocar invitación" variant="danger" disabled={busy} onPress={() => Alert.alert('Revocar invitación', `Se impedirá el acceso de ${item.name}. Si tiene un pago, revisa su devolución por separado.`, [{ text: 'Volver', style: 'cancel' }, { text: 'Revocar', style: 'destructive', onPress: () => void action('revoke', item.id) }])} /> : null}</Card>)}
    {loading ? <ActivityIndicator color={C.blue} /> : !items.length && !error ? <Text style={F.small}>Todavía no has autorizado ninguna cuenta.</Text> : null}{cursor ? <Btn label="Más invitaciones" variant="secondary" disabled={loading} onPress={() => void load(cursor)} /> : null}
  </View>;
}
