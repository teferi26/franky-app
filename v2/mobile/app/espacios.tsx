import { isAccountPanelAllowed } from '@/pro/legacy-panel';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { GraduationCap, Building2, UsersRound, Store, Check, Plus } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Card, Chip, Pill } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { useWorkspaceMfa } from '@/components/WorkspaceMfa';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { errorForWorkspace, workspaceRpc, WORKSPACE_LABELS, type Workspace, type WorkspaceKind } from '@/lib/workspaces';
import { C, F } from '@/theme';

const OPTIONS = [
  { kind: 'student', title: 'Uso personal', text: 'Estudiantes y otras personas: estudios, ciudad, alojamiento y planes.', Icon: GraduationCap },
  { kind: 'housing', title: 'Propietario / Inmobiliaria', text: 'Gestiona pisos, interesados y visitas.', Icon: Building2 },
  { kind: 'community', title: 'Comunidad / Organizador', text: 'Organiza actividades y cuida de tu comunidad.', Icon: UsersRound },
  { kind: 'leisure', title: 'Ocio / Negocio', text: 'Da a conocer tus locales y actividades.', Icon: Store },
] as const;

export default function WorkspacesScreen() {
  const { uid } = useSessionIdentity();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  // Los espacios se abren desde Franky Pro; esta pantalla queda para el alta
  // y para la cuenta, el equipo y la facturación.
  if (!onboarding && !isAccountPanelAllowed()) return <Redirect href={'/pro' as never} />;
  return <WorkspacesContent key={uid ?? 'guest'} />;
}

