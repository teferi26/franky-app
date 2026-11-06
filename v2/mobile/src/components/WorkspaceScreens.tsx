import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeftRight, Plus, ChevronRight, RefreshCw, UsersRound, ShieldCheck } from 'lucide-react-native';
import { Screen } from './Screen';
import { Btn, Card, Pill, Tap, Chip } from './ui';
import { useWorkspace } from './WorkspaceProvider';
import { useWorkspaceMfa } from './WorkspaceMfa';
import { errorForWorkspace, hasWorkspacePermission, RESOURCE_LABELS, ROLE_LABELS, WORKSPACE_LABELS, type WorkspaceDashboard, type WorkspaceMember, type WorkspaceResource, type WorkspaceResourceType } from '@/lib/workspaces';
import { C, F } from '@/theme';

export function WorkspaceSwitch() {
  const router = useRouter();
  return <Tap accessibilityLabel="Cambiar de espacio" onPress={() => router.push('/espacios')} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><ArrowLeftRight color={C.blue} size={22} /></Tap>;
}

function ErrorNotice({ message, retry }: { message: string | null; retry(): void }) {
  if (!message) return null;
  return <Card style={{ gap: 12, marginVertical: 12 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{message}</Text><Btn label="Reintentar" variant="secondary" small icon={RefreshCw} onPress={retry} /></Card>;
}

export function WorkspaceHome() {
  const { active, run, isCurrent } = useWorkspace(); const router = useRouter();
  const [dashboard, setDashboard] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!active) return; setLoading(true); setError(null);
    try { const result = await run<WorkspaceDashboard>('get_workspace_dashboard'); if (isCurrent(active.id)) setDashboard(result); }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id)) setLoading(false); }
  }, [active?.id, run, isCurrent]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!active) return null;
  return <Screen title={active.name} subtitle={WORKSPACE_LABELS[active.kind]} right={<WorkspaceSwitch />} refreshing={loading && !!dashboard} onRefresh={() => void load()}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}><Pill label={ROLE_LABELS[active.role] ?? active.role} tone="blue" />{active.verification_status === 'verified' ? <Pill label="Organización verificada" icon={ShieldCheck} tone="green" /> : null}{active.demo_cohort_id ? <Pill label="Demostración · datos ficticios" tone="orange" /> : null}</View>
    <Text style={[F.h1, { marginBottom: 8 }]}>Tu espacio, al día.</Text>
    <Text style={[F.small, { marginBottom: 22 }]}>{active.kind === 'housing' ? 'Tus inmuebles, visitas y conversaciones en un mismo lugar.' : active.kind === 'university' ? 'Información institucional, actividades y cuidado de tu campus.' : active.kind === 'community' ? 'Haz crecer tu comunidad y organiza cada actividad con tu equipo.' : 'Tus locales y planes, más cerca de la gente de tu ciudad.'}</Text>
    {loading && !dashboard ? <ActivityIndicator color={C.blue} /> : null}
    <ErrorNotice message={error} retry={() => void load()} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{dashboard?.metrics?.map(metric => <Card key={metric.key} style={{ width: '47%', minHeight: 116, justifyContent: 'space-between' }}><Text style={F.small}>{metric.label}</Text><Text style={[F.h1, { marginTop: 12 }]}>{metric.value === null ? '—' : metric.unit === 'cents' ? (metric.value / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : metric.value.toLocaleString('es-ES')}{metric.unit && metric.unit !== 'cents' ? ` ${metric.unit}` : ''}</Text>{metric.period_label ? <Text style={[F.tiny, { marginTop: 8 }]}>{metric.period_label}</Text> : null}</Card>)}</View>
    {dashboard?.notes?.map(note => <Text key={note} style={[F.small, { marginTop: 12 }]}>{note}</Text>)}
    {active.kind === 'university' ? <Text style={[F.small, { marginTop: 12 }]}>Los grupos pequeños se ocultan para proteger la privacidad. «—» indica un dato protegido o todavía no disponible.</Text> : null}
    <View style={{ marginVertical: 24, gap: 10 }}><Btn label={active.kind === 'housing' ? 'Ver mis pisos' : active.kind === 'community' ? 'Organizar una actividad' : active.kind === 'leisure' ? 'Gestionar mis locales' : 'Gestionar información'} onPress={() => router.push('/(workspace)/recursos')} /><Btn label="Gestionar equipo y permisos" variant="secondary" onPress={() => router.push('/(workspace)/gestion')} /></View>
    <Text style={[F.h3, { marginBottom: 12 }]}>Actividad reciente</Text>
    {dashboard?.activity?.length ? dashboard.activity.map((item, index) => <Card key={item.id ?? index} style={{ marginBottom: 10 }}><Text style={F.body}>{activityLabel(item.action)}</Text>{item.created_at ? <Text style={[F.small, { marginTop: 4 }]}>{new Date(item.created_at).toLocaleString('es-ES')}</Text> : null}</Card>) : !loading && !error ? <Text style={F.small}>Aquí aparecerán los movimientos de tu espacio.</Text> : null}
  </Screen>;
}

