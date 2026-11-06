import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { LayoutDashboard, Building2, CalendarDays, MessageCircle, Settings2, GraduationCap, UsersRound, Store, ShieldCheck } from 'lucide-react-native';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { C, FONT } from '@/theme';
import { ProfessionalProvider, useProfessionalWorkspace } from '@/components/card/ProfessionalWorkspace';
import { PROFESSIONAL_SECTORS } from '../../../shared/professional-services';
import { isLegacyPanelAllowed } from '@/pro/legacy-panel';

export default function WorkspaceLayout() {
  const owner = useSessionOwner(); const workspace = useWorkspace();
  return <ProfessionalProvider key={`${owner?.userId}:${owner?.generation}:${workspace.active?.id}:${workspace.revision}`}><WorkspaceTabs /></ProfessionalProvider>;
}
function WorkspaceTabs() {
  const { ready, active, revision } = useWorkspace();
  const professional = useProfessionalWorkspace();
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.blue} /></View>;
  if (!active) return <Redirect href="/pro" />;
  // Los negocios de ocio trabajan en Franky Pro; este panel queda solo para
  // lo que Franky Pro abre expresamente.
  if (active.kind === 'leisure' && !isLegacyPanelAllowed(active.id)) return <Redirect href={`/pro/${active.id}` as never} />;
  const kind = active.kind;
  const category = professional?.data?.settings?.category;
  const labels = kind === 'leisure' && category ? PROFESSIONAL_SECTORS[category].tabs : null;
  const ResourceIcon = kind === 'housing' ? Building2 : kind === 'community' ? CalendarDays : kind === 'leisure' ? Store : GraduationCap;
  return <Tabs key={`${active.id}:${revision}`} screenOptions={{ headerShown: false, tabBarActiveTintColor: C.blue, tabBarInactiveTintColor: C.muted, tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border }, tabBarLabelStyle: { fontFamily: FONT.medium, fontSize: 10.5 }, tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="resumen" options={{ title: labels?.[0] ?? 'Resumen', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
    <Tabs.Screen name="recursos" options={{ title: labels?.[1] ?? (kind === 'housing' ? 'Pisos' : kind === 'community' ? 'Actividades' : kind === 'leisure' ? 'Locales' : 'Información'), tabBarIcon: ({ color, size }) => <ResourceIcon color={color} size={size} /> }} />
    <Tabs.Screen name="actividad" options={{ title: labels?.[2] ?? (kind === 'housing' ? 'Agenda' : kind === 'community' ? 'Miembros' : kind === 'leisure' ? 'Contenido' : 'Actividades'), tabBarIcon: ({ color, size }) => kind === 'community' ? <UsersRound color={color} size={size} /> : <CalendarDays color={color} size={size} /> }} />
    <Tabs.Screen name="conversaciones" options={{ title: labels?.[3] ?? (kind === 'university' ? 'FOMO' : 'Mensajes'), tabBarIcon: ({ color, size }) => kind === 'university' ? <ShieldCheck color={color} size={size} /> : <MessageCircle color={color} size={size} /> }} />
    <Tabs.Screen name="gestion" options={{ title: 'Gestión', tabBarIcon: ({ color, size }) => <Settings2 color={color} size={size} /> }} />
  </Tabs>;
}
