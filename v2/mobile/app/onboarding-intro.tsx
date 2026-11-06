import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { type AccountType, getAccountType, isBusinessType } from '@/lib/account-type';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { C } from '@/theme';

// Destino tras el alta (welcome.tsx y el gate de app/_layout.tsx apuntan aquí).
// Quien ya tiene un espacio entra en Franky Pro; si no, se pregunta qué tipo
// de cuenta es: los estudiantes siguen a su guía y el resto a Franky Pro.
export default function OnboardingIntro() {
  const { ready, workspaces } = useWorkspace();
  const owner = useSessionOwner();
  const [type, setType] = useState<AccountType | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    if (!owner) return;
    void getAccountType(owner.userId).then((value) => { if (alive) setType(value); });
    return () => { alive = false; };
  }, [owner]);

  if (!owner) return <Redirect href={'/welcome' as never} />;
  if (!ready || type === undefined) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.blue} /></View>;
  if (workspaces.length > 0 || isBusinessType(type)) return <Redirect href={'/pro' as never} />;
  if (type === 'estudiante') return <Redirect href={{ pathname: '/tour', params: { next: '/onboarding-perfil' } }} />;
  return <Redirect href={'/onboarding-tipo' as never} />;
}