export function WorkspaceResources({ type, alternate }: { type: WorkspaceResourceType; alternate?: WorkspaceResourceType[] }) {
  const { active, run, isCurrent } = useWorkspace(); const router = useRouter();
  const [selected, setSelected] = useState(type); const [items, setItems] = useState<WorkspaceResource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); const requestSeq = useRef(0);
  const load = useCallback(async (next?: string) => {
    if (!active) return; const sequence = ++requestSeq.current; setLoading(true); setError(null);
    try {
      const result = await run<{ items: WorkspaceResource[]; next_cursor?: string | null }>('get_workspace_resources', { p_resource_type: selected, p_cursor: next ?? null, p_limit: 30 });
      if (!isCurrent(active.id) || sequence !== requestSeq.current) return;
      setItems(previous => next ? [...previous, ...result.items.filter(item => !previous.some(existing => existing.id === item.id))] : result.items); setCursor(result.next_cursor ?? null);
    } catch (err) { if (isCurrent(active.id) && sequence === requestSeq.current) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id) && sequence === requestSeq.current) setLoading(false); }
  }, [active?.id, selected, run, isCurrent]);
  // Otro espacio u otro tipo: se vacía la lista (nunca se ven elementos de un
  // espacio en otro). Volver a la pestaña solo revalida la primera página por
  // detrás, sin parpadeo de lista vacía.
  useEffect(() => { setItems([]); setCursor(null); }, [active?.id, selected]);
  useFocusEffect(useCallback(() => { void load(); return () => { ++requestSeq.current; }; }, [load]));
  if (!active) return null;
  const canCreate = hasWorkspacePermission(active, 'content.manage') && ['housing', 'event', 'venue', 'community', 'post', 'academic'].includes(selected);
  return <Screen title={RESOURCE_LABELS[selected]} subtitle={active.name} right={<WorkspaceSwitch />} refreshing={loading && items.length > 0} onRefresh={() => void load()}>
    {alternate?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>{[type, ...alternate].map(resourceType => <Chip key={resourceType} label={RESOURCE_LABELS[resourceType]} active={selected === resourceType} onPress={() => setSelected(resourceType)} />)}</View> : null}
    {canCreate ? <View style={{ marginBottom: 20 }}><Btn icon={Plus} label={selected === 'academic' ? 'Proponer actualización' : selected === 'post' ? 'Nueva publicación' : 'Crear nuevo'} onPress={() => selected === 'academic' ? router.push('/espacio-academico') : router.push({ pathname: '/espacio-editar', params: { type: selected } })} /></View> : null}
    <ErrorNotice message={error} retry={() => void load()} />
    {loading && !items.length ? <ActivityIndicator color={C.blue} /> : null}
    {!loading && !error && !items.length ? <Card><Text style={F.h3}>Todo empieza aquí</Text><Text style={[F.small, { marginTop: 8 }]}>{canCreate ? 'Crea el primer contenido de este espacio. Puedes guardarlo como borrador antes de publicarlo.' : 'Todavía no hay elementos disponibles para tu equipo.'}</Text></Card> : null}
    {items.map(item => <Card key={item.id} onPress={() => router.push({ pathname: '/espacio-recurso', params: { type: selected, id: item.id } })} style={{ marginBottom: 12 }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={F.h3}>{item.title}</Text>{item.subtitle ? <Text style={[F.small, { marginTop: 5 }]}>{item.subtitle}</Text> : null}{item.starts_at ? <Text style={[F.small, { marginTop: 5 }]}>{new Date(item.starts_at).toLocaleString('es-ES')}</Text> : null}<View style={{ alignSelf: 'flex-start', marginTop: 10 }}><Pill label={statusLabel(item.status)} /></View></View><ChevronRight color={C.muted} size={20} /></View></Card>)}
    {cursor ? <Btn label="Cargar más" variant="secondary" busy={loading} onPress={() => void load(cursor)} /> : null}
  </Screen>;
}

export function statusLabel(status: string) {
  return ({ draft: 'Borrador', published: 'Publicado', active: 'Activo', archived: 'Archivado', pending: 'Pendiente', confirmed: 'Confirmado', cancelled: 'Cancelado', completed: 'Completado', resolved: 'Resuelto', reviewed: 'Revisado', dismissed: 'Descartado', hidden: 'Oculto', approved: 'Aprobado', pending_review: 'En revisión' } as Record<string, string>)[status] ?? status;
}