function WorkspacesContent() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const context = useWorkspace();
  const mfa = useWorkspaceMfa({ accountOnly: true });
  const [kind, setKind] = useState<Exclude<WorkspaceKind, 'university'> | null>(null);
  const [name, setName] = useState(''); const [city, setCity] = useState('');
  const [subtype, setSubtype] = useState('individual');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<{ id: string; organization_name: string; role: string }[]>([]);
  useEffect(() => {
    let mounted = true; const owner = captureSessionIdentity();
    if (owner) void workspaceRpc<typeof invitations>('list_workspace_invitations', {}, owner)
      .then(items => { if (mounted && isCurrentSessionIdentity(owner)) setInvitations(items); }).catch(() => {});
    return () => { mounted = false; };
  }, [context.ready]);
  const accept = async (id: string) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(null);
    const owner = captureSessionIdentity();
    try {
      await workspaceRpc('accept_workspace_invitation', { p_invitation_id: id }, owner);
      if (!owner || !isCurrentSessionIdentity(owner)) return;
      setInvitations(items => items.filter(item => item.id !== id)); await context.refresh();
    } catch (err) { if (owner && isCurrentSessionIdentity(owner)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  const select = async (id: string | null) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    const owner = captureSessionIdentity();
    try {
      await context.select(id);
      if (!owner || !isCurrentSessionIdentity(owner)) return;
      if (id) router.replace('/(workspace)/resumen');
      else if (onboarding === '1') router.replace({ pathname: '/tour', params: { next: '/onboarding-perfil' } });
      else router.replace('/(tabs)/feed');
    } catch (err) { if (owner && isCurrentSessionIdentity(owner)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  const create = async () => {
    if (lock.current || !kind || !name.trim() || !context.canCreate) return;
    lock.current = true; setBusy(true); setError(null);
    const owner = captureSessionIdentity();
    try {
      const result = await workspaceRpc<Workspace>('create_workspace', {
        p_kind: kind, p_name: name.trim(), p_subtype: kind === 'housing' ? subtype : kind === 'community' ? 'community' : 'business', p_city: city.trim() || null,
      }, owner);
      await context.refresh();
      if (!owner || !isCurrentSessionIdentity(owner)) return;
      await context.select(result.id);
      if (isCurrentSessionIdentity(owner)) router.replace(kind === 'leisure' ? '/card-sector' : '/(workspace)/resumen');
    } catch (err) { if (owner && isCurrentSessionIdentity(owner)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Screen title={onboarding ? '¿Cómo usarás Franky?' : 'Tus espacios'} back={!onboarding}>
    <Text style={[F.small, { marginBottom: 20 }]}>Una cuenta para todo. Cambia de espacio cuando quieras; cada equipo tiene sus propios permisos y herramientas.</Text>
    {!context.ready ? <ActivityIndicator color={C.blue} /> : <>
      {invitations.map(invitation => <Card key={invitation.id} style={{ marginBottom: 16, gap: 10 }}><Text style={F.h3}>Invitación a {invitation.organization_name}</Text><Text style={F.small}>Se ha invitado a tu correo verificado a formar parte de este equipo.</Text><Btn label="Aceptar invitación" busy={busy} onPress={() => ['admin', 'finance'].includes(invitation.role) ? void mfa.protect(() => accept(invitation.id)) : void accept(invitation.id)} /></Card>)}
      {mfa.node}
      {context.workspaces.map(workspace => <Card key={workspace.id} onPress={busy ? undefined : () => void select(workspace.id)} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Building2 size={23} color={C.blue} /><View style={{ flex: 1 }}><Text style={F.h3}>{workspace.name}</Text><Text style={F.small}>{WORKSPACE_LABELS[workspace.kind]}{workspace.city ? ` · ${workspace.city}` : ''}</Text></View>{context.active?.id === workspace.id ? <Check color={C.blue} size={20} /> : null}</View>
        {workspace.demo_cohort_id ? <View style={{ marginTop: 10 }}><Pill label="Demostración · datos ficticios" tone="orange" /></View> : null}
      </Card>)}
      {(context.workspaces.length > 0 || !onboarding) ? <Text style={[F.h3, { marginTop: 20, marginBottom: 14 }]}>Elige tu experiencia</Text> : null}
      {OPTIONS.filter(option => option.kind === 'student' ? !context.workspaces.some(workspace => !!workspace.demo_cohort_id) : context.canCreate).map(option => <Card key={option.kind} onPress={busy ? undefined : () => {
        if (option.kind === 'student') void select(null);
        else { setKind(option.kind); setError(null); }
      }} style={{ marginBottom: 12, borderColor: kind === option.kind ? C.blue : C.border }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}><option.Icon size={27} color={C.blue} /><View style={{ flex: 1 }}><Text style={F.h3}>{option.title}</Text><Text style={[F.small, { marginTop: 4 }]}>{option.text}</Text></View></View>
      </Card>)}
      {kind && context.canCreate ? <Card style={{ gap: 14, marginTop: 10 }}>
        <Text style={F.h3}>Tu nuevo espacio</Text>
        <Text style={F.small}>El nombre identifica a tu organización. Crear un espacio no concede una insignia de verificación.</Text>
        {kind === 'housing' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Chip label="Particular" active={subtype === 'individual'} onPress={() => setSubtype('individual')} /><Chip label="Inmobiliaria" active={subtype === 'agency'} onPress={() => setSubtype('agency')} /></View> : null}
        <TextInput accessibilityLabel="Nombre del espacio" placeholder="Nombre del espacio" placeholderTextColor={C.muted} value={name} maxLength={120} onChangeText={setName} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, color: C.text }} />
        <TextInput accessibilityLabel="Ciudad" placeholder="Ciudad" placeholderTextColor={C.muted} value={city} maxLength={100} onChangeText={setCity} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, color: C.text }} />
        <Btn label="Crear mi espacio" icon={Plus} busy={busy} disabled={name.trim().length < 2} onPress={() => void create()} />
      </Card> : null}
      <Text style={[F.small, { marginVertical: 20 }]}>Las universidades reciben su acceso institucional directamente de Franky. Si has recibido una invitación, aparecerá aquí al aceptarla.</Text>
      {context.error ? <><Text accessibilityRole="alert" style={{ color: C.errorText }}>{context.error}</Text><Btn label="Volver a comprobar" variant="secondary" onPress={() => void context.refresh()} /></> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: C.errorText, marginTop: 12 }}>{error}</Text> : null}
    </>}
  </Screen>;
}