function activityLabel(action: string) { return ({ 'resource.created': 'Nuevo contenido', 'resource.updated': 'Contenido actualizado', 'member.invited': 'Nueva invitación al equipo', 'member.revoked': 'Acceso retirado', 'workspace.created': 'Espacio creado' } as Record<string, string>)[action] ?? 'Actividad del espacio'; }
const INVITABLE_ROLES = ['admin', 'editor', 'moderator', 'analyst', 'finance', 'checkin', 'member'] as const;
export function WorkspaceMembers({ management = false }: { management?: boolean }) {
  const { active, run, isCurrent, refresh } = useWorkspace(); const router = useRouter(); const mfa = useWorkspaceMfa();
  const [members, setMembers] = useState<WorkspaceMember[]>([]); const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(''); const [role, setRole] = useState('editor');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!active) return; setLoading(true);
    if (!hasWorkspacePermission(active, 'members.read')) { setLoading(false); return; }
    try { const result = await run<WorkspaceMember[]>('get_workspace_members'); if (isCurrent(active.id)) { setMembers(result.filter(member => member.status === 'active')); setError(null); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id)) setLoading(false); }
  }, [active?.id, run, isCurrent]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!active) return null;
  const canManage = hasWorkspacePermission(active, 'members.manage');
  const canInvite = canManage && !active.demo_cohort_id;
  const changeRole = (member: WorkspaceMember, nextRole: string) => Alert.alert('Cambiar permisos', `${member.display_name} tendrá el rol ${ROLE_LABELS[nextRole as keyof typeof ROLE_LABELS]}. Sus permisos anteriores dejarán de aplicarse.`, [{ text: 'Volver', style: 'cancel' }, { text: 'Cambiar rol', onPress: () => {
    const execute = async () => {
      if (lock.current || !isCurrent(active.id)) return; lock.current = true; setBusy(true); setError(null);
      try { await run('set_workspace_member_role', { p_user_id: member.user_id, p_role: nextRole }); if (isCurrent(active.id)) { setEditingMember(null); await load(); await refresh(); } }
      catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
      finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
    };
    if (['admin', 'finance'].includes(member.role) || ['admin', 'finance'].includes(nextRole)) void mfa.protect(execute); else void execute();
  } }]);
  const invite = async () => {
    if (lock.current || !canManage || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { await run('invite_workspace_member', { p_email: email.trim().toLowerCase(), p_role: role }); if (isCurrent(active.id)) { setEmail(''); setNotice('Invitación preparada. La persona podrá aceptarla con la cuenta de ese correo.'); await load(); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  const revoke = (member: WorkspaceMember) => Alert.alert('Retirar acceso', `Esta persona dejará de tener acceso a ${active.name}.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Retirar', style: 'destructive', onPress: () => {
    const execute = async () => {
      if (!isCurrent(active.id) || lock.current) return; lock.current = true; setBusy(true);
      try { await run('revoke_workspace_member', { p_user_id: member.user_id }); await load(); }
      catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
      finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
    };
    if (['admin', 'finance'].includes(member.role)) void mfa.protect(execute); else void execute();
  } }]);
  const transfer = (member: WorkspaceMember) => Alert.alert('Transferir la responsabilidad', `${member.display_name} pasará a ser responsable del espacio y tu rol será administrador. Los contratos y cuentas de cobro conservarán su titular actual.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Verificar y transferir', onPress: () => void mfa.protect(async () => {
    if (lock.current || !isCurrent(active.id)) return; lock.current = true; setBusy(true);
    try { await run('transfer_workspace_ownership', { p_user_id: member.user_id }); await refresh(); }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  }) }]);
  return <Screen title={management ? 'Gestión' : 'Miembros'} subtitle={active.name} right={<WorkspaceSwitch />} refreshing={loading && members.length > 0} onRefresh={() => void load()}>
    {management && active.kind === 'leisure' ? <Card style={{ gap: 10, marginBottom: 18 }}><Text style={F.h3}>Actividad y atención al cliente</Text><Btn label="Recepción Card y fidelización" onPress={() => router.push('/card-recepcion')} /><Btn label="Sedes, ventajas y programas" variant="secondary" onPress={() => router.push('/card-gestion')} /><Btn label="Servicios, recursos y horarios" variant="secondary" onPress={() => router.push('/card-sector')} /><Btn label="Planes del software" variant="secondary" onPress={() => router.push({ pathname: '/card-sector', params: { editor: 'plans' } })} /><Btn label="Locales, eventos y publicaciones" variant="ghost" onPress={() => router.push('/card-locales')} /><Btn label="Mensajes del espacio" variant="ghost" onPress={() => router.push('/card-mensajes')} /></Card> : null}
    {management && active.demo_cohort_id ? <View style={{ marginBottom: 18 }}><Btn label="Simular compras de tienda" variant="secondary" onPress={() => router.push('/compras')} /></View> : null}
    {management && ['content.manage', 'analytics.read', 'finance.read'].some(permission => active.permissions.includes(permission as 'content.manage' | 'analytics.read' | 'finance.read')) ? <View style={{ marginBottom: 18 }}><Btn label="Referidos de la organización" variant="secondary" onPress={() => router.push('/espacio-referidos')} /></View> : null}
    {management && active.subtype === 'creator' ? <Card style={{ gap: 10, marginBottom: 18 }}><Text style={F.h3}>Tu espacio de creador</Text><Btn label="Franky Creators" onPress={() => router.push('/creadores')} /><Btn label="Mis recompensas" variant="secondary" onPress={() => router.push('/recompensas')} /><Btn label="Invitaciones y referidos" variant="secondary" onPress={() => router.push('/invitar')} /></Card> : null}
    {management && ['community', 'leisure'].includes(active.kind) && hasWorkspacePermission(active, 'finance.read') ? <View style={{ marginBottom: 18 }}><Btn label="Campañas en tu ciudad" variant="secondary" onPress={() => router.push('/espacio-campanas')} /></View> : null}
    {management && active.kind === 'housing' && hasWorkspacePermission(active, 'finance.read') ? <View style={{ marginBottom: 18 }}><Btn label="Pagos y devoluciones de visitas" variant="secondary" onPress={() => router.push('/espacio-devoluciones-visitas')} /></View> : null}
    {management ? <><Card style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>{active.name}</Text><Text style={F.small}>{WORKSPACE_LABELS[active.kind]} · {ROLE_LABELS[active.role] ?? active.role}</Text>{active.demo_cohort_id ? <Pill label="Demo aislada · sin operaciones reales" tone="orange" /> : null}<Btn label="Cambiar de espacio" variant="secondary" onPress={() => router.push('/espacios')} /><Btn label="Mis apelaciones" variant="ghost" onPress={() => router.push('/apelaciones')} /><Btn label="Ajustes de mi cuenta" variant="ghost" onPress={() => router.push('/seguridad')} /></Card><Text style={[F.h3, { marginBottom: 12 }]}>Equipo y permisos</Text></> : null}
    <ErrorNotice message={error} retry={() => void load()} />
    {loading ? <ActivityIndicator color={C.blue} /> : null}
    {!hasWorkspacePermission(active, 'members.read') ? <Text style={F.small}>El responsable de tu espacio puede gestionar el equipo.</Text> : members.map(member => <Card key={member.user_id} style={{ marginBottom: 10, gap: 10 }}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><UsersRound color={C.blue} size={22} /><View style={{ flex: 1 }}><Text style={F.h3}>{member.display_name || 'Miembro del equipo'}</Text><Text style={F.small}>{ROLE_LABELS[member.role] ?? member.role}{member.status === 'pending' ? ' · Invitación pendiente' : ''}</Text></View></View>{canManage && member.role !== 'owner' ? <><Btn label="Cambiar rol" small variant="secondary" disabled={busy} onPress={() => setEditingMember(previous => previous === member.user_id ? null : member.user_id)} />{editingMember === member.user_id ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{INVITABLE_ROLES.filter(value => active.role === 'owner' || !['admin', 'finance'].includes(value)).map(value => <Chip key={value} label={ROLE_LABELS[value]} active={member.role === value} onPress={() => changeRole(member, value)} />)}</View> : null}</> : null}{canManage && member.role !== 'owner' ? <Btn label="Retirar acceso" small variant="danger" disabled={busy} onPress={() => revoke(member)} /> : null}{active.role === 'owner' && member.role !== 'owner' ? <Btn label="Transferir responsabilidad" small variant="ghost" disabled={busy} onPress={() => transfer(member)} /> : null}</Card>)}
    {canInvite ? <Card style={{ marginTop: 16, gap: 12 }}><Text style={F.h3}>Invitar a tu equipo</Text><TextInput accessibilityLabel="Correo de la persona invitada" placeholder="Correo electrónico" placeholderTextColor={C.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} style={{ padding: 14, color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 14 }} /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{INVITABLE_ROLES.filter(value => !['admin', 'finance'].includes(value) || active.role === 'owner').map(value => <Chip key={value} label={ROLE_LABELS[value]} active={role === value} onPress={() => setRole(value)} />)}</View><Text style={F.small}>Cada persona accede solo a las funciones de su rol. Las cuentas financieras y la titularidad requieren comprobaciones adicionales.</Text><Btn label="Invitar" busy={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onPress={() => ['admin', 'finance'].includes(role) ? void mfa.protect(invite) : void invite()} />{notice ? <Text accessibilityRole="alert" style={{ color: C.green }}>{notice}</Text> : null}</Card> : active.demo_cohort_id ? <Text style={[F.small, { marginTop: 16 }]}>Las demostraciones no envían invitaciones a cuentas reales.</Text> : null}
    {mfa.node}
  </Screen>;
}
